// --- mosaic パネル ---
const _mosaicExecuteButton = document.getElementById("mosaicExecuteButton");
const _mosaicResult = document.getElementById("mosaicResult");
const _mosaicDownloadButton = document.getElementById("mosaicDownloadButton");
const _mosaicPreviewWrap = document.getElementById("mosaicPreviewWrap");
const _mosaicPreviewFrame = document.getElementById("mosaicPreviewFrame");
const _mosaicPreviewCanvas = document.getElementById("mosaicPreviewCanvas");
const _mosaicPreviewMeta = document.getElementById("mosaicPreviewMeta");
const _mosaicPreviewContext = _mosaicPreviewCanvas.getContext("2d");
const _mosaicPreviewImage = new Image();
const _mosaicEnable = document.getElementById("mosaicEnable");
const _mosaicXInput = document.getElementById("mosaicX");
const _mosaicYInput = document.getElementById("mosaicY");
const _mosaicWInput = document.getElementById("mosaicW");
const _mosaicHInput = document.getElementById("mosaicH");
const _mosaicSizeInput = document.getElementById("mosaicSize");
const _mosaicOverlayInputs = [_mosaicXInput, _mosaicYInput, _mosaicWInput, _mosaicHInput, _mosaicSizeInput];
let _mosaicPreviewRequestSerial = 0;
let _isMosaicDragging = false;
let _mosaicDragStart = null;
let _mosaicDragCurrent = null;

function _toFiniteNumber(input) {
  const value = Number(input.value);
  return Number.isFinite(value) ? value : null;
}

function _updateMosaicPreviewLayout() {
  const isPortrait = _mosaicPreviewImage.naturalHeight > _mosaicPreviewImage.naturalWidth;

  _mosaicPreviewFrame.classList.toggle("aspect-square", isPortrait);
  _mosaicPreviewCanvas.classList.toggle("w-full", !isPortrait);
  _mosaicPreviewCanvas.classList.toggle("h-auto", true);
  _mosaicPreviewCanvas.classList.toggle("max-w-full", isPortrait);
  _mosaicPreviewCanvas.classList.toggle("max-h-full", isPortrait);
  _mosaicPreviewCanvas.classList.toggle("w-auto", isPortrait);
  _mosaicPreviewCanvas.classList.toggle("mx-auto", isPortrait);
}

function _drawOverlayRect(x, y, width, height, strokeStyle, fillStyle) {
  if (!_mosaicPreviewContext || !_mosaicPreviewCanvas.width || !_mosaicPreviewCanvas.height) return;
  if (![x, y, width, height].every(Number.isFinite)) return;
  if (width <= 0 || height <= 0) return;

  const canvasWidth = _mosaicPreviewCanvas.width;
  const canvasHeight = _mosaicPreviewCanvas.height;

  const drawX = Math.max(0, Math.min(canvasWidth - 1, x));
  const drawY = Math.max(0, Math.min(canvasHeight - 1, y));
  const maxWidth = canvasWidth - drawX;
  const maxHeight = canvasHeight - drawY;
  const drawWidth = Math.max(0, Math.min(width, maxWidth));
  const drawHeight = Math.max(0, Math.min(height, maxHeight));
  if (drawWidth <= 0 || drawHeight <= 0) return;

  _mosaicPreviewContext.fillStyle = fillStyle;
  _mosaicPreviewContext.strokeStyle = strokeStyle;
  _mosaicPreviewContext.lineWidth = 2;
  _mosaicPreviewContext.fillRect(drawX, drawY, drawWidth, drawHeight);
  _mosaicPreviewContext.strokeRect(drawX, drawY, drawWidth, drawHeight);
}

function _getCanvasPointFromPointer(event) {
  const rect = _mosaicPreviewCanvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;

  const scaleX = _mosaicPreviewCanvas.width / rect.width;
  const scaleY = _mosaicPreviewCanvas.height / rect.height;
  const x = (event.clientX - rect.left) * scaleX;
  const y = (event.clientY - rect.top) * scaleY;

  const clampedX = Math.max(0, Math.min(_mosaicPreviewCanvas.width - 1, x));
  const clampedY = Math.max(0, Math.min(_mosaicPreviewCanvas.height - 1, y));
  return { x: clampedX, y: clampedY };
}

function _normalizeDragRect(startPoint, endPoint) {
  if (!startPoint || !endPoint) return null;
  const left = Math.min(startPoint.x, endPoint.x);
  const top = Math.min(startPoint.y, endPoint.y);
  const right = Math.max(startPoint.x, endPoint.x);
  const bottom = Math.max(startPoint.y, endPoint.y);

  const x = Math.max(0, Math.floor(left));
  const y = Math.max(0, Math.floor(top));
  const width = Math.max(1, Math.ceil(right) - x);
  const height = Math.max(1, Math.ceil(bottom) - y);
  return { x, y, width, height };
}

