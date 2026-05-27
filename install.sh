#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Pick a Python launcher that works across macOS/Linux/Windows (Git Bash).
# Use execution tests (not just command -v) to skip broken installs.
if python3 -c "import sys" >/dev/null 2>&1; then
  PYTHON_CMD=(python3)
elif python -c "import sys" >/dev/null 2>&1; then
  PYTHON_CMD=(python)
elif py -3 -c "import sys" >/dev/null 2>&1; then
  PYTHON_CMD=(py -3)
else
  echo "Error: Python was not found in PATH or could not be executed."
  exit 1
fi

echo "Using Python: ${PYTHON_CMD[*]}"

# Detect Python version
PYTHON_MAJOR=$("${PYTHON_CMD[@]}" -c "import sys; print(sys.version_info.major)")
PYTHON_MINOR=$("${PYTHON_CMD[@]}" -c "import sys; print(sys.version_info.minor)")
echo "Python version: ${PYTHON_MAJOR}.${PYTHON_MINOR}"

IS_TERMUX="false"
if [[ "${PREFIX:-}" == *"com.termux"* ]] || [[ "$(uname -o 2>/dev/null || true)" == "Android" ]]; then
  IS_TERMUX="true"
fi

echo "Creating virtual environment (.venv)..."
if [[ "$IS_TERMUX" == "true" ]]; then
  # Termux packages install into system site-packages, so expose them to the venv.
  "${PYTHON_CMD[@]}" -m venv --system-site-packages .venv
else
  "${PYTHON_CMD[@]}" -m venv .venv
fi

# Use the venv's Python directly to avoid shell/OS activation differences.
if [ -x ".venv/bin/python" ]; then
  VENV_PYTHON=".venv/bin/python"
elif [ -x ".venv/Scripts/python.exe" ]; then
  VENV_PYTHON=".venv/Scripts/python.exe"
elif [ -x ".venv/Scripts/python" ]; then
  VENV_PYTHON=".venv/Scripts/python"
else
  echo "Error: Could not find Python inside .venv"
  exit 1
fi

# Select requirements file based on Python version
# Python < 3.12: use requirement310.txt for broader compatibility
REQ_FILE=""
if [[ "$PYTHON_MAJOR" -eq 3 && "$PYTHON_MINOR" -lt 12 ]]; then
  if [ -f "requirement310.txt" ]; then
    REQ_FILE="requirement310.txt"
    echo "Python ${PYTHON_MAJOR}.${PYTHON_MINOR} detected: using $REQ_FILE (Python 3.10 compatible versions)"
  fi
fi

if [ -z "$REQ_FILE" ]; then
  if [ -f "requirements.txt" ]; then
    REQ_FILE="requirements.txt"
  elif [ -f "requirement.txt" ]; then
    REQ_FILE="requirement.txt"
  else
    echo "Error: requirements file not found (requirements.txt or requirement.txt)."
    exit 1
  fi
fi

echo "Upgrading pip..."
"$VENV_PYTHON" -m pip install --upgrade pip

if [[ "$IS_TERMUX" == "true" ]]; then
  if ! command -v pkg >/dev/null 2>&1; then
    echo "Error: Termux environment detected but pkg command was not found."
    exit 1
  fi

  # Upgrade all packages first to ensure ABI consistency between native libraries.
  # Skipping this step can cause dynamic-linker symbol errors (e.g. libplacebo.so)
  # when Termux repo packages were rebuilt against a newer NDK.
  echo "Upgrading Termux packages (required for ABI consistency)..."
  if ! pkg upgrade -y; then
    echo "Warning: 'pkg upgrade' encountered errors. Continuing, but installation may fail."
    echo "If you see symbol/linker errors, run 'pkg upgrade' manually and re-run this script."
  fi

  # rust is required to build pydantic-core (and other Rust-based packages).
  # pkg install rust provides a native aarch64-android build, unlike rustup
  # which does not support the Termux target triple.
  echo "Installing Termux packages: python-numpy, python-pillow, ffmpeg, rust..."
  if ! pkg install -y python-numpy python-pillow ffmpeg rust; then
    echo ""
    echo "Error: 'pkg install' failed. This is often caused by ABI/library version mismatch."
    echo "Fix: run the following command manually, then re-run this script:"
    echo "  pkg upgrade"
    echo "See also: https://github.com/termux/termux-packages/wiki/Termux-execution-environment#dynamic-library-linking-errors"
    exit 1
  fi

  FILTERED_REQ=".termux-requirements.txt"
  trap 'rm -f "$FILTERED_REQ"' EXIT
  # Install heavy native deps via pkg on Termux; skip them in pip requirements.
  grep -Eiv '^\s*(numpy|pillow|ffmpeg|ffmpeg-python)\s*([<=>!~].*)?$' "$REQ_FILE" > "$FILTERED_REQ" || true

  if [ -s "$FILTERED_REQ" ]; then
    echo "Installing remaining Python dependencies from filtered requirements..."
    # --prefer-binary avoids source builds (e.g. Rust/C extensions) for any remaining packages.
    "$VENV_PYTHON" -m pip install --prefer-binary -r "$FILTERED_REQ"
  else
    echo "No pip dependencies left after Termux-specific filtering."
  fi
else
  echo "Installing dependencies from $REQ_FILE..."
  "$VENV_PYTHON" -m pip install -r "$REQ_FILE"
fi

echo "Install completed successfully."
