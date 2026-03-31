import gc
import io
import os
from pathlib import Path
from typing import Optional, Tuple

import httpx
from PIL import Image


DR_STAGES = ["No DR", "Mild", "Moderate", "Severe", "Proliferative DR"]

_model = None
_img_size = 300
_model_path = None


def _lazy_import_torch():
    import torch  # type: ignore
    from torchvision import transforms  # type: ignore
    import timm  # type: ignore

    return torch, transforms, timm


def _apply_jet_colormap(heatmap):
    import numpy as np  # local import keeps import time down

    r = np.clip(1.5 - np.abs(4 * heatmap - 3), 0, 1)
    g = np.clip(1.5 - np.abs(4 * heatmap - 2), 0, 1)
    b = np.clip(1.5 - np.abs(4 * heatmap - 1), 0, 1)
    return np.stack([r, g, b], axis=-1)


def _overlay_heatmap_on_image(image_rgb: Image.Image, heatmap, alpha: float = 0.45) -> Image.Image:
    import numpy as np

    w, h = image_rgb.size
    hm = Image.fromarray((heatmap * 255.0).astype("uint8")).resize((w, h), resample=Image.BILINEAR)
    hm_arr = np.asarray(hm, dtype=np.float32) / 255.0
    colored_arr = _apply_jet_colormap(hm_arr)
    colored_img = Image.fromarray((colored_arr * 255.0).astype("uint8")).convert("RGB")
    return Image.blend(image_rgb, colored_img, alpha=alpha)


class _GradCAM:
    def __init__(self, model, target_layer) -> None:
        torch, _, _ = _lazy_import_torch()

        self.model = model
        self.target_layer = target_layer
        self._activations: Optional["torch.Tensor"] = None
        self._gradients: Optional["torch.Tensor"] = None
        self._handles = [
            target_layer.register_forward_hook(self._forward_hook),
            target_layer.register_full_backward_hook(self._backward_hook),
        ]

    def close(self):
        for h in self._handles:
            h.remove()
        self._handles.clear()

    def _forward_hook(self, _module, _inputs, output):
        self._activations = output.detach()

    def _backward_hook(self, _module, _grad_input, grad_output):
        self._gradients = grad_output[0].detach()

    def __call__(self, x, class_idx: int):
        torch, _, _ = _lazy_import_torch()

        self.model.zero_grad(set_to_none=True)
        logits = self.model(x)
        score = logits[:, class_idx].sum()
        score.backward(retain_graph=False)

        grads, acts = self._gradients, self._activations
        weights = grads.mean(dim=(2, 3), keepdim=True)
        cam = torch.relu((weights * acts).sum(dim=1))
        cam = cam - cam.min()
        cam = cam / cam.max().clamp(min=1e-6)
        res = cam[0].detach().cpu().numpy().astype("float32")

        self.model.zero_grad(set_to_none=True)
        del grads, acts, weights, cam, logits, score
        gc.collect()
        return res


def _resolve_model_path() -> str:
    # Prefer explicit env override.
    env_path = (os.getenv("MODEL_PATH") or "").strip()
    if env_path:
        return env_path
    # Default to bundled checkpoint in the backend repo.
    return str(Path(__file__).resolve().parents[1] / "checkpoints" / "model_b3.pth")


def load_predictor():
    global _model, _img_size, _model_path
    if _model is not None:
        return _model

    torch, _, timm = _lazy_import_torch()
    model_path = _resolve_model_path()
    if not os.path.exists(model_path):
        raise FileNotFoundError(f"Model checkpoint not found: {model_path}")

    print(f"Loading local model: {model_path}")
    try:
        ckpt = torch.load(model_path, map_location="cpu", weights_only=True)
    except TypeError:
        ckpt = torch.load(model_path, map_location="cpu")

    num_classes = int(ckpt.get("num_classes", 5))
    _img_size = int(ckpt.get("img_size", 300))

    model = timm.create_model("efficientnet_b3", pretrained=False, num_classes=num_classes)
    model.load_state_dict(ckpt["state_dict"])
    model.eval()

    _model = model
    _model_path = model_path
    del ckpt
    gc.collect()
    print("Local model loaded.")
    return _model


def _predict_from_pil(image: Image.Image) -> Tuple[str, float, bytes, str, str]:
    torch, transforms, _ = _lazy_import_torch()

    model = load_predictor()
    transform = transforms.Compose(
        [
            transforms.Resize((_img_size, _img_size)),
            transforms.ToTensor(),
            transforms.Normalize(mean=(0.485, 0.456, 0.406), std=(0.229, 0.224, 0.225)),
        ]
    )

    img_rgb = image.convert("RGB")
    input_tensor = transform(img_rgb).unsqueeze(0)

    with torch.no_grad():
        outputs = model(input_tensor)
        probs = torch.softmax(outputs, dim=1)
        confidence, class_idx = torch.max(probs, dim=1)
        label = DR_STAGES[class_idx.item()]
        conf = float(confidence.item())

    cam = _GradCAM(model, getattr(model, "conv_head", None) or list(model.modules())[-1])
    try:
        heatmap = cam(input_tensor, class_idx.item())
    finally:
        cam.close()

    overlay = _overlay_heatmap_on_image(img_rgb, heatmap)
    buf = io.BytesIO()
    overlay.save(buf, format="PNG")
    heatmap_bytes = buf.getvalue()

    gc.collect()
    return label, conf, heatmap_bytes, "image/png", ".png"


def predict(image_path: str) -> Tuple[str, float, Optional[bytes], Optional[str], Optional[str]]:
    img = Image.open(image_path)
    label, conf, heatmap_bytes, ct, ext = _predict_from_pil(img)
    return label, conf, heatmap_bytes, ct, ext


def predict_from_url(image_url: str) -> Tuple[str, float, Optional[bytes], Optional[str], Optional[str]]:
    if not image_url or not image_url.startswith("http"):
        raise ValueError("Invalid URL")
    with httpx.Client(timeout=60.0, follow_redirects=True) as client:
        resp = client.get(image_url)
        resp.raise_for_status()
        img = Image.open(io.BytesIO(resp.content))
    label, conf, heatmap_bytes, ct, ext = _predict_from_pil(img)
    return label, conf, heatmap_bytes, ct, ext

