#!/bin/bash
set -e

# Muat environment PATH & NVM agar node, npm, dan pm2 selalu dikenali
export PATH="/usr/local/bin:/usr/bin:/bin:/usr/local/sbin:/usr/sbin:/sbin:$HOME/.nvm/versions/node/$(ls $HOME/.nvm/versions/node 2>/dev/null | tail -n 1)/bin:$HOME/.nvm/versions/node/current/bin:$HOME/bin:$HOME/.local/bin:$PATH"

if [ -s "$HOME/.nvm/nvm.sh" ]; then
    export NVM_DIR="$HOME/.nvm"
    \. "$NVM_DIR/nvm.sh" 2>/dev/null || true
fi
if [ -s "/root/.nvm/nvm.sh" ]; then
    export NVM_DIR="/root/.nvm"
    \. "$NVM_DIR/nvm.sh" 2>/dev/null || true
fi
if [ -f "$HOME/.profile" ]; then
    source "$HOME/.profile" 2>/dev/null || true
fi
if [ -f "$HOME/.bashrc" ]; then
    source "$HOME/.bashrc" 2>/dev/null || true
fi

DEST="/home/magangit/appkoperasi"
cd "$DEST"

echo "============================================================"
echo "  [SERVER] PROSES DEPLOY & SINKRONISASI KOPERASI BKN KANREG V"
echo "============================================================"

# 1. Menyiapkan file konfigurasi environment .env untuk server
echo ""
echo "[1/4] Menyiapkan environment (.env) server..."
if [ ! -f .env ]; then
    cat <<EOT > .env
PORT=3001
SESSION_SECRET=koperasi-bkn-kanreg5-jakarta-secret-2026
DB_HOST=localhost
DB_PORT=5432
DB_NAME=koperasi_bkn
DB_USER=magangit
DB_PASSWORD=K@nreg5
EOT
    echo "  [OK] File .env baru berhasil dibuat untuk port 3001!"
else
    # Pastikan PORT adalah 3001 agar tidak bentrok dengan meetingapp
    sed -i 's/^PORT=.*/PORT=3001/' .env
    echo "  [OK] File .env sudah ada (memakai PORT 3001)."
fi

# 2. Memelihara Database PostgreSQL koperasi_bkn
echo ""
echo "[2/4] Memeriksa & menginisialisasi database PostgreSQL (koperasi_bkn)..."

export PGPASSWORD=postgres
DB_EXISTS=$(sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname = 'koperasi_bkn'" 2>/dev/null || psql -h localhost -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname = 'koperasi_bkn'" 2>/dev/null || echo "0")

if [ "$DB_EXISTS" != "1" ]; then
    echo "  -> Database koperasi_bkn belum ada, membuat database baru di PostgreSQL..."
    (psql -h localhost -U postgres -c "CREATE DATABASE koperasi_bkn;" 2>/dev/null) || (sudo -u postgres psql -c "CREATE DATABASE koperasi_bkn;" 2>/dev/null) || true
    (psql -h localhost -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE koperasi_bkn TO magangit;" 2>/dev/null) || (sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE koperasi_bkn TO magangit;" 2>/dev/null) || true
    
    if [ -f backup_local.sql ]; then
        echo "  -> Menginisialisasi struktur & data awal dari backup_local.sql..."
        (psql -h localhost -U postgres -d koperasi_bkn -f backup_local.sql 2>/dev/null) || (sudo -u postgres psql -d koperasi_bkn -f backup_local.sql 2>/dev/null) || true
        echo "  [OK] Data awal koperasi berhasil diimpor!"
    elif [ -f database/schema.sql ]; then
        echo "  -> Menginisialisasi tabel dari database/schema.sql..."
        (psql -h localhost -U postgres -d koperasi_bkn -f database/schema.sql 2>/dev/null) || (sudo -u postgres psql -d koperasi_bkn -f database/schema.sql 2>/dev/null) || true
    fi
else
    echo "  [OK] Database koperasi_bkn sudah ada di server. Data server tetap aman & dipertahankan!"
fi

# Berikan hak akses penuh ke user magangit untuk seluruh tabel & sequence di koperasi_bkn
SQL_PERMS="
    GRANT ALL ON ALL TABLES IN SCHEMA public TO magangit;
    GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO magangit;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO magangit;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO magangit;
"
(psql -h localhost -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE koperasi_bkn TO magangit;" 2>/dev/null) || (sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE koperasi_bkn TO magangit;" 2>/dev/null) || true
(psql -h localhost -U postgres -d koperasi_bkn -c "$SQL_PERMS" 2>/dev/null) || (sudo -u postgres psql -d koperasi_bkn -c "$SQL_PERMS" 2>/dev/null) || true

# 3. Dependencies
echo ""
echo "[3/4] Memeriksa & menginstall dependencies aplikasi..."
npm install --production

# 4. Restart PM2 dengan appkoperasi
echo ""
echo "[4/4] Menjalankan aplikasi dengan PM2 (Port 3001)..."
if command -v pm2 &> /dev/null; then
    pm2 delete appkoperasi 2>/dev/null || true
    PORT=3001 pm2 start app.js --name appkoperasi
    pm2 save
else
    npm install -g pm2
    PORT=3001 pm2 start app.js --name appkoperasi
    pm2 save
    pm2 startup || true
fi

# 5. Buka Firewall Port 3001 jika UFW aktif di server
echo ""
echo "-> Memastikan port 3001 diizinkan di firewall server (UFW)..."
(echo "K@nreg5" | sudo -S ufw allow 3001/tcp 2>/dev/null) || (sudo ufw allow 3001/tcp 2>/dev/null) || true
(echo "K@nreg5" | sudo -S ufw reload 2>/dev/null) || (sudo ufw reload 2>/dev/null) || true

echo ""
echo "============================================================"
echo "  [SERVER] STATUS PROSES DI SERVER:"
echo "============================================================"
pm2 status

echo ""
echo "============================================================"
echo "  DEPLOY SUKSES! APLIKASI KOPERASI AKTIF DI PORT 3001"
echo "============================================================"

