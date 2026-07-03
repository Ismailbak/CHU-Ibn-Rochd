# RhumatoAI — On-Prem Operations Runbook

Complete reference for the **3-VM RhumatoAI deployment** on Proxmox (test site).
Covers architecture, every VM, the deployment process, day-to-day commands, a user
guide, and **what to do when things break**.

> Keep this file up to date. When you deploy the **second site**, copy this and change
> the IPs / hostnames in the tables.

---

## 1. Architecture overview

```
                 Clinic / office PC (10.13.x network)
                                │
                                │  http://10.13.19.111:8080
                                ▼
                   ┌─────────────────────────────┐
                   │  Proxmox host  "wdf"          │
                   │  10.13.19.111 (mgmt)          │
                   │  192.168.11.111 (vmbr0)       │
                   │  nginx reverse proxy :8080 ──►│──┐
                   └─────────────────────────────┘  │
                                                     │ proxy_pass
                                                     ▼
   ┌───────────────┐      ┌────────────────────────────┐      ┌────────────────────────┐
   │ 4010 rhumato-db│◄────│ 4020 rhumato-app             │─────►│ 4030 rhumato-ai         │
   │ 192.168.11.10  │ SQL │ 192.168.11.20 (enp6s18)      │ HTTP │ 192.168.11.30           │
   │ MySQL 8        │     │ 10.13.19.120  (enp6s19 2nd)  │11434 │ Ollama + RTX 3060       │
   │ rhumatoai      │     │ Nginx + FastAPI + React      │      │ model: gemma4:e4b       │
   │ rhumatoai_sec  │     │ systemd: ia-medical          │      │ systemd: ollama         │
   └───────────────┘      └────────────────────────────┘      └────────────────────────┘
```

**Two networks meet at the Proxmox host:**

- `10.13.19.0/24` — office/hospital LAN (your PC, Proxmox mgmt).
- `192.168.11.0/24` — internal lab VLAN on bridge `vmbr0` (the three VMs).

Your desk PC **cannot** reach `192.168.11.x` directly (Barracuda proxy blocks it), so
the browser goes through the **Proxmox nginx proxy** at `http://10.13.19.111:8080`.
VM **4020** also has a **second NIC** on `10.13.19.120` for direct access if routing allows.

---

## 2. The virtual machines

### Common to all VMs

| Item | Value |
|------|-------|
| Hypervisor node | `wdf` |
| OS | Ubuntu Server 24.04.4 LTS |
| Linux user | `ismailbak` (sudo) |
| Bridge | `vmbr0` |
| Gateway | `192.168.11.1` |
| DNS | `8.8.8.8`, `1.1.1.1` |
| Machine type | q35 |
| SSH | enabled (OpenSSH) |

### VM 4010 — `rhumato-db` (database)

| Item | Value |
|------|-------|
| IP | `192.168.11.10/24` |
| vCPU / RAM / Disk | 2 / 4 GB / 40 GB |
| Service | MySQL 8 (`systemctl … mysql`) |
| Databases | `rhumatoai` (primary), `rhumatoai_sec` (future AI sync) |
| App DB user | `rhumato_app@192.168.11.20` / password `App123` |
| Bind address | `0.0.0.0` (in `/etc/mysql/mysql.conf.d/mysqld.cnf`) |
| Port | 3306 |

### VM 4020 — `rhumato-app` (application)

| Item | Value |
|------|-------|
| IP (internal) | `192.168.11.20/24` — `enp6s18` (DB + AI traffic, default gateway) |
| IP (office)   | `10.13.19.120/24` — `enp6s19` (2nd NIC, no gateway) |
| vCPU / RAM / Disk | 4 / 8 GB / 40 GB (root LVM expanded to full disk) |
| App code | `/opt/ia-medical` (`backend/`, `frontend/web/build`) |
| Python venv | `/opt/ia-medical/backend/.venv` |
| Env file | `/etc/ia-medical/env` (mode 600) |
| Backend service | `ia-medical` (systemd) → uvicorn on `127.0.0.1:8000` |
| Web server | Nginx → `/etc/nginx/sites-available/ia-medical` |
| Serves | React build on port 80, proxies `/api/`, `/uploads/`, `/health` |

