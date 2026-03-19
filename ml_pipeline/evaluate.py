from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Dict, List, Tuple

try:
    import numpy as np
    import torch
    from sklearn.metrics import (
        accuracy_score,
        balanced_accuracy_score,
        classification_report,
        cohen_kappa_score,
        confusion_matrix,
        f1_score,
        matthews_corrcoef,
        roc_auc_score,
    )
    from torch.cuda.amp import autocast
    from torch.utils.data import DataLoader
except ModuleNotFoundError as e:  # pragma: no cover
    raise ModuleNotFoundError(
        "Missing Python dependencies. Install with: pip install -r ml_pipeline/requirements-ml.txt"
    ) from e

from dataset import APTOS2019Dataset, get_val_transforms
from model import build_efficientnet_b3
from utils import get_device, plot_confusion_matrix, save_json, setup_logger


@dataclass(frozen=True)
class EvalResults:
    n_samples: int
    accuracy: float
    balanced_accuracy: float
    f1_macro: float
    f1_weighted: float
    mcc: float
    kappa_quadratic: float
    auc_ovr_macro: float | None
    auc_ovr_weighted: float | None
    confusion_matrix: List[List[int]]


def _resolve_nested(images_dir: Path) -> Path:
    images_dir = Path(images_dir)
    nested = images_dir / images_dir.name
    if images_dir.exists() and not any(images_dir.glob("*.png")) and nested.exists():
        return nested
    return images_dir


def _infer_split_paths(data_dir: Path, split: str) -> Tuple[Path, Path]:
    data_dir = Path(data_dir)
    if split == "train":
        csv_path = data_dir / "train.csv"
        if not csv_path.exists():
            csv_path = data_dir / "train_1.csv"
        images_dir = data_dir / "train_images"
    elif split == "valid":
        csv_path = data_dir / "valid.csv"
        images_dir = data_dir / "val_images"
    elif split == "test":
        csv_path = data_dir / "test.csv"
        images_dir = data_dir / "test_images"
    else:
        raise ValueError(f"Unknown split: {split}")

    images_dir = _resolve_nested(images_dir)
    return csv_path, images_dir


def _load_checkpoint(model_path: Path, device: torch.device) -> Tuple[torch.nn.Module, dict]:
    ckpt = torch.load(model_path, map_location=device)
    num_classes = int(ckpt.get("num_classes", 5))
    model = build_efficientnet_b3(num_classes=num_classes, pretrained=False).to(device)
    model.load_state_dict(ckpt["state_dict"], strict=True)
    model.eval()
    return model, ckpt


@torch.no_grad()
def _predict(
    model: torch.nn.Module,
    loader: DataLoader,
    device: torch.device,
    amp: bool,
) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    y_true: List[int] = []
    y_pred: List[int] = []
    y_prob: List[np.ndarray] = []

    for images, labels in loader:
        images = images.to(device, non_blocking=True)
        labels = labels.to(device, non_blocking=True)

        with autocast(enabled=amp):
            logits = model(images)
            probs = torch.softmax(logits, dim=1)
            preds = torch.argmax(probs, dim=1)

        y_true.extend(labels.detach().cpu().tolist())
        y_pred.extend(preds.detach().cpu().tolist())
        y_prob.append(probs.detach().cpu().numpy())

    return np.asarray(y_true, dtype=int), np.asarray(y_pred, dtype=int), np.concatenate(y_prob, axis=0)


