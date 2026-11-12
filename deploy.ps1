# ============================================================
#  DEPLOY SCRIPT - AppKoperasi ke Server 84.247.160.55:3001
#  Jalankan: .\deploy.ps1 (atau double klik deploy.bat)
# ============================================================

$SERVER   = "84.247.160.55"
$USER     = "magangit"
$DEST     = "/home/magangit/appkoperasi"
$LOCAL    = if ($PSScriptRoot) { $PSScriptRoot } else { "c:\Users\ThinkPad\OneDrive\Dokumen\BKN\appkoperasi" }

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  DEPLOY APPKOPERASI BKN KANREG V (84.247.160.55:3001)" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# ---- 1. Export database lokal PostgreSQL ----
Write-Host "`n[1/4] Mengekspor database lokal (PostgreSQL koperasi_bkn)..." -ForegroundColor Yellow

$pgDump = "C:\Program Files\PostgreSQL\17\bin\pg_dump.exe"
if (-not (Test-Path $pgDump)) {
    $pgDump = (Get-ChildItem "C:\Program Files\PostgreSQL" -Recurse -Filter "pg_dump.exe" -ErrorAction SilentlyContinue | Where-Object { $_.FullName -like "*\bin\pg_dump.exe" } | Select-Object -ExpandProperty FullName -First 1)
    if (-not $pgDump) {
        $pgDump = "pg_dump"
    }
}

if ($pgDump) {
    $env:PGPASSWORD = "postgres"
    & $pgDump -U postgres -h localhost -p 5432 --clean --if-exists koperasi_bkn -f "$LOCAL\backup_local.sql" 2>$null
    if ($LASTEXITCODE -eq 0 -and (Test-Path "$LOCAL\backup_local.sql")) {
        (Get-Content "$LOCAL\backup_local.sql") | Where-Object { $_ -notmatch '^\\restrict' } | Set-Content "$LOCAL\backup_local.sql" -Encoding UTF8
        Write-Host "  [OK] Database lokal berhasil diekspor ke backup_local.sql!" -ForegroundColor Green
    } else {
        Write-Host "  [INFO] Menggunakan backup_local.sql yang sudah ada." -ForegroundColor Gray
    }
} else {
    Write-Host "  [INFO] pg_dump tidak terdeteksi, menggunakan backup_local.sql yang sudah ada." -ForegroundColor Gray
}

# ---- 2. Hilangkan atribut ReadOnly dan kompresi paket proyek ----
Write-Host "`n[2/4] Menyiapkan berkas dan mengompres paket proyek..." -ForegroundColor Yellow

attrib -r "$LOCAL\*" /s /d 2>$null

tar --format ustar -czf "$LOCAL\deploy_bundle.tar.gz" --exclude="node_modules" --exclude=".git" --exclude=".gemini" --exclude="scratch" config controllers middleware models routes utils views public database app.js setup.js deploy_server.sh backup_local.sql package.json package-lock.json

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Gagal membuat file arsip kompresi." -ForegroundColor Red
    exit $LASTEXITCODE
}
Write-Host "  [OK] Seluruh berkas aplikasi berhasil dikompres ke deploy_bundle.tar.gz!" -ForegroundColor Green

# ---- 3. Upload deploy_bundle.tar.gz ke server ----
Write-Host "`n[3/4] Mengunggah paket ke server..." -ForegroundColor Yellow
Write-Host "      (Masukkan password user $USER jika diminta: K@nreg5)" -ForegroundColor Gray

scp "$LOCAL\deploy_bundle.tar.gz" "${USER}@${SERVER}:/home/${USER}/"

if (Test-Path "$LOCAL\deploy_bundle.tar.gz") {
    Remove-Item "$LOCAL\deploy_bundle.tar.gz" -Force
}

if ($LASTEXITCODE -ne 0) {
    Write-Host "`n[ERROR] Gagal mengunggah arsip. Pastikan koneksi atau password benar." -ForegroundColor Red
    exit $LASTEXITCODE
}
Write-Host "  [OK] Berkas arsip berhasil diunggah!" -ForegroundColor Green

# ---- 4. Eksekusi remote di server via SSH ----
Write-Host "`n[4/4] Mengekstrak, inisialisasi database, dan menjalankan PM2 di server..." -ForegroundColor Yellow
Write-Host "      (Masukkan password user $USER jika diminta: K@nreg5)" -ForegroundColor Gray

ssh -t "${USER}@${SERVER}" "bash -l -c 'mkdir -p /home/magangit/appkoperasi && tar --no-same-owner --overwrite -xzf /home/magangit/deploy_bundle.tar.gz -C /home/magangit/appkoperasi/ && rm -f /home/magangit/deploy_bundle.tar.gz && chmod -R 775 /home/magangit/appkoperasi && chmod +x /home/magangit/appkoperasi/deploy_server.sh && bash -l /home/magangit/appkoperasi/deploy_server.sh'"

Write-Host "`n============================================================" -ForegroundColor Cyan
Write-Host "  DEPLOY APPKOPERASI SELESAI & SUKSES!" -ForegroundColor Green
Write-Host "  Buka aplikasi di browser: http://${SERVER}:3001" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
