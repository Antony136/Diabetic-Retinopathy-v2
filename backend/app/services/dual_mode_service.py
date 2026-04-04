import torch
import torch.nn.functional as F
from PIL import Image
from torchvision import transforms
import timm
import os
from typing import List, Dict, Any, Union

# Configuration
DR_STAGES = ["No DR", "Mild", "Moderate", "Severe", "Proliferative DR"]
# Robust path relative to current app directory
APP_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL_PATH = os.path.join(APP_DIR, "checkpoints", "model_b3.pth")
IMG_SIZE = 300 # Standard resolution for this EfficientNet-B3 checkpoint

def load_model(model_path: str):
    """
    Load the pre-trained EfficientNet-B3 model.
    """
    if not os.path.exists(model_path):
        raise FileNotFoundError(f"Model checkpoint not found at {model_path}")
    
    # Create model structure
    model = timm.create_model("efficientnet_b3", pretrained=False, num_classes=5)
    
    # Load state dict
    try:
        state_dict = torch.load(model_path, map_location="cpu", weights_only=True)
    except Exception:
        state_dict = torch.load(model_path, map_location="cpu")
    
    # Handle state_dict if it is nested
    if "state_dict" in state_dict:
        state_dict = state_dict["state_dict"]
    elif "model" in state_dict:
        state_dict = state_dict["model"]
    
    # Remove 'module.' prefix if present
    if any(k.startswith("module.") for k in state_dict.keys()):
        state_dict = {k.replace("module.", "", 1): v for k, v in state_dict.items()}
        
    model.load_state_dict(state_dict, strict=False)
    model.eval()
    return model

