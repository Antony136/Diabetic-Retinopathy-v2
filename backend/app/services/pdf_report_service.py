import os
from io import BytesIO
from typing import List, Dict, Any
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image as RLImage, Table, TableStyle, PageBreak
from reportlab.lib.units import inch

class PDFReportService:
    """
    Service to generate clinical PDF reports for batch screenings.
    """

    def generate_batch_pdf(self, batch_results: Dict[str, Any]) -> bytes:
        """
        Generate a single PDF report for the entire batch.
        """
        buffer = BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=letter)
        styles = getSampleStyleSheet()
        elements = []

        # 1. Title & Summary Page
        title_style = ParagraphStyle(
            'TitleStyle',
            parent=styles['Heading1'],
            fontSize=24,
            spaceAfter=20,
            alignment=1 # Center
        )
        elements.append(Paragraph("Diabetic Retinopathy Screening - Batch Report", title_style))
        elements.append(Spacer(1, 0.2 * inch))
        
        summary_data = [
            ["Total Images Processed", str(batch_results["total"])],
            ["Successful Analysis", str(batch_results["successful"])],
            ["Failed/Invalid Items", str(batch_results["failed"])]
        ]
        
        t = Table(summary_data, colWidths=[2.5 * inch, 1.5 * inch])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (0, -1), colors.lightgrey),
            ('TEXTCOLOR', (0, 0), (-1, -1), colors.black),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica-Bold'),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 12),
            ('GRID', (0, 0), (-1, -1), 1, colors.black)
        ]))
        elements.append(t)
        elements.append(Spacer(1, 0.5 * inch))

        # 2. Failed Items Section (if any)
        if batch_results["failed_items"]:
            elements.append(Paragraph("Invalid/Skipped Entries", styles['Heading2']))
            failed_data = [["Filename", "Reason"]]
            for item in batch_results["failed_items"]:
                failed_data.append([item["name"], item["reason"]])
            
            tf = Table(failed_data, colWidths=[2.5 * inch, 3.5 * inch])
            tf.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.red),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.grey)
            ]))
            elements.append(tf)
        
        elements.append(PageBreak())

        # 3. Compact Sequential Patient Results
        elements.append(Paragraph("Detailed Batch Results", styles['Heading2']))
        elements.append(Spacer(1, 0.1 * inch))

        # Compact Table Header
        results_data = [["Patient / File", "Prediction", "Confidence", "Decision", "Clinical Summary", "Heatmap Map"]]

        for res in batch_results["results"]:
            meta = res.get("metadata") or {}
            patient_label = meta.get("patient_name") or meta.get("name") or meta.get("patient") or res['name']
            
            hm_cell = ""
            if res.get("heatmap_bytes"):
                try:
                    img_data = BytesIO(res["heatmap_bytes"])
                    hm_cell = RLImage(img_data, width=1.0*inch, height=1.0*inch)
                except Exception:
                    hm_cell = "[Missing]"

            # Cap the summary length to prevent row explosion
            summary_txt = (res.get("clinical_summary") or res.get("explanation") or "")[:150] + "..."

            results_data.append([
                Paragraph(str(patient_label), styles['Normal']),
                res['prediction'],
                f"{res['confidence']*100:.1f}%",
                res['decision'],
                Paragraph(summary_txt, styles['Normal']),
                hm_cell
            ])

        tr = Table(results_data, colWidths=[1.5*inch, 0.9*inch, 0.8*inch, 0.9*inch, 2.3*inch, 1.1*inch])
        tr.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.darkblue),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0,0), (-1,-1), 'LEFT'),
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
            ('FONTSIZE', (0, 0), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ]))
        elements.append(tr)


        doc.build(elements)
        pdf_bytes = buffer.getvalue()
        buffer.close()
        return pdf_bytes

pdf_report_service = PDFReportService()
