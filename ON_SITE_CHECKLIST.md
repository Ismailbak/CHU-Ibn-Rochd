# RhumatoAI — On-Site Production Checklist

Print or open on your phone. Fill in **Prod values** on arrival, then work top to bottom.

Full steps: [`DEPLOY_MANUAL.md`](DEPLOY_MANUAL.md) · Incidents: [`RUNBOOK.md`](RUNBOOK.md)

---

## Fill in on arrival

| Item | Prod value |
|------|------------|
| Proxmox UI | `https://192.168.1.159:8006` |
| Proxmox SSH (root) | `ismailbak` |
| vm_dwh (4010) | `____________` |
| vm_smarthoshealth (4020) | `____________` |
| vm_mia (4030) | `____________` |
| Gateway | `____________` |
| Staff browser URL | `http://____________` |
| rhumato_app password |deploy123|
| ia_sync password |deploy123|
| SECRET_KEY (new) |deploy123|
| Admin email | ____________ |
| Admin password | ____________ |
| Dump filename | `rhumatoai-________.sql` |

---

## Phase A — Before VMs (30 min)

- [ ] Proxmox login works
- [ ] Ubuntu ISO on `local`
- [ ] Enough `local-lvm` free space (~260 GB+)
- [ ] Dump file on PC (or create from test DB on site)
- [ ] Prod passwords + SECRET_KEY written down

---

## Phase B — Create VMs (4010 → 4030 → 4020)

For each VM: Proxmox Create VM → Ubuntu install → static IP → user `ismailbak` + OpenSSH

- [ ] **4010** rhumato-db — 2 CPU / 4 GB / 40 GB
- [ ] **4030** rhumato-ai — 4 CPU / 8 GB / 160 GB (+ GPU if ready)
- [X] **4020** vm-smarthoshealth — 4 CPU / 8 GB / 40 GB
- [ ] Expand disk on each: `lvextend` + `resize2fs`

---

## Phase C — Dump to prod DB (4010)

**Create dump** (if not brought from PC — on test/source DB):
```bash
mysqldump -h SOURCE_IP -u rhumato_app -p --single-transaction rhumatoai -r /tmp/rhumatoai-DATE.sql
```

**PC → Proxmox → DB VM:**
```powershell
# On PC
scp D:\backups\rhumatoai-DATE.sql root@PROXMOX_IP:/tmp/
```
```bash
# On Proxmox
scp /tmp/rhumatoai-DATE.sql ismailbak@PROD_DB_IP:/tmp/
```

**On 4010:**
- [ ] MySQL installed, `bind-address = 0.0.0.0`, port 3306 open
- [ ] Databases `rhumatoai` + `rhumatoai_sec` created
- [ ] Users `rhumato_app@PROD_APP_IP` + `ia_sync@PROD_APP_IP` created
- [ ] `file /tmp/rhumatoai-*.sql` → UTF-8/ASCII (not UTF-16)
- [ ] Import: `sudo mysql rhumatoai < /tmp/rhumatoai-DATE.sql`
- [ ] Verify: `SELECT COUNT(*) FROM patients;` + admin user exists
- [ ] Snapshot: `4010-db-imported`

---

## Phase D — AI VM (4030)

- [ ] Ollama installed
- [ ] `OLLAMA_HOST=0.0.0.0:11434` override + restart
- [ ] `ollama pull gemma4:e4b`
- [ ] `curl http://127.0.0.1:11434/api/tags` shows model
- [ ] Snapshot: `4030-ai-ready`

---

## Phase E — App VM (4020)

- [ ] `apt install` python3-venv nginx mysql-client git nodejs
- [ ] `git clone` → `/opt/ia-medical`
- [ ] `pip install -r requirements.txt` + `bcrypt==4.0.1`
- [ ] `/etc/ia-medical/env` written (600 perms) — **new SECRET_KEY**
- [ ] `nc -vz PROD_DB_IP 3306` OK
- [ ] `nc -vz PROD_AI_IP 11434` OK
- [ ] **Load env:** `set -a && source /etc/ia-medical/env && set +a`
- [ ] `alembic upgrade head`
- [ ] `npm ci && REACT_APP_API_URL=/api npm run build`
- [ ] `ia-medical.service` + nginx configured
- [ ] `curl http://127.0.0.1:8000/health` → ok + ai_assistant ready
- [ ] Snapshot: `4020-app-running`

---

## Phase F — Proxy + RAG sync

- [ ] Proxmox nginx `:8080` → app VM (if staff use proxy URL)
- [ ] Staff URL opens login page in browser
- [ ] RAG sync:
  ```bash
  set -a && source /etc/ia-medical/env && set +a
  cd /opt/ia-medical/backend && source .venv/bin/activate
  python -m scripts.sync_rag_database --init-schema
  python -m scripts.sync_rag_database
  ```
- [ ] Cron every 10 min (see DEPLOY_MANUAL §7)
- [ ] Primary vs secondary patient counts match

---

## Phase G — Smoke tests (must pass)

**Server:**
```bash
bash /opt/ia-medical/scripts/golden_path_vm.sh http://127.0.0.1:8000 'ADMIN_EMAIL' 'ADMIN_PASSWORD'
```
- [ ] **17 passed, 0 failed**

**Browser (Ctrl+F5):**
- [ ] Login admin
- [ ] Login nurse
- [ ] Patients search `ismail`
- [ ] Actes médicaux loads
- [ ] Notification bell red dot
- [ ] Admin settings health OK
- [ ] Maintenance OFF
- [ ] Assistant answers on known patient

---

## Phase H — Go live

- [ ] Snapshots: `4010-go-live`, `4020-go-live`, `4030-go-live`
- [ ] Hand staff URL + credentials
- [ ] Note commit hash: `git log -1 --oneline`

---

## If stuck (quick)

| Problem | Fix |
|---------|-----|
| Alembic → localhost | `set -a && source /etc/ia-medical/env && set +a` |
| Can't scp to VM | PC → Proxmox `/tmp/` → VM |
| Import garbled | Dump must be UTF-8; use `mysqldump -r` |
| AI unavailable | 4030 Ollama on `0.0.0.0:11434` |
| Login 500 | `journalctl -u ia-medical -n 50`; `bcrypt==4.0.1` |

---

*Take this + DEPLOY_MANUAL on site. Good luck.*
