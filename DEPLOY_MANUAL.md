# RhumatoAI — Full Day-Of Deployment Manual

**Use this document tomorrow.** Follow sections **in order**. Do not skip verification steps.

Related reference (architecture, incidents, gotchas): [`RUNBOOK.md`](RUNBOOK.md)

---

## 0. Before you start (checklist)

### People & access
- [ ] Proxmox UI login: `https://10.13.19.111:8006` (host `wdf`)
- [ ] Linux user on all VMs: `ismailbak` (sudo)
- [ ] GitHub access to clone/pull `Medical-AI-Assitant`
- [ ] Admin web login ready (e.g. `admin@chu.ma`)
- [ ] USB / offline packages if the VLAN has no internet (Node, Ollama model, apt cache)

### Assets to have ready
- [ ] Ubuntu ISO on Proxmox `local`: `ubuntu-24.04.4-live-server-amd64.iso`
- [ ] Latest MySQL dump of primary DB: `rhumatoai-YYYY-MM-DD.sql` (UTF-8, created with `mysqldump -r`)
- [ ] Strong `SECRET_KEY` generated (do not reuse the default)
- [ ] Passwords written down securely:
  - MySQL `rhumato_app` / `ia_sync`
  - Admin web password
  - Linux `ismailbak`

### Target topology (test / current site)

| VM ID | Hostname | Role | IP | Specs |
|------:|----------|------|----|-------|
| 4010 | `rhumato-db` | MySQL 8 | `192.168.11.10/24` | 2 vCPU / 4 GB / 40 GB |
| 4020 | `rhumato-app` | Nginx + FastAPI + React | `192.168.11.20/24` (+ optional `10.13.19.120`) | 4 vCPU / 8 GB / 40 GB |
| 4030 | `rhumato-ai` | Ollama + GPU | `192.168.11.30/24` | 4 vCPU / 8 GB / 160 GB |

| Network | Value |
|---------|-------|
| Bridge | `vmbr0` |
| Gateway | `192.168.11.1` |
| DNS | `8.8.8.8`, `1.1.1.1` |
| Office access | `http://10.13.19.111:8080` (Proxmox nginx → 4020) |
| Direct app (lab) | `http://192.168.11.20` |
| Optional 2nd NIC | `10.13.19.120` on 4020 |

### Order of work tomorrow
1. Create 3 VMs in Proxmox  
2. Install Ubuntu on each  
3. Configure **4010 DB**  
4. Configure **4030 AI** (can parallel with DB if two people)  
5. Configure **4020 App**  
6. Proxmox reverse proxy  
7. Sync secondary DB + cron  
8. Golden path + browser smoke  
9. Snapshots  

---

## 1. Create the three VMs in Proxmox

Repeat this for **4010**, **4020**, **4030**. Only name / ID / CPU / RAM / disk change.

### 1.1 Create VM wizard

1. Open Proxmox → node **`wdf`** → **Create VM**.
2. **General**
   - VM ID / Name from table above  
   - Start at boot: unchecked (enable later when stable)  
3. **OS**
   - Use CD/DVD ISO image  
   - Storage: `local`  
   - ISO: `ubuntu-24.04.4-live-server-amd64.iso`  
   - Type: Linux 6.x  
4. **System**
   - Machine: **q35**  
   - BIOS: SeaBIOS  
   - SCSI Controller: VirtIO SCSI single  
   - Qemu Agent / TPM: unchecked  
5. **Disks**
   - Storage: `local-lvm`  
   - Size from table  
   - Format: raw  
6. **CPU**
   - Sockets: 1  
   - Cores from table  
   - Type: `host` if available  
7. **Memory**
   - MiB from table  
8. **Network**
   - Bridge: `vmbr0`  
   - Model: VirtIO  
   - Firewall: **unchecked**  
9. Finish → **do not** start yet if you need GPU passthrough on 4030 first (see §1.2).

### 1.2 GPU passthrough (4030 only — before or after first boot)

If RTX 3060 is already configured on this Proxmox host:

1. Select VM **4030** → **Hardware** → **Add** → **PCI Device**  
2. Device: GPU (`0000:01:00.0` or as documented on host)  
3. Options typically: All Functions / ROM-Bar as used on the test site  
4. Machine stays **q35** + SeaBIOS  