def preprocess_image(image_path: str):
    """
    Resize image to 224x224 and normalize.
    """
    transform = transforms.Compose([
        transforms.Resize((IMG_SIZE, IMG_SIZE)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
    ])
    
    image = Image.open(image_path).convert("RGB")
    image_tensor = transform(image).unsqueeze(0)
    return image_tensor

def predict(model, image_tensor) -> torch.Tensor:
    """
    Run model inference and return softmax probabilities.
    """
    with torch.no_grad():
        logits = model(image_tensor)
        probs = F.softmax(logits, dim=1)
    return probs[0]

def compute_risk(probs: torch.Tensor) -> float:
    """
    Compute continuous early-stage risk score: risk_score = P1 + 0.5 * P2
    P1 = Mild, P2 = Moderate
    """
    p1 = probs[1].item()
    p2 = probs[2].item()
    risk_score = p1 + 0.5 * p2
    return min(1.0, risk_score)

def get_risk_level(risk_score: float) -> str:
    """
    Assign risk level based on score.
    - 0–0.3 → Low
    - 0.3–0.6 → Moderate
    - > 0.6 → High
    """
    if risk_score <= 0.3:
        return "Low"
    elif risk_score <= 0.6:
        return "Moderate"
    else:
        return "High"

def check_safety_override(probs: torch.Tensor) -> bool:
    """
    MANDATORY SAFETY OVERRIDE:
    Checks if the model detects Severe (P3) or Proliferative (P4) with high confidence.
    """
    p3 = probs[3].item() # Severe
    p4 = probs[4].item() # Proliferative
    return p3 > 0.5 or p4 > 0.5

def decision_engine(risk_score: float, mode: str, override_applied: bool) -> str:
    """
    Final decision flow:
    1. If safety override is applied, MUST always refer.
    2. Otherwise, use mode-based thresholds.
    """
    if override_applied:
        return "Refer"
        
    threshold = 0.3 if mode == "high_sensitivity" else 0.5
    return "Refer" if risk_score > threshold else "Normal"

def generate_explanation(decision: str, override_applied: bool) -> str:
    """
    Generate clinically safe and explainable outputs.
    """
    if override_applied:
        return "Critical DR stage detected — immediate referral required."
    
    if decision == "Refer":
        return "Early signs detected — follow-up recommended."
    else:
        return "Low risk — continue routine screening."

def validate_image_file(image_path: str):
    """
    Reject non-supported formats (GIF) and enforce JPG/PNG.
    """
    ext = os.path.splitext(image_path)[1].lower()
    if ext not in [".jpg", ".jpeg", ".png"]:
        return False, "Invalid image. Please upload a retinal fundus image (JPG/PNG only)."
    
    try:
        with Image.open(image_path) as img:
            if img.format not in ["JPEG", "PNG"]:
                return False, "Invalid image. Please upload a retinal fundus image (JPG/PNG only)."
            
            # Heuristic check: reasonable brightness and color dominance
            # Convert to RGB to ensure 3 channels
            rgb_img = img.convert("RGB")
            # Downscale for fast heuristic calculation
            small_img = rgb_img.resize((64, 64))
            pixels = list(small_img.getdata())
            
            # 1. Brightness Check (Average intensity)
            avg_brightness = sum(sum(p) for p in pixels) / (len(pixels) * 3)
            # Fundus images are typically not pure black or extremely overexposed white
            if avg_brightness < 20 or avg_brightness > 220:
                return False, "Invalid image. Please upload a retinal fundus image (JPG/PNG only)."
            
            # 2. Retinal Color Dominance (Red should be higher than Blue/Green)
            avg_r = sum(p[0] for p in pixels) / len(pixels)
            avg_g = sum(p[1] for p in pixels) / len(pixels)
            avg_b = sum(p[2] for p in pixels) / len(pixels)
            
            # Most fundus images are reddish/orange. If green/blue is dominant, it's likely not a fundus.
            if avg_r < avg_g or avg_r < avg_b:
                return False, "Invalid image. Please upload a retinal fundus image (JPG/PNG only)."
                
    except Exception:
        return False, "Invalid image. Please upload a retinal fundus image (JPG/PNG only)."
        
    return True, None

def run_inference(image_path: str, mode: str, model=None) -> Dict[str, Any]:
    """
    Orchestrate full prediction pipeline with strict input validation.
    1. Check file type/format
    2. Check heuristics (brightness/color)
    3. Run model
    4. Apply confidence filter
    """
    # 0. Initial Validation
    is_valid, err_msg = validate_image_file(image_path)
    if not is_valid:
        raise ValueError(err_msg)

    if model is None:
        model = load_model(MODEL_PATH)
        
    image_tensor = preprocess_image(image_path)
    probs = predict(model, image_tensor)
    
    grade_idx = torch.argmax(probs).item()
    confidence = torch.max(probs).item()

    # 4. Secondary Confidence Filter: If low probability, probably not a fundus
    if confidence < 0.6:
        raise ValueError("Invalid image. Please upload a retinal fundus image (JPG/PNG only).")
    
    # Core Logic Steps
    risk_score = compute_risk(probs)
    risk_level = get_risk_level(risk_score)
    
    # 1. Check Safety Override
    override_applied = check_safety_override(probs)
    
    # 2. Decision Engine
    decision = decision_engine(risk_score, mode, override_applied)
    
    # 3. Explanation
    explanation = generate_explanation(decision, override_applied)
    
    return {
        "grade": DR_STAGES[grade_idx],
        "confidence": round(confidence, 4),
        "risk_score": round(risk_score, 4),
        "risk_level": risk_level,
        "decision": decision,
        "mode": mode,
        "explanation": explanation,
        "override_applied": override_applied,
        "raw_probs": [round(p.item(), 4) for p in probs]
    }

def generate_referral_list(results: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Implement generate_referral_list(results).
    High-sensitivity mode will include more patients (mild cases).
    """
    return [res for res in results if res["decision"] == "Refer"]

if __name__ == "__main__":
    # DEMO OF CLINICAL BEHAVIOR
    print("--- [CLINICAL SCENARIO DEMONSTRATION] ---")
    
    # SCENARIO 1: Severe Case (P3=0.8)
    print("\nSCENARIO 1: Severe DR Case detected")
    severe_probs = torch.tensor([0.05, 0.0, 0.1, 0.8, 0.05])
    risk_s = compute_risk(severe_probs)
    ov = check_safety_override(severe_probs)
    print(f"Probabilities: {severe_probs.tolist()}")
    print(f"MANDATORY OVERRIDE APPLIED: {ov}")
    print(f"Decision (STANDARD MODE): {decision_engine(risk_s, 'standard', ov)}")
    print(f"Decision (HIGH SENSITIVITY): {decision_engine(risk_s, 'high_sensitivity', ov)}")
    print("RULE: Severe cases MUST always be referred regardless of triage mode.")
    
    # SCENARIO 2: Borderline Case (Mild/Moderate Progression)
    print("\nSCENARIO 2: Borderline Case (Risk Score = 0.4)")
    borderline_probs = torch.tensor([0.4, 0.3, 0.2, 0.05, 0.05])
    risk_b = compute_risk(borderline_probs)
    print(f"Probabilities: {borderline_probs.tolist()}")
    print(f"CALCULATED RISK: {risk_b:.2f}")
    print(f"Decision (STANDARD [Threshold 0.5]): {decision_engine(risk_b, 'standard', False)}")
    print(f"Decision (HIGH SENSITIVITY [Threshold 0.3]): {decision_engine(risk_b, 'high_sensitivity', False)}")
    print("RULE: Borderline patients change status based on camp efficiency settings.")
