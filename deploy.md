# Deploy guide — RhumatoAI (on-prem Proxmox)

Internal deployment for **backend (FastAPI)** + **web (React)** on **Ubuntu 26.04 LTS**, with **MySQL on a dedicated DB VM** and **Ollama on a dedicated AI VM**. No Docker in production.

## Target infrastructure

Three new VMs on Proxmox (example IDs and IPs):

| VM ID | Name | IP | Role |
|-------|------|-----|------|
| 4010 | `rhumato-db` | `10.10.10.10` | MySQL 8 — **primary + secondary** databases |
| 4020 | `rhumato-app` | `10.10.10.20` | Nginx, React build, FastAPI (systemd) |
| 4030 | `rhumato-ai` | `10.10.10.30` | Ollama (+ Qdrant later for semantic RAG) |

Clinic users open `http://10.10.10.20` or `http://rheuma.local` (hosts file) on the LAN.

```text
Clinic LAN ──HTTP──► rhumato-app (10.10.10.20)
                           │
                           ├── MySQL RW ──► rhumato-db (10.10.10.10) / rhumatoai
                           └── Ollama ────► rhumato-ai (10.10.10.30):11434

rhumato-db also hosts rhumatoai_sec (secondary, for future sync — empty at first deploy)
```

Take a Proxmox snapshot on each VM before and after major steps.

## Overview

| Component | Where | How it runs |
|-----------|-------|-------------|
| Web UI | App VM | Static files from `frontend/web/build`, served by Nginx |
| API | App VM | Uvicorn on `127.0.0.1:8000` via systemd |
| Uploads | App VM | FastAPI `/uploads` proxied by Nginx |
| Primary DB | DB VM | MySQL 8, database `rhumatoai` |
| Secondary DB | DB VM | MySQL 8, database `rhumatoai_sec` (reserved for future AI sync) |
| LLM | AI VM | Ollama at `OLLAMA_HOST` |

## Assumptions