If GPU is not ready yet: install Ubuntu first, add PCI device later, then reboot 4030.

### 1.3 Start VMs and open Console

Proxmox → each VM → **Start** → **Console**.

---

## 2. Install Ubuntu on each VM (identical base)

On the installer for **every** VM:

1. Language / keyboard as needed  
2. **Network** — set static IP for that VM:

```text
Subnet:  192.168.11.0/24
Address: 192.168.11.10   # or .20 / .30
Gateway: 192.168.11.1
DNS:     8.8.8.8,1.1.1.1
Hostname: rhumato-db | rhumato-app | rhumato-ai
```

3. Create user **`ismailbak`** with sudo, strong password  
4. Install **OpenSSH server**  
5. Finish install → reboot → login as `ismailbak`  

### 2.1 Expand root filesystem (do on each VM)

Ubuntu often leaves free LVM space unused:

```bash
df -h /
sudo lvextend -l +100%FREE /dev/ubuntu-vg/ubuntu-lv
sudo resize2fs /dev/ubuntu-vg/ubuntu-lv
df -h /
```

### 2.2 Update packages (if internet available)

```bash
sudo apt update && sudo apt upgrade -y
```

### 2.3 Snapshot checkpoint

Proxmox → each VM → **Snapshots** → `after-ubuntu-base`

---

## 3. VM 4010 — Database (`rhumato-db`)

SSH (from PC via Proxmox jump) or Console:

```bash
ssh -J root@10.13.19.111 ismailbak@192.168.11.10
```

### 3.1 Install MySQL 8

```bash
sudo apt update
sudo apt install -y mysql-server
sudo systemctl enable --now mysql
sudo systemctl status mysql --no-pager
```

### 3.2 Bind MySQL to all interfaces

```bash
sudo sed -i 's/^bind-address.*/bind-address = 0.0.0.0/' /etc/mysql/mysql.conf.d/mysqld.cnf
grep bind-address /etc/mysql/mysql.conf.d/mysqld.cnf
sudo systemctl restart mysql
ss -tlnp | grep 3306
# must show 0.0.0.0:3306 (not 127.0.0.1 only)
```

### 3.3 Create databases and users

```bash
sudo mysql
```

```sql
CREATE DATABASE IF NOT EXISTS rhumatoai CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS rhumatoai_sec CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'rhumato_app'@'192.168.11.20' IDENTIFIED BY 'App123';
GRANT ALL PRIVILEGES ON rhumatoai.* TO 'rhumato_app'@'192.168.11.20';

CREATE USER IF NOT EXISTS 'ia_sync'@'192.168.11.20' IDENTIFIED BY 'Sync123';
GRANT ALL PRIVILEGES ON rhumatoai_sec.* TO 'ia_sync'@'192.168.11.20';

FLUSH PRIVILEGES;
SHOW DATABASES;
EXIT;
```

> Change `App123` / `Sync123` for a real clinical site and keep them in a password vault.

### 3.4 Import primary dump

Copy dump to 4010 (via Proxmox if needed — see RUNBOOK §10), then:

```bash
# Example path
sudo mysql rhumatoai < /tmp/rhumatoai-YYYY-MM-DD.sql

# Verify
sudo mysql rhumatoai -e "SHOW TABLES;"
sudo mysql rhumatoai -e "SELECT COUNT(*) AS patients FROM patients;"
sudo mysql rhumatoai -e "SELECT id, username, email, is_admin, is_active FROM users LIMIT 10;"
```

**Do not** import the dump into `rhumatoai_sec` — sync will fill it later.

### 3.5 DB done checkpoint

- [ ] MySQL active  
- [ ] Port `0.0.0.0:3306`  
- [ ] `rhumatoai` has data  
- [ ] `rhumatoai_sec` empty (or schema only later)  
- [ ] Snapshot: `db-imported`

---

## 4. VM 4030 — AI (`rhumato-ai`)

```bash
ssh -J root@10.13.19.111 ismailbak@192.168.11.30
```

### 4.1 Confirm GPU (if passthrough)

```bash
lspci | grep -i nvidia
# After NVIDIA drivers / Ollama install:
nvidia-smi
```

### 4.2 Install Ollama

