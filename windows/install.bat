@echo off
setlocal enabledelayedexpansion

:: Move to project root (one level up from windows\)
cd /d "%~dp0.."

echo === Splitter Installer (Windows) ===

:: --- Find Python ---
set "PYTHON_CMD="

python -c "import sys" >nul 2>&1
if %errorlevel% == 0 (
    set "PYTHON_CMD=python"
    goto :found_python
)

py -3 -c "import sys" >nul 2>&1
if %errorlevel% == 0 (
    set "PYTHON_CMD=py -3"
    goto :found_python
)

echo Error: Python was not found in PATH or could not be executed.
exit /b 1

:found_python
echo Using Python: %PYTHON_CMD%

:: --- Get Python version ---
for /f "delims=" %%v in ('%PYTHON_CMD% -c "import sys; print(sys.version_info.major)"') do set "PY_MAJOR=%%v"
for /f "delims=" %%v in ('%PYTHON_CMD% -c "import sys; print(sys.version_info.minor)"') do set "PY_MINOR=%%v"
echo Python version: %PY_MAJOR%.%PY_MINOR%

:: --- Create virtual environment ---
echo Creating virtual environment (.venv)...
%PYTHON_CMD% -m venv .venv
if %errorlevel% neq 0 (
    echo Error: Failed to create virtual environment.
    exit /b 1
)

set "VENV_PYTHON=.venv\Scripts\python.exe"
if not exist "%VENV_PYTHON%" (
    echo Error: Could not find Python inside .venv
    exit /b 1
)

:: --- Select requirements file based on Python version ---
set "REQ_FILE="

:: Python 3.x where x < 12 -> use requirement310.txt
if "%PY_MAJOR%" == "3" (
    if %PY_MINOR% lss 12 (
        if exist "requirement310.txt" (
            set "REQ_FILE=requirement310.txt"
            echo Python %PY_MAJOR%.%PY_MINOR% detected: using requirement310.txt ^(Python 3.10 compatible versions^)
        )
    )
)

if "!REQ_FILE!" == "" (
    if exist "requirements.txt" (
        set "REQ_FILE=requirements.txt"
    ) else if exist "requirement.txt" (
        set "REQ_FILE=requirement.txt"
    ) else (
        echo Error: requirements file not found ^(requirements.txt or requirement.txt^).
        exit /b 1
    )
)

:: --- Upgrade pip ---
echo Upgrading pip...
"%VENV_PYTHON%" -m pip install --upgrade pip
if %errorlevel% neq 0 (
    echo Error: Failed to upgrade pip.
    exit /b 1
)

:: --- Install dependencies ---
echo Installing dependencies from %REQ_FILE%...
"%VENV_PYTHON%" -m pip install -r "%REQ_FILE%"
if %errorlevel% neq 0 (
    echo Error: Failed to install dependencies.
    exit /b 1
)

echo.
echo Install completed successfully.
pause