### VM 4030 — `rhumato-ai` (LLM)

| Item | Value |
|------|-------|
| IP | `192.168.11.30/24` |
| vCPU / RAM / Disk | 4 / 8 GB / 160 GB (root LVM expanded to ~155 GB) |
| GPU | NVIDIA RTX 3060 (PCI passthrough `0000:01:00.0`, BIOS q35 + SeaBIOS) |
| Service | `ollama` (systemd), listens `0.0.0.0:11434` |
| Model | `gemma4:e4b` (~9.6 GB) |
| Override | `/etc/systemd/system/ollama.service.d/override.conf` sets `OLLAMA_HOST=0.0.0.0:11434` |

### Proxmox host — `wdf`

| Item | Value |
|------|-------|
| Mgmt IP | `10.13.19.111` (web UI `https://10.13.19.111:8006`) |
| vmbr0 IP | `192.168.11.111` |
| Reverse proxy | nginx `:8080` → `http://192.168.11.20` (`/etc/nginx/sites-available/rhumato`) |
| Storage | `local` (dir, ISOs/backups) + `local-lvm` (VM disks, lvmthin) |

---

## 3. Configuration files (reference)

### `/etc/ia-medical/env` (on 4020)

```bash
APP_ENV=production
DATABASE_URL=mysql+pymysql://rhumato_app:App123@192.168.11.10:3306/rhumatoai
SECRET_KEY=<long-random-secret>
CORS_ORIGINS="http://192.168.11.20,http://10.13.19.120,http://10.13.19.111:8080,http://rheuma.local"
OLLAMA_HOST=http://192.168.11.30:11434
OLLAMA_MODEL=gemma4:e4b
RAG_SEMANTIC_ENABLED=false
CREATE_TABLES_ON_STARTUP=false
```

### `/etc/systemd/system/ia-medical.service` (on 4020)

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

### `/etc/nginx/sites-available/ia-medical` (on 4020)

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

### `/etc/nginx/sites-available/rhumato` (on Proxmox host)

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

### `/etc/netplan/50-cloud-init.yaml` (on 4020, dual NIC)

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

---

## 4. How to connect

### Browser (end users / you)

- From office PC: **`http://10.13.19.111:8080`**
- From a PC on the lab LAN: **`http://192.168.11.20`**

### SSH (admin) — jump through Proxmox

Your PC can reach Proxmox (`10.13.19.111`), and Proxmox can reach the VMs:

```powershell
# App VM
ssh -J root@10.13.19.111 ismailbak@192.168.11.20
# DB VM
ssh -J root@10.13.19.111 ismailbak@192.168.11.10
# AI VM
ssh -J root@10.13.19.111 ismailbak@192.168.11.30
```

### Proxmox console (always works, even if network/SSH is down)

Proxmox web UI → select VM → **Console**. Log in as `ismailbak`.

---

## 5. Deployment process (summary of what was done)

Order: **DB → App → AI**.

1. **Create 3 VMs** in Proxmox (Ubuntu 24.04, static IPs, `ismailbak` user, OpenSSH).
2. **4010 DB:**
   - Install MySQL 8, set `bind-address = 0.0.0.0`, open port 3306.
   - Create `rhumatoai` + `rhumatoai_sec`; create user `rhumato_app@192.168.11.20`.
   - Import existing dump (`mysqldump -r` from PC → transfer → `mysql rhumatoai < dump.sql`).
3. **4020 App:**
   - Install `python3-venv`, `nginx`, Node.js, `mysql-client`.
   - Copy repo to `/opt/ia-medical`; `python -m venv .venv`; `pip install -r requirements.txt`.
   - Write `/etc/ia-medical/env`; run `alembic upgrade head`.
   - `npm ci && REACT_APP_API_URL=/api npm run build` in `frontend/web`.
   - Create `ia-medical.service`; configure Nginx; open port 80.
   - Add **2nd NIC** (`10.13.19.120`) via netplan for office access.
