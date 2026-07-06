from app.patients.service import PatientService
from app.core.utils.preprocessing import clean_text, anonymize_text
from app.core.utils.text_encoding import repair_utf8_mojibake


def anonymize_patient_data(data):
    """Wrapper for backward compatibility in tests."""
    service = PatientService.__new__(PatientService)
    return service.anonymize_patient_data(data)

def test_anonymize_patient():
    data = {"name": "John Doe", "age": 45}
    result = anonymize_patient_data(data)
    assert result["name"] == "ANONYMIZED"
    assert result["age"] == 45

def test_clean_text():
    text = "  Hello   world  "
    result = clean_text(text)
    assert result == "Hello world"

def test_anonymize_text():
    text = "Contact: test@email.com or 1234567890"
    result = anonymize_text(text)
    assert "[EMAIL]" in result
    assert "[PHONE]" in result


def test_repair_utf8_mojibake():
    correct = "séropositive"
    latin1_garbled = correct.encode("utf-8").decode("latin1")
    cp437_garbled = correct.encode("utf-8").decode("cp437")
    assert repair_utf8_mojibake(latin1_garbled) == correct
    assert repair_utf8_mojibake(cp437_garbled) == correct
    assert repair_utf8_mojibake(correct) == correct
    assert repair_utf8_mojibake("PR s├®ropositive") == "PR séropositive"
    assert repair_utf8_mojibake("Syndrome de Sj├Âgren primitif") == "Syndrome de Sjögren primitif"
    assert repair_utf8_mojibake("Ost├®op├®nie") == "Ostéopénie"
