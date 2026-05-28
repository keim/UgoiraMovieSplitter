# mp4 to jpeg images

A browser-based tool for splitting mp4 files into frames, merging frames, applying mosaic effects, and downloading results as ZIP archives.
Designed for local use — extracted JPG frames are stored in a dedicated folder on your machine.

## Table of Contents

- [TL;DR](#tldr)
- [Overview](#overview)
- [Requirements](#requirements)
- [Installation](#installation)
- [Running the Server](#running-the-server)
- [Features](#features)
  - [upload tab](#1-upload)
  - [split tab](#2-split)
  - [mergeframe tab](#3-mergeframe)
  - [mosaic tab](#4-mosaic)
  - [preview tab](#5-preview)
- [API Endpoints](#api-endpoints)
- [Frontend Structure](#frontend-structure)
- [Directory Layout](#directory-layout)
- [Notes](#notes)

---

## TL;DR

### bash (Linux / macOS / Git Bash / Termux)
1. `./install.sh` — install dependencies
2. `./run.sh` — start the server
3. Open `http://localhost:8000/html/` in your browser
4. **upload** tab: upload a video (file picker or Google Drive URL)
5. **split** tab: extract JPG frames with a specified range
6. **mergeframe** tab: average-blend multiple frames to reduce count *(optional)*
7. **mosaic** tab: apply pixelated mosaic to a selected area *(optional)*
8. **preview** tab: playlist playback and ZIP download
9. `./uninstall.sh` — uninstall

### Windows
1. `windows\install.bat` — install dependencies
2. `windows\run.bat` — start the server
3. Open `http://localhost:8000/html/` in your browser
4. Steps 4–8 same as above
9. `windows\uninstall.bat` — uninstall

---

## Overview

- Split an mp4 into a numbered JPG sequence
- Average-blend multiple frames to reduce the total frame count
- Apply a pixelated mosaic effect to a specified region
- Download processed results as a ZIP archive
- Play back frames in the browser as a playlist animation

The frontend is built with vanilla JavaScript files under `html/` (`tabs.js`, `state.js`, `upload.js`, `split.js`, `mergeframe.js`, `mosaic.js`, `preview.js`). The backend is `server.py` (FastAPI).

---

## Requirements

- Python 3.10 or later (Python < 3.12 automatically uses `requirement310.txt`)
- bash environment (Linux / macOS / Git Bash / Termux)
- Termux (Android) supported

---

## Installation

### 1) Grant execute permissions (Linux / macOS / Termux only)

```bash
chmod +x install.sh run.sh uninstall.sh
```

### 2) Install dependencies

```bash
./install.sh
```

`install.sh` behaviour:

- **Python detection**: tries `python3` → `python` → `py -3` in order
- **Requirements selection**: Python < 3.12 uses `requirement310.txt`; otherwise `requirements.txt`
- **Standard environment**:
  - Creates `.venv` and runs `pip install`
- **Termux environment**:
  - Runs `pkg upgrade -y` to ensure ABI consistency
  - Runs `pkg install -y python-numpy python-pillow ffmpeg rust`
  - Runs `pip install` excluding `numpy` / `pillow` / `ffmpeg`, with `--prefer-binary`

### 3) Uninstall

```bash
./uninstall.sh
```

- Removes the `.venv` directory
- On Termux, prompts to individually remove `python-numpy` / `python-pillow` / `ffmpeg` / `rust`

---

## Running the Server

### bash

```bash
./run.sh
```

### Windows

```cmd
windows\run.bat
```

Defaults:

- App file: `server.py`
- Port: `8000`

Override with environment variables:

```bash
APP_FILE=server.py PORT=9000 ./run.sh
```

Access the UI at: `http://localhost:8000/html/`

---

## Features

The tab bar is displayed as tabs on desktop (≥ 768 px) and as a hamburger dropdown on mobile (≤ 767 px).

### 1. upload

- **File upload**: select a local mp4 and send it to the server
- **Google Drive import**: paste a sharing link (`?usp=sharing`) to download directly
  - Links with `?usp=drive_link` are not supported due to permission restrictions (an error message is shown)
- Displays video info (codec / fps / duration, etc.)
- Select or delete previously uploaded mp4 files
- **The split tab is only enabled after a file is selected**

### 2. split

- Specify start / end frame to write out a numbered JPG sequence
- Output: `images/<movie_stem>_frames/`
- Download split images as a ZIP
- Automatically updates the preview tab playlist on completion

### 3. mergeframe

- Average-blend every N frames to reduce the total count
- Output: `images/<movie_stem>_frames/merged/`
- Download merged results as a ZIP
- Automatically updates the preview tab playlist on completion

### 4. mosaic

- Apply a pixelated mosaic to a rectangle defined by (x, y, w, h, size)
- Drag on the preview canvas to define the region
- Output: `images/<movie_stem>_frames/mosaic/`
- Download mosaic results as a ZIP
- Automatically updates the preview tab playlist on completion

### 5. preview

- **Playlist playback only** (tab is always enabled)
- When split / mergeframe / mosaic completes, or when a file is selected, the playlist is automatically set to that single video
  - Priority order for frame source: mosaic → merged → split
- **Available Movies**: thumbnail list — click to add/remove from playlist
- **Playlist controls**:
  - ↑ / ↓ to reorder, ✕ to remove
  - Loop checkbox to wrap back to the start after the last video
- Playback speed (msec/frame) is adjustable in real time
- **Download**: enabled when the playlist contains at least one video. Fetches the latest frames and downloads as a sequentially numbered ZIP

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/movie_list` | Returns the list of mp4 files under `movies/` |
| `POST` | `/upload` | Saves an mp4 and returns movie info (filename: `<stem>_YYYYMMDDHHMMSS.mp4`) |
| `POST` | `/download_from_gdrive` | Downloads an mp4 from a Google Drive sharing link. Body: `{"url": "https://drive.google.com/..."}` |
| `GET` | `/movie_info?file=<name>.mp4` | Returns info and processing status for a given mp4 |
| `GET` | `/delete_movie?file=<name>.mp4` | Deletes the mp4 and its associated frame directory |
| `GET` | `/split?file=<name>.mp4&start=0&end=120` | Splits frames (job-based; poll via `GET /job/<job_id>`) |
| `GET` | `/frame_image?dir=<dir>&index=0` | Returns frame info for a given directory and index |
| `GET` | `/mergeframe?dir=<dir>&frames=2` | Merges frames (job-based) |
| `GET` | `/mergeframe_delete?dir=<dir>` | Deletes the `merged/` subdirectory |
| `GET` | `/mosaic?dir=<dir>&x1=100&y1=100&w1=80&h1=80&size1=8` | Applies mosaic (job-based) |
| `GET` | `/download_images?dir=<dir>&name=result.zip` | Returns JPG files as a ZIP archive |
| `POST` | `/download_playlist_frames` | Downloads specified frames renamed as `00001.jpg`, `00002.jpg`, … in a ZIP. Body: `{"frames": [{"dir": "<dir>", "index": 0}, ...], "name": "playlist.zip"}` |

---

## Frontend Structure

JS files under `html/` are loaded in order. `index.html` loads them as follows:

| File | Purpose |
|------|---------|
| [`tabs.js`](html/tabs.js) | Desktop/mobile tab constants, `activateTab()` |
| [`state.js`](html/state.js) | Shared state variables, utility functions, panel update functions |
| [`upload.js`](html/upload.js) | Upload DOM refs, movie management, Google Drive import, event listeners |
| [`split.js`](html/split.js) | Split DOM refs, execution listeners |
| [`mergeframe.js`](html/mergeframe.js) | Mergeframe DOM refs, event listeners |
| [`mosaic.js`](html/mosaic.js) | Mosaic DOM refs, canvas drawing, `activateTab` override |
| [`preview.js`](html/preview.js) | Playlist playback, thumbnails, download — all preview functionality |

---

## Directory Layout

```
splitter/
├── server.py               # FastAPI backend
├── html/                   # Frontend (static files)
├── movies/                 # Uploaded mp4 files
├── images/                 # Split and processed frames
│   └── <stem>_frames/
│       ├── *.jpg               # split frames
│       ├── merged/*.jpg        # mergeframe output
│       └── mosaic/*.jpg        # mosaic output
├── requirements.txt            # Python 3.12+
├── requirement310.txt          # Python 3.10 / 3.11
├── install.sh
├── uninstall.sh
└── run.sh
```

---

## Notes

- The recommended way to use this tool is via the Web UI (`server.py` + `html/`).
- JS files are served with `Cache-Control: no-store`, so browser-cached versions are never used.
