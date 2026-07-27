# CHU Ibn Rochd — Production Site (Smart HosHealth)

**On-site reference.** Inter-VM traffic uses **vmbr2** (`10.10.10.0/24`). Align VM NICs with **vmbr1** (local) + **vmbr2** (VM bridge).

---

## Network map

| Role | VM name | vmbr2 (use for DB/Ollama/API) | Other NIC | Gateway (vmbr2) |
|------|---------|-------------------------------|-----------|-----------------|
| **App** (was rhumato-app) | `vm_smarthoshealth` | **10.10.10.3** | 192.168.1.161 | 10.10.10.1 |
| **AI** (was rhumato-ai) | `vm_mia` | **10.10.10.4** | 192.168.1.180 | 10.10.10.1 |
| **DB** (was rhumato-db) | `vm_dwh` | **10.10.10.5** | 192.168.1.170 | 10.10.10.1 |

| Host | IP | Notes |
|------|-----|--------|
| Proxmox / chu-ir (`eno1`) | 10.3.0.161/16 | gw 10.3.0.1 |
| hoshealth (`enp1s0`) | 192.168.1.160/24 | gw 192.168.1.1 |
| Old hoshealth app | 192.168.1.161 | legacy — **new stack uses same .161 on app VM** |

**Proxmox login:** `ismailbak` / *(set at site — do not commit password)*

**VM root:** `root` / *(set at site — do not commit password)*

---

## VM creation (Proxmox)

- Bridge **vmbr2** for `10.10.10.x` on all 3 VMs
- Bridge **vmbr1** for `192.168.1.x` where needed (app access)
- Ubuntu 24.04, hostname = VM name above
- Also create user `ismailbak` (sudo) for app deploy, or use `root` as discovered on site

### Suggested specs

| VM | vCPU | RAM | Disk |
|----|------|-----|------|
| vm_dwh | 2 | 4 GB | 40 GB |
| vm_smarthoshealth | 4 | 8 GB | 40 GB |
| vm_mia | 4 | 8 GB | 160 GB (+ GPU if available) |

---

## 1. vm_dwh (10.10.10.5) — MySQL

```bash
sudo apt update && sudo apt install -y mysql-server
sudo sed -i 's/^bind-address.*/bind-address = 0.0.0.0/' /etc/mysql/mysql.conf.d/mysqld.cnf
sudo systemctl restart mysql
ss -tlnp | grep 3306
```

```sql
sudo mysql
CREATE DATABASE smarthos CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE smarthos_sec CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER 'rhumato_app'@'10.10.10.3' IDENTIFIED BY 'CHOOSE_STRONG_PASSWORD';
GRANT ALL ON smarthos.* TO 'rhumato_app'@'10.10.10.3';

CREATE USER 'ia_sync'@'10.10.10.3' IDENTIFIED BY 'CHOOSE_STRONG_PASSWORD';
GRANT ALL ON smarthos_sec.* TO 'ia_sync'@'10.10.10.3';
FLUSH PRIVILEGES;
EXIT;
```

Import dump:
```bash
sudo mysql smarthos < /tmp/smarthos-DATE.sql
sudo mysql smarthos -e "SELECT COUNT(*) FROM patients;"
```

---

## 2. vm_mia (10.10.10.4) — Ollama

```bash
curl -fsSL https://ollama.com/install.sh | sh
sudo mkdir -p /etc/systemd/system/ollama.service.d
echo -e '[Service]\nEnvironment="OLLAMA_HOST=0.0.0.0:11434"' | \
  sudo tee /etc/systemd/system/ollama.service.d/override.conf
sudo systemctl daemon-reload && sudo systemctl restart ollama
ollama pull gemma4:e4b
curl -s http://10.10.10.4:11434/api/tags
```

---

## 3. vm_smarthoshealth (10.10.10.3) — App

```bash
sudo apt install -y python3-venv nginx mysql-client git curl
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

mkdir -p /opt/smarthos && cd /opt/smarthos
git clone https://github.com/Ismailbak/Medical-AI-Assitant.git .

cd backend && python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt && pip install 'bcrypt==4.0.1'
```

### `/etc/smarthos/env`

```bash
APP_ENV=production
DATABASE_URL=mysql+pymysql://rhumato_app:APP_PWD@10.10.10.5:3306/smarthos
RAG_DATABASE_URL=mysql+pymysql://ia_sync:SYNC_PWD@10.10.10.5:3306/smarthos_sec
SECRET_KEY=GENERATE_NEW_LONG_RANDOM_SECRET
CORS_ORIGINS="http://10.10.10.3,http://192.168.1.161,http://10.3.0.161,http://192.168.1.160"
OLLAMA_HOST=http://10.10.10.4:11434
OLLAMA_MODEL=gemma4:e4b
RAG_SEMANTIC_ENABLED=false
CREATE_TABLES_ON_STARTUP=false
```

```bash
sudo chmod 600 /etc/smarthos/env

set -a && source /etc/smarthos/env && set +a
alembic upgrade head

cd /opt/smarthos/frontend/web
npm ci && REACT_APP_API_URL=/api npm run build
```

### Connectivity test (from app VM)

```bash
nc -vz 10.10.10.5 3306
nc -vz 10.10.10.4 11434
mysql -h 10.10.10.5 -u rhumato_app -p smarthos -e "SELECT 1;"
```

### systemd + nginx

Use same units as `DEPLOY_MANUAL.md` §5.9–5.10. Nginx `server_name`:

```nginx
server_name smarthoshealth.local 10.10.10.3 192.168.1.161;
```

```bash
sudo systemctl enable --now smarthos nginx
curl -s http://127.0.0.1:8000/health; echo
```

---

## 4. RAG sync (on app VM)

```bash
mkdir -p /opt/smarthos/logs
set -a && source /etc/smarthos/env && set +a
cd /opt/smarthos/backend && source .venv/bin/activate
python -m scripts.sync_rag_database --init-schema
python -m scripts.sync_rag_database
```

Cron:
```
*/10 * * * * set -a && source /etc/smarthos/env && set +a && cd /opt/smarthos/backend && .venv/bin/python -m scripts.sync_rag_database >> /opt/smarthos/logs/smarthos-sync.log 2>&1
```

---

## 5. Dump transfer (PC → Proxmox → vm_dwh)

```powershell
# PC
scp D:\backups\smarthos-DATE.sql root@10.3.0.161:/tmp/
```

```bash
# Proxmox
scp /tmp/smarthos-DATE.sql root@10.10.10.5:/tmp/
# or ismailbak@10.10.10.5 depending on SSH user

# vm_dwh
sudo mysql smarthos < /tmp/smarthos-DATE.sql
```

---

## 6. Staff URL (pick what works on clinic LAN)

Try in browser:
- `http://192.168.1.161`
- `http://10.10.10.3`
- `http://10.3.0.161` (if proxied)

Add the working URL to `CORS_ORIGINS` and restart `smarthos`.

---

## 7. Smoke test

```bash
bash /opt/smarthos/scripts/golden_path_vm.sh http://127.0.0.1:8000 'admin@email' 'password'
```

Target: **17 passed, 0 failed**.

---

## Order today

1. [ ] Confirm 3 VMs exist or create them (vmbr1 + vmbr2)
2. [ ] vm_dwh MySQL + import dump
3. [ ] vm_mia Ollama + model
4. [ ] vm_smarthoshealth app + env + build
5. [ ] RAG sync + cron
6. [ ] Golden path + browser login
7. [ ] Snapshots

---

*Do not commit passwords to git. Rotate credentials shared in chat after go-live.*