function _renderMosaicPreviewOverlay() {
  if (!_mosaicPreviewContext || !mosaicPreviewFrameUrl) return;
  if (!_mosaicPreviewImage.complete || !_mosaicPreviewImage.naturalWidth || !_mosaicPreviewImage.naturalHeight) return;

  _updateMosaicPreviewLayout();
  _mosaicPreviewCanvas.width = _mosaicPreviewImage.naturalWidth;
  _mosaicPreviewCanvas.height = _mosaicPreviewImage.naturalHeight;
  _mosaicPreviewContext.clearRect(0, 0, _mosaicPreviewCanvas.width, _mosaicPreviewCanvas.height);
  _mosaicPreviewContext.drawImage(_mosaicPreviewImage, 0, 0);

  const x1 = _toFiniteNumber(_mosaicXInput);
  const y1 = _toFiniteNumber(_mosaicYInput);
  const w1 = _toFiniteNumber(_mosaicWInput);
  const h1 = _toFiniteNumber(_mosaicHInput);
  if (_mosaicEnable.checked && [x1, y1, w1, h1].every((value) => value != null)) {
    _drawOverlayRect(x1, y1, w1, h1, "rgba(239, 68, 68, 0.95)", "rgba(239, 68, 68, 0.20)");
  }

  if (_isMosaicDragging && _mosaicDragStart && _mosaicDragCurrent) {
    const draggingRect = _normalizeDragRect(_mosaicDragStart, _mosaicDragCurrent);
    if (draggingRect) {
      _drawOverlayRect(
        draggingRect.x,
        draggingRect.y,
        draggingRect.width,
        draggingRect.height,
        "rgba(245, 158, 11, 0.95)",
        "rgba(245, 158, 11, 0.20)",
      );
    }
  }
}

function _canStartMosaicDrag() {
  return Boolean(
    _mosaicEnable.checked
    && !_mosaicEnable.disabled
    && mosaicPreviewFrameUrl
    && _mosaicPreviewImage.complete
    && _mosaicPreviewImage.naturalWidth > 0
    && _mosaicPreviewImage.naturalHeight > 0
    && !_mosaicXInput.disabled
    && !_mosaicYInput.disabled
    && !_mosaicWInput.disabled
    && !_mosaicHInput.disabled
  );
}

function _finalizeMosaicDrag() {
  if (!_isMosaicDragging) return;

  const draggingRect = _normalizeDragRect(_mosaicDragStart, _mosaicDragCurrent);
  _isMosaicDragging = false;
  _mosaicDragStart = null;
  _mosaicDragCurrent = null;

  if (draggingRect) {
    _mosaicXInput.value = String(draggingRect.x);
    _mosaicYInput.value = String(draggingRect.y);
    _mosaicWInput.value = String(draggingRect.width);
    _mosaicHInput.value = String(draggingRect.height);
  }

  _renderMosaicPreviewOverlay();
}

async function _refreshMosaicPreview() {
  const targetDir = getMosaicTargetDir();
  const dirParam = buildDirParam(targetDir);

  if (!dirParam) {
    _mosaicPreviewWrap.classList.add("hidden");
    _mosaicPreviewMeta.textContent = "";
    mosaicPreviewFrameUrl = null;
    return;
  }

  const serial = ++_mosaicPreviewRequestSerial;
  _mosaicPreviewMeta.textContent = "プレビュー読み込み中...";
  _mosaicPreviewWrap.classList.remove("hidden");

  try {
    const frameCount = Number(getMosaicImageCount());
    const index = Number.isFinite(frameCount) && frameCount > 0 ? Math.floor(frameCount / 2) : 0;
    const response = await fetch(`/frame_image?dir=${encodeURIComponent(dirParam)}&index=${index}`);
    const data = await response.json();
    if (serial !== _mosaicPreviewRequestSerial) return;
    if (!response.ok) {
      throw new Error(data.detail || "preview load failed");
    }

    const frameUrlWithBust = `${data.frame_url}?v=${Date.now()}`;
    mosaicPreviewFrameUrl = frameUrlWithBust;
    _mosaicPreviewImage.onload = () => {
      if (serial !== _mosaicPreviewRequestSerial) return;
      _renderMosaicPreviewOverlay();
    };
    _mosaicPreviewImage.src = frameUrlWithBust;
    _mosaicPreviewMeta.textContent = `${data.frame_name} (${data.width}x${data.height}, total ${data.frame_count} frames)`;
  } catch (error) {
    if (serial !== _mosaicPreviewRequestSerial) return;
    mosaicPreviewFrameUrl = null;
    if (_mosaicPreviewContext) {
      _mosaicPreviewContext.clearRect(0, 0, _mosaicPreviewCanvas.width, _mosaicPreviewCanvas.height);
    }
    _mosaicPreviewMeta.textContent = `プレビュー取得エラー: ${error}`;
  }
}

function updateMosaicRegionInputAvailability() {
  const panelEnabled = _hasSplitImages();
  const region1Enabled = panelEnabled && _mosaicEnable.checked;

  _mosaicOverlayInputs.forEach((element) => setElementDisabled(element, !region1Enabled));

  setElementDisabled(_mosaicEnable, !panelEnabled);
}

