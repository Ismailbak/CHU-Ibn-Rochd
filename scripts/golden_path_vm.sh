#!/usr/bin/env bash
# Golden-path smoke test — run ON the app VM (4020) as ismailbak
# Usage: bash scripts/golden_path_vm.sh [BASE_URL] [APP_USERNAME] [APP_PASSWORD]
# APP_USERNAME is the web login (usually email), NOT the Linux SSH user.
set -euo pipefail

BASE_URL="${1:-http://127.0.0.1:8000}"
USER="${2:-admin}"
PASS="${3:-}"

REPO="/opt/ia-medical"
PASS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0

pass() { echo "[PASS] $1"; PASS_COUNT=$((PASS_COUNT + 1)); }
fail() { echo "[FAIL] $1"; FAIL_COUNT=$((FAIL_COUNT + 1)); }
skip() { echo "[SKIP] $1"; SKIP_COUNT=$((SKIP_COUNT + 1)); }

echo ""
echo "=== RhumatoAI Golden Path — VM Smoke Test ==="
echo "Base URL: $BASE_URL"
echo ""

# 1. Git version
cd "$REPO"
COMMIT=$(git log -1 --oneline)
echo "Git: $COMMIT"
if git rev-parse --short HEAD >/dev/null 2>&1; then
  pass "Git repo reachable"
else
  fail "Git repo issue"
fi

# 2. Health
HEALTH=$(curl -sf "$BASE_URL/health" || echo '{}')
if echo "$HEALTH" | grep -q '"status"'; then
  pass "API /health"
else
  fail "API /health"
fi

if echo "$HEALTH" | grep -qiE 'ai_assistant|ollama'; then
  pass "Health mentions AI assistant"
else
  skip "AI status not in health payload (check 4030 manually)"
fi

# 3. Public maintenance / session config
MAINT=$(curl -sf "$BASE_URL/api/analytics/maintenance-status" || echo '{}')
if echo "$MAINT" | grep -q 'maintenanceMode'; then
  pass "Public maintenance-status endpoint"
else
  fail "Public maintenance-status endpoint"
fi

SESSION=$(curl -sf "$BASE_URL/api/analytics/session-config" || echo '{}')
if echo "$SESSION" | grep -q 'sessionTimeout'; then
  pass "Public session-config endpoint"
else
  fail "Public session-config endpoint"
fi

