const RESULT_PANEL_BASE = "rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm";
const RESULT_TONE_CLASS = {
  neutral: "text-slate-700",
  info: "text-slate-600",
  processing: "text-slate-500",
  success: "text-emerald-700",
  error: "text-rose-600",
};

function setResultMessage(element, message, tone = "neutral") {
  if (!element) return;
  const text = String(message ?? "").trim();
  const isPanelFormat = element.dataset.resultPanel === "true";

  if (isPanelFormat) {
    const messageElement = element.querySelector('[data-role="message"]');
    const toneClass = RESULT_TONE_CLASS[tone] || RESULT_TONE_CLASS.neutral;
    if (!messageElement) return;

    if (!text) {
      messageElement.textContent = "";
      messageElement.className = "mt-2 text-sm";
      element.classList.add("hidden");
      return;
    }

    messageElement.textContent = text;
    messageElement.className = `mt-2 text-sm ${toneClass}`;
    element.classList.remove("hidden");
    return;
  }

  if (!text) {
    element.textContent = "";
    element.className = `hidden ${RESULT_PANEL_BASE}`;
    return;
  }

  const toneClass = RESULT_TONE_CLASS[tone] || RESULT_TONE_CLASS.neutral;
  element.textContent = text;
  element.className = `${RESULT_PANEL_BASE} ${toneClass}`;
}

// upload / split 結果の共有ステート
let uploadState = { savedPath: null, frameCount: null, filename: null };
let splitState = { outputDir: null, frameCount: null };
let mergeframeState = { mergedDir: null, outputFrames: null };
let mosaicState = { mosaicDir: null, outputFrames: null };
let movieStatus = { splitImages: 0, mergedImages: 0, mosaicImages: 0 };
let movieInfoRequestSerial = 0;
let uploadedMovies = [];

function getBaseFramesDir(filename) {
  if (!filename) return null;
  return `images/${filename.replace(/\.[^.]+$/, "")}_frames`;
}

function updatePanelResultSummaries() {
  const splitResultElement = document.getElementById("splitResult");
  const mergeframeResultElement = document.getElementById("mergeframeResult");
  const mosaicResultElement = document.getElementById("mosaicResult");
  const splitDownloadButton = document.getElementById("splitDownloadButton");
  const mergeframeDownloadButton = document.getElementById("mergeframeDownloadButton");
  const mosaicDownloadButton = document.getElementById("mosaicDownloadButton");
  const baseFramesDir = getBaseFramesDir(uploadState.filename);

  const applyDownloadButtonState = (button, dirPath, count, label) => {
    if (!button) return;
    const normalizedCount = Number(count ?? 0);
    if (dirPath && Number.isFinite(normalizedCount) && normalizedCount > 0) {
      button.classList.remove("hidden");
      button.dataset.dir = dirPath;
      button.dataset.label = label;
    } else {
      button.classList.add("hidden");
      delete button.dataset.dir;
      delete button.dataset.label;
    }
  };

  const splitCount = Number(splitState.frameCount ?? movieStatus.splitImages ?? 0);
  const splitDir = splitState.outputDir ?? baseFramesDir;
  if (splitCount > 0 && splitDir) {
    setResultMessage(splitResultElement, `${splitCount} images generated -> ${splitDir}`, "info");
  } else {
    setResultMessage(splitResultElement, "");
  }
  applyDownloadButtonState(splitDownloadButton, splitDir, splitCount, "split");

  const mergeCount = Number(mergeframeState.outputFrames ?? movieStatus.mergedImages ?? 0);
  const mergeDir = mergeframeState.mergedDir ?? (baseFramesDir ? `${baseFramesDir}/merged` : null);
  if (mergeCount > 0 && mergeDir) {
    setResultMessage(mergeframeResultElement, `${mergeCount} images generated -> ${mergeDir}`, "info");
  } else {
    setResultMessage(mergeframeResultElement, "");
  }
  applyDownloadButtonState(mergeframeDownloadButton, mergeDir, mergeCount, "mergeframe");

  const mosaicCount = Number(mosaicState.outputFrames ?? movieStatus.mosaicImages ?? 0);
  const mosaicDir = mosaicState.mosaicDir ?? (baseFramesDir ? `${baseFramesDir}/mosaic` : null);
  if (mosaicCount > 0 && mosaicDir) {
    setResultMessage(mosaicResultElement, `${mosaicCount} images generated -> ${mosaicDir}`, "info");
  } else {
    setResultMessage(mosaicResultElement, "");
  }
  applyDownloadButtonState(mosaicDownloadButton, mosaicDir, mosaicCount, "mosaic");
}

function downloadImagesFromButton(button) {
  if (!button?.dataset?.dir) return;
  const dirParam = buildDirParam(button.dataset.dir);
  if (!dirParam) return;
  const baseName = uploadState.filename ? uploadState.filename.replace(/\.[^.]+$/, "") : "images";
  const label = button.dataset.label || "images";
  const zipName = `${baseName}_${label}.zip`;
  window.location.href = `/download_images?dir=${encodeURIComponent(dirParam)}&name=${encodeURIComponent(zipName)}`;
}

function getMosaicTargetDir() {
  return mosaicState.mosaicDir ?? mergeframeState.mergedDir ?? splitState.outputDir;
}

function getMosaicImageCount() {
  return mosaicState.outputFrames ?? mergeframeState.outputFrames ?? splitState.frameCount;
}

function hasSplitImages() {
  return Number.isFinite(splitState.frameCount) && splitState.frameCount > 0 && Boolean(splitState.outputDir);
}

