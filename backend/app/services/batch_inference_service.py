import os
import zipfile
import pandas as pd
import io
import uuid
import asyncio
from concurrent.futures import ThreadPoolExecutor
from typing import List, Dict, Any, Optional
from pathlib import Path
from PIL import Image
from fastapi import UploadFile

from app.services.dual_mode_service import run_inference, get_cached_model, MODEL_PATH, validate_image_file, apply_dual_mode_logic_remote
from app.services.ai_service import predict_dr_stage
from app.services.storage_service import storage_service
from app.services import image_explanation_service
from app.services.pdf_report_service import pdf_report_service

batch_progress_store: Dict[str, Dict[str, int]] = {}

class BatchInferenceService:
    """
    Enhanced Batch Screening System.
    Supports multi-image, zip folders, and CSV labels.
    Implements strict validation and fault-tolerant execution.
    """

    def __init__(self):
        self._executor = ThreadPoolExecutor(max_workers=min(os.cpu_count() or 4, 8))
        self.provider = (os.getenv("AI_PROVIDER") or "").strip().lower()
        self.use_local = self.provider in ("local", "offline", "desktop")

    async def process_batch(
        self, 
        files: List[UploadFile], 
        mode: str = "standard", 
        csv_file: Optional[UploadFile] = None,
        batch_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Orchestrate batch processing.
        """
        results = []
        failed_items = []
        
        # 1. Parse CSV if provided
        labels_map = {}
        if csv_file:
            try:
                csv_content = await csv_file.read()
                df = pd.read_csv(io.BytesIO(csv_content))
                # Normalize column names to lowercase and handle missing ones
                df.columns = [c.lower().strip() for c in df.columns]
                for _, row in df.iterrows():
                    # Support valid filename-centric key patterns to prevent confusing Patient ID with Filename
                    key = str(row.get('filename') or row.get('file') or row.get('image') or row.get('image_name') or "").strip()
                    if key:
                        labels_map[key] = row.to_dict()
            except Exception as e:
                print(f"ERROR: Failed to parse CSV: {e}")

        # 2. Extract files (supporting zip)
        all_images = []
        for f in files:
            if f.filename.endswith('.zip'):
                content = await f.read()
                with zipfile.ZipFile(io.BytesIO(content)) as z:
                    for info in z.infolist():
                        # Skip directories and non-images
                        if not info.is_dir() and info.filename.lower().endswith(('.jpg', '.jpeg', '.png')):
                            with z.open(info) as img_file:
                                all_images.append({
                                    "filename": info.filename,
                                    "content": img_file.read(),
                                    "content_type": f"image/{Path(info.filename).suffix[1:]}"
                                })
            else:
                content = await f.read()
                if f.filename.lower().endswith(('.jpg', '.jpeg', '.png')):
                    all_images.append({
                        "filename": f.filename,
                        "content": content,
                        "content_type": f.content_type
                    })
                else:
                    failed_items.append({
                        "name": f.filename,
                        "reason": "Unsupported format. Only JPG/PNG allowed."
                    })

        # 3. Parallel Processing
        if batch_id:
            batch_progress_store[batch_id] = {"done": 0, "total": len(all_images)}

        tasks = [asyncio.create_task(self._process_single_image(img, mode, labels_map)) for img in all_images]
        
        async def wrap_task(idx, t):
            try:
                r = await t
            except Exception as e:
                r = e
            if batch_id and batch_id in batch_progress_store:
                batch_progress_store[batch_id]["done"] += 1
            return idx, r

        wrapped_tasks = [wrap_task(i, t) for i, t in enumerate(tasks)]
        
        batch_results = [None] * len(all_images)
        for coro in asyncio.as_completed(wrapped_tasks):
            idx, res = await coro
            batch_results[idx] = res

        for i, res in enumerate(batch_results):
            if isinstance(res, Exception):
                failed_items.append({
                    "name": all_images[i]["filename"],
                    "reason": f"System error: {str(res)}"
                })
            elif res.get("status") == "failed":
                failed_items.append(res)
            else:
                results.append(res)

        # 4. Generate Batch PDF
        summary = {
            "total": len(all_images) + len(failed_items),
            "successful": len(results),
            "failed": len(failed_items),
            "results": results,
            "failed_items": failed_items
        }
        
        batch_pdf_url = ""
        if results:
            try:
                pdf_bytes = pdf_report_service.generate_batch_pdf(summary)
                pdf_name = f"batch_report_{uuid.uuid4().hex[:8]}.pdf"
                batch_pdf_url = storage_service.upload_bytes(pdf_bytes, pdf_name, content_type="application/pdf")
            except Exception as e:
                print(f"ERROR: PDF generation failed: {e}")

        summary["batch_pdf_url"] = batch_pdf_url
        
        # Cleanup: Remove heatmap_bytes from summary to keep JSON response small
        for res in summary["results"]:
            res.pop("heatmap_bytes", None)
            
        if batch_id and batch_id in batch_progress_store:
            del batch_progress_store[batch_id]
            
        return summary

    async def _process_single_image(self, img_data: Dict[str, Any], mode: str, labels_map: Dict[str, Any]) -> Dict[str, Any]:
        """
        Process a single image with strict validation.
        """
        filename = img_data["filename"]
        content = img_data["content"]
        content_type = img_data["content_type"]
        
        # 1. Security & Sanitization
        # Limit image size to 20MB for memory stability
        if len(content) > 20 * 1024 * 1024:
            return {"status": "failed", "name": filename, "reason": "Image size exceeds 20MB limit."}

        # Sanitize filename to prevent traversal
        safe_filename = Path(filename).name
        ext = Path(safe_filename).suffix.lower()
        if ext not in ['.jpg', '.jpeg', '.png']:
            return {"status": "failed", "name": safe_filename, "reason": "Unsupported format. Only JPG/PNG allowed."}

        # 2. Save temp for heuristic and inference
        tmp_path = f"tmp_batch_{uuid.uuid4().hex}{ext}"
        try:
            with open(tmp_path, "wb") as f:
                f.write(content)

            # 3. Heuristic Validation
            is_valid, err_msg = validate_image_file(tmp_path)
            if not is_valid:
                return {"status": "failed", "name": filename, "reason": f"Heuristic failure: {err_msg}"}

            # 4. AI Inference (Run in Executor to prevent blocking the event loop and ensure True parallelism)
            def _blocking_inference():
                if self.use_local:
                    model = get_cached_model(MODEL_PATH)
                    r = run_inference(tmp_path, mode, model=model)
                    from app.services.local_ai_service import predict as local_predict
                    _, _, hm_b, _, _ = local_predict(tmp_path)
                    return r["grade"], float(r["confidence"]), hm_b, r["risk_score"], r["decision"], r["explanation"]
                else:
                    pred, conf, hm_b, _, _ = predict_dr_stage(tmp_path)
                    conf_float = float(conf)
                    triage = apply_dual_mode_logic_remote(pred, mode, conf_float)
                    return pred, conf_float, hm_b, triage["risk_score"], triage["decision"], triage["explanation"]

            loop = asyncio.get_running_loop()
            prediction, confidence, heatmap_bytes, risk_score, decision, explanation = await loop.run_in_executor(
                self._executor, _blocking_inference
            )

            # 5. Confidence Filter (>= 0.6)
            if confidence < 0.6:
                return {"status": "failed", "name": filename, "reason": "Low confidence. Probable non-fundus image."}

            # 6. Upload results to storage
            image_url = storage_service.upload_bytes(content, f"batch_{uuid.uuid4().hex}_{filename}", content_type=content_type)
            if heatmap_bytes:
                hm_name = f"heatmap_{uuid.uuid4().hex}_{Path(filename).stem}.png"
                heatmap_url = storage_service.upload_bytes(heatmap_bytes, hm_name, content_type="image/png")

            # 7. Image Explanation (LLM)
            image_explanation = ""
            if heatmap_bytes:
                try:
                    hm_img = image_explanation_service.load_heatmap_image_from_bytes(heatmap_bytes)
                    feats = image_explanation_service.extract_heatmap_features(hm_img)
                    obs = image_explanation_service.derive_observations(feats)
                    image_explanation = await image_explanation_service.generate_image_explanation(
                        diagnosis=prediction,
                        confidence=confidence,
                        observations=obs
                    )
                except Exception as e:
                    print(f"WARNING: Explanation failed for {filename}: {e}")

            # Combine with CSV labels if any
            safe_filename = Path(filename).name
            extra_data = labels_map.get(filename) or labels_map.get(safe_filename) or labels_map.get(Path(safe_filename).stem) or {}
            
            return {
                "status": "success",
                "name": filename,
                "image_url": image_url,
                "heatmap_url": heatmap_url,
                "prediction": prediction,
                "confidence": round(confidence, 4),
                "risk_score": round(risk_score, 4),
                "decision": decision,
                "explanation": explanation,
                "clinical_summary": image_explanation,
                "heatmap_bytes": heatmap_bytes, # For PDF reporting
                "metadata": extra_data
            }

        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

batch_inference_service = BatchInferenceService()
