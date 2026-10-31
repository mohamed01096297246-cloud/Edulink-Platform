@echo off
rem Daily copy of the EduLink database, then proof that the copy restores.
rem Run by the Windows task "EduLink daily backup"; output goes to the log.
set BACKUP_DIR=D:\EduLink-backups
cd /d "%~dp0.."
rem The task tries again every two hours, in case a copy was cut off; once
rem today's copy is written the later tries stop here.
for /f %%d in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd"') do set TODAY=%%d
if exist "%BACKUP_DIR%\edulink-%TODAY%_*.jsonl.gz" exit /b 0
echo ===== %date% %time% ===== >> "%BACKUP_DIR%\backup.log"
node scripts\backup.js >> "%BACKUP_DIR%\backup.log" 2>&1
if errorlevel 1 (
  echo BACKUP FAILED >> "%BACKUP_DIR%\backup.log"
  exit /b 1
)
node scripts\verify-backup.js >> "%BACKUP_DIR%\backup.log" 2>&1
