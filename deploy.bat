@echo off
setlocal enabledelayedexpansion

echo ============================================================
echo   DEPLOY APPKOPERASI BKN KANREG V KE SERVER (84.247.160.55:3001)
echo ============================================================

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy.ps1"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Proses deploy mengalami kendala. Periksa pesan di atas.
    pause
    exit /b %ERRORLEVEL%
)

echo.
pause
