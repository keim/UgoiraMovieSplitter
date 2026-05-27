// --- mosaic パネル ---
const mosaicExecuteButton = document.getElementById("mosaicExecuteButton");
const mosaicResult = document.getElementById("mosaicResult");
const mosaicDownloadButton = document.getElementById("mosaicDownloadButton");
const mosaicPreviewWrap = document.getElementById("mosaicPreviewWrap");
const mosaicPreviewFrame = document.getElementById("mosaicPreviewFrame");
const mosaicPreviewCanvas = document.getElementById("mosaicPreviewCanvas");
const mosaicPreviewMeta = document.getElementById("mosaicPreviewMeta");
const mosaicPreviewContext = mosaicPreviewCanvas.getContext("2d");
const mosaicPreviewImage = new Image();
const mosaicOverlayInputs = [
  document.getElementById("mosaicX1"),
  document.getElementById("mosaicY1"),
  document.getElementById("mosaicW1"),
  document.getElementById("mosaicH1"),
  document.getElementById("mosaicSize1"),
];
const mosaicX1Input = document.getElementById("mosaicX1");
const mosaicY1Input = document.getElementById("mosaicY1");
const mosaicW1Input = document.getElementById("mosaicW1");
const mosaicH1Input = document.getElementById("mosaicH1");
let mosaicPreviewFrameUrl = null;
let mosaicPreviewRequestSerial = 0;
let isMosaicDragging = false;
let mosaicDragStart = null;
let mosaicDragCurrent = null;

mosaicDownloadButton.addEventListener("click", () => downloadImagesFromButton(mosaicDownloadButton));

const previewDownloadButton = document.getElementById("previewDownloadButton");
previewDownloadButton.addEventListener("click", async () => {
  await downloadPlaylistFrames();
});

mosaicPreviewCanvas.style.touchAction = "none";

function toFiniteNumber(inputId) {
  const value = Number(document.getElementById(inputId).value);
  return Number.isFinite(value) ? value : null;
}

function updateMosaicPreviewLayout() {
  const isPortrait = mosaicPreviewImage.naturalHeight > mosaicPreviewImage.naturalWidth;

  mosaicPreviewFrame.classList.toggle("aspect-square", isPortrait);
  mosaicPreviewCanvas.classList.toggle("w-full", !isPortrait);
  mosaicPreviewCanvas.classList.toggle("h-auto", true);
  mosaicPreviewCanvas.classList.toggle("max-w-full", isPortrait);
  mosaicPreviewCanvas.classList.toggle("max-h-full", isPortrait);
  mosaicPreviewCanvas.classList.toggle("w-auto", isPortrait);
  mosaicPreviewCanvas.classList.toggle("mx-auto", isPortrait);
}

function drawOverlayRect(x, y, width, height, strokeStyle, fillStyle) {
  if (!mosaicPreviewContext || !mosaicPreviewCanvas.width || !mosaicPreviewCanvas.height) return;
  if (![x, y, width, height].every(Number.isFinite)) return;
  if (width <= 0 || height <= 0) return;

  const canvasWidth = mosaicPreviewCanvas.width;
  const canvasHeight = mosaicPreviewCanvas.height;

  const drawX = Math.max(0, Math.min(canvasWidth - 1, x));
  const drawY = Math.max(0, Math.min(canvasHeight - 1, y));
  const maxWidth = canvasWidth - drawX;
  const maxHeight = canvasHeight - drawY;
  const drawWidth = Math.max(0, Math.min(width, maxWidth));
  const drawHeight = Math.max(0, Math.min(height, maxHeight));
  if (drawWidth <= 0 || drawHeight <= 0) return;

  mosaicPreviewContext.fillStyle = fillStyle;
  mosaicPreviewContext.strokeStyle = strokeStyle;
  mosaicPreviewContext.lineWidth = 2;
  mosaicPreviewContext.fillRect(drawX, drawY, drawWidth, drawHeight);
  mosaicPreviewContext.strokeRect(drawX, drawY, drawWidth, drawHeight);
}

function getCanvasPointFromPointer(event) {
  const rect = mosaicPreviewCanvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;

  const scaleX = mosaicPreviewCanvas.width / rect.width;
  const scaleY = mosaicPreviewCanvas.height / rect.height;
  const x = (event.clientX - rect.left) * scaleX;
  const y = (event.clientY - rect.top) * scaleY;

  const clampedX = Math.max(0, Math.min(mosaicPreviewCanvas.width - 1, x));
  const clampedY = Math.max(0, Math.min(mosaicPreviewCanvas.height - 1, y));
  return { x: clampedX, y: clampedY };
}

