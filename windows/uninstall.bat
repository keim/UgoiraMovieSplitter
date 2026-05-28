@echo off
setlocal

:: Move to project root (one level up from windows\)
cd /d "%~dp0.."

echo === Splitter Uninstaller (Windows) ===

:: --- Remove virtual environment ---
if exist ".venv" (
    echo Removing .venv...
    rmdir /s /q ".venv"
    if %errorlevel% neq 0 (
        echo Error: Failed to remove .venv. It may be in use by another process.
        exit /b 1
    )
    echo .venv removed.
) else (
    echo .venv not found, nothing to remove.
)

echo.
echo Uninstall completed.
pause
