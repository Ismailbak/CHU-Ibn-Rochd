#!/usr/bin/env bash
# Golden-path smoke test — run ON the app VM (4020) as ismailbak
# Usage: bash /opt/ia-medical/scripts/golden_path_vm.sh [BASE_URL] [USER] [PASS]
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
if git log -1 --format=%s | grep -qE 'treatment|notification|golden|mojibake|modal|suggestion' 2>/dev/null || \
   git rev-parse --short HEAD | grep -q .; then
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

if echo "$HEALTH" | grep -qi ollama; then
  pass "Health mentions AI/Ollama"
else
  skip "Ollama status not in health payload (check 4030 manually)"
fi

# 3. Frontend build markers
if grep -rl 'cnm-segment' "$REPO/frontend/web/build/static/js/"*.js >/dev/null 2>&1; then
  pass "Frontend build contains notification modal (cnm-segment)"
else
  fail "Frontend build missing cnm-segment — run npm run build"
fi

if grep -rl 'handleSuggestionClick' "$REPO/frontend/web/build/static/js/"*.js >/dev/null 2>&1; then
  pass "Frontend build contains chat suggestion templates"
else
  fail "Frontend build missing handleSuggestionClick — run npm run build"
fi

# 4. Auth + API flows
if [ -z "$PASS" ]; then
  skip "API write tests (set password: golden_path_vm.sh URL user pass)"
else
  TOKEN=$(curl -sf -X POST "$BASE_URL/api/auth/login" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "username=$USER&password=$PASS" | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null || true)

  if [ -z "$TOKEN" ]; then
    fail "Login as $USER"
  else
    pass "Login as $USER"
    AUTH="Authorization: Bearer $TOKEN"

    PATIENT_ID=$(curl -sf "$BASE_URL/api/patients/" -H "$AUTH" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(data[0]['id'] if data else '')
" 2>/dev/null || true)

    if [ -z "$PATIENT_ID" ]; then
      skip "Treatment create test (no patients)"
    else
      ACT_JSON=$(curl -sf -X POST "$BASE_URL/api/medical-acts/" -H "$AUTH" -H "Content-Type: application/json" \
        -d "{\"patient_id\":$PATIENT_ID,\"act_type\":\"Consultation\",\"act_date\":\"$(date +%Y-%m-%d)\",\"status\":\"completed\",\"description\":\"Golden path smoke test\",\"treatment\":[{\"drug_name\":\"Méthotrexate\",\"dosage\":\"15 mg\"}]}")
      TREAT_COUNT=$(echo "$ACT_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('treatments',[])))" 2>/dev/null || echo 0)
      if [ "$TREAT_COUNT" -gt 0 ] 2>/dev/null; then
        pass "Create act with treatment (patient $PATIENT_ID)"
      else
        fail "Create act with treatment — treatments empty in response"
        echo "       Response: $ACT_JSON"
      fi
    fi

    NOTIF_JSON=$(curl -sf -X POST "$BASE_URL/api/notifications/" -H "$AUTH" -H "Content-Type: application/json" \
      -d '{"title":"Golden path smoke","message":"Showcase check","is_public":true,"category":"message"}')
    NOTIF_COUNT=$(echo "$NOTIF_JSON" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo 0)
    if [ "$NOTIF_COUNT" -gt 0 ] 2>/dev/null; then
      pass "Send public notification"
    else
      fail "Send public notification"
    fi

    INBOX=$(curl -sf "$BASE_URL/api/notifications/" -H "$AUTH")
    if echo "$INBOX" | grep -q 'Golden path smoke'; then
      pass "Notification visible in inbox"
    else
      fail "Notification not in inbox for sender"
    fi

    DOCTORS=$(curl -sf "$BASE_URL/api/auth/doctors" -H "$AUTH")
    DOCTOR_COUNT=$(echo "$DOCTORS" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo 0)
    if [ "$DOCTOR_COUNT" -gt 0 ] 2>/dev/null; then
      pass "Doctors list available ($DOCTOR_COUNT)"
    else
      skip "No doctors for notification recipient test"
    fi
  fi
fi

# 5. Services
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
echo "  - Patient profile -> RDV / Acte (patient pre-selected)"
echo "  - Traitements tab -> Ajouter -> Enregistrer"
echo "  - Lab result modal, notification modal (no outside-click close)"
echo "  - Chat suggestion fills input, then send manually"
echo ""

[ "$FAIL_COUNT" -eq 0 ] || exit 1
