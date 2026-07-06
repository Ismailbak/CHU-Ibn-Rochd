from typing import List, Dict, Optional
from datetime import date, datetime, timedelta
from dateutil.relativedelta import relativedelta

from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from app.core.utils.text_encoding import repair_utf8_mojibake
from app.models.appointment import Appointment
from app.models.medical_act import ActDiagnosis, ActTreatment, MedicalAct
from app.models.patient import Patient


def _classify_appointment_reason(reason: str | None) -> str:
    """Bucket appointment reason text into chart categories."""
    text = (reason or "").lower()
    if "urgence" in text:
        return "urgences"
    if "suivi" in text:
        return "suivis"
    if "consultation" in text or "consult" in text:
        return "consultations"
    return "autres"


def get_top_act_diagnoses(
    db: Session,
    start_date: Optional[date] = None,
    limit: Optional[int] = 5,
) -> List[dict]:
    """Top diagnosis labels from act_diagnoses (CHUIR import stores diagnoses per act, not on patients)."""
    q = (
        db.query(ActDiagnosis.diagnosis_label, func.count(ActDiagnosis.id))
        .join(MedicalAct, MedicalAct.id == ActDiagnosis.act_id)
        .filter(ActDiagnosis.diagnosis_label.isnot(None))
        .filter(func.trim(ActDiagnosis.diagnosis_label) != "")
    )
    if start_date is not None:
        q = q.filter(MedicalAct.act_date >= start_date)
    q = q.group_by(ActDiagnosis.diagnosis_label).order_by(desc(func.count(ActDiagnosis.id)))
    if limit is not None:
        q = q.limit(limit)
    rows = q.all()
    return [
        {"name": repair_utf8_mojibake(label), "count": count}
        for label, count in rows
        if label and str(label).strip()
    ]

def calculate_age(date_of_birth):
    """Calculate age from date of birth."""
    if not date_of_birth:
        return None
    today = datetime.now().date()
    age = today.year - date_of_birth.year - ((today.month, today.day) < (date_of_birth.month, date_of_birth.day))
    # Legacy imports contain placeholder/corrupt birth dates; exclude impossible ages
    # from averages and demographic buckets instead of skewing analytics.
    if age < 0 or age > 120:
        return None
    return age

