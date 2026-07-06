from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, KeepTogether, HRFlowable
from app.models.patient import Patient
from io import BytesIO
from datetime import datetime, date
import os

from app.core.utils.text_encoding import repair_deep


def calculate_age(date_of_birth):
    """Calculate age from date of birth."""
    if not date_of_birth:
        return None
    if isinstance(date_of_birth, str):
        date_of_birth = datetime.fromisoformat(date_of_birth).date()
    if isinstance(date_of_birth, datetime):
        date_of_birth = date_of_birth.date()
    
    today = date.today()
    age = today.year - date_of_birth.year - ((today.month, today.day) < (date_of_birth.month, date_of_birth.day))
    return age if age > 0 else None


def generate_medical_act_pdf(act_data: dict):
    """
    Generates a comprehensive professional PDF for a medical act with ALL information.
    act_data contains: id, patient_id, patient_name, patient_age, act_type, act_date, 
    category, status, report, notes, description, amount, doctor_id, diagnoses, treatments
    """
    act_data = repair_deep(act_data)
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=50, leftMargin=50, topMargin=50, bottomMargin=50)
    
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle('Title', parent=styles['Heading1'], fontSize=20, spaceAfter=20, alignment=1, textColor=colors.black)
    subtitle_style = ParagraphStyle('Subtitle', parent=styles['Heading2'], fontSize=14, spaceBefore=15, spaceAfter=10, textColor=colors.black, fontName='Helvetica-Bold')
    normal_style = ParagraphStyle('Normal', parent=styles['Normal'], textColor=colors.black)
    label_style = ParagraphStyle('Label', parent=styles['Normal'], fontSize=11, fontName='Helvetica-Bold', textColor=colors.black)
    
    elements = []

    # Header
    elements.append(Paragraph("<b>CLINIQUE MÉDICALE RHUMATO-AI</b>", title_style))
    elements.append(Paragraph("Casablanca, Maroc | Tel: +212 522 000 000", ParagraphStyle('Header', parent=styles['Normal'], fontSize=9, textColor=colors.black, alignment=1)))
    elements.append(Spacer(1, 12))
    elements.append(HRFlowable(width="100%", thickness=1, color=colors.black, spaceBefore=10, spaceAfter=20))
    
    # Document Title
    elements.append(Paragraph(f"RAPPORT D'ACTE MÉDICAL", subtitle_style))
    elements.append(Spacer(1, 12))
    
    # 1. Act Header Info - Type, Category, Status
    header_info = [
        [Paragraph("<b>Type d'Acte:</b>", label_style), Paragraph(str(act_data.get('act_type') or 'N/A'), normal_style)],
        [Paragraph("<b>Catégorie:</b>", label_style), Paragraph(str(act_data.get('category') or 'N/A'), normal_style)],
        [Paragraph("<b>Statut:</b>", label_style), Paragraph(str(act_data.get('status') or 'N/A'), normal_style)],
        [Paragraph("<b>Date:</b>", label_style), Paragraph(str(act_data.get('act_date') or 'N/A'), normal_style)],
        [Paragraph("<b>Montant:</b>", label_style), Paragraph(f"{act_data.get('amount') or 'N/A'} DH" if act_data.get('amount') else "N/A", normal_style)],
    ]
    
    t1 = Table(header_info, colWidths=[120, 330])
    t1.setStyle(TableStyle([
        ('GRID', (0, 0), (-1, -1), 0.5, colors.lightgrey),
        ('PADDING', (0, 0), (-1, -1), 8),
        ('BACKGROUND', (0, 0), (0, -1), colors.HexColor("#f5f5f5")),
        ('TEXTCOLOR', (0, 0), (-1, -1), colors.black),
    ]))
    elements.append(t1)
    elements.append(Spacer(1, 20))
    
    # 2. Patient Information
    elements.append(Paragraph("INFORMATIONS PATIENT", subtitle_style))
    patient_info = [
        [Paragraph("<b>Nom:</b>", label_style), Paragraph(str(act_data.get('patient_name') or 'N/A'), normal_style)],
        [Paragraph("<b>ID Patient:</b>", label_style), Paragraph(str(act_data.get('patient_id') or 'N/A'), normal_style)],
    ]
    
    if act_data.get('patient_age'):
        age = calculate_age(act_data.get('patient_age'))
        patient_info.append([Paragraph("<b>Âge:</b>", label_style), Paragraph(f"{age} ans" if age else "N/A", normal_style)])
    
    t2 = Table(patient_info, colWidths=[120, 330])
    t2.setStyle(TableStyle([
        ('GRID', (0, 0), (-1, -1), 0.5, colors.lightgrey),
        ('PADDING', (0, 0), (-1, -1), 8),
        ('BACKGROUND', (0, 0), (0, -1), colors.HexColor("#f5f5f5")),
        ('TEXTCOLOR', (0, 0), (-1, -1), colors.black),
    ]))
    elements.append(t2)
    elements.append(Spacer(1, 20))
    
    # 3. Diagnoses
    if act_data.get('diagnoses') and len(act_data['diagnoses']) > 0:
        elements.append(Paragraph("DIAGNOSTICS", subtitle_style))
        diagnoses_data = []
        for i, diag in enumerate(act_data['diagnoses'], 1):
            diag_text = f"<b>{diag.get('label') or 'N/A'}</b><br/>Type: {diag.get('type') or 'N/A'}<br/>{diag.get('notes') or ''}"
            diagnoses_data.append([
                Paragraph(f"<b>{i}.</b>", label_style),
                Paragraph(diag_text, normal_style)
            ])
        
        t3 = Table(diagnoses_data, colWidths=[30, 420])
        t3.setStyle(TableStyle([
            ('GRID', (0, 0), (-1, -1), 0.5, colors.lightgrey),
            ('PADDING', (0, 0), (-1, -1), 8),
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#f5f5f5")),
            ('TEXTCOLOR', (0, 0), (-1, -1), colors.black),
        ]))
        elements.append(t3)
        elements.append(Spacer(1, 20))
    
    # 4. Description / Report
    if act_data.get('description'):
        elements.append(Paragraph("DESCRIPTION", subtitle_style))
        elements.append(Paragraph(str(act_data.get('description') or '').replace('\n', '<br/>'), normal_style))
        elements.append(Spacer(1, 12))
    
    if act_data.get('report'):
        elements.append(Paragraph("RAPPORT D'EXAMEN", subtitle_style))
        elements.append(Paragraph(str(act_data.get('report') or '').replace('\n', '<br/>'), normal_style))
        elements.append(Spacer(1, 12))
    
    # 5. Treatments
    if act_data.get('treatments') and len(act_data['treatments']) > 0:
        elements.append(Paragraph("TRAITEMENTS / PRESCRIPTIONS", subtitle_style))
        treatments_data = []
        for i, treatment in enumerate(act_data['treatments'], 1):
            treatment_text = f"<b>{treatment.get('drug_name') or 'N/A'}</b>"
            if treatment.get('dosage'):
                treatment_text += f"<br/>Dosage: {treatment['dosage']}"
            if treatment.get('frequency'):
                treatment_text += f"<br/>Fréquence: {treatment['frequency']}"
            if treatment.get('duration'):
                treatment_text += f"<br/>Durée: {treatment['duration']}"
            if treatment.get('notes'):
                treatment_text += f"<br/>Notes: {treatment['notes']}"
            
            treatments_data.append([
                Paragraph(f"<b>{i}.</b>", label_style),
                Paragraph(treatment_text, normal_style)
            ])
        
        t5 = Table(treatments_data, colWidths=[30, 420])
        t5.setStyle(TableStyle([
            ('GRID', (0, 0), (-1, -1), 0.5, colors.lightgrey),
            ('PADDING', (0, 0), (-1, -1), 8),
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#f5f5f5")),
            ('TEXTCOLOR', (0, 0), (-1, -1), colors.black),
        ]))
        elements.append(t5)
        elements.append(Spacer(1, 20))
    
    # Build PDF
    doc.build(elements)
    buffer.seek(0)
    return buffer
