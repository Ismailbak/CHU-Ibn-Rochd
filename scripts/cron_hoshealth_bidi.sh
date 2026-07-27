#!/usr/bin/env bash
# Run on app VM (4020): hoshealth ↔ primary, then primary → secondary.
set -uo pipefail
set -a
# shellcheck disable=SC1091
source /etc/smarthos/env
set +a
cd /opt/smarthos/backend
# shellcheck disable=SC1091
source .venv/bin/activate
mkdir -p /opt/smarthos/logs
# Do not use set -e: bidi may report phase errors but still sync patients.
python -m scripts.sync_hoshealth_bidi --commit
bidi_rc=$?
python -m scripts.sync_rag_database
rag_rc=$?
if [ "$bidi_rc" -ne 0 ]; then
  exit "$bidi_rc"
fi
exit "$rag_rc"
