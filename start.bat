@echo off
title Sistem Presensi Mahasiswa Berbasis QR Code
echo ========================================================
echo   Menjalankan Sistem Presensi Mahasiswa Berbasis QR Code
echo ========================================================
echo.
cd /d "%~dp0"
node server/index.js
pause
