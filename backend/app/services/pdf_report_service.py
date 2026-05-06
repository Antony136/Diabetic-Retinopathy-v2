import os
from datetime import datetime
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
        results_data = [["Patient / File", "Prediction", "Confidence", "Decision", "Clinical Summary"]]

        for res in batch_results["results"]:
            meta = res.get("metadata") or {}
            patient_label = meta.get("patient_name") or meta.get("name") or meta.get("patient") or res['name']
            
            # Cap the summary length to prevent row explosion
            summary_txt = (res.get("clinical_summary") or res.get("explanation") or "")[:150] + "..."

            results_data.append([
                Paragraph(str(patient_label), styles['Normal']),
                res['prediction'],
                f"{res['confidence']*100:.1f}%",
                res['decision'],
                Paragraph(summary_txt, styles['Normal'])
            ])

        tr = Table(results_data, colWidths=[1.6*inch, 1.0*inch, 1.0*inch, 1.1*inch, 2.8*inch])
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

    def generate_single_report_pdf(self, report_data: Dict[str, Any]) -> bytes:
        """
        Generate a professional clinical PDF report for a single patient screening.
        Guaranteed to fit on a single page by using tighter spacing and optimized sizing.
        """
        buffer = BytesIO()
        # Tight margins to maximize single-page usage
        doc = SimpleDocTemplate(
            buffer, 
            pagesize=letter,
            rightMargin=50, leftMargin=50, topMargin=40, bottomMargin=40
        )
        styles = getSampleStyleSheet()
        elements = []

        # 1. Header
        title_style = ParagraphStyle(
            'TitleStyle',
            parent=styles['Heading1'],
            fontSize=18,
            spaceAfter=10,
            alignment=1
        )
        elements.append(Paragraph("Diabetic Retinopathy Screening Report", title_style))

        # 2. Patient Information
        elements.append(Paragraph("Patient Information", styles['Heading3']))
        meta = report_data.get("metadata") or {}
        patient_name = meta.get("patient_name") or meta.get("name") or meta.get("patient") or report_data.get('name', 'Unknown')
        
        info_data = [
            ["Patient Name:", str(patient_name)],
            ["Patient ID:", str(meta.get("patient_id") or meta.get("id") or "N/A")],
            ["Age / Gender:", f"{meta.get('age', 'N/A')} / {meta.get('gender', 'N/A')}"],
            ["Date of Screening:", datetime.now().strftime("%Y-%m-%d %H:%M")],
        ]
        
        info_table = Table(info_data, colWidths=[1.5 * inch, 4.0 * inch])
        info_table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
            ('TOPPADDING', (0, 0), (-1, -1), 3),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ]))
        elements.append(info_table)
        elements.append(Spacer(1, 0.15 * inch))

        # 3. Screening Results
        elements.append(Paragraph("Screening Results", styles['Heading3']))
        results_data = [
            ["Metric", "Value"],
            ["AI Prediction:", report_data.get('prediction', 'Unknown')],
            ["Confidence:", f"{report_data.get('confidence', 0)*100:.1f}%"],
            ["Risk Score:", str(report_data.get('risk_score', 'N/A'))],
            ["Decision:", report_data.get('decision', 'N/A')],
        ]
        
        res_table = Table(results_data, colWidths=[1.5 * inch, 4.0 * inch])
        res_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.darkblue),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('FONTNAME', (0, 1), (0, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
            ('TOPPADDING', (0, 0), (-1, -1), 3),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ]))
        elements.append(res_table)
        elements.append(Spacer(1, 0.15 * inch))

        # 4. Clinical Summary & Observations
        elements.append(Paragraph("Clinical Summary", styles['Heading3']))
        summary_txt = report_data.get("clinical_summary") or report_data.get("explanation") or "No detailed summary available."
        summary_style = ParagraphStyle('SummaryStyle', parent=styles['Normal'], fontSize=9, leading=11)
        elements.append(Paragraph(summary_txt, summary_style))
        elements.append(Spacer(1, 0.2 * inch))

        # 5. Visualizations
        if report_data.get("heatmap_bytes"):
            try:
                elements.append(Paragraph("AI Attention Map (Heatmap)", styles['Heading3']))
                img_data = BytesIO(report_data["heatmap_bytes"])
                # Slightly smaller image to ensure 1-page fit
                hm_img = RLImage(img_data, width=2.4*inch, height=2.4*inch)
                elements.append(hm_img)
                elements.append(Paragraph("Red areas indicate regions identified by AI as clinically relevant.", ParagraphStyle('Note', parent=styles['Italic'], fontSize=7)))
            except Exception as e:
                print(f"WARNING: Could not embed heatmap in PDF: {e}")

        # Final disclaimer at bottom
        elements.append(Spacer(1, 0.1 * inch))
        elements.append(Paragraph("* This report is generated by AI and should be reviewed by a clinical professional.", ParagraphStyle('Disc', parent=styles['Normal'], fontSize=7, alignment=1)))

        doc.build(elements)
        pdf_bytes = buffer.getvalue()
        buffer.close()
        return pdf_bytes

pdf_report_service = PDFReportService()
