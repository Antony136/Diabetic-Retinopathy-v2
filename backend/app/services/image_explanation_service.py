from __future__ import annotations

import json
import math
import os
import hashlib
import re
from dataclasses import dataclass
from typing import Optional

import numpy as np
from PIL import Image

from app.services.doctor_assistant_llm import generate_with_fallback


@dataclass(frozen=True)
class Region:
    area: int
    x0: int
    y0: int
    x1: int
    y1: int
    cx: float
    cy: float


@dataclass(frozen=True)
class HeatmapFeatures:
    width: int
    height: int
    intensity_mean: float
    intensity_std: float
    high_activation_ratio: float
    activation_regions_count: int
    top_regions: list[Region]


def _normalize_grayscale(arr: np.ndarray) -> np.ndarray:
    a = arr.astype(np.float32)
    if a.ndim != 2:
        raise ValueError("heatmap must be grayscale")
    mn = float(np.min(a))
    mx = float(np.max(a))
    if not math.isfinite(mn) or not math.isfinite(mx):
        raise ValueError("invalid heatmap values")
    if mx - mn < 1e-6:
        return np.zeros_like(a, dtype=np.float32)
    return (a - mn) / (mx - mn)


def _connected_components(mask: np.ndarray, *, min_area: int = 40) -> list[Region]:
    """
    Very small, dependency-free connected components (8-neighborhood).
    Returns regions sorted by area desc.
    """
    h, w = mask.shape
    visited = np.zeros((h, w), dtype=np.uint8)
    regions: list[Region] = []

    def neighbors(y: int, x: int):
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dy == 0 and dx == 0:
                    continue
                ny, nx = y + dy, x + dx
                if 0 <= ny < h and 0 <= nx < w:
                    yield ny, nx

    for y in range(h):
        for x in range(w):
            if not mask[y, x] or visited[y, x]:
                continue
            # BFS
            stack = [(y, x)]
            visited[y, x] = 1

            area = 0
            x0 = x1 = x
            y0 = y1 = y
            sx = 0.0
            sy = 0.0

            while stack:
                cy, cx = stack.pop()
                area += 1
                sx += float(cx)
                sy += float(cy)
                if cx < x0:
                    x0 = cx
                if cx > x1:
                    x1 = cx
                if cy < y0:
                    y0 = cy
                if cy > y1:
                    y1 = cy

                for ny, nx in neighbors(cy, cx):
                    if mask[ny, nx] and not visited[ny, nx]:
                        visited[ny, nx] = 1
                        stack.append((ny, nx))

            if area < min_area:
                continue

            # bbox uses inclusive coords above; normalize to [x0,y0,x1+1,y1+1)
            cx_f = sx / max(1, area)
            cy_f = sy / max(1, area)
            regions.append(
                Region(
                    area=area,
                    x0=int(x0),
                    y0=int(y0),
                    x1=int(x1) + 1,
                    y1=int(y1) + 1,
                    cx=cx_f,
                    cy=cy_f,
                )
            )

    regions.sort(key=lambda r: r.area, reverse=True)
    return regions


def extract_heatmap_features(
    heatmap_image: Image.Image,
    *,
    high_activation_threshold: float = 0.7,
    max_regions: int = 3,
) -> HeatmapFeatures:
    hm = heatmap_image.convert("L")
    arr = np.asarray(hm)
    norm = _normalize_grayscale(arr)
    h, w = norm.shape

    intensity_mean = float(np.mean(norm))
    intensity_std = float(np.std(norm))

    mask = norm >= float(high_activation_threshold)
    high_activation_ratio = float(np.mean(mask.astype(np.float32)))
    regions = _connected_components(mask, min_area=max(20, int(0.0003 * h * w)))

    top = regions[: max(0, int(max_regions))]
    return HeatmapFeatures(
        width=w,
        height=h,
        intensity_mean=intensity_mean,
        intensity_std=intensity_std,
        high_activation_ratio=high_activation_ratio,
        activation_regions_count=len(regions),
        top_regions=top,
    )