4. **4030 AI:**
   - Install Ubuntu, add **GPU passthrough** (RTX 3060) after install.
   - Install Ollama; set `OLLAMA_HOST=0.0.0.0:11434` override; pull `gemma4:e4b`.
5. **Proxmox host:** nginx reverse proxy `:8080` → `192.168.11.20`.
6. **Verify:** `/health` returns `"ai_assistant":"ready"`; login + chat work in browser.

Full step-by-step is in [`deploy.md`](deploy.md).

---

## 6. Important commands (cheat sheet)

### Health & status

```bash
# App (run on 4020)
curl -s http://127.0.0.1:8000/health          # direct backend
curl -s http://127.0.0.1/health               # via local nginx
sudo systemctl status ia-medical nginx

# From Proxmox host
curl -s http://127.0.0.1:8080/health          # via reverse proxy

# AI (run on 4030)
curl -s http://127.0.0.1:11434/api/tags       # models loaded
nvidia-smi                                     # GPU status
sudo systemctl status ollama

# DB (run on 4010)
sudo systemctl status mysql
ss -tlnp | grep 3306                           # should show 0.0.0.0:3306
```

### Restart services

```bash
# 4020
sudo systemctl restart ia-medical
sudo systemctl reload nginx        # after nginx config change (test first!)
sudo nginx -t                      # validate nginx config

# 4030
sudo systemctl restart ollama

# 4010
sudo systemctl restart mysql

# Proxmox host
systemctl reload nginx
```

### Logs

```bash
# App backend (most useful for 500 errors / crashes)
sudo journalctl -u ia-medical -n 50 --no-pager
sudo journalctl -u ia-medical -f            # live follow

# Ollama
sudo journalctl -u ollama -n 50 --no-pager

# MySQL
sudo journalctl -u mysql -n 50 --no-pager

# Nginx
sudo tail -n 50 /var/log/nginx/error.log
```

### Database

```bash
# Connect from app VM (4020)
mysql -h 192.168.11.10 -u rhumato_app -pApp123 rhumatoai

# List users
mysql -h 192.168.11.10 -u rhumato_app -pApp123 rhumatoai \
  -e "SELECT id, username, email, is_active, is_admin FROM users;"

# On DB VM directly
sudo mysql rhumatoai -e "SHOW TABLES;"
```

### Ollama models

```bash
ollama list                        # installed models
ollama pull gemma4:e4b             # download a model
ollama rm <model>                  # delete a model
ollama run gemma4:e4b "Bonjour"    # quick test
```

### Environment / migrations (on 4020)

```bash
set -a && source /etc/ia-medical/env && set +a
cd /opt/ia-medical/backend && source .venv/bin/activate
alembic upgrade head               # apply DB migrations
python scripts/setup_admin.py      # (re)create admin — needs ADMIN_PASSWORD
```

---

## 7. User guide (clinic staff)

1. Open a browser and go to **`http://10.13.19.111:8080`**.
2. Log in with your account (email + password), e.g. `admin@chu.ma`.
3. Main areas:
   - **Dashboard** — overview.
   - **Patients** — create / view / edit patient files.
   - **Appointments** — schedule and view.
   - **Medical Acts / Forms** — clinical forms and documents.
   - **Assistant** (`/assistant`) — AI chat. First answer may take **10–30 s** (model loads on GPU).
4. Log out when finished. The app auto-logs out after **30 minutes** of inactivity.

**Notes for users:**
- If a page is blank, refresh with **Ctrl+Shift+R**.
- If AI chat says unavailable, tell the admin (VM 4030 / Ollama may be down).
- Do not share accounts; each doctor/nurse has their own login.

---

## 8. Incident response — "what to do in accidents"

> Golden rule: **stay calm, check `/health` first, read the logs before changing things.**
> The Proxmox **Console** always works even if SSH/network is broken.

### 8.1 Quick triage

```bash
# On 4020
curl -s http://127.0.0.1:8000/health
```

| `/health` shows | Meaning | Go to |
|-----------------|---------|-------|
| `status: ok`, `ai_assistant: ready` | Everything fine | — |
| `ai_assistant: unavailable` | Ollama/4030 problem | §8.5 |
| `Internal Server Error` / no response | Backend crashed | §8.3 |
| Page unreachable in browser | Network/proxy/nginx | §8.2 |