def _safe_multiclass_auc(y_true: np.ndarray, y_prob: np.ndarray) -> Tuple[float | None, float | None]:
    """
    Returns (auc_macro, auc_weighted) using one-vs-rest ROC AUC.

    If the evaluated split doesn't contain all classes, sklearn raises a ValueError;
    in that case we return (None, None) and let the caller report it.
    """
    try:
        auc_macro = float(roc_auc_score(y_true, y_prob, multi_class="ovr", average="macro"))
        auc_weighted = float(roc_auc_score(y_true, y_prob, multi_class="ovr", average="weighted"))
        return auc_macro, auc_weighted
    except ValueError:
        return None, None


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate EfficientNet-B3 DR model with extended metrics.")
    parser.add_argument("--model-path", type=Path, default=Path("ml_outputs/model_b3.pth"))
    parser.add_argument("--data-dir", type=Path, default=None, help="Dataset dir (supports train/valid/test splits).")
    parser.add_argument("--split", type=str, default="valid", choices=["train", "valid", "test"])
    parser.add_argument("--csv-path", type=Path, default=None, help="Override CSV path (must include id_code, diagnosis).")
    parser.add_argument("--images-dir", type=Path, default=None, help="Override images directory path.")
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--num-workers", type=int, default=4)
    parser.add_argument("--device", type=str, default="auto")
    parser.add_argument("--no-amp", action="store_true", help="Disable AMP during evaluation.")
    parser.add_argument("--img-size", type=int, default=300, help="Override input size; defaults to checkpoint value if present.")
    parser.add_argument("--output-dir", type=Path, default=Path("ml_outputs/eval"))
    args = parser.parse_args()

    device = get_device(args.device)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    logger = setup_logger(output_dir)

    if args.csv_path is not None or args.images_dir is not None:
        if args.csv_path is None or args.images_dir is None:
            raise SystemExit("If using overrides, you must pass both --csv-path and --images-dir.")
        csv_path = Path(args.csv_path)
        images_dir = _resolve_nested(Path(args.images_dir))
    else:
        if args.data_dir is None:
            raise SystemExit("Pass --data-dir (recommended) or both --csv-path and --images-dir.")
        csv_path, images_dir = _infer_split_paths(Path(args.data_dir), split=args.split)

    model, ckpt = _load_checkpoint(args.model_path, device=device)
    img_size = int(ckpt.get("img_size", args.img_size))
    amp = (not args.no_amp) and device.type == "cuda"

    logger.info(f"Device={device} | AMP={amp}")
    logger.info(f"Model: {args.model_path}")
    logger.info(f"Data: csv={csv_path} | images={images_dir}")

    ds = APTOS2019Dataset(csv_path=csv_path, images_dir=images_dir, transform=get_val_transforms(img_size))
    loader = DataLoader(
        ds,
        batch_size=args.batch_size,
        shuffle=False,
        num_workers=args.num_workers,
        pin_memory=(device.type == "cuda"),
        persistent_workers=(args.num_workers > 0),
        prefetch_factor=2 if args.num_workers > 0 else None,
        drop_last=False,
    )

    y_true, y_pred, y_prob = _predict(model=model, loader=loader, device=device, amp=amp)

    acc = float(accuracy_score(y_true, y_pred))
    bal_acc = float(balanced_accuracy_score(y_true, y_pred))
    f1_macro = float(f1_score(y_true, y_pred, average="macro"))
    f1_weighted = float(f1_score(y_true, y_pred, average="weighted"))
    mcc = float(matthews_corrcoef(y_true, y_pred))
    kappa_qwk = float(cohen_kappa_score(y_true, y_pred, weights="quadratic"))
    cm = confusion_matrix(y_true, y_pred, labels=[0, 1, 2, 3, 4])

    auc_macro, auc_weighted = _safe_multiclass_auc(y_true=y_true, y_prob=y_prob)

    results = EvalResults(
        n_samples=int(len(y_true)),
        accuracy=acc,
        balanced_accuracy=bal_acc,
        f1_macro=f1_macro,
        f1_weighted=f1_weighted,
        mcc=mcc,
        kappa_quadratic=kappa_qwk,
        auc_ovr_macro=auc_macro,
        auc_ovr_weighted=auc_weighted,
        confusion_matrix=cm.astype(int).tolist(),
    )

    report = classification_report(y_true, y_pred, labels=[0, 1, 2, 3, 4], digits=4, zero_division=0)
    (output_dir / "classification_report.txt").write_text(report, encoding="utf-8")
    save_json(output_dir / "metrics.json", asdict(results))
    plot_confusion_matrix(cm, out_path=output_dir / "confusion_matrix.png", title=f"Confusion matrix ({args.split})")

    logger.info("Accuracy: %.4f | BalancedAcc: %.4f | F1(macro): %.4f | F1(weighted): %.4f", acc, bal_acc, f1_macro, f1_weighted)
    logger.info("MCC: %.4f | QWK: %.4f", mcc, kappa_qwk)
    if auc_macro is None:
        logger.warning("AUC (OvR) not computed: evaluated split does not contain all classes.")
    else:
        logger.info("AUC OvR (macro): %.4f | AUC OvR (weighted): %.4f", auc_macro, auc_weighted)
    logger.info("Saved: metrics.json, classification_report.txt, confusion_matrix.png -> %s", output_dir.resolve())


if __name__ == "__main__":
    main()

