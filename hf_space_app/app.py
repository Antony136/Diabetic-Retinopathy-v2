import gradio as gr
import torch
import torch.nn as nn
from torchvision import transforms
from PIL import Image
import numpy as np
import timm
import os
import gc
from typing import Tuple, Optional

# =========================
# JET COLORMAP
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
# MODEL LOADING
# =========================
DR_STAGES = ["No DR", "Mild", "Moderate", "Severe", "Proliferative DR"]
MODEL_FILENAME = "model_b3.pth"
_model = None
_img_size = 300

def load_predictor():
    global _model, _img_size
    if _model is None:
        if not os.path.exists(MODEL_FILENAME):
            print(f"ERROR: {MODEL_FILENAME} not found.")
            return None
            
        ckpt = torch.load(MODEL_FILENAME, map_location="cpu", weights_only=True)
        num_classes = ckpt.get("num_classes", 5)
        _img_size = ckpt.get("img_size", 300)
        
        _model = timm.create_model("efficientnet_b3", pretrained=False, num_classes=num_classes)
        _model.load_state_dict(ckpt["state_dict"])
        _model.eval()
        del ckpt
        gc.collect()
        print("Model loaded successfully.")
    return _model

# =========================
# MAIN PREDICTION
# =========================
def predict(image):
    if image is None:
        return {"prediction": "Error", "confidence": 0.0}, None
        
    model = load_predictor()
    if model is None:
        return {"prediction": "Model Error", "confidence": 0.0}, None

    transform = transforms.Compose([
        transforms.Resize((_img_size, _img_size)),
        transforms.ToTensor(),
        transforms.Normalize(mean=(0.485, 0.456, 0.406), std=(0.229, 0.224, 0.225)),
    ])
    
    img_rgb = image.convert("RGB")
    input_tensor = transform(img_rgb).unsqueeze(0)

    # 1. Classification
    with torch.no_grad():
        outputs = model(input_tensor)
        probs = torch.softmax(outputs, dim=1)
        confidence, class_idx = torch.max(probs, dim=1)
        res_label = DR_STAGES[class_idx.item()]
        res_conf = float(confidence.item())

    # 2. Grad-CAM
    cam = GradCAM(model, model.conv_head)
    try:
        heatmap = cam(input_tensor, class_idx.item())
    finally:
        cam.close()
        
    # 3. Overlay
    heatmap_overlay = overlay_heatmap_on_image(img_rgb, heatmap)
    
    # Pack result per user request
    prediction_data = {
        "prediction": res_label,
        "confidence": res_conf
    }
    
    gc.collect()
    return prediction_data, heatmap_overlay

# =========================
# GRADIO INTERFACE
# =========================
demo = gr.Interface(
    fn=predict,
    inputs=gr.Image(type="pil"),
    outputs=[
        gr.JSON(label="Prediction Data"),
        gr.Image(label="Heatmap Output")
    ],
    title="Diabetic Retinopathy Detection",
    api_name="predict"
)

if __name__ == "__main__":
    demo.launch()