```bash
curl -fsSL https://ollama.com/install.sh | sh
# Offline: install from pre-downloaded package instead
sudo systemctl enable --now ollama
```

### 4.3 Listen on all interfaces (required for 4020)

```bash
sudo mkdir -p /etc/systemd/system/ollama.service.d
echo -e '[Service]\nEnvironment="OLLAMA_HOST=0.0.0.0:11434"' | \
  sudo tee /etc/systemd/system/ollama.service.d/override.conf
sudo systemctl daemon-reload
sudo systemctl restart ollama
ss -tlnp | grep 11434
# must show *:11434 or 0.0.0.0:11434
```

### 4.4 Pull model

```bash
ollama pull gemma4:e4b
ollama list
ollama run gemma4:e4b "Bonjour, réponds en une phrase."
curl -s http://127.0.0.1:11434/api/tags | head
```

### 4.5 AI done checkpoint

- [ ] `ollama` active  
- [ ] Model `gemma4:e4b` listed  
- [ ] Listening on `0.0.0.0:11434`  
- [ ] Snapshot: `ai-ollama-ready`

---

## 5. VM 4020 — Application (`rhumato-app`)

```bash
ssh -J root@10.13.19.111 ismailbak@192.168.11.20
```

### 5.1 Install system packages

```bash
sudo apt update
sudo apt install -y python3-venv python3-pip nginx mysql-client git curl

# Node.js 20.x (if internet)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
```

### 5.2 Clone repository

```bash
sudo mkdir -p /opt/ia-medical
sudo chown ismailbak:ismailbak /opt/ia-medical
cd /opt/ia-medical
git clone https://github.com/Ismailbak/Medical-AI-Assitant.git .
# Or: rsync / copy from USB if offline
git log -1 --oneline
```

### 5.3 Python venv + dependencies

```bash
cd /opt/ia-medical/backend
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
# Ensure bcrypt pin if needed:
pip install 'bcrypt==4.0.1'
```

### 5.4 Environment file

```bash
sudo mkdir -p /etc/ia-medical
sudo nano /etc/ia-medical/env
```

Paste (adjust secrets/passwords/CORS for the site):

```bash
APP_ENV=production
DATABASE_URL=mysql+pymysql://rhumato_app:App123@192.168.11.10:3306/rhumatoai
RAG_DATABASE_URL=mysql+pymysql://ia_sync:Sync123@192.168.11.10:3306/rhumatoai_sec
SECRET_KEY=REPLACE_WITH_LONG_RANDOM_SECRET
CORS_ORIGINS="http://192.168.11.20,http://10.13.19.120,http://10.13.19.111:8080,http://rheuma.local"
OLLAMA_HOST=http://192.168.11.30:11434
OLLAMA_MODEL=gemma4:e4b
RAG_SEMANTIC_ENABLED=false
CREATE_TABLES_ON_STARTUP=false
```

```bash
sudo chmod 600 /etc/ia-medical/env
sudo chown root:root /etc/ia-medical/env
```

### 5.5 Test DB + Ollama from app VM

```bash
nc -vz 192.168.11.10 3306
nc -vz 192.168.11.30 11434
mysql -h 192.168.11.10 -u rhumato_app -pApp123 rhumatoai -e "SELECT 1;"
curl -s http://192.168.11.30:11434/api/tags | head
```

### 5.6 Migrations (always load env first)

```bash
cd /opt/ia-medical/backend
source .venv/bin/activate
set -a && source /etc/ia-medical/env && set +a
echo "$DATABASE_URL"   # must show 192.168.11.10 — NOT localhost
alembic upgrade head
```

### 5.7 Create / reset admin (if needed)

```bash
set -a && source /etc/ia-medical/env && set +a
export ADMIN_PASSWORD='ChooseAStrongPassword'
cd /opt/ia-medical/backend && source .venv/bin/activate
python scripts/setup_admin.py
```

### 5.8 Build frontend

```bash
cd /opt/ia-medical/frontend/web
rm -rf node_modules build
npm ci
REACT_APP_API_URL=/api npm run build
test -f build/index.html && echo "frontend build: OK"
```

### 5.9 systemd service

```bash
sudo nano /etc/systemd/system/ia-medical.service
```