def derive_observations(features: HeatmapFeatures) -> list[str]:
    """
    Rule-based translation of heatmap stats into LLM-friendly observations.
    """
    obs: list[str] = []

    ratio = features.high_activation_ratio
    if ratio >= 0.18:
        obs.append("Large proportion of the retina shows high model activation (diffuse involvement).")
    elif ratio >= 0.08:
        obs.append("Moderate spread of high activation across the retina.")
    elif ratio >= 0.02:
        obs.append("Small but focal high-activation areas are present.")
    else:
        obs.append("Very limited high-activation areas are present (mostly low activation).")

    if features.activation_regions_count >= 6:
        obs.append("Multiple distinct clusters of activation are present (scattered lesions pattern).")
    elif features.activation_regions_count >= 2:
        obs.append("More than one activation cluster is present.")
    elif features.activation_regions_count == 1:
        obs.append("A single dominant activation region is present.")
    else:
        obs.append("No stable high-activation regions detected above threshold.")

    # Region localization (central vs peripheral) using centroid.
    def region_loc(r: Region) -> str:
        cx = r.cx / max(1.0, float(features.width))
        cy = r.cy / max(1.0, float(features.height))
        central = 0.33 <= cx <= 0.66 and 0.33 <= cy <= 0.66
        if central:
            return "central"
        if cy < 0.33:
            return "upper peripheral"
        if cy > 0.66:
            return "lower peripheral"
        if cx < 0.33:
            return "left peripheral"
        return "right peripheral"

    for i, r in enumerate(features.top_regions[:3], start=1):
        bbox_area = max(1, (r.x1 - r.x0) * (r.y1 - r.y0))
        frac = bbox_area / max(1.0, float(features.width * features.height))
        loc = region_loc(r)
        if frac >= 0.18:
            obs.append(f"Top region #{i} is a large {loc} activation zone covering a wide area.")
        elif frac >= 0.06:
            obs.append(f"Top region #{i} is a medium-sized {loc} activation zone.")
        else:
            obs.append(f"Top region #{i} is a small focal {loc} activation zone.")

    # Intensity distribution hint
    if features.intensity_mean >= 0.55 and features.intensity_std >= 0.25:
        obs.append("Overall activation is strong with high variability (mixed hotspots).")
    elif features.intensity_mean >= 0.45:
        obs.append("Overall activation is moderate.")
    else:
        obs.append("Overall activation is relatively low on average.")

    return obs


IMAGE_EXPLAIN_SYSTEM = (
    "You are an ophthalmology AI assistant. "
    "You will explain a diabetic retinopathy diagnosis based on image-derived observations from a heatmap. "
    "Be clinically grounded. Do not claim certainty beyond the provided confidence."
)


def build_image_explain_summary_prompt(*, diagnosis: str, confidence: float) -> str:
    """Build a prompt for generating a short, crisp summary (1-2 sentences)."""
    return (
        "A retinal scan has been analyzed by a deep learning model.\n\n"
        f"Diagnosis: {diagnosis}\n"
        f"Confidence: {round(float(confidence) * 100.0, 1)}%\n\n"
        "Generate a very short and crisp one-liner summary of this diagnosis (one sentence max). "
        "Be direct and clinical without unnecessary detail."
    )


def build_image_explain_user_prompt(*, diagnosis: str, confidence: float, observations: list[str]) -> str:
    """Build a prompt for generating detailed explanation."""
    obs_lines = "\n".join([f"- {o}" for o in observations]) if observations else "- (none)"
    return (
        "A retinal scan has been analyzed by a deep learning model.\n\n"
        f"Diagnosis: {diagnosis}\n"
        f"Confidence: {round(float(confidence) * 100.0, 1)}%\n\n"
        "Image Observations:\n"
        f"{obs_lines}\n\n"
        "Explain in clear medical reasoning WHY this diagnosis was made based on the observed retinal patterns.\n"
        "Focus on:\n"
        "- Lesions (hemorrhages, microaneurysms, exudates)\n"
        "- Spread and density of affected regions\n"
        "- Severity indicators\n\n"
        "Keep the explanation concise (3-6 sentences) and clinically meaningful."
    )


async def generate_image_explanation_summary(
    *,
    diagnosis: str,
    confidence: float,
    cache_key: Optional[str] = None,
) -> Optional[str]:
    """
    Generate a short, crisp summary (1-2 sentences) of the diagnosis.
    Falls back to a simple rule-based summary if LLM fails.
    """
    user_prompt = build_image_explain_summary_prompt(
        diagnosis=diagnosis,
        confidence=confidence,
    )
    text, _provider, _err = await generate_with_fallback(
        system_prompt=IMAGE_EXPLAIN_SYSTEM,
        user_prompt=user_prompt,
        cache_key=cache_key + "_summary" if cache_key else None,
    )
    if text and text.strip():
        return text.strip()

    # Fallback: simple rule-based summary
    conf_pct = round(float(confidence) * 100.0, 1)
    return f"Diagnosis: {diagnosis} ({conf_pct}% confidence)"


