---
title: Diabetic Retinopathy Detection - EfficientNet-B3
emoji: 🩺
colorFrom: blue
colorTo: indigo
sdk: gradio
app_file: app.py
pinned: false
---

# Diabetic Retinopathy (DR) Screening
This Space provides an automated screening tool for Diabetic Retinopathy severity classification using EfficientNet-B3. 

### ⚙️ Setup Checklist
1.  **Model Initialization**: Upload the `model_b3.pth` file to the root of this Space.
2.  **Webhooks**: This Space is designed to be called by the `Retina Max 2.0` backend API.

### 📋 Output Format
Returns:
-   **Label**: DR Stage (No DR, Mild, Moderate, Severe, Proliferative).
-   **Confidence**: Probability 0.0 - 1.0.
-   **Heatmap**: Grad-CAM visualization overlay.
