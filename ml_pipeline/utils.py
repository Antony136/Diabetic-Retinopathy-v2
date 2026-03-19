from __future__ import annotations

import csv
import json
import logging
import os
import random
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import torch
from PIL import Image
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score


def set_seed(seed: int = 42) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    torch.backends.cudnn.deterministic = False
    torch.backends.cudnn.benchmark = True


def get_device(device: Optional[str] = None) -> torch.device:
    if device is None or device == "auto":
        return torch.device("cuda" if torch.cuda.is_available() else "cpu")
    return torch.device(device)


def setup_logger(output_dir: Path) -> logging.Logger:
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    logger = logging.getLogger("dr-train")
    logger.setLevel(logging.INFO)
    logger.handlers.clear()

    fmt = logging.Formatter("%(asctime)s | %(levelname)s | %(message)s", datefmt="%Y-%m-%d %H:%M:%S")

    ch = logging.StreamHandler()
    ch.setLevel(logging.INFO)
    ch.setFormatter(fmt)
    logger.addHandler(ch)

    fh = logging.FileHandler(output_dir / "train.log", encoding="utf-8")
    fh.setLevel(logging.INFO)
    fh.setFormatter(fmt)
    logger.addHandler(fh)

    logger.propagate = False
    return logger


def save_json(path: Path, payload: dict) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")


def save_csv_row(path: Path, row: Dict[str, object], fieldnames: List[str]) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    exists = path.exists()
    with path.open("a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        if not exists:
            writer.writeheader()
        writer.writerow(row)


@dataclass(frozen=True)
class EpochMetrics:
    accuracy: float
    f1_macro: float
    f1_weighted: float
    confusion: np.ndarray


def compute_epoch_metrics(y_true: Iterable[int], y_pred: Iterable[int]) -> EpochMetrics:
    y_true_arr = np.asarray(list(y_true), dtype=int)
    y_pred_arr = np.asarray(list(y_pred), dtype=int)
    acc = float(accuracy_score(y_true_arr, y_pred_arr))
    f1_macro = float(f1_score(y_true_arr, y_pred_arr, average="macro"))
    f1_weighted = float(f1_score(y_true_arr, y_pred_arr, average="weighted"))
    cm = confusion_matrix(y_true_arr, y_pred_arr, labels=[0, 1, 2, 3, 4])
    return EpochMetrics(accuracy=acc, f1_macro=f1_macro, f1_weighted=f1_weighted, confusion=cm)


def plot_confusion_matrix(cm: np.ndarray, out_path: Path, title: str = "Confusion matrix") -> None:
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    fig, ax = plt.subplots(figsize=(6, 5))
    im = ax.imshow(cm, interpolation="nearest", cmap=plt.cm.Blues)
    ax.figure.colorbar(im, ax=ax)
    ax.set(
        xticks=np.arange(cm.shape[1]),
        yticks=np.arange(cm.shape[0]),
        xticklabels=[0, 1, 2, 3, 4],
        yticklabels=[0, 1, 2, 3, 4],
        ylabel="True label",
        xlabel="Predicted label",
        title=title,
    )
    plt.setp(ax.get_xticklabels(), rotation=45, ha="right", rotation_mode="anchor")

    thresh = cm.max() / 2.0 if cm.max() > 0 else 1.0
    for i in range(cm.shape[0]):
        for j in range(cm.shape[1]):
            ax.text(j, i, format(cm[i, j], "d"), ha="center", va="center", color="white" if cm[i, j] > thresh else "black")

    fig.tight_layout()
    fig.savefig(out_path, dpi=160)
    plt.close(fig)


def plot_training_curves(log_csv: Path, out_dir: Path) -> None:
    import pandas as pd

    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    df = pd.read_csv(log_csv)
    epochs = df["epoch"].to_numpy()

    def _plot(y_train: str, y_val: str, ylabel: str, out_name: str) -> None:
        fig, ax = plt.subplots(figsize=(7, 4))
        ax.plot(epochs, df[y_train].to_numpy(), label=y_train)
        ax.plot(epochs, df[y_val].to_numpy(), label=y_val)
        ax.set_xlabel("Epoch")
        ax.set_ylabel(ylabel)
        ax.grid(True, alpha=0.3)
        ax.legend()
        fig.tight_layout()
        fig.savefig(out_dir / out_name, dpi=160)
        plt.close(fig)

    _plot("train_loss", "val_loss", "Loss", "loss_curve.png")
    _plot("train_acc", "val_acc", "Accuracy", "accuracy_curve.png")


class GradCAM:
    """
    Minimal Grad-CAM implementation for CNN-style backbones.

    Usage:
      cam = GradCAM(model, target_layer=model.conv_head)
      heatmap = cam(input_tensor, class_idx=pred_idx)  # (H, W) float32 in [0, 1]
    """

    def __init__(self, model: torch.nn.Module, target_layer: torch.nn.Module) -> None:
        self.model = model
        self.target_layer = target_layer
        self._activations: Optional[torch.Tensor] = None
        self._gradients: Optional[torch.Tensor] = None
        self._handles: list[torch.utils.hooks.RemovableHandle] = []

        self._handles.append(target_layer.register_forward_hook(self._forward_hook))
        self._handles.append(target_layer.register_full_backward_hook(self._backward_hook))

    def close(self) -> None:
        for h in self._handles:
            h.remove()
        self._handles.clear()

    def _forward_hook(self, _module, _inputs, output) -> None:
        self._activations = output.detach()

    def _backward_hook(self, _module, _grad_input, grad_output) -> None:
        self._gradients = grad_output[0].detach()

    @torch.no_grad()
    def _normalize_cam(self, cam: torch.Tensor) -> torch.Tensor:
        cam = cam - cam.min()
        denom = cam.max().clamp(min=1e-6)
        cam = cam / denom
        return cam

    def __call__(self, x: torch.Tensor, class_idx: int) -> np.ndarray:
        self.model.zero_grad(set_to_none=True)
        logits = self.model(x)
        score = logits[:, class_idx].sum()

        self.model.zero_grad(set_to_none=True)
        score.backward(retain_graph=False)

        if self._activations is None or self._gradients is None:
            raise RuntimeError("Grad-CAM hooks did not capture activations/gradients.")

        # activations/gradients: [B, C, H, W]
        grads = self._gradients
        acts = self._activations

        weights = grads.mean(dim=(2, 3), keepdim=True)  # [B, C, 1, 1]
        cam = (weights * acts).sum(dim=1)  # [B, H, W]
        cam = torch.relu(cam)
        cam = self._normalize_cam(cam)
        return cam[0].detach().cpu().numpy().astype(np.float32)


def overlay_heatmap_on_image(
    image_rgb: Image.Image,
    heatmap: np.ndarray,
    alpha: float = 0.45,
    colormap: str = "jet",
) -> Image.Image:
    """
    Returns an RGB image with heatmap overlay.
    """
    if image_rgb.mode != "RGB":
        image_rgb = image_rgb.convert("RGB")

    w, h = image_rgb.size
    hm = Image.fromarray(np.uint8(heatmap * 255.0)).resize((w, h), resample=Image.BILINEAR)
    hm_arr = np.asarray(hm, dtype=np.float32) / 255.0

    cmap = plt.get_cmap(colormap)
    colored = cmap(hm_arr)[:, :, :3]  # RGB in [0..1]
    colored_img = Image.fromarray(np.uint8(colored * 255.0)).convert("RGB")

    blended = Image.blend(image_rgb, colored_img, alpha=alpha)
    return blended