def get_summary_stats(db: Session, date_range: str = "6months") -> Dict:
    """Calculates top-level summary statistics directly from the database."""
    # Calculate date range
    today = datetime.now().date()
    if date_range == "7days":
        start_date = today - timedelta(days=7)
    elif date_range == "30days":
        start_date = today - timedelta(days=30)
    elif date_range == "3months":
        start_date = today - relativedelta(months=3)
    elif date_range == "1year":
        start_date = today - relativedelta(years=1)
    else:  # 6months is default
        start_date = today - relativedelta(months=6)
    
    total_patients = db.query(func.count(Patient.id)).scalar() or 0
    
    # Pull the small fields needed for demographics once, then reuse them.
    patients_with_dob = (
        db.query(Patient.date_of_birth, Patient.gender)
        .filter(Patient.date_of_birth.isnot(None))
        .all()
    )
    avg_age = 0.0
    if patients_with_dob:
        ages = []
        for p in patients_with_dob:
            age = calculate_age(p.date_of_birth)
            if age is not None:
                ages.append(age)
        avg_age = sum(ages) / len(ages) if ages else 0.0
    
    common_diagnoses = get_top_act_diagnoses(db, start_date=None, limit=5)

    # Weekly appointments (current calendar week — all reasons, CHUIR notes are free text)
    week_start = today - timedelta(days=today.weekday())

    daily_activity = []
    days_fr = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
    for i in range(7):
        current_date = week_start + timedelta(days=i)
        day_start = datetime.combine(current_date, datetime.min.time())
        day_end = datetime.combine(current_date, datetime.max.time())

        counts = {"consultations": 0, "suivis": 0, "urgences": 0, "autres": 0}
        day_reasons = (
            db.query(Appointment.reason)
            .filter(
                Appointment.datetime_scheduled >= day_start,
                Appointment.datetime_scheduled <= day_end,
            )
            .all()
        )
        for (reason,) in day_reasons:
            counts[_classify_appointment_reason(reason)] += 1

        daily_activity.append({
            "day": days_fr[i],
            **counts,
            "total": sum(counts.values()),
        })

    # Age Distribution
    age_groups = [
        {"label": "18-30", "min": 18, "max": 30},
        {"label": "31-45", "min": 31, "max": 45},
        {"label": "46-60", "min": 46, "max": 60},
        {"label": "61-75", "min": 61, "max": 75},
        {"label": "75+", "min": 76, "max": 120},
    ]
    demographics = [{"age": group["label"], "male": 0, "female": 0} for group in age_groups]
    for patient in patients_with_dob:
        age = calculate_age(patient.date_of_birth)
        if age is None:
            continue
        gender = (patient.gender or "").lower()
        for idx, group in enumerate(age_groups):
            if group["min"] <= age <= group["max"]:
                if gender in ["homme", "m"]:
                    demographics[idx]["male"] += 1
                elif gender in ["femme", "f"]:
                    demographics[idx]["female"] += 1
                break

    # Monthly Trends (within date range)
    months_fr = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc']
    activity_trends = []
    revenue_trends = []
    
    # Determine months to display based on date range
    current_month = today.month
    current_year = today.year
    
    if date_range == "7days" or date_range == "30days":
        # Show last 4 weeks
        num_periods = 4
        period_type = "week"
    elif date_range == "3months":
        # Show last 3 months
        num_periods = 3
        period_type = "month"
    elif date_range == "1year":
        # Show all 12 months
        num_periods = 12
        period_type = "month"
    else:  # 6months
        num_periods = 6
        period_type = "month"
    
    for i in range(num_periods - 1, -1, -1):
        if period_type == "month":
            month_idx = current_month - i
            year = current_year
            if month_idx <= 0:
                month_idx += 12
                year -= 1
            month_name = months_fr[month_idx - 1]
            
            month_start = datetime(year, month_idx, 1)
            if month_idx == 12:
                month_end = datetime(year + 1, 1, 1) - timedelta(seconds=1)
            else:
                month_end = datetime(year, month_idx + 1, 1) - timedelta(seconds=1)
            
            period_label = month_name
        else:  # week
            week_num = i
            week_date = today - timedelta(weeks=week_num)
            week_start_dt = week_date - timedelta(days=week_date.weekday())
            week_end_dt = week_start_dt + timedelta(days=6)
            period_label = f"S-{week_start_dt.strftime('%d/%m')}"
        # For now, compute a simple activity count for the period using appointments
        try:
            appt_start = month_start if period_type == 'month' else datetime.combine(week_start_dt, datetime.min.time())
            appt_end = month_end if period_type == 'month' else datetime.combine(week_end_dt, datetime.max.time())
            period_count = (
                db.query(func.count(Appointment.id))
                .filter(Appointment.datetime_scheduled >= appt_start,
                        Appointment.datetime_scheduled <= appt_end)
                .scalar() or 0
            )
        except Exception:
            period_count = 0
            
        try:
            period_revenue = (
                db.query(func.sum(MedicalAct.amount))
                .filter(MedicalAct.act_date >= (month_start.date() if period_type == 'month' else week_start_dt.date()),
                        MedicalAct.act_date <= (month_end.date() if period_type == 'month' else week_end_dt.date()))
                .scalar() or 0
            )
        except Exception:
            period_revenue = 0
            
        activity_trends.append({"period": period_label, "count": period_count})
        revenue_trends.append({"period": period_label, "revenue": float(period_revenue)})
            
    # Treatments summary (top prescribed medications)
    try:
        top_treatments = (
            db.query(ActTreatment.drug_name, func.count(ActTreatment.drug_name))
            .join(MedicalAct, MedicalAct.id == ActTreatment.act_id)
            .filter(MedicalAct.act_date >= start_date)
            .filter(ActTreatment.drug_name.isnot(None))
            .group_by(ActTreatment.drug_name)
            .order_by(desc(func.count(ActTreatment.drug_name)))
            .limit(10)
            .all()
        )
        treatments = [{"treatment": t[0], "count": t[1]} for t in top_treatments]
    except Exception:
        treatments = []

    # Final assembled stats
    stats = {
        "total_patients": int(total_patients),
        "avg_age": float(avg_age),
        "common_diagnoses": common_diagnoses,
        "weekly_activity": daily_activity,
        "demographics": demographics,
        "activity_trends": activity_trends,
        "revenue_trends": revenue_trends,
        "treatments": treatments,
    }

    return stats
