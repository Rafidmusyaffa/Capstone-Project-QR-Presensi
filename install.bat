@echo off
title Install Dependensi Presensi QR
echo ========================================================
echo   Menginstall Dependensi Presensi QR Code
echo ========================================================
echo.
cd /d "%~dp0"
echo Menginstall dependensi backend...
call npm install
echo.
echo Menginstall dependensi frontend...
cd client
call npm install
call npm run build
cd ..
echo.
echo ========================================================
echo   Instalasi Selesai!
echo   Sekarang Anda dapat menjalankan: start.bat
echo ========================================================
echo.
pause