function setElementDisabled(element, disabled) {
  if (!element) return;
  element.disabled = disabled;
  element.setAttribute("aria-disabled", disabled ? "true" : "false");
  element.classList.toggle("opacity-50", disabled);
  element.classList.toggle("cursor-not-allowed", disabled);
}

function updateMosaicRegionInputAvailability() {
  const panelEnabled = hasSplitImages();
  const region1Enabled = panelEnabled && mosaicEnable1.checked;

  [
    document.getElementById("mosaicX1"),
    document.getElementById("mosaicY1"),
    document.getElementById("mosaicW1"),
    document.getElementById("mosaicH1"),
    document.getElementById("mosaicSize1"),
  ].forEach((element) => setElementDisabled(element, !region1Enabled));

  setElementDisabled(mosaicEnable1, !panelEnabled);
}

function updateProcessingAvailability() {
  const hasMovie = Boolean(uploadState.filename);
  const enabled = hasSplitImages();

  setElementDisabled(splitTabButton, !hasMovie);
  setElementDisabled(mergeframeTabButton, !enabled);
  setElementDisabled(mosaicTabButton, !enabled);
  setElementDisabled(mergeframeFrames, !enabled);
  setElementDisabled(mergeframeExecuteButton, !enabled);
  setElementDisabled(mergeframeDeleteButton, !enabled);
  setElementDisabled(mosaicExecuteButton, !enabled);
  updateMosaicRegionInputAvailability();
  mergeframeDisabledHint.classList.toggle("hidden", enabled);
  mosaicDisabledHint.classList.toggle("hidden", enabled);

  if (!enabled) {
    if (document.getElementById("panel-mergeframe").classList.contains("hidden") === false || document.getElementById("panel-mosaic").classList.contains("hidden") === false) {
      activateTab("split");
    }
    mosaicPreviewWrap.classList.add("hidden");
    mosaicPreviewMeta.textContent = "";
    mosaicPreviewFrameUrl = null;
  }

  const activeTab = document.querySelector(`.tab-btn.${DESKTOP_ACTIVE.split(" ")[0]}`)?.dataset.tab;
  if ((activeTab === "mergeframe" || activeTab === "mosaic") && !enabled) {
    activateTab("split");
  } else if (activeTab === "split" && !hasMovie) {
    activateTab("upload");
  } else {
    activateTab(activeTab ?? "upload");
  }
}

function buildDirParam(targetDir) {
  if (!targetDir) return null;
  const normalized = String(targetDir).replace(/\\/g, "/").replace(/^\/+/, "");
  if (normalized.startsWith("images/")) {
    return normalized.slice("images/".length);
  }
  return normalized;
}

function formatFrameProgress(done, total) {
  const completed = Number.isFinite(Number(done)) ? Number(done) : 0;
  const hasTotal = Number.isFinite(Number(total)) && Number(total) > 0;
  return hasTotal
    ? `[${completed} frames] / [${Number(total)} frames]`
    : `[${completed} frames] / [? frames]`;
}

function pollJob(jobId, resultEl, onCompleted, onError) {
  const intervalId = setInterval(async () => {
    try {
      const resp = await fetch(`/job/${jobId}`);
      const data = await resp.json();
      if (!resp.ok) {
        clearInterval(intervalId);
        onError(data.detail || "unknown error");
        return;
      }
      const done = data.done ?? 0;
      const total = data.total ?? 0;
      const progress = formatFrameProgress(done, total);
      if (data.status === "processing") {
        setResultMessage(resultEl, `実行中... ${progress}`, "processing");
      } else if (data.status === "completed") {
        clearInterval(intervalId);
        onCompleted(data);
      } else if (data.status === "error") {
        clearInterval(intervalId);
        onError(data.detail || "unknown error");
      }
    } catch (e) {
      clearInterval(intervalId);
      onError(String(e));
    }
  }, 1000);
}

function updateSplitPanel() {
  document.getElementById("splitFilePath").textContent = uploadState.savedPath ?? "-";
  document.getElementById("splitFrameCount").textContent = uploadState.frameCount ?? "-";
  if (uploadState.frameCount != null) {
    document.getElementById("splitEnd").placeholder = String(uploadState.frameCount - 1);
    splitFrameSeekInput.max = String(uploadState.frameCount - 1);
    splitFrameSeekMax.textContent = `/ ${uploadState.frameCount - 1}`;
    if (splitPreview.src && currentFps != null) {
      splitFrameSeekArea.classList.remove("hidden");
    }
  } else {
    splitFrameSeekArea.classList.add("hidden");
    splitFrameSeekInput.value = 0;
    splitFrameSeekMax.textContent = "";
  }
  document.getElementById("mergeframeMoviePath").textContent = uploadState.savedPath ?? "-";
  document.getElementById("mergeframeImageCount").textContent = splitState.frameCount ?? "-";
  document.getElementById("mosaicMoviePath").textContent = getMosaicTargetDir() ?? "-";
  document.getElementById("mosaicImageCount").textContent = getMosaicImageCount() ?? "-";
  const hasMovie = Boolean(uploadState.filename);
  setElementDisabled(deleteMovieButton, !hasMovie);
  updateProcessingAvailability();
}

function updateMergeframePanel() {
  document.getElementById("mergeframeMoviePath").textContent = uploadState.savedPath ?? "-";
  document.getElementById("mergeframeImageCount").textContent = splitState.frameCount ?? "-";
  document.getElementById("mosaicMoviePath").textContent = getMosaicTargetDir() ?? "-";
  document.getElementById("mosaicImageCount").textContent = getMosaicImageCount() ?? "-";
}

function updateMosaicPanel() {
  document.getElementById("mosaicMoviePath").textContent = getMosaicTargetDir() ?? "-";
  document.getElementById("mosaicImageCount").textContent = getMosaicImageCount() ?? "-";
}
