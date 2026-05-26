@echo off
title GM Patient Handover
cd /d "%~dp0"

if not exist "node.exe" (
    echo.
    echo  ERROR: node.exe is missing from this folder.
    echo  Please ensure all files were copied correctly.
    echo.
    pause
    exit /b 1
)

if not exist "server.js" (
    echo.
    echo  ERROR: server.js is missing from this folder.
    echo.
    pause
    exit /b 1
)

echo.
echo  Starting GM Patient Handover...
echo  Your browser will open automatically.
echo.

start "" "http://localhost:8080"
".\node.exe" server.js

echo.
echo  Server stopped.
pause
