from __future__ import annotations

import argparse
from pathlib import Path
from typing import Tuple

import torch
from PIL import Image

from dataset import get_val_transforms
from model import build_efficientnet_b3
from utils import GradCAM, get_device, overlay_heatmap_on_image


# =========================
# LOAD MODEL (SAFE)
# =========================
def _load_checkpoint(model_path: Path, device: torch.device) -> Tuple[torch.nn.Module, dict]:
    ckpt = torch.load(model_path, map_location=device, weights_only=True)

    num_classes = int(ckpt.get("num_classes", 5))
    model = build_efficientnet_b3(num_classes=num_classes, pretrained=False).to(device)
    model.load_state_dict(ckpt["state_dict"], strict=True)
    model.eval()

    return model, ckpt


# =========================
# SINGLE PREDICTION
# =========================
@torch.no_grad()
def predict_once(model, x):
    logits = model(x)
    probs = torch.softmax(logits, dim=1)[0]

    pred_idx = int(torch.argmax(probs).item())
    confidence = float(probs[pred_idx].item())

    return pred_idx, confidence, probs.cpu().numpy()


# =========================
# MAIN
# =========================
def main():
    parser = argparse.ArgumentParser(description="Predict DR severity (+ multi-run + detailed metrics).")
    parser.add_argument("--model-path", type=Path, default=Path("ml_outputs/model_b3.pth"))
    parser.add_argument("--image-path", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, default=Path("ml_outputs/predictions"))
    parser.add_argument("--device", type=str, default="auto")
    parser.add_argument("--img-size", type=int, default=300)
    parser.add_argument("--runs", type=int, default=5, help="Number of repeated predictions")

    args = parser.parse_args()

    device = get_device(args.device)
    args.output_dir.mkdir(parents=True, exist_ok=True)

    model, ckpt = _load_checkpoint(args.model_path, device=device)
    img_size = int(ckpt.get("img_size", args.img_size))

    image = Image.open(args.image_path).convert("RGB")
    val_tf = get_val_transforms(img_size)
    x = val_tf(image).unsqueeze(0).to(device)

    print("\n========== MULTI-RUN PREDICTION ==========\n")

    all_preds = []
    all_confs = []

    for i in range(args.runs):
        pred, conf, probs = predict_once(model, x)

        all_preds.append(pred)
        all_confs.append(conf)

        print(f"[Run {i+1}]")
        print(f"Predicted class : {pred}")
        print(f"Confidence      : {conf:.4f}")

        # Top-3 predictions
        top3 = sorted(enumerate(probs), key=lambda x: x[1], reverse=True)[:3]
        print("Top-3 classes   :")
        for cls, p in top3:
            print(f"  Class {cls} → {p:.4f}")

        print("-" * 40)

    # =========================
    # CONSISTENCY CHECK
    # =========================
    unique_preds = set(all_preds)

    print("\n========== CONSISTENCY CHECK ==========")
    print(f"Predictions across runs: {all_preds}")
    print(f"Unique predictions     : {unique_preds}")

    if len(unique_preds) == 1:
        print("✅ Model is STABLE (same output every time)")
    else:
        print("⚠️ Model is UNSTABLE (varies across runs)")

    print(f"Avg confidence         : {sum(all_confs)/len(all_confs):.4f}")
    print("=======================================\n")

    # =========================
    # GRAD-CAM (only once)
    # =========================
    target_layer = getattr(model, "conv_head", None)
    if target_layer is None:
        target_layer = list(model.modules())[-1]

    cam = GradCAM(model, target_layer=target_layer)

    try:
        heatmap = cam(x, class_idx=all_preds[0])
    finally:
        cam.close()

    overlay = overlay_heatmap_on_image(
        image_rgb=image,
        heatmap=heatmap,
        alpha=0.45,
        colormap="jet"
    )

    out_path = args.output_dir / f"heatmap_{args.image_path.stem}.png"
    overlay.save(out_path)

    print(f"Saved Grad-CAM heatmap: {out_path}")


if __name__ == "__main__":
    main()