- Ubuntu **26.04 LTS Server** (amd64) on all three VMs.
- SSH as user `deploy` with sudo on app and AI VMs.
- VLAN is air-gapped or has no reliable internet — use offline ISO, apt cache, or internal mirror (see [Offline packages](#offline-packages)).
- Git repo cloned at `/opt/ia-medical` on the app VM.
- Chat requires Ollama reachable from the app VM.
- Structured RAG is the default production path; semantic/Qdrant stays off until validated.

## ISO

Download on a PC with internet, then upload to Proxmox **local → ISO Images**:

- `ubuntu-26.04-live-server-amd64.iso`

Use the same ISO for all three VMs. In the office test VLAN we use **Ubuntu 24.04.4** (`ubuntu-24.04.4-live-server-amd64.iso`).

---

## Proxmox: create a VM (repeat for 4010, 4020, 4030)

Use this checklist for **each** new VM. Only the **General**, **CPU/RAM/Disk**, and **installer IP/hostname** rows change.

### VM-specific values

| VM ID | Name | Static IP | Hostname | vCPU | RAM (MiB) | Disk (GiB) |
|-------|------|-----------|----------|------|-----------|------------|
| 4010 | `rhumato-db` | `192.168.11.10/24` | `rhumato-db` | 2 | 4096 | 40 |
| 4020 | `rhumato-app` | `192.168.11.20/24` | `rhumato-app` | 4 | 8192 | 40 |
| 4030 | `rhumato-ai` | `192.168.11.30/24` | `rhumato-ai` | 4 | 8192 | 60 |

Office LAN (test): gateway **`192.168.11.1`**, DNS **`8.8.8.8, 1.1.1.1`**, bridge **`vmbr0`**, Proxmox host **`10.13.19.111`** (also **`192.168.11.111`** on `vmbr0`).

Linux user on all VMs: **`ismailbak`** (sudo). Use the same username in systemd `User=` on the app VM.

### Tab 1 — General

| Field | Value |
|-------|--------|
| Node | `wdf` |
| VM ID | from table above |
| Name | from table above |
| Resource Pool | empty |
| Add to HA / Start at boot | unchecked |

→ **Next**

### Tab 2 — OS

| Field | Value |
|-------|--------|
| Use CD/DVD disc image (iso) | selected |
| Storage | `local` |
| ISO image | `ubuntu-24.04.4-live-server-amd64.iso` |
| Type | Linux |
| Version | 6.x - 2.6 Kernel |

→ **Next**

### Tab 3 — System

| Field | Value |
|-------|--------|
| Machine | q35 |
| BIOS | Default (SeaBIOS) |
| SCSI Controller | VirtIO SCSI single |
| Qemu Agent / TPM | unchecked |

(Firmware field stays empty with SeaBIOS — normal.)

→ **Next**

### Tab 4 — Disks

| Field | Value |
|-------|--------|
| Storage | `local-lvm` |
| Disk size | from table above |
| Format | raw |

→ **Next**

### Tab 5 — CPU

| Field | Value |
|-------|--------|
| Sockets | 1 |
| Cores | from table above |
| Type | `host` if available |

→ **Next**

### Tab 6 — Memory

| Field | Value |
|-------|--------|
| Memory (MiB) | from table above |

→ **Next**

### Tab 7 — Network

| Field | Value |
|-------|--------|
| Bridge | `vmbr0` |
| Model | VirtIO (paravirtualized) |
| Firewall | **unchecked** |

→ **Next** → **Confirm** → **Finish** (do not start after created) → **Start** → **Console**

### Ubuntu installer (every VM)

| Screen | Choice |
|--------|--------|
| Install vs Try | **Install Ubuntu Server** |
| Installer update | **Continue without updating** (or update if mirror works) |
| Type | **Ubuntu Server** (not minimized) |
| Third-party drivers | unchecked |
| Network → `enp6s18` → Manual | Subnet `192.168.11.0/24`, Address from table, Gateway `192.168.11.1`, DNS `8.8.8.8, 1.1.1.1` |
| Proxy | empty → Done |
| Mirror | Continue if test fails; **Done** if mirror passes |
| Storage | Use entire disk, LVM on, **no** LUKS encryption → Done → confirm wipe |
| Profile | Your name: any; Server name: hostname from table; Username: `ismailbak`; password; **OpenSSH** enabled |
| Featured snaps | none |
| Install | wait for logs to finish → **Reboot** |

After reboot: Proxmox → VM → **Hardware** → CD/DVD → **Do not use any media**.

Verify:

```bash
hostname
ip a
ping -c 2 google.com
```

Snapshot: **`clean-ubuntu-installed`**.

### Copy files PC → VM (when PC cannot reach VM IP)

1. `scp` file to Proxmox host: `scp FILE root@10.13.19.111:/tmp/`
2. On Proxmox shell: `cd /tmp && python3 -m http.server 8888 --bind 0.0.0.0`
3. On VM console: `wget http://192.168.11.111:8888/FILE -O /tmp/FILE` (use **`-O`** capital O, not zero)
4. Ctrl+C on Proxmox shell when done

### MySQL dump encoding (Windows)

Use mysqldump **`-r`** flag — do not use PowerShell `>` (creates UTF-16):

```powershell
mysqldump -u root -p --single-transaction rhumatoai -r D:\rhumatoai-backup.sql
```

If the VM already has a UTF-16 file: `iconv -f UTF-16LE -t UTF-8 ... > /tmp/rhumatoai-utf8.sql`

---

## Part A — DB VM (`rhumato-db`, 10.10.10.10)

### A1. Install Ubuntu 26.04

- Minimal install, enable **OpenSSH server**.
- Static IP: `10.10.10.10/24`, hostname `rhumato-db`.
- Create user `deploy` with sudo.

### A2. Install MySQL 8

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y mysql-server ufw
```

Secure and tune as needed (`sudo mysql_secure_installation` if interactive access is available).

### A3. Create databases and users

```sql
CREATE DATABASE rhumatoai CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE rhumatoai_sec CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- App VM: read/write primary only
CREATE USER 'ia_app'@'10.10.10.20' IDENTIFIED BY 'STRONG_PASSWORD';
GRANT ALL ON rhumatoai.* TO 'ia_app'@'10.10.10.20';

-- Future sync service on app VM: read/write secondary only
CREATE USER 'ia_sync'@'10.10.10.20' IDENTIFIED BY 'STRONG_PASSWORD';
GRANT ALL ON rhumatoai_sec.* TO 'ia_sync'@'10.10.10.20';

-- Future AI/RAG on AI VM: read-only secondary
CREATE USER 'ia_rag'@'10.10.10.30' IDENTIFIED BY 'STRONG_PASSWORD';
GRANT SELECT ON rhumatoai_sec.* TO 'ia_rag'@'10.10.10.30';

FLUSH PRIVILEGES;
```

Bind MySQL to the LAN interface if needed (`bind-address = 10.10.10.10` in `/etc/mysql/mysql.conf.d/mysqld.cnf`), then:

```bash
sudo systemctl restart mysql
```

### A4. Firewall (DB VM)

```bash
sudo ufw allow from 10.10.10.20 to any port 3306
sudo ufw allow from 10.10.10.30 to any port 3306
sudo ufw allow OpenSSH
sudo ufw enable
```

### A5. Verify from app VM (after it exists)

```bash
mysql -h 10.10.10.10 -u ia_app -p rhumatoai -e "SELECT 1"
```

---

## Part B — AI VM (`rhumato-ai`, 10.10.10.30)

### B1. Install Ubuntu 26.04

- Static IP: `10.10.10.30/24`, hostname `rhumato-ai`.

### B2. Install Ollama

Install from your offline bundle or internal mirror. When Ollama is available:

```bash
ollama pull gemma4:e4b
curl -s http://127.0.0.1:11434/api/tags
```

### B3. Firewall (AI VM)

```bash
sudo ufw allow from 10.10.10.20 to any port 11434
sudo ufw allow OpenSSH
sudo ufw enable
```

Qdrant (port 6333) can be added later when `RAG_SEMANTIC_ENABLED=true`.

---

## Part C — App VM (`rhumato-app`, 10.10.10.20)

This VM runs the main deploy checklist below.

### Production environment template

Create `/etc/ia-medical/env` (mode `600`, root-owned):

```bash
APP_ENV=production
DATABASE_URL=mysql+pymysql://ia_app:STRONG_PASSWORD@10.10.10.10:3306/rhumatoai
SECRET_KEY=GENERATE_A_LONG_RANDOM_SECRET

# Clinic browser origins (comma-separated)
CORS_ORIGINS=http://10.10.10.20,http://rheuma.local

OLLAMA_HOST=http://10.10.10.30:11434
OLLAMA_MODEL=gemma4:e4b

# Keep structured RAG as the default production path unless semantic/Qdrant is explicitly validated.
RAG_SEMANTIC_ENABLED=false

# Do not auto-create tables in production — use Alembic
CREATE_TABLES_ON_STARTUP=false
```

Generate a secret:

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(48))"
```

Keep real `.env` files local/private. Do not commit them to git.

### Quick checklist

#### 0. Pick a release

```bash
git tag v1.0.0 && git push origin v1.0.0
# On VM: git checkout v1.0.0
```

#### 1. Snapshot VM

```bash
qm snapshot 4020 pre-deploy-$(date +%F-%H%M)
```

#### 2. SSH and install packages

```bash
ssh deploy@10.10.10.20
sudo apt update && sudo apt upgrade -y
sudo apt install -y python3-venv python3-pip python3-dev nginx git ufw mysql-client build-essential
```

**Node.js (18+)** for the React build — check the distro package first:

```bash
node -v
```

If `node -v` is below 18, install Node 20 LTS from [NodeSource](https://github.com/nodesource/distributions) or your offline bundle before `npm ci`.

#### 3. Firewall (app VM)

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp   # optional HTTPS
sudo ufw enable
```

#### 4. Deploy application code

```bash
sudo mkdir -p /opt/ia-medical
sudo chown deploy:deploy /opt/ia-medical
cd /opt/ia-medical
git clone <REPO-URL> .
git checkout <release-tag>
```

On air-gapped hosts, copy the repo via USB/SCP from a dev machine instead of `git clone` over the internet.

#### 5. Backend virtualenv and dependencies

Ubuntu 26.04 ships Python 3.12+. Use a venv (required):

```bash
cd /opt/ia-medical/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -U pip
pip install -r requirements.txt
```

This step can take 10–20 minutes (`torch`, `transformers`). If a wheel is missing for Python 3.12+, install build deps (`python3-dev`, `build-essential`) and retry, or use an offline wheel cache prepared on a matching Ubuntu 26.04 machine.

Verify before continuing:

```bash
python -c "import fastapi, sqlalchemy; print('ok')"
```

#### 6. Secrets file

```bash
sudo mkdir -p /etc/ia-medical
sudo nano /etc/ia-medical/env
sudo chown root:root /etc/ia-medical/env
sudo chmod 600 /etc/ia-medical/env
```

#### 7. Backup MySQL (before migrations)

```bash
mysqldump -h 10.10.10.10 -u ia_app -p rhumatoai > /tmp/db-predeploy-$(date +%F).sql
# Copy dump off the VM
```

#### 8. Run database migrations

```bash
set -a && source /etc/ia-medical/env && set +a
cd /opt/ia-medical/backend
source .venv/bin/activate
alembic upgrade head
```

#### 9. Bootstrap admin (one time)

```bash
set -a && source /etc/ia-medical/env && set +a
export ADMIN_PASSWORD='your-secure-admin-password'
cd /opt/ia-medical/backend
source .venv/bin/activate
python scripts/setup_admin.py
```

Default username: `admin@chu.ma`. Do not rely on dev default `admin123` in production.

#### 10. Build web frontend

```bash
cd /opt/ia-medical/frontend/web
npm ci
REACT_APP_API_URL=/api npm run build
```

Output: `frontend/web/build/` (Nginx `root`).

#### 11. Persist uploads directory

```bash
sudo mkdir -p /opt/ia-medical/backend/data/uploads
sudo chown -R deploy:deploy /opt/ia-medical/backend/data
```

#### 12. systemd service

Create `/etc/systemd/system/ia-medical.service`:

```ini
[Unit]
Description=IA Medical FastAPI backend
After=network.target

[Service]
User=deploy
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
sudo journalctl -u ia-medical -f
```

#### 13. Nginx (static web + API proxy)

Create `/etc/nginx/sites-available/ia-medical`:

```nginx
server {
    listen 80;
    server_name rheuma.local 10.10.10.20;

    root /opt/ia-medical/frontend/web/build;
    index index.html;

    # React SPA
    location / {
        try_files $uri $uri/ /index.html;
    }

    # FastAPI
    location /api/ {
        proxy_pass http://127.0.0.1:8000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }

    # Profile pictures and medical-act uploads
    location /uploads/ {
        proxy_pass http://127.0.0.1:8000/uploads/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Optional: direct health check without /api prefix
    location = /health {
        proxy_pass http://127.0.0.1:8000/health;
    }
}
```

```bash
sudo ln -sf /etc/nginx/sites-available/ia-medical /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

#### 14. Clinic PCs — hosts file (optional)

```
10.10.10.20  rheuma.local
```

Windows: `C:\Windows\System32\drivers\etc\hosts` (as Administrator).

#### 15. Smoke tests

On app VM:

```bash
curl -s http://127.0.0.1:8000/health
curl -I http://127.0.0.1/
```

From a clinic PC:

```bash
curl -I http://10.10.10.20/
curl -s http://10.10.10.20/health
```

Verify Ollama from app VM:

```bash
curl -s http://10.10.10.30:11434/api/tags
```

#### 16. Rollback

**Preferred:** Proxmox snapshot restore.

**Code only:**

```bash
cd /opt/ia-medical
git checkout <previous-tag>
cd frontend/web && REACT_APP_API_URL=/api npm run build
sudo systemctl restart ia-medical
sudo systemctl reload nginx
```

**Database restore:**

```bash
mysql -h 10.10.10.10 -u ia_app -p rhumatoai < /path/db-predeploy-YYYY-MM-DD.sql
```

---

## Offline packages

If the VLAN has no internet (Proxmox `apt-get update` failures are expected):

1. Download **Ubuntu 26.04 ISO** on a connected PC; upload to Proxmox.
2. On a temporary 26.04 machine with internet, cache `.deb` packages:
   `nginx`, `python3-venv`, `python3-dev`, `python3-pip`, `mysql-server`, `mysql-client`, `git`, `build-essential`, Node 20 LTS.
3. Copy the apt cache or use `apt-offline` / an internal mirror onto the VLAN.
4. Copy **Ollama binary + model** to the AI VM via USB.
5. Copy the **git repo** and optionally a **pre-built pip wheelhouse** for `backend/requirements.txt`.

---

## Post-deploy checklist

- [ ] All three VMs on Ubuntu 26.04 with static IPs
- [ ] `rhumatoai` and `rhumatoai_sec` exist on DB VM; `ia_app` can connect from app VM
- [ ] `SECRET_KEY` and `DATABASE_URL` are not defaults
- [ ] Admin password changed from any dev default
- [ ] `CREATE_TABLES_ON_STARTUP=false` in production
- [ ] `RAG_SEMANTIC_ENABLED=false` unless semantic/Qdrant ingestion has been tested
- [ ] `alembic upgrade head` succeeded
- [ ] Login works at `http://10.10.10.20` or `http://rheuma.local`
- [ ] Chat health: `/health` shows `ai_assistant` when Ollama is up
- [ ] Uploads directory backed up with DB
- [ ] Proxmox snapshots kept until stable

## Notes

- Do not commit `.env` or `/etc/ia-medical/env` to git.
- The secondary database (`rhumatoai_sec`) and sync service are not used on first deploy; the app reads the primary DB only.
- Mobile (Expo) is out of scope for this guide; point the API at `http://10.10.10.20/api` on the device network.
- Optional LAN HTTPS: use `mkcert` and add `ssl_certificate` directives to Nginx.
- Heavy Python deps (`torch`, `transformers`) are in `requirements.txt` for RAG/embeddings; keep semantic retrieval disabled until RAM/disk and Qdrant indexing are validated on the AI VM.
- Replicate at a second site with the same VM layout and git tag; generate **new secrets** per site.