async def generate_image_explanation(
    *,
    diagnosis: str,
    confidence: float,
    observations: list[str],
    cache_key: Optional[str] = None,
) -> Optional[str]:
    """
    Generate detailed explanation of the diagnosis based on heatmap observations.
    Falls back to a concise rule-based explanation if the LLM fails.
    """
    timeout_override = (os.getenv("IMAGE_EXPLANATION_TIMEOUT_SECONDS") or "").strip()
    # Reuse existing LLM config; allow global timeout env (LLM_TIMEOUT_SECONDS) to control this.
    _ = timeout_override  # reserved for future use

    user_prompt = build_image_explain_user_prompt(
        diagnosis=diagnosis,
        confidence=confidence,
        observations=observations,
    )
    text, _provider, _err = await generate_with_fallback(
        system_prompt=IMAGE_EXPLAIN_SYSTEM,
        user_prompt=user_prompt,
        cache_key=cache_key,
    )
    if text and text.strip():
        # Strip any accidental JSON wrappers; we store plain text.
        return text.strip()

    # Fallback: keep app functional offline even if Ollama isn't running.
    if not observations:
        return f"The model predicted {diagnosis} with {round(float(confidence) * 100.0, 1)}% confidence based on the retinal image activation pattern."

    top = observations[:4]
    bullets = " ".join([o.rstrip(".") + "." for o in top])
    return (
        f"The model predicted {diagnosis} with {round(float(confidence) * 100.0, 1)}% confidence. "
        f"Heatmap analysis suggests: {bullets} "
        "This pattern is consistent with lesions and severity cues the model associates with this DR stage."
    ).strip()


async def generate_structured_explanation(
    *,
    diagnosis: str,
    confidence: float,
    observations: list[str],
    cache_key: Optional[str] = None,
) -> dict:
    """
    Generate a structured explanation with separate components:
    - severity: Severity assessment
    - reasonings: Key reasoning points
    - lesions: Lesion findings
    - recommendations: Clinical recommendations
    """
    try:
        # Build a prompt asking for JSON-structured output
        obs_lines = "\n".join([f"- {o}" for o in observations]) if observations else "- (none)"
        system_prompt = (
            "You are an ophthalmology AI assistant. Generate structured clinical analysis in JSON format with keys: "
            "severity (string: Low/Moderate/High), reasonings (list of 2-3 key points), "
            "lesions (string describing lesion types), recommendations (string with clinical guidance)."
        )
        user_prompt = (
            f"Diagnosis: {diagnosis}\n"
            f"Confidence: {round(float(confidence) * 100.0, 1)}%\n\n"
            f"Observations:\n{obs_lines}\n\n"
            "Provide analysis in JSON format."
        )
        
        text, _provider, _err = await generate_with_fallback(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            cache_key=cache_key + "_structured" if cache_key else None,
        )
        
        if text and text.strip():
            # Try to parse as JSON
            try:
                # Extract JSON from response (may have markdown code blocks)
                json_match = re.search(r'\{.*\}', text, re.DOTALL)
                if json_match:
                    result = json.loads(json_match.group())
                    return result
            except Exception:
                pass
    except Exception:
        pass
    
    # Fallback: generate structured response from observations
    return _generate_fallback_structured_explanation(diagnosis, confidence, observations)


def _generate_fallback_structured_explanation(diagnosis: str, confidence: float, observations: list[str]) -> dict:
    """Fallback structured explanation when LLM is unavailable."""
    conf_pct = round(float(confidence) * 100.0, 1)
    
    # Determine severity based on diagnosis
    severity_map = {
        "No DR": "Low",
        "Mild": "Moderate",
        "Moderate": "High",
        "Severe": "High",
        "Proliferative DR": "High",
    }
    severity = severity_map.get(diagnosis, "Moderate")
    
    # Build reasonings from observations
    reasonings = []
    if observations:
        reasonings = [obs.rstrip(".") for obs in observations[:3]]
    if not reasonings:
        reasonings = [f"Model confidence: {conf_pct}%", "Pattern analysis indicates this DR stage"]
    
    return {
        "severity": severity,
        "reasonings": reasonings,
        "lesions": "Lesions detected based on retinal pattern activation",
        "recommendations": f"Follow-up examination recommended. Consult with ophthalmologist for clinical confirmation."
    }


def get_stable_hash(values: list[str]) -> str:
    """Returns a stable hex digest for a list of strings (avoids randomized hash())."""
    content = "|".join(values)
    return hashlib.md5(content.encode("utf-8")).hexdigest()[:12]


def pack_observations(observations: list[str]) -> str:
    try:
        return json.dumps(observations, ensure_ascii=False)
    except Exception:
        return json.dumps([str(o) for o in observations], ensure_ascii=False)


def unpack_observations(raw: str | None) -> list[str]:
    if not raw:
        return []
    try:
        v = json.loads(raw)
        if isinstance(v, list):
            return [str(x) for x in v]
    except Exception:
        pass
    return [raw]


def load_heatmap_image_from_bytes(heatmap_bytes: bytes) -> Image.Image:
    from io import BytesIO

    return Image.open(BytesIO(heatmap_bytes))