function setMosaicButtonState(hasMovie, hasSplitImages) {
  setElementDisabled(_mosaicExecuteButton, !hasSplitImages);
  updateMosaicRegionInputAvailability();
  if (!hasSplitImages) {
    _mosaicPreviewWrap.classList.add("hidden");
    _mosaicPreviewMeta.textContent = "";
  }
}

function setupMosaic() {
  _mosaicDownloadButton.addEventListener("click", () => downloadImagesFromButton(_mosaicDownloadButton));

  _mosaicPreviewCanvas.style.touchAction = "none";

  _mosaicPreviewCanvas.addEventListener("pointerdown", (event) => {
    if (!_canStartMosaicDrag()) return;

    const point = _getCanvasPointFromPointer(event);
    if (!point) return;

    _isMosaicDragging = true;
    _mosaicDragStart = point;
    _mosaicDragCurrent = point;
    _mosaicPreviewCanvas.setPointerCapture(event.pointerId);
    _renderMosaicPreviewOverlay();
  });

  _mosaicPreviewCanvas.addEventListener("pointermove", (event) => {
    if (!_isMosaicDragging) return;

    const point = _getCanvasPointFromPointer(event);
    if (!point) return;

    _mosaicDragCurrent = point;
    _renderMosaicPreviewOverlay();
  });

  _mosaicPreviewCanvas.addEventListener("pointerup", (event) => {
    if (_isMosaicDragging && _mosaicPreviewCanvas.hasPointerCapture(event.pointerId)) {
      _mosaicPreviewCanvas.releasePointerCapture(event.pointerId);
    }
    _finalizeMosaicDrag();
  });

  _mosaicPreviewCanvas.addEventListener("pointercancel", (event) => {
    if (_isMosaicDragging && _mosaicPreviewCanvas.hasPointerCapture(event.pointerId)) {
      _mosaicPreviewCanvas.releasePointerCapture(event.pointerId);
    }
    _finalizeMosaicDrag();
  });

  _mosaicOverlayInputs.forEach((input) => {
    input.addEventListener("input", _renderMosaicPreviewOverlay);
  });

  [_mosaicEnable].forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      updateMosaicRegionInputAvailability();
      _renderMosaicPreviewOverlay();
    });
  });

  const _originalActivateTab = activateTab;
  activateTab = function(name) {
    const prevActiveBtn = document.querySelector(".tab-btn.bg-slate-800");
    const prevTab = prevActiveBtn?.dataset.tab ?? null;
    _originalActivateTab(name);
    if (name === "mosaic") {
      _refreshMosaicPreview();
    }
    if (prevTab === "preview" && name !== "preview") {
      stopPreviewPlay();
    }
  };

  _mosaicExecuteButton.addEventListener("click", async () => {
    if (!uploadState.filename) {
      setResultMessage(_mosaicResult, "先に upload タブでファイルをアップロードしてください。", "error");
      return;
    }
    if (!splitState.outputDir) {
      setResultMessage(_mosaicResult, "先に split タブで JPEG を展開してください。", "error");
      return;
    }

    const targetDir = getMosaicTargetDir();
    if (!targetDir) {
      setResultMessage(_mosaicResult, "対象ディレクトリがありません。先に split を実行してください。", "error");
      return;
    }

    const dirParam = buildDirParam(targetDir);
    if (!dirParam) {
      setResultMessage(_mosaicResult, "対象ディレクトリの解決に失敗しました。", "error");
      return;
    }

    const params = new URLSearchParams({
      dir: dirParam,
      x1: String(Number(_mosaicXInput.value)),
      y1: String(Number(_mosaicYInput.value)),
      w1: String(Number(_mosaicWInput.value)),
      h1: String(Number(_mosaicHInput.value)),
      size1: _mosaicEnable.checked ? String(Number(_mosaicSizeInput.value)) : "1",
    });
    setResultMessage(_mosaicResult, `実行中... ${formatFrameProgress(0, null)}`, "processing");

    try {
      const response = await fetch(`/mosaic?${params}`);
      const startData = await response.json();
      if (!response.ok) {
        setResultMessage(_mosaicResult, `Error: ${startData.detail || "unknown error"}`, "error");
        return;
      }
      pollJob(startData.job_id, _mosaicResult,
        (result) => {
          mosaicState = {
            mosaicDir: result.mosaic_dir,
            outputFrames: result.output_frames,
          };
          movieStatus.mosaicImages = Number.isFinite(Number(result.output_frames)) ? Number(result.output_frames) : 0;
          updateMosaicPanel();
          _refreshMosaicPreview();
          setResultMessage(
            _mosaicResult,
            `完了: ${formatFrameProgress(result.done, result.total)} → ${result.mosaic_dir}`,
            "success"
          );
          updatePanelResultSummaries();
          autoSetPlaylistToCurrentMovie();
        },
        (detail) => setResultMessage(_mosaicResult, `Error: ${detail}`, "error")
      );
    } catch (error) {
      setResultMessage(_mosaicResult, `Error: ${error}`, "error");
    }
  });

  updateSplitPanel();
  updatePanelResultSummaries();
}
