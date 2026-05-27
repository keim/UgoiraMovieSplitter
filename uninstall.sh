#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

IS_TERMUX="false"
if [[ "${PREFIX:-}" == *"com.termux"* ]] || [[ "$(uname -o 2>/dev/null || true)" == "Android" ]]; then
  IS_TERMUX="true"
fi

# --- Termux: ask whether to remove each globally installed package ---
if [[ "$IS_TERMUX" == "true" ]]; then
  echo "Termux environment detected."
  echo "The following packages were installed globally via pkg:"
  echo "  python-numpy, python-pillow, ffmpeg, rust"
  echo "Removing them may affect other apps that depend on these packages."
  echo ""

  for PKG in python-numpy python-pillow ffmpeg rust; do
    read -r -p "Remove '$PKG' via pkg? [y/N] " ANSWER
    case "$ANSWER" in
      [yY][eE][sS]|[yY])
        echo "Removing $PKG..."
        pkg remove -y "$PKG" || echo "Warning: failed to remove $PKG (may not be installed)."
        ;;
      *)
        echo "Skipping $PKG."
        ;;
    esac
  done

  echo ""
fi

# --- Remove virtual environment ---
if [ -d ".venv" ]; then
  echo "Removing .venv..."
  rm -rf ".venv"
  echo ".venv removed."
else
  echo ".venv not found, nothing to remove."
fi

echo "Uninstall completed."