### 8.2 Website won't load in browser

1. Is the VM up? Proxmox → **4020** running?
2. On 4020: `sudo systemctl status nginx ia-medical`
3. `sudo nginx -t` — fix config errors, then `sudo systemctl reload nginx`.
4. Proxy path: on Proxmox host `curl -s http://127.0.0.1:8080/health`.
   - Fails → `systemctl status nginx` on the host; reload.
5. From your PC: `ping 10.13.19.111` (Proxmox). If that fails, it's your office network.
6. **White screen:** rebuild frontend —
   ```bash
   cd /opt/ia-medical/frontend/web
   rm -rf node_modules build && npm ci && REACT_APP_API_URL=/api npm run build
   sudo systemctl reload nginx
   ```

### 8.3 Login fails / 500 Internal Server Error

Check the backend log first:

```bash
sudo journalctl -u ia-medical -n 50 --no-pager
```

Known cause — **bcrypt/passlib clash** (`password cannot be longer than 72 bytes`):

```bash
cd /opt/ia-medical/backend && source .venv/bin/activate
pip install 'bcrypt==4.0.1'
sudo systemctl restart ia-medical
```

Wrong password (401, not 500) — reset admin:

```bash
set -a && source /etc/ia-medical/env && set +a
export ADMIN_PASSWORD='NewSecurePass'
cd /opt/ia-medical/backend && source .venv/bin/activate
python scripts/setup_admin.py
```

CORS error in browser console — make sure `/etc/ia-medical/env` `CORS_ORIGINS`
includes `http://10.13.19.111:8080`, then `sudo systemctl restart ia-medical`.

### 8.4 Database connection errors

```bash
# From 4020 — can we reach MySQL?
mysql -h 192.168.11.10 -u rhumato_app -pApp123 rhumatoai -e "SELECT 1;"
```

- **Connection refused / timeout:**
  - On 4010: `sudo systemctl status mysql`; `ss -tlnp | grep 3306` must show `0.0.0.0`.
  - If it shows `127.0.0.1`, set `bind-address = 0.0.0.0` in
    `/etc/mysql/mysql.conf.d/mysqld.cnf`, then `sudo systemctl restart mysql`.
- **Access denied:** user/host/password mismatch — re-grant
  `rhumato_app@192.168.11.20`.

### 8.5 AI chat unavailable

```bash
# On 4020 — can we reach Ollama?
curl -s http://192.168.11.30:11434/api/tags
```

- **Connection refused:** Ollama bound to localhost only. On 4030:
  ```bash
  sudo mkdir -p /etc/systemd/system/ollama.service.d
  echo -e "[Service]\nEnvironment=\"OLLAMA_HOST=0.0.0.0:11434\"" | \
    sudo tee /etc/systemd/system/ollama.service.d/override.conf
  sudo systemctl daemon-reload && sudo systemctl restart ollama
  ss -tlnp | grep 11434     # must show *:11434
  ```
- **Model missing:** `ollama list` on 4030; if empty `ollama pull gemma4:e4b`.
- **Model name mismatch:** `OLLAMA_MODEL` in `/etc/ia-medical/env` must equal the
  pulled model (`gemma4:e4b`). Fix and `sudo systemctl restart ia-medical`.
- **GPU not detected:** `nvidia-smi` on 4030. If it fails, reboot; if still failing,
  check the PCI passthrough device in Proxmox Hardware (`0000:01:00.0`).

### 8.6 Disk full / "IO error" (this happened once)

Symptom: VM shows **IO error**, Ollama pull stuck, writes fail.

Cause: Proxmox **`local-lvm` at 100%**.

```bash
# On Proxmox host
pvesm status          # check local-lvm %
df -h
```

Fixes:
- Delete unused VMs/disks/backups/ISOs to free `local-lvm`.
- Inside a VM, if its own `/` is full but the disk has room (LVM half-used by default):
  ```bash
  df -h /
  sudo lvextend -l +100%FREE /dev/ubuntu-vg/ubuntu-lv
  sudo resize2fs /dev/ubuntu-vg/ubuntu-lv
  ```

