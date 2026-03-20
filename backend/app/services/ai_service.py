"""
AI Prediction Service for Diabetic Retinopathy Detection
This module handles real AI model predictions for retina images.
Uses an EfficientNet-B3 model trained for 5-class DR severity.
"""

import os
from pathlib import Path
from typing import Tuple, Optional

import torch
import torch.nn as nn
from torchvision import transforms
from PIL import Image
import numpy as np
import timm
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from app.services.storage_service import storage_service

# =========================
# CONSTANTS & TRANSFORMS
# =========================
IMAGENET_MEAN = (0.485, 0.456, 0.406)
IMAGENET_STD = (0.229, 0.224, 0.225)
DR_STAGES = [
    "No DR",
    "Mild",
    "Moderate",
    "Severe",
    "Proliferative DR"
]

def get_val_transforms(img_size: int = 300) -> transforms.Compose:
    return transforms.Compose([
        transforms.Resize((img_size, img_size)),
        transforms.ToTensor(),
        transforms.Normalize(mean=IMAGENET_MEAN, std=IMAGENET_STD),
    ])

# =========================
# GRAD-CAM IMPLEMENTATION
# =========================
class GradCAM:
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

        grads = self._gradients
        acts = self._activations
        weights = grads.mean(dim=(2, 3), keepdim=True)
        cam = (weights * acts).sum(dim=1)
        cam = torch.relu(cam)
        cam = self._normalize_cam(cam)
        return cam[0].detach().cpu().numpy().astype(np.float32)

def overlay_heatmap_on_image(image_rgb: Image.Image, heatmap: np.ndarray, alpha: float = 0.45) -> Image.Image:
    w, h = image_rgb.size
    hm = Image.fromarray(np.uint8(heatmap * 255.0)).resize((w, h), resample=Image.BILINEAR)
    hm_arr = np.asarray(hm, dtype=np.float32) / 255.0

    cmap = plt.get_cmap("jet")
    colored = cmap(hm_arr)[:, :, :3]
    colored_img = Image.fromarray(np.uint8(colored * 255.0)).convert("RGB")

    return Image.blend(image_rgb, colored_img, alpha=alpha)

# =========================
# AI PREDICTOR SERVICE
# =========================
class AIPredictor:
    _model = None
    _device = None
    _img_size = 300
    
    # Path relative to this file: ../checkpoints/model_b3.pth
    _base_dir = Path(__file__).parent.parent
    MODEL_PATH = _base_dir / "checkpoints" / "model_b3.pth"

    @classmethod
    def load_model(cls):
        if cls._model is None:
            cls._device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
            if not os.path.exists(cls.MODEL_PATH):
                raise FileNotFoundError(f"Model file not found at {cls.MODEL_PATH}")
            
            # Load checkpoint
            ckpt = torch.load(cls.MODEL_PATH, map_location=cls._device, weights_only=True)
            num_classes = int(ckpt.get("num_classes", 5))
            cls._img_size = int(ckpt.get("img_size", 300))
            
            # Reconstruct model architecture
            cls._model = timm.create_model(
                "efficientnet_b3",
                pretrained=False,
                num_classes=num_classes,
                in_chans=3,
            ).to(cls._device)
            
            cls._model.load_state_dict(ckpt["state_dict"])
            cls._model.eval()
            print(f"Model loaded successfully on {cls._device}")

    @classmethod
    def predict(cls, image_path: str) -> Tuple[str, float, str]:
        """
        Predict DR stage from retina image using the loaded ML model
        """
        try:
            cls.load_model()
            
            # 1. Load and Preprocess Image
            image = Image.open(image_path).convert("RGB")
            transform = get_val_transforms(cls._img_size)
            x = transform(image).unsqueeze(0).to(cls._device)
            
            # 2. Model Inference
            with torch.no_grad():
                logits = cls._model(x)
                probs = torch.softmax(logits, dim=1)[0]
                pred_idx = int(torch.argmax(probs).item())
                confidence = float(probs[pred_idx].item())
            
            # 3. Generate Grad-CAM Heatmap
            target_layer = getattr(cls._model, "conv_head", None)
            if target_layer is None:
                target_layer = list(cls._model.modules())[-1]
                
            cam = GradCAM(cls._model, target_layer=target_layer)
            try:
                heatmap = cam(x, class_idx=pred_idx)
            finally:
                cam.close()
                
            heatmap_overlay = overlay_heatmap_on_image(image, heatmap)
            
            # 4. Save and Upload Heatmap
            local_heatmap_path = image_path.replace('.jpg', '_heatmap.jpg').replace('.png', '_heatmap.png').replace('.jpeg', '_heatmap.jpeg')
            heatmap_overlay.save(local_heatmap_path, quality=95)
            
            # Use StorageService to upload to Supabase
            remote_filename = os.path.basename(local_heatmap_path)
            heatmap_url = storage_service.upload_file(local_heatmap_path, remote_filename)
            
            # Clean up local folder only if cloud upload was successful
            if os.path.exists(local_heatmap_path) and heatmap_url.startswith('http'):
                os.remove(local_heatmap_path)
            
            prediction = DR_STAGES[pred_idx]
            return prediction, confidence, heatmap_url
        except Exception as e:
            print(f"Prediction error: {str(e)}")
            raise Exception(f"Prediction failed: {str(e)}")

# Convenience function for API calls
# Convenience function for API calls
def predict_dr_stage(image_path: str) -> Tuple[str, float, str]:
    return AIPredictor.predict(image_path)


