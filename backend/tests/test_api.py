from fastapi.testclient import TestClient
from datetime import datetime
from app.main import app
from types import SimpleNamespace

# Override authentication dependency for tests so endpoints requiring user
# authentication succeed without needing a real JWT or database user.
def _test_current_user_override():
    return SimpleNamespace(
        id=1,
        username="test",
        role="admin",
        is_admin=True,
        is_active=True,
    )

app.dependency_overrides = getattr(app, "dependency_overrides", {})
from app.auth.router import get_current_user_orm, RoleChecker
app.dependency_overrides[get_current_user_orm] = _test_current_user_override

# Override RoleChecker to always pass for tests
class TestRoleChecker:
    def __init__(self, allowed_roles: list):
        self.allowed_roles = allowed_roles
    
    def __call__(self, user=None):
        return _test_current_user_override()

# Patch RoleChecker in the router module
import app.auth.router as auth_router
_original_role_checker = auth_router.RoleChecker
auth_router.RoleChecker = TestRoleChecker

client = TestClient(app)

def test_root():
    response = client.get("/")
    assert response.status_code == 200

def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"

def test_get_patients():
    response = client.get("/api/patients/")
    assert response.status_code == 200

def test_analytics_summary():
    response = client.get("/api/analytics/summary")
    assert response.status_code == 200
    data = response.json()
    assert "total_patients" in data
    assert "avg_age" in data
    assert "common_diagnoses" in data


def test_analytics_upcoming_appointments():
    response = client.get("/api/analytics/upcoming-appointments")
    assert response.status_code == 200
    data = response.json()
    assert "appointments" in data
    assert isinstance(data["appointments"], list)


def test_analytics_recent_activity_excludes_future():
    response = client.get("/api/analytics/recent-activity")
    assert response.status_code == 200
    data = response.json()
    assert "activities" in data
    now = datetime.now()
    for activity in data["activities"]:
        assert activity.get("time"), "activity must have a time"
        activity_time = datetime.fromisoformat(activity["time"])
        assert activity_time <= now, f"future activity returned: {activity}"


def test_global_search_endpoint():
    response = client.get("/api/search/", params={"q": "test", "limit": 3})
    assert response.status_code == 200
    data = response.json()
    assert "patients" in data
    assert "appointments" in data
    assert "acts" in data
    assert isinstance(data["patients"], list)
