@echo off
chcp 65001 >nul
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Joan\Projects\wuohome-ragic\scripts\run-perf-update.ps1"