# 4. Frontend build markers
BUILD_JS="$REPO/frontend/web/build/static/js"
if [ -d "$BUILD_JS" ]; then
  if grep -rl 'cnm-segment\|notifications\|Rechercher patients' "$BUILD_JS"/*.js >/dev/null 2>&1; then
    pass "Frontend build present with app markers"
  else
    fail "Frontend build missing expected markers — run npm run build"
  fi
else
  fail "Frontend build directory missing — run: cd frontend/web && npm run build"
fi

# 5. Auth + API flows
if [ -z "$PASS" ]; then
  skip "API write tests (set password: golden_path_vm.sh URL user pass)"
else
  LOGIN_RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/auth/login" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "username=$USER&password=$PASS")
  LOGIN_HTTP=$(echo "$LOGIN_RESP" | tail -n1)
  LOGIN_BODY=$(echo "$LOGIN_RESP" | sed '$d')
  TOKEN=$(echo "$LOGIN_BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null || true)

  if [ -z "$TOKEN" ]; then
    fail "Login as $USER (HTTP $LOGIN_HTTP)"
    echo "       Tip: use your web app email, not Linux user ismailbak"
    echo "       Response: $LOGIN_BODY"
  else
    pass "Login as $USER"
    AUTH="Authorization: Bearer $TOKEN"

    # Patients list + search (name-first; should not 500)
    PATIENTS_HTTP=$(curl -s -o /tmp/gp_patients.json -w "%{http_code}" \
      "$BASE_URL/api/patients/?limit=5&q=test" -H "$AUTH" || echo 000)
    if [ "$PATIENTS_HTTP" = "200" ]; then
      pass "Patients list/search HTTP 200"
    else
      fail "Patients list/search HTTP $PATIENTS_HTTP"
    fi

    # Medical acts list (regression: missing ActForm import used to 500)
    ACTS_HTTP=$(curl -s -o /tmp/gp_acts.json -w "%{http_code}" \
      "$BASE_URL/api/medical-acts/?limit=5" -H "$AUTH" || echo 000)
    if [ "$ACTS_HTTP" = "200" ]; then
      pass "Medical acts list HTTP 200"
    else
      fail "Medical acts list HTTP $ACTS_HTTP"
    fi

    # Global search
    SEARCH_HTTP=$(curl -s -o /tmp/gp_search.json -w "%{http_code}" \
      "$BASE_URL/api/search/?q=test&limit=3" -H "$AUTH" || echo 000)
    if [ "$SEARCH_HTTP" = "200" ] && python3 -c "import json; d=json.load(open('/tmp/gp_search.json')); assert 'patients' in d and 'appointments' in d and 'acts' in d" 2>/dev/null; then
      pass "Global /api/search shape OK"
    else
      fail "Global /api/search HTTP $SEARCH_HTTP"
    fi

    # System health (admin-only; skip if forbidden)
    HEALTH_SYS_HTTP=$(curl -s -o /tmp/gp_syshealth.json -w "%{http_code}" \
      "$BASE_URL/api/analytics/system-health" -H "$AUTH" || echo 000)
    if [ "$HEALTH_SYS_HTTP" = "200" ]; then
      if python3 -c "import json; d=json.load(open('/tmp/gp_syshealth.json')); assert d.get('database') in ('connected','disconnected'); assert d.get('users') in ('operational','error')" 2>/dev/null; then
        pass "System health status fields OK"
      else
        fail "System health payload unexpected"
      fi
    elif [ "$HEALTH_SYS_HTTP" = "403" ]; then
      skip "System health (admin only)"
    else
      fail "System health HTTP $HEALTH_SYS_HTTP"
    fi

    PATIENT_ID=$(python3 -c "
import json
try:
  data=json.load(open('/tmp/gp_patients.json'))
  print(data[0]['id'] if data else '')
except Exception:
  print('')
" 2>/dev/null || true)

    if [ -z "$PATIENT_ID" ]; then
      skip "Treatment create test (no patients)"
    else
      ACT_JSON=$(curl -sf -X POST "$BASE_URL/api/medical-acts/" -H "$AUTH" -H "Content-Type: application/json" \
        -d "{\"patient_id\":$PATIENT_ID,\"act_type\":\"Consultation\",\"act_date\":\"$(date +%Y-%m-%d)\",\"status\":\"completed\",\"description\":\"Golden path smoke test\",\"treatment\":[{\"drug_name\":\"Methotrexate\",\"dosage\":\"15 mg\"}]}" || echo '{}')
      TREAT_COUNT=$(echo "$ACT_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('treatments',[])))" 2>/dev/null || echo 0)
      if [ "$TREAT_COUNT" -gt 0 ] 2>/dev/null; then
        pass "Create act with treatment (patient $PATIENT_ID)"
      else
        fail "Create act with treatment — treatments empty in response"
        echo "       Response: $ACT_JSON"
      fi
    fi

    NOTIF_JSON=$(curl -sf -X POST "$BASE_URL/api/notifications/" -H "$AUTH" -H "Content-Type: application/json" \
      -d '{"title":"Golden path smoke","message":"Showcase check","is_public":true,"audience":"all","category":"message"}' || echo '[]')
    NOTIF_COUNT=$(echo "$NOTIF_JSON" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo 0)
    if [ "$NOTIF_COUNT" -gt 0 ] 2>/dev/null; then
      pass "Send public notification"
    else
      fail "Send public notification"
    fi

    INBOX=$(curl -sf "$BASE_URL/api/notifications/" -H "$AUTH" || echo '[]')
    if echo "$INBOX" | grep -q 'Golden path smoke'; then
      pass "Notification visible in inbox"
    else
      fail "Notification not in inbox for sender"
    fi

    DOCTORS=$(curl -sf "$BASE_URL/api/auth/doctors" -H "$AUTH" || echo '[]')
    DOCTOR_COUNT=$(echo "$DOCTORS" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo 0)
    if [ "$DOCTOR_COUNT" -gt 0 ] 2>/dev/null; then
      pass "Doctors list available ($DOCTOR_COUNT)"
    else
      skip "No doctors for notification recipient test"
    fi
  fi
fi

# 6. Services
if systemctl is-active --quiet ia-medical 2>/dev/null; then
  pass "systemd ia-medical active"
else
  fail "systemd ia-medical not active"
fi

if systemctl is-active --quiet nginx 2>/dev/null; then
  pass "systemd nginx active"
else
  fail "systemd nginx not active"
fi

echo ""
echo "=== Summary: $PASS_COUNT passed, $FAIL_COUNT failed, $SKIP_COUNT skipped ==="
echo ""
echo "Manual UI checks (browser):"
echo "  - Patient search: 'ismail' should match names, not street addresses"
echo "  - Nurse account: Actes Medicaux list loads (no 500)"
echo "  - Sidebar bell shows red dot on unread notifications"
echo "  - Admin settings: maintenance mode + session timeout"
echo "  - Assistant: inverted patient name still resolves"
echo ""

[ "$FAIL_COUNT" -eq 0 ] || exit 1