```ini
[Unit]
Description=IA Medical FastAPI backend
After=network.target

[Service]
User=ismailbak
WorkingDirectory=/opt/ia-medical/backend
EnvironmentFile=/etc/ia-medical/env
ExecStart=/opt/ia-medical/backend/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 4
Restart=always
RestartSec=5
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now ia-medical
sudo systemctl status ia-medical --no-pager
curl -s http://127.0.0.1:8000/health; echo
```

Expected:

```json
{"status":"ok","environment":"production","ai_assistant":"ready"}
```

If `ai_assistant` is `unavailable`, fix 4030 / `OLLAMA_*` then `sudo systemctl restart ia-medical`.

### 5.10 Nginx on 4020

```bash
sudo nano /etc/nginx/sites-available/ia-medical
```

```nginx
server {
    listen 80;
    server_name rheuma.local 192.168.11.20 10.13.19.120;

    root /opt/ia-medical/frontend/web/build;
    index index.html;

    location / { try_files $uri $uri/ /index.html; }

    location /api/ {
        proxy_pass http://127.0.0.1:8000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }

    location /uploads/ {
        proxy_pass http://127.0.0.1:8000/uploads/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location = /health { proxy_pass http://127.0.0.1:8000/health; }
}
```

```bash
sudo ln -sf /etc/nginx/sites-available/ia-medical /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl enable --now nginx
sudo systemctl reload nginx
curl -s http://127.0.0.1/health; echo
```

### 5.11 Optional: second NIC for office LAN (`10.13.19.120`)

```bash
ip -br a
sudo nano /etc/netplan/50-cloud-init.yaml
```

Example (interface names may differ — check with `ip -br a`):

```yaml
network:
  version: 2
  ethernets:
    enp6s18:
      addresses:
        - 192.168.11.20/24
      routes:
        - to: default
          via: 192.168.11.1
      nameservers:
        addresses:
          - 8.8.8.8
          - 1.1.1.1
    enp6s19:
      addresses:
        - 10.13.19.120/24
```

```bash
sudo netplan apply
ip -br a
```

### 5.12 App done checkpoint

- [ ] `/health` ok + AI ready  
- [ ] Nginx serves build  
- [ ] Snapshot: `app-running`

---

## 6. Proxmox host — reverse proxy (office access)

On Proxmox host (`root@10.13.19.111`):

```bash
# install nginx if missing
apt install -y nginx
nano /etc/nginx/sites-available/rhumato
```

```nginx
server {
    listen 8080;
    server_name 10.13.19.111;
    location / {
        proxy_pass http://192.168.11.20;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 120s;
    }
}
```

```bash
ln -sf /etc/nginx/sites-available/rhumato /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
curl -s http://127.0.0.1:8080/health; echo
```

From an office PC browser: **`http://10.13.19.111:8080`**

---

## 7. Secondary DB sync (RAG)

On **4020**:

```bash
mkdir -p /opt/ia-medical/logs
cd /opt/ia-medical/backend
source .venv/bin/activate
set -a && source /etc/ia-medical/env && set +a
python -m scripts.sync_rag_database --init-schema
python -m scripts.sync_rag_database
```

Verify on **4010**:

```bash
sudo mysql -e "
SELECT 'PRIMARY patients' AS label, COUNT(*) AS n FROM rhumatoai.patients
UNION ALL SELECT 'SECONDARY patients', COUNT(*) FROM rhumatoai_sec.patients
UNION ALL SELECT 'PRIMARY acts', COUNT(*) FROM rhumatoai.medical_acts
UNION ALL SELECT 'SECONDARY acts', COUNT(*) FROM rhumatoai_sec.medical_acts;
"
```

Cron on **4020**:

```bash
crontab -e
```

Add **one** line:

```
*/10 * * * * set -a && source /etc/ia-medical/env && set +a && cd /opt/ia-medical/backend && .venv/bin/python -m scripts.sync_rag_database >> /opt/ia-medical/logs/rhumato-sync.log 2>&1
```

```bash
crontab -l | grep sync
tail -n 20 /opt/ia-medical/logs/rhumato-sync.log
```

---

## 8. Day-of verification (must pass)

### 8.1 Server smoke

On **4020**:

