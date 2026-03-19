from __future__ import annotations

import argparse
import math
import time
from pathlib import Path
from typing import Dict, List, Tuple

try:
    import numpy as np
    import pandas as pd
    import torch
    from sklearn.model_selection import train_test_split
    from torch import nn
    from torch.cuda.amp import GradScaler, autocast
    from torch.optim import AdamW
    from torch.optim.lr_scheduler import OneCycleLR
    from torch.utils.data import DataLoader, Subset, WeightedRandomSampler
    from tqdm import tqdm
except ModuleNotFoundError as e:  # pragma: no cover
    raise ModuleNotFoundError(
        "Missing Python dependencies. Install with: pip install -r ml_pipeline/requirements-ml.txt"
    ) from e

from dataset import APTOS2019Dataset, build_paths, get_train_transforms, get_val_transforms
from model import build_efficientnet_b3, set_backbone_trainable, set_head_trainable, split_trainable_params
from utils import (
    compute_epoch_metrics,
    get_device,
    plot_confusion_matrix,
    plot_training_curves,
    save_csv_row,
    save_json,
    set_seed,
    setup_logger,
)


def _compute_class_weights(labels: List[int], num_classes: int = 5) -> torch.Tensor:
    counts = np.bincount(np.asarray(labels, dtype=int), minlength=num_classes).astype(np.float32)
    counts = np.clip(counts, 1.0, None)
    weights = counts.sum() / (num_classes * counts)
    return torch.tensor(weights, dtype=torch.float32)


def _build_sampler(labels: List[int], num_classes: int = 5) -> WeightedRandomSampler:
    counts = np.bincount(np.asarray(labels, dtype=int), minlength=num_classes).astype(np.float32)
    counts = np.clip(counts, 1.0, None)
    class_weights = counts.sum() / counts
    sample_weights = [float(class_weights[y]) for y in labels]
    return WeightedRandomSampler(weights=sample_weights, num_samples=len(sample_weights), replacement=True)


def _run_epoch(
    model: nn.Module,
    loader: DataLoader,
    criterion: nn.Module,
    optimizer: torch.optim.Optimizer | None,
    scheduler: OneCycleLR | None,
    scaler: GradScaler | None,
    device: torch.device,
    train: bool,
    amp: bool,
    channels_last: bool,
    grad_accum_steps: int,
    clip_grad_norm: float | None,
) -> Tuple[float, List[int], List[int]]:
    model.train(mode=train)

    total_loss = 0.0
    y_true: List[int] = []
    y_pred: List[int] = []

    if grad_accum_steps < 1:
        raise ValueError("--grad-accum-steps must be >= 1")

    it = tqdm(loader, desc="train" if train else "val", leave=False)
    for step_idx, (images, labels) in enumerate(it, start=1):
        if channels_last:
            images = images.contiguous(memory_format=torch.channels_last)
        images = images.to(device, non_blocking=True)
        if channels_last and images.is_cuda:
            images = images.contiguous(memory_format=torch.channels_last)
        labels = labels.to(device, non_blocking=True)

        if train:
            assert optimizer is not None
            if step_idx == 1:
                optimizer.zero_grad(set_to_none=True)

        with autocast(enabled=amp):
            logits = model(images)
            loss = criterion(logits, labels)
            if train and grad_accum_steps > 1:
                loss = loss / grad_accum_steps

        if train:
            assert optimizer is not None
            if scaler is not None and amp:
                scaler.scale(loss).backward()
            else:
                loss.backward()

            do_step = (step_idx % grad_accum_steps == 0) or (step_idx == len(loader))
            if do_step:
                if clip_grad_norm is not None:
                    if scaler is not None and amp:
                        scaler.unscale_(optimizer)
                    torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=float(clip_grad_norm))

                if scaler is not None and amp:
                    scaler.step(optimizer)
                    scaler.update()
                else:
                    optimizer.step()

                optimizer.zero_grad(set_to_none=True)
                if scheduler is not None:
                    scheduler.step()

        # Report true (unscaled) loss for logging.
        true_loss = loss.detach().float().item() * (grad_accum_steps if (train and grad_accum_steps > 1) else 1.0)
        total_loss += float(true_loss) * images.size(0)
        preds = logits.argmax(dim=1)
        y_true.extend(labels.detach().cpu().tolist())
        y_pred.extend(preds.detach().cpu().tolist())
        it.set_postfix(loss=float(true_loss))

    avg_loss = total_loss / max(1, len(loader.dataset))
    return avg_loss, y_true, y_pred