### 8.7 A VM won't stop

Use Proxmox **Stop** (hard power off), not Shutdown. If Stop fails, wait a minute and
retry, or **More → Reset**. Check the **Tasks** panel for the error.

### 8.8 Full recovery order (after power loss / reboot)

Start VMs in this order and verify each:

1. **4010** (DB) → `sudo systemctl status mysql`
2. **4030** (AI) → `curl -s http://127.0.0.1:11434/api/tags`
3. **4020** (App) → `curl -s http://127.0.0.1:8000/health`
4. **Proxmox nginx** proxy → `curl -s http://127.0.0.1:8080/health`
5. Browser → `http://10.13.19.111:8080` → log in → test chat.

---

## 9. Backups & snapshots

### Proxmox snapshots (fast rollback)

Take after any known-good state: VM → **Snapshots** → Take.
Suggested names: `db-deployed`, `full-stack`, `ollama-gemma4`.

### Database dump (off-box copy)

```bash
# From 4020 or 4010
mysqldump -h 192.168.11.10 -u rhumato_app -pApp123 --single-transaction \
  rhumatoai -r /tmp/rhumatoai-$(date +%F).sql
# then copy off the VM (scp to Proxmox, download, etc.)
```

Restore:

```bash
mysql -h 192.168.11.10 -u rhumato_app -pApp123 rhumatoai < /tmp/rhumatoai-YYYY-MM-DD.sql
```

> On Windows, always dump with `mysqldump -r file.sql` (never PowerShell `>`, which
> creates a UTF-16 file that MySQL import chokes on). If you get a bad file:
> `iconv -f UTF-16LE -t UTF-8 in.sql > out.sql`.

---

## 10. File transfer (PC → VM) when PC can't reach the VM

1. Copy to Proxmox host: `scp FILE root@10.13.19.111:/tmp/`
2. On Proxmox: `cd /tmp && python3 -m http.server 8888 --bind 0.0.0.0`
3. On the VM: `wget http://192.168.11.111:8888/FILE -O /tmp/FILE`  (capital `-O`)
4. Ctrl+C the http server on Proxmox when done.

---

## 11. Known gotchas (learned during this deploy)

| Problem | Root cause | Fix |
|---------|-----------|-----|
| Login 500 error | `bcrypt 5.x` incompatible with `passlib 1.7.4` | pin `bcrypt==4.0.1` |
| AI chat unavailable from 4020 | Ollama bound to `127.0.0.1` | `OLLAMA_HOST=0.0.0.0:11434` override |
| VM IO error | Proxmox `local-lvm` full | free space (deleted VM 3001) |
| Browser can't reach 192.168.11.20 | Office network / Barracuda can't route | use Proxmox proxy `:8080` or 2nd NIC |
| `npm run build` permission denied | `node_modules` copied from Windows | delete it, `npm ci` on the VM |
| `/` full after `pip install` | Ubuntu LVM uses ~half the disk | `lvextend` + `resize2fs` |
| MySQL import garbled | PowerShell `>` made UTF-16 file | `mysqldump -r` / `iconv` |
| netplan `unknown key` / indentation | tabs or wrong indent in YAML | spaces only; interfaces aligned |

---

## 12. Second-site replication checklist

When deploying at the next clinic:

1. Same 3 VMs, Ubuntu 24.04, user `ismailbak`, static IPs (adjust subnet).
2. Import latest `rhumatoai` dump into the new DB VM.
3. `pip install -r requirements.txt` (now includes `bcrypt==4.0.1`).
4. Set `/etc/ia-medical/env` with the new IPs and a **new** `SECRET_KEY`.
5. Ollama: `OLLAMA_HOST=0.0.0.0:11434` + `ollama pull gemma4:e4b`.
6. GPU passthrough if a card is available; otherwise CPU (slower).
7. Decide browser access with IT: routing to the app subnet, a reverse proxy,
   DNS name, or a 2nd NIC (as done here).
8. Snapshot every VM once login + chat work.

---

*Last updated: deployment of the office test site (3-VM stack live, `gemma4:e4b`).*