```bash
sudo systemctl is-active ia-medical nginx
curl -s http://127.0.0.1:8000/health; echo
cd /opt/ia-medical && git log -1 --oneline
test -f frontend/web/build/index.html && echo "frontend build: OK"

set -a && source /etc/ia-medical/env && set +a
nc -vz 192.168.11.10 3306
nc -vz 192.168.11.30 11434
curl -s http://127.0.0.1:8000/api/analytics/maintenance-status; echo
curl -s http://127.0.0.1:8000/api/analytics/session-config; echo

bash /opt/ia-medical/scripts/golden_path_vm.sh \
  http://127.0.0.1:8000 'admin@chu.ma' 'YOUR_REAL_PASSWORD'
```

Target: **all PASS**, 0 FAIL.

### 8.2 Browser smoke (hard refresh: Ctrl+F5)

Open `http://10.13.19.111:8080` (or direct app URL).

| # | Check | Pass? |
|---|--------|-------|
| 1 | Login admin | [ ] |
| 2 | Login nurse | [ ] |
| 3 | Patients search `ismail` → names only (not street) | [ ] |
| 4 | Actes médicaux list loads (no 500) on nurse | [ ] |
| 5 | Header search returns patients / RDV / actes | [ ] |
| 6 | Send notification → red dot on bell → mark read clears | [ ] |
| 7 | Admin → Paramètres → santé: Connectée / Accessible / Disponible / Synchronisé | [ ] |
| 8 | Session timeout setting saves (optional short test) | [ ] |
| 9 | Maintenance ON → nurse blocked → turn OFF | [ ] |
| 10 | Assistant: known patient (IPP or both name orders) | [ ] |

### 8.3 Final snapshots

Proxmox snapshots when all green:

- `4010-go-live`
- `4020-go-live`
- `4030-go-live`

---

## 9. Code update later (same day / next days)

On **4020** only:

```bash
cd /opt/ia-medical
git pull

cd backend
source .venv/bin/activate
set -a && source /etc/ia-medical/env && set +a
alembic upgrade head

cd ../frontend/web
npm ci
REACT_APP_API_URL=/api npm run build

sudo systemctl restart ia-medical
sudo systemctl reload nginx
curl -s http://127.0.0.1:8000/health; echo
```

Optional immediate RAG sync:

```bash
cd /opt/ia-medical/backend
source .venv/bin/activate
set -a && source /etc/ia-medical/env && set +a
python -m scripts.sync_rag_database
```

---

## 10. If something breaks (quick)

| Symptom | First action |
|---------|----------------|
| Alembic → `localhost` refused | `set -a && source /etc/ia-medical/env && set +a` then retry |
| `/health` no AI | Check 4030 `ss -tlnp \| grep 11434`, restart ollama, restart `ia-medical` |
| Login 500 | `journalctl -u ia-medical -n 50`; pin `bcrypt==4.0.1` |
| DB refused from 4020 | On 4010: MySQL up + `bind-address = 0.0.0.0` |
| Browser blank | Rebuild frontend; Ctrl+F5 |
| Office can't open site | Use `http://10.13.19.111:8080`; check Proxmox nginx |
| Assistant stale | Run sync or wait for cron |

Full incident playbook: [`RUNBOOK.md`](RUNBOOK.md) §8.

---

## 11. Day-of timeline (suggested)

| Time | Task |
|------|------|
| 0:00–0:45 | Create 3 VMs + Ubuntu install |
| 0:45–1:30 | 4010 MySQL + import dump |
| 0:45–1:45 | 4030 Ollama + model (parallel if 2 people) |
| 1:30–3:00 | 4020 app install, env, migrate, build, systemd, nginx |
| 3:00–3:20 | Proxmox proxy |
| 3:20–3:40 | Secondary sync + cron |
| 3:40–4:10 | Golden path + browser smoke |
| 4:10–4:20 | Snapshots + handoff URL/credentials |

---

## 12. Handoff card (fill at end of day)

```text
URL:              http://10.13.19.111:8080
Admin:            __________________
Nurse test:       __________________
Git commit:       __________________
DB dump used:     __________________
SECRET_KEY set:   yes / no
Sync cron:        yes / no
Snapshots taken:  yes / no
AI model:         gemma4:e4b
Notes:            __________________
```

---

*Prepared for go-live — Jul 2026. Keep IPs/passwords in sync with the real site; update this file if the second clinic uses a different subnet.*
