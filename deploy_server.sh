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
DB_NAME=koperasi
DB_USER=magangit
DB_PASSWORD=K@nreg5
EOT
    echo "  [OK] File .env baru berhasil dibuat untuk database 'koperasi' di port 3001!"
else
    # Pastikan konfigurasi database dan port sesuai dengan arahan mentor
    sed -i 's/^PORT=.*/PORT=3001/' .env
    sed -i 's/^DB_NAME=.*/DB_NAME=koperasi/' .env
    sed -i 's/^DB_USER=.*/DB_USER=magangit/' .env
    sed -i 's/^DB_PASSWORD=.*/DB_PASSWORD=K@nreg5/' .env
    echo "  [OK] File .env sudah disesuaikan (DB_NAME=koperasi, PORT=3001)."
fi

# 2. Inisialisasi Database PostgreSQL 'koperasi'
echo ""
echo "[2/4] Memeriksa & menginisialisasi database PostgreSQL (koperasi)..."

export PGPASSWORD=K@nreg5
TABLE_COUNT=$(psql -h localhost -U magangit -d koperasi -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'" 2>/dev/null || echo "0")

if [ "$TABLE_COUNT" -lt "3" ]; then
    echo "  -> Database 'koperasi' masih kosong, mengimpor struktur & data dari backup_local.sql..."
    if [ -f backup_local.sql ]; then
        psql -h localhost -U magangit -d koperasi -f backup_local.sql 2>/dev/null || true
        echo "  [OK] Data awal koperasi berhasil diimpor ke database 'koperasi'!"
    elif [ -f database/schema.sql ]; then
        psql -h localhost -U magangit -d koperasi -f database/schema.sql 2>/dev/null || true
        echo "  [OK] Struktur schema.sql berhasil diimpor!"
    fi
else
    echo "  [OK] Database 'koperasi' sudah berisi data ($TABLE_COUNT tabel). Data server tetap dipertahankan!"
fi

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

