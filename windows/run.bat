@echo off
setlocal enabledelayedexpansion

:: Move to project root (one level up from windows\)
cd /d "%~dp0.."

echo === Splitter Server (Windows) ===

:: --- Check venv exists ---
if not exist ".venv" (
    echo Error: .venv not found. Run windows\install.bat first.
    exit /b 1
)

if not exist ".venv\Scripts\activate.bat" (
    echo Error: venv activate script not found in .venv
    exit /b 1
)

:: --- Set defaults (can be overridden by environment variables) ---
if "%APP_FILE%" == "" set "APP_FILE=server.py"
if "%PORT%" == "" set "PORT=8000"

:: --- Activate venv and start server ---
call ".venv\Scripts\activate.bat"

echo Starting FastAPI: %APP_FILE% on port %PORT%
python -m fastapi run "%APP_FILE%" --port %PORT%