function normalizeDragRect(startPoint, endPoint) {
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

function renderMosaicPreviewOverlay() {
  if (!mosaicPreviewContext || !mosaicPreviewFrameUrl) return;
  if (!mosaicPreviewImage.complete || !mosaicPreviewImage.naturalWidth || !mosaicPreviewImage.naturalHeight) return;

  updateMosaicPreviewLayout();
  mosaicPreviewCanvas.width = mosaicPreviewImage.naturalWidth;
  mosaicPreviewCanvas.height = mosaicPreviewImage.naturalHeight;
  mosaicPreviewContext.clearRect(0, 0, mosaicPreviewCanvas.width, mosaicPreviewCanvas.height);
  mosaicPreviewContext.drawImage(mosaicPreviewImage, 0, 0);

  const x1 = toFiniteNumber("mosaicX1");
  const y1 = toFiniteNumber("mosaicY1");
  const w1 = toFiniteNumber("mosaicW1");
  const h1 = toFiniteNumber("mosaicH1");
  if (mosaicEnable1.checked && [x1, y1, w1, h1].every((value) => value != null)) {
    drawOverlayRect(x1, y1, w1, h1, "rgba(239, 68, 68, 0.95)", "rgba(239, 68, 68, 0.20)");
  }

  if (isMosaicDragging && mosaicDragStart && mosaicDragCurrent) {
    const draggingRect = normalizeDragRect(mosaicDragStart, mosaicDragCurrent);
    if (draggingRect) {
      drawOverlayRect(
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

function canStartMosaicDrag() {
  return Boolean(
    mosaicEnable1.checked
    && !mosaicEnable1.disabled
    && mosaicPreviewFrameUrl
    && mosaicPreviewImage.complete
    && mosaicPreviewImage.naturalWidth > 0
    && mosaicPreviewImage.naturalHeight > 0
    && !mosaicX1Input.disabled
    && !mosaicY1Input.disabled
    && !mosaicW1Input.disabled
    && !mosaicH1Input.disabled
  );
}

mosaicPreviewCanvas.addEventListener("pointerdown", (event) => {
  if (!canStartMosaicDrag()) return;

  const point = getCanvasPointFromPointer(event);
  if (!point) return;

  isMosaicDragging = true;
  mosaicDragStart = point;
  mosaicDragCurrent = point;
  mosaicPreviewCanvas.setPointerCapture(event.pointerId);
  renderMosaicPreviewOverlay();
});

mosaicPreviewCanvas.addEventListener("pointermove", (event) => {
  if (!isMosaicDragging) return;

  const point = getCanvasPointFromPointer(event);
  if (!point) return;

  mosaicDragCurrent = point;
  renderMosaicPreviewOverlay();
});

function finalizeMosaicDrag() {
  if (!isMosaicDragging) return;

  const draggingRect = normalizeDragRect(mosaicDragStart, mosaicDragCurrent);
  isMosaicDragging = false;
  mosaicDragStart = null;
  mosaicDragCurrent = null;

  if (draggingRect) {
    mosaicX1Input.value = String(draggingRect.x);
    mosaicY1Input.value = String(draggingRect.y);
    mosaicW1Input.value = String(draggingRect.width);
    mosaicH1Input.value = String(draggingRect.height);
  }

  renderMosaicPreviewOverlay();
}

mosaicPreviewCanvas.addEventListener("pointerup", (event) => {
  if (isMosaicDragging && mosaicPreviewCanvas.hasPointerCapture(event.pointerId)) {
    mosaicPreviewCanvas.releasePointerCapture(event.pointerId);
  }
  finalizeMosaicDrag();
});

mosaicPreviewCanvas.addEventListener("pointercancel", (event) => {
  if (isMosaicDragging && mosaicPreviewCanvas.hasPointerCapture(event.pointerId)) {
    mosaicPreviewCanvas.releasePointerCapture(event.pointerId);
  }
  finalizeMosaicDrag();
});

async function refreshMosaicPreview() {
  const targetDir = getMosaicTargetDir();
  const dirParam = buildDirParam(targetDir);

  if (!dirParam) {
    mosaicPreviewWrap.classList.add("hidden");
    mosaicPreviewMeta.textContent = "";
    mosaicPreviewFrameUrl = null;
    return;
  }

  const serial = ++mosaicPreviewRequestSerial;
  mosaicPreviewMeta.textContent = "プレビュー読み込み中...";
  mosaicPreviewWrap.classList.remove("hidden");

  try {
    const frameCount = Number(getMosaicImageCount());
    const index = Number.isFinite(frameCount) && frameCount > 0 ? Math.floor(frameCount / 2) : 0;
    const response = await fetch(`/frame_image?dir=${encodeURIComponent(dirParam)}&index=${index}`);
    const data = await response.json();
    if (serial !== mosaicPreviewRequestSerial) return;
    if (!response.ok) {
      throw new Error(data.detail || "preview load failed");
    }

    const frameUrlWithBust = `${data.frame_url}?v=${Date.now()}`;
    mosaicPreviewFrameUrl = frameUrlWithBust;
    mosaicPreviewImage.onload = () => {
      if (serial !== mosaicPreviewRequestSerial) return;
      renderMosaicPreviewOverlay();
    };
    mosaicPreviewImage.src = frameUrlWithBust;
    mosaicPreviewMeta.textContent = `${data.frame_name} (${data.width}x${data.height}, total ${data.frame_count} frames)`;
  } catch (error) {
    if (serial !== mosaicPreviewRequestSerial) return;
    mosaicPreviewFrameUrl = null;
    if (mosaicPreviewContext) {
      mosaicPreviewContext.clearRect(0, 0, mosaicPreviewCanvas.width, mosaicPreviewCanvas.height);
    }
    mosaicPreviewMeta.textContent = `プレビュー取得エラー: ${error}`;
  }
}

mosaicOverlayInputs.forEach((input) => {
  input.addEventListener("input", renderMosaicPreviewOverlay);
});

[mosaicEnable1].forEach((checkbox) => {
  checkbox.addEventListener("change", () => {
    updateMosaicRegionInputAvailability();
    renderMosaicPreviewOverlay();
  });
});

const originalActivateTab = activateTab;
activateTab = function(name) {
  const prevActiveBtn = document.querySelector(".tab-btn.bg-slate-800");
  const prevTab = prevActiveBtn?.dataset.tab ?? null;
  originalActivateTab(name);
  if (name === "mosaic") {
    refreshMosaicPreview();
  }
  if (prevTab === "preview" && name !== "preview") {
    stopPreviewPlay();
  }
};

mosaicExecuteButton.addEventListener("click", async () => {
  if (!uploadState.filename) {
    setResultMessage(mosaicResult, "先に upload タブでファイルをアップロードしてください。", "error");
    return;
  }
  if (!splitState.outputDir) {
    setResultMessage(mosaicResult, "先に split タブで JPEG を展開してください。", "error");
    return;
  }

  const targetDir = getMosaicTargetDir();
  if (!targetDir) {
    setResultMessage(mosaicResult, "対象ディレクトリがありません。先に split を実行してください。", "error");
    return;
  }

  const dirParam = buildDirParam(targetDir);
  if (!dirParam) {
    setResultMessage(mosaicResult, "対象ディレクトリの解決に失敗しました。", "error");
    return;
  }

  const params = new URLSearchParams({
    dir: dirParam,
    x1: String(Number(document.getElementById("mosaicX1").value)),
    y1: String(Number(document.getElementById("mosaicY1").value)),
    w1: String(Number(document.getElementById("mosaicW1").value)),
    h1: String(Number(document.getElementById("mosaicH1").value)),
    size1: mosaicEnable1.checked ? String(Number(document.getElementById("mosaicSize1").value)) : "1",
  });
  setResultMessage(mosaicResult, `実行中... ${formatFrameProgress(0, null)}`, "processing");

  try {
    const response = await fetch(`/mosaic?${params}`);
    const startData = await response.json();
    if (!response.ok) {
      setResultMessage(mosaicResult, `Error: ${startData.detail || "unknown error"}`, "error");
      return;
    }
    pollJob(startData.job_id, mosaicResult,
      (result) => {
        mosaicState = {
          mosaicDir: result.mosaic_dir,
          outputFrames: result.output_frames,
        };
        movieStatus.mosaicImages = Number.isFinite(Number(result.output_frames)) ? Number(result.output_frames) : 0;
        updateMosaicPanel();
        refreshMosaicPreview();
        setResultMessage(
          mosaicResult,
          `完了: ${formatFrameProgress(result.done, result.total)} → ${result.mosaic_dir}`,
          "success"
        );
        updatePanelResultSummaries();
        autoSetPlaylistToCurrentMovie();
      },
      (detail) => setResultMessage(mosaicResult, `Error: ${detail}`, "error")
    );
  } catch (error) {
    setResultMessage(mosaicResult, `Error: ${error}`, "error");
  }
});

updateSplitPanel();
updatePanelResultSummaries();
