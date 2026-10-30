@echo off
title Install Dependensi Presensi QR
echo ========================================================
echo   Menginstall Dependensi Presensi QR Code
echo ========================================================
echo.
cd /d "%~dp0"
echo Menginstall dependensi backend dan frontend, lalu build frontend...
rem postinstall di package.json sudah menginstall dan mem-build client (sekali)
call npm install
echo.
echo ========================================================
echo   Instalasi Selesai!
echo   Sekarang Anda dapat menjalankan: start.bat
echo ========================================================
echo.
pause
