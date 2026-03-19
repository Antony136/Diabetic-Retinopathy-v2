from __future__ import annotations

import argparse
from pathlib import Path
from typing import Tuple

try:
    import torch
    from PIL import Image
except ModuleNotFoundError as e:  # pragma: no cover
    raise ModuleNotFoundError(
        "Missing Python dependencies. Install with: pip install -r ml_pipeline/requirements-ml.txt"
    ) from e

from dataset import get_val_transforms
from model import build_efficientnet_b3
from utils import GradCAM, get_device, overlay_heatmap_on_image


def _load_checkpoint(model_path: Path, device: torch.device) -> Tuple[torch.nn.Module, dict]:
    ckpt = torch.load(model_path, map_location=device)
    num_classes = int(ckpt.get("num_classes", 5))
    model = build_efficientnet_b3(num_classes=num_classes, pretrained=False).to(device)
    model.load_state_dict(ckpt["state_dict"], strict=True)
    model.eval()
    return model, ckpt


def main() -> None:
    parser = argparse.ArgumentParser(description="Predict DR severity with EfficientNet-B3 (+ Grad-CAM heatmap).")
    parser.add_argument("--model-path", type=Path, default=Path("ml_outputs/model_b3.pth"))
    parser.add_argument("--image-path", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, default=Path("ml_outputs/predictions"))
    parser.add_argument("--device", type=str, default="auto")
    parser.add_argument("--img-size", type=int, default=300, help="Override input size; defaults to checkpoint value if present.")
    args = parser.parse_args()

    device = get_device(args.device)
    args.output_dir.mkdir(parents=True, exist_ok=True)

    model, ckpt = _load_checkpoint(args.model_path, device=device)
    img_size = int(ckpt.get("img_size", args.img_size))

    image = Image.open(args.image_path).convert("RGB")
    val_tf = get_val_transforms(img_size)
    x = val_tf(image).unsqueeze(0).to(device)

    with torch.no_grad():
        logits = model(x)
        probs = torch.softmax(logits, dim=1)[0]
        pred_idx = int(torch.argmax(probs).item())
        confidence = float(probs[pred_idx].item())

    print(f"Predicted class: {pred_idx} | confidence: {confidence:.4f}")

    # Grad-CAM: target conv_head if available, else fallback to last module.
    target_layer = getattr(model, "conv_head", None)
    if target_layer is None:
        target_layer = list(model.modules())[-1]

    cam = GradCAM(model, target_layer=target_layer)
    try:
        heatmap = cam(x, class_idx=pred_idx)
    finally:
        cam.close()

    overlay = overlay_heatmap_on_image(image_rgb=image, heatmap=heatmap, alpha=0.45, colormap="jet")
    out_path = args.output_dir / f"heatmap_{args.image_path.stem}.png"
    overlay.save(out_path)
    print(f"Saved Grad-CAM heatmap: {out_path}")


if __name__ == "__main__":
    main()