def main() -> None:
    parser = argparse.ArgumentParser(description="Train EfficientNet-B3 on APTOS2019 (5-class DR severity).")
    parser.add_argument("--data-dir", type=Path, required=True, help="APTOS dataset directory containing train.csv and train_images/")
    parser.add_argument("--output-dir", type=Path, default=Path("ml_outputs"), help="Output directory for logs/checkpoints/plots")
    parser.add_argument("--img-size", type=int, default=300)
    parser.add_argument("--batch-size", type=int, default=8, help="RTX 3050 6GB-friendly default; increase if you have headroom.")
    parser.add_argument("--epochs", type=int, default=25)
    parser.add_argument("--freeze-epochs", type=int, default=2, help="Epochs to train classifier head only before fine-tuning.")
    parser.add_argument("--lr", type=float, default=3e-4, help="Max learning rate for OneCycleLR (head).")
    parser.add_argument("--backbone-lr-mult", type=float, default=0.1, help="Backbone LR = lr * backbone_lr_mult during fine-tuning.")
    parser.add_argument("--weight-decay", type=float, default=1e-4)
    parser.add_argument("--num-workers", type=int, default=4)
    parser.add_argument("--val-size", type=float, default=0.2)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--device", type=str, default="auto")
    parser.add_argument("--no-amp", action="store_true", help="Disable AMP mixed precision.")
    parser.add_argument("--grad-accum-steps", type=int, default=1, help="Accumulate gradients to emulate larger batches with low VRAM.")
    parser.add_argument("--clip-grad-norm", type=float, default=1.0, help="Set to 0 to disable.")
    parser.add_argument("--tf32", action="store_true", help="Enable TF32 matmul/cudnn (Ampere+). Good speedup on RTX 30xx.")
    parser.add_argument("--channels-last", action="store_true", help="Use channels_last memory format (often faster on RTX 30xx).")
    parser.add_argument("--sampler", type=str, default="none", choices=["none", "weighted"], help="Use weighted oversampling sampler.")
    parser.add_argument("--use-class-weights", action="store_true", help="Use class-weighted CrossEntropyLoss.")
    args = parser.parse_args()

    set_seed(args.seed)
    device = get_device(args.device)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    logger = setup_logger(output_dir)

    amp = (not args.no_amp) and device.type == "cuda"
    logger.info(f"Device={device} | AMP={amp}")
    if device.type != "cuda":
        logger.warning("CUDA not available; training will run on CPU. Install a CUDA-enabled PyTorch for GPU training.")

    if args.tf32 and device.type == "cuda":
        torch.backends.cuda.matmul.allow_tf32 = True
        torch.backends.cudnn.allow_tf32 = True
        try:
            torch.set_float32_matmul_precision("high")
        except Exception:
            pass
        logger.info("TF32 enabled.")

    paths = build_paths(args.data_dir)
    df = pd.read_csv(paths.csv_path)
    labels = df["diagnosis"].astype(int).tolist()
    indices = np.arange(len(df))

    train_idx, val_idx = train_test_split(
        indices,
        test_size=args.val_size,
        random_state=args.seed,
        shuffle=True,
        stratify=labels,
    )
    train_idx = train_idx.tolist()
    val_idx = val_idx.tolist()

    train_ds_full = APTOS2019Dataset(paths.csv_path, paths.images_dir, transform=get_train_transforms(args.img_size))
    val_ds_full = APTOS2019Dataset(paths.csv_path, paths.images_dir, transform=get_val_transforms(args.img_size))
    train_ds = Subset(train_ds_full, train_idx)
    val_ds = Subset(val_ds_full, val_idx)

    train_labels = [labels[i] for i in train_idx]
    class_weights = _compute_class_weights(train_labels, num_classes=5)
    logger.info(f"Train class weights: {class_weights.numpy().round(4).tolist()}")

    sampler = _build_sampler(train_labels, num_classes=5) if args.sampler == "weighted" else None

    train_loader = DataLoader(
        train_ds,
        batch_size=args.batch_size,
        shuffle=(sampler is None),
        sampler=sampler,
        num_workers=args.num_workers,
        pin_memory=(device.type == "cuda"),
        persistent_workers=(args.num_workers > 0),
        prefetch_factor=2 if args.num_workers > 0 else None,
        drop_last=False,
    )
    val_loader = DataLoader(
        val_ds,
        batch_size=args.batch_size,
        shuffle=False,
        num_workers=args.num_workers,
        pin_memory=(device.type == "cuda"),
        persistent_workers=(args.num_workers > 0),
        prefetch_factor=2 if args.num_workers > 0 else None,
        drop_last=False,
    )

    model = build_efficientnet_b3(num_classes=5, pretrained=True).to(device)
    if args.channels_last and device.type == "cuda":
        model = model.to(memory_format=torch.channels_last)

    # Transfer learning stage: head only.
    if args.freeze_epochs > 0:
        set_backbone_trainable(model, trainable=False)
        set_head_trainable(model, trainable=True)
    else:
        set_backbone_trainable(model, trainable=True)
        set_head_trainable(model, trainable=True)

    backbone_params, head_params = split_trainable_params(model)
    optimizer = AdamW(
        [
            {"params": backbone_params, "lr": args.lr * args.backbone_lr_mult},
            {"params": head_params, "lr": args.lr},
        ],
        weight_decay=args.weight_decay,
    )

    steps_per_epoch = max(1, math.ceil(len(train_loader) / max(1, args.grad_accum_steps)))
    scheduler = OneCycleLR(
        optimizer,
        max_lr=[args.lr * args.backbone_lr_mult, args.lr],
        epochs=args.epochs,
        steps_per_epoch=steps_per_epoch,
        pct_start=0.1,
        div_factor=10.0,
        final_div_factor=100.0,
    )

    if args.use_class_weights:
        criterion = nn.CrossEntropyLoss(weight=class_weights.to(device))
    else:
        criterion = nn.CrossEntropyLoss()

    scaler = GradScaler(enabled=amp)
    clip_grad_norm = None if args.clip_grad_norm <= 0 else float(args.clip_grad_norm)

    log_csv = output_dir / "training_log.csv"
    fields = [
        "epoch",
        "lr_backbone",
        "lr_head",
        "train_loss",
        "val_loss",
        "train_acc",
        "val_acc",
        "val_f1_macro",
        "val_f1_weighted",
        "epoch_seconds",
    ]

    best_f1 = -1.0
    best_path = output_dir / "model_b3.pth"

    logger.info(f"Train samples={len(train_ds)} | Val samples={len(val_ds)}")
    logger.info(f"Output dir: {output_dir.resolve()}")

    for epoch in range(1, args.epochs + 1):
        t0 = time.time()

        if args.freeze_epochs > 0 and epoch == args.freeze_epochs + 1:
            logger.info("Unfreezing backbone for fine-tuning.")
            set_backbone_trainable(model, trainable=True)

        train_loss, train_true, train_pred = _run_epoch(
            model=model,
            loader=train_loader,
            criterion=criterion,
            optimizer=optimizer,
            scheduler=scheduler,
            scaler=scaler,
            device=device,
            train=True,
            amp=amp,
            channels_last=args.channels_last,
            grad_accum_steps=args.grad_accum_steps,
            clip_grad_norm=clip_grad_norm,
        )
        train_metrics = compute_epoch_metrics(train_true, train_pred)

        with torch.no_grad():
            val_loss, val_true, val_pred = _run_epoch(
                model=model,
                loader=val_loader,
                criterion=criterion,
                optimizer=None,
                scheduler=None,
                scaler=None,
                device=device,
                train=False,
                amp=amp,
                channels_last=args.channels_last,
                grad_accum_steps=1,
                clip_grad_norm=None,
            )
        val_metrics = compute_epoch_metrics(val_true, val_pred)

        lr_backbone = float(optimizer.param_groups[0]["lr"])
        lr_head = float(optimizer.param_groups[1]["lr"])

        epoch_seconds = time.time() - t0
        save_csv_row(
            log_csv,
            row={
                "epoch": epoch,
                "lr_backbone": lr_backbone,
                "lr_head": lr_head,
                "train_loss": train_loss,
                "val_loss": val_loss,
                "train_acc": train_metrics.accuracy,
                "val_acc": val_metrics.accuracy,
                "val_f1_macro": val_metrics.f1_macro,
                "val_f1_weighted": val_metrics.f1_weighted,
                "epoch_seconds": epoch_seconds,
            },
            fieldnames=fields,
        )

        plot_confusion_matrix(
            val_metrics.confusion,
            out_path=output_dir / f"confusion_epoch_{epoch:03d}.png",
            title=f"Confusion matrix (epoch {epoch})",
        )

        logger.info(
            "Epoch %d/%d | train_loss=%.4f val_loss=%.4f | train_acc=%.4f val_acc=%.4f | val_f1_macro=%.4f | lr(head)=%.2e",
            epoch,
            args.epochs,
            train_loss,
            val_loss,
            train_metrics.accuracy,
            val_metrics.accuracy,
            val_metrics.f1_macro,
            lr_head,
        )

        if val_metrics.f1_macro > best_f1:
            best_f1 = val_metrics.f1_macro
            ckpt = {
                "model_name": "efficientnet_b3",
                "num_classes": 5,
                "img_size": args.img_size,
                "imagenet_norm": True,
                "state_dict": model.state_dict(),
                "best_epoch": epoch,
                "best_val_f1_macro": best_f1,
                "class_names": ["0", "1", "2", "3", "4"],
            }
            torch.save(ckpt, best_path)
            save_json(output_dir / "best_metrics.json", {"best_epoch": epoch, "best_val_f1_macro": best_f1})
            logger.info(f"Saved best model to: {best_path} (val_f1_macro={best_f1:.4f})")

    if log_csv.exists():
        plot_training_curves(log_csv=log_csv, out_dir=output_dir)
        logger.info("Saved curves: loss_curve.png, accuracy_curve.png")

    logger.info(f"Done. Best val_f1_macro={best_f1:.4f} | Model: {best_path}")


if __name__ == "__main__":
    main()
