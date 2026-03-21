import os
import torch
import torch.nn as nn
from torchvision import transforms
from PIL import Image
import numpy as np
import timm
import gc
from typing import Tuple, Optional
from app.services.storage_service import storage_service

# =========================
# JET COLORMAP (PURE NUMPY)
# =========================
def apply_jet_colormap(heatmap: np.ndarray) -> np.ndarray:
    """Pure Numpy JET colormap."""
    r = np.clip(1.5 - np.abs(4 * heatmap - 3), 0, 1)
    g = np.clip(1.5 - np.abs(4 * heatmap - 2), 0, 1)
    b = np.clip(1.5 - np.abs(4 * heatmap - 1), 0, 1)
    return np.stack([r, g, b], axis=-1)

def overlay_heatmap_on_image(image_rgb: Image.Image, heatmap: np.ndarray, alpha: float = 0.45) -> Image.Image:
    w, h = image_rgb.size
    hm = Image.fromarray(np.uint8(heatmap * 255.0)).resize((w, h), resample=Image.BILINEAR)
    hm_arr = np.asarray(hm, dtype=np.float32) / 255.0
    colored_arr = apply_jet_colormap(hm_arr)
    colored_img = Image.fromarray(np.uint8(colored_arr * 255.0)).convert("RGB")
    del hm, hm_arr, colored_arr
    return Image.blend(image_rgb, colored_img, alpha=alpha)

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

    def _normalize_cam(self, cam: torch.Tensor) -> torch.Tensor:
        cam = cam - cam.min()
        denom = cam.max().clamp(min=1e-6)
        cam = cam / denom
        return cam

    def __call__(self, x: torch.Tensor, class_idx: int) -> np.ndarray:
        with torch.set_grad_enabled(True):
            self.model.zero_grad(set_to_none=True)
            logits = self.model(x)
            score = logits[:, class_idx].sum()
            score.backward(retain_graph=False)

        grads, acts = self._gradients, self._activations
        weights = grads.mean(dim=(2, 3), keepdim=True)
        cam = torch.relu((weights * acts).sum(dim=1))
        cam = self._normalize_cam(cam)
        res = cam[0].detach().cpu().numpy().astype(np.float32)
        
        self.model.zero_grad(set_to_none=True)
        del grads, acts, weights, cam, logits, score
        gc.collect()
        return res

# =========================
# AI PREDICTOR (LOCAL MODEL)
# =========================
class AIPredictor:
    """
    LOCAL MODE: Uses the model locally on the server.
    Warning: This will use ~1.2GB of RAM and might OOM on Render Free Tier. 🚩
    """
    DR_STAGES = ["No DR", "Mild", "Moderate", "Severe", "Proliferative DR"]
    MODEL_PATH = os.path.join(os.path.dirname(__file__), "..", "checkpoints", "model_b3.pth")
    
    _model = None
    _img_size = 300

    @classmethod
    def load_model(cls):
        if cls._model is None:
            if not os.path.exists(cls.MODEL_PATH):
                raise FileNotFoundError(f"Model checkpoint not found at {cls.MODEL_PATH}")
            
            print(f"DEBUG: Loading local model from {cls.MODEL_PATH}...")
            # Use weights_only=True for security (safe for standard checkpoints)
            ckpt = torch.load(cls.MODEL_PATH, map_location="cpu", weights_only=True)
            num_classes = ckpt.get("num_classes", 5)
            cls._img_size = ckpt.get("img_size", 300)
            
            cls._model = timm.create_model("efficientnet_b3", pretrained=False, num_classes=num_classes)
            cls._model.load_state_dict(ckpt["state_dict"])
            cls._model.eval()
            print("SUCCESS: Local model loaded.")
            
            # Explicit cleanup
            del ckpt
            gc.collect()
        return cls._model

    @classmethod
    def predict(cls, image_path: str) -> Tuple[str, float, str]:
        try:
            model = cls.load_model()
            
            # Preprocessing
            transform = transforms.Compose([
                transforms.Resize((cls._img_size, cls._img_size)),
                transforms.ToTensor(),
                transforms.Normalize(mean=(0.485, 0.456, 0.406), std=(0.229, 0.224, 0.225)),
            ])
            
            img_pil = Image.open(image_path).convert("RGB")
            input_tensor = transform(img_pil).unsqueeze(0)

            # 1. Classification
            with torch.no_grad():
                outputs = model(input_tensor)
                probs = torch.softmax(outputs, dim=1)
                confidence, class_idx = torch.max(probs, dim=1)
                
            prediction = cls.DR_STAGES[class_idx.item()]
            conf_value = float(confidence.item())

            # 2. Grad-CAM for Heatmap
            cam_obj = GradCAM(model, model.conv_head)
            try:
                heatmap = cam_obj(input_tensor, class_idx.item())
            finally:
                cam_obj.close()
                
            heatmap_overlay = overlay_heatmap_on_image(img_pil, heatmap)
            
            # 3. Save Heatmap Locally
            heatmap_filename = f"heatmap_{os.path.basename(image_path)}"
            local_heatmap_path = os.path.join(os.path.dirname(image_path), heatmap_filename)
            heatmap_overlay.save(local_heatmap_path)
            
            # 4. Upload Heatmap to Supabase
            heatmap_url = storage_service.upload_file(local_heatmap_path, heatmap_filename)
            
            # Cleanup
            if os.path.exists(local_heatmap_path):
                os.remove(local_heatmap_path)
            
            del input_tensor
            gc.collect()

            return prediction, conf_value, heatmap_url

        except Exception as e:
            print(f"LOCAL Prediction error: {e}")
            import traceback
            traceback.print_exc()
            raise Exception(f"AI Service failed: {e}")


# Convenience function for API calls
def predict_dr_stage(image_path: str) -> Tuple[str, float, str]:
    return AIPredictor.predict(image_path)
