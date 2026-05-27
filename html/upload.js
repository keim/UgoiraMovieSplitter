// --- upload パネル ---
const movieInput = document.getElementById("movie");
const uploadButton = document.getElementById("uploadButton");
const gdriveUrlInput = document.getElementById("gdriveUrlInput");
const gdriveImportButton = document.getElementById("gdriveImportButton");
const deleteMovieButton = document.getElementById("deleteMovieButton");
const uploadedMovieSelect = document.getElementById("uploadedMovieSelect");
const result = document.getElementById("result");
const informationPanel = document.getElementById("informationPanel");
const informationList = document.getElementById("informationList");
const imageStatusPanel = document.getElementById("imageStatusPanel");
const imageStatusList = document.getElementById("imageStatusList");
const preview = document.getElementById("preview");
const previewPlaceholder = document.getElementById("previewPlaceholder");
const splitPreview = document.getElementById("splitPreview");
const splitPreviewPlaceholder = document.getElementById("splitPreviewPlaceholder");
const splitFrameSeekArea = document.getElementById("splitFrameSeekArea");
const splitFrameSeekInput = document.getElementById("splitFrameSeekInput");
const splitSetStartButton = document.getElementById("splitSetStartButton");
const splitSetEndButton = document.getElementById("splitSetEndButton");
const splitFrameSeekMax = document.getElementById("splitFrameSeekMax");
const mergeframeMsecPerFrame = document.getElementById("mergeframeMsecPerFrame");
const mosaicEnable1 = document.getElementById("mosaicEnable1");
const mergeframeDisabledHint = document.getElementById("mergeframeDisabledHint");
const mosaicDisabledHint = document.getElementById("mosaicDisabledHint");
let currentFps = null;
let previewObjectUrl = null;

const informationKeys = [
  "video_codec",
  "audio_codec",
  "width",
  "height",
  "fps",
  "bitrate",
  "duration",
  "creation_time"
];

function clearInformation() {
  informationList.innerHTML = "";
  informationPanel.open = false;
  informationPanel.classList.add("hidden");

  imageStatusList.innerHTML = "";
  imageStatusPanel.classList.add("hidden");

  currentFps = null;
  updateMergeframeTimingDisplay();
}

function updateMergeframeTimingDisplay() {
  const mergeCount = Number(document.getElementById("mergeframeFrames")?.value);
  if (!Number.isFinite(mergeCount) || mergeCount <= 0 || !Number.isFinite(currentFps) || currentFps == null || currentFps <= 0) {
    mergeframeMsecPerFrame.textContent = "-";
    return;
  }

  const msecPerFrame = (mergeCount * 1000) / currentFps;
  mergeframeMsecPerFrame.textContent = `${msecPerFrame.toFixed(2)} ms`;
}

function renderImageStatus(data) {
  imageStatusList.innerHTML = "";

  const statusItems = [
    ["split_images", data?.split_images ?? 0],
    ["merged_images", data?.merged_images ?? 0],
    ["mosaic_images", data?.mosaic_images ?? 0],
  ];

  statusItems.forEach(([key, rawValue]) => {
    const value = Number.isFinite(Number(rawValue)) ? Number(rawValue) : 0;

    const item = document.createElement("div");
    item.className = "rounded-md bg-white px-3 py-2 ring-1 ring-slate-200";

    const term = document.createElement("dt");
    term.className = "text-xs uppercase tracking-wide text-slate-500";
    term.textContent = key;

    const description = document.createElement("dd");
    description.className = "mt-1 font-medium text-slate-800";
    description.textContent = String(value);

    item.appendChild(term);
    item.appendChild(description);
    imageStatusList.appendChild(item);
  });

  imageStatusPanel.classList.remove("hidden");
}

function renderInformation(information) {
  informationList.innerHTML = "";

  const enrichedInformation = { ...(information || {}) };
  const fps = Number(enrichedInformation.fps);
  const duration = Number(enrichedInformation.duration);
  if (Number.isFinite(fps) && Number.isFinite(duration)) {
    enrichedInformation.frame_count = Math.round(fps * duration);
  }

  const displayKeys = [...informationKeys, "frame_count"];

  displayKeys.forEach((key) => {
    const value = enrichedInformation?.[key] ?? "-";

    const item = document.createElement("div");
    item.className = "rounded-md bg-white px-3 py-2 ring-1 ring-slate-200";

    const term = document.createElement("dt");
    term.className = "text-xs uppercase tracking-wide text-slate-500";
    term.textContent = key;

    const description = document.createElement("dd");
    description.className = "mt-1 font-medium text-slate-800 break-all";
    description.textContent = String(value);

    item.appendChild(term);
    item.appendChild(description);
    informationList.appendChild(item);
  });

  informationPanel.classList.remove("hidden");
  informationPanel.open = true;

  const frameCount = enrichedInformation.frame_count;
  if (Number.isFinite(fps) && fps > 0) {
    currentFps = fps;
  }
  updateMergeframeTimingDisplay();
}

splitFrameSeekInput.addEventListener("input", () => {
  if (currentFps == null || !splitPreview.src) return;
  const frame = Math.max(0, Number(splitFrameSeekInput.value));
  splitPreview.currentTime = frame / currentFps;
});

function updateVideoAspectClass(videoElement) {
  const isPortrait = videoElement.videoHeight > videoElement.videoWidth;
  videoElement.classList.toggle("aspect-square", isPortrait);
}

preview.addEventListener("loadedmetadata", () => updateVideoAspectClass(preview));
splitPreview.addEventListener("loadedmetadata", () => updateVideoAspectClass(splitPreview));

function syncSplitFrameSeekFromVideo() {
  if (currentFps == null || !Number.isFinite(currentFps) || currentFps <= 0) return;
  if (!splitPreview.src) return;

  const frame = Math.max(0, Math.round(splitPreview.currentTime * currentFps));
  splitFrameSeekInput.value = String(frame);
}

splitPreview.addEventListener("timeupdate", syncSplitFrameSeekFromVideo);
splitPreview.addEventListener("seeked", syncSplitFrameSeekFromVideo);

splitSetStartButton.addEventListener("click", () => {
  const frame = Math.max(0, Number(splitFrameSeekInput.value));
  document.getElementById("splitStart").value = String(frame);
});

splitSetEndButton.addEventListener("click", () => {
  const frame = Math.max(0, Number(splitFrameSeekInput.value));
  document.getElementById("splitEnd").value = String(frame);
});

function setSplitPreviewSource(src) {
  if (!src) {
    splitPreview.removeAttribute("src");
    splitPreview.classList.add("hidden");
    splitPreviewPlaceholder.classList.remove("hidden");
    splitPreviewPlaceholder.textContent = "ターゲットムービーを選択してください";
    splitFrameSeekArea.classList.add("hidden");
    splitFrameSeekInput.value = 0;
    splitFrameSeekMax.textContent = "";
    return;
  }

  splitPreview.src = src;
  splitPreview.classList.remove("hidden");
  splitPreviewPlaceholder.classList.add("hidden");
  splitPreview.load();

  if (currentFps != null && uploadState.frameCount != null) {
    splitFrameSeekInput.value = 0;
    splitFrameSeekInput.max = String(uploadState.frameCount - 1);
    splitFrameSeekMax.textContent = `/ ${uploadState.frameCount - 1}`;
    splitFrameSeekArea.classList.remove("hidden");
  }
}

movieInput.addEventListener("change", () => {
  const file = movieInput.files[0];
  if (previewObjectUrl) {
    URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = null;
  }
  if (!file) {
    preview.removeAttribute("src");
    preview.classList.add("hidden");
    previewPlaceholder.classList.remove("hidden");
    previewPlaceholder.textContent = "選択してください";
    setSplitPreviewSource(null);
    clearInformation();
    return;
  }

  previewObjectUrl = URL.createObjectURL(file);
  preview.src = previewObjectUrl;
  preview.classList.remove("hidden");
  previewPlaceholder.classList.add("hidden");
  preview.load();
  setSplitPreviewSource(null);
  clearInformation();
});

async function renderMovieInfoForFilename(filename) {
  if (!filename) {
    clearInformation();
    return;
  }

  const serial = ++movieInfoRequestSerial;
  try {
    const response = await fetch(`/movie_info?file=${encodeURIComponent(filename)}`);
    const data = await response.json();
    if (serial !== movieInfoRequestSerial) return;
    if (!response.ok) {
      throw new Error(data.detail || "failed to load movie info");
    }

    renderInformation(data.information);
    renderImageStatus(data);
    const info = data.information || {};
    const fps = Number(info.fps);
    const duration = Number(info.duration);
    const splitImages = Number(data.split_images);
    const mergedImages = Number(data.merged_images);
    const mosaicImages = Number(data.mosaic_images);
    uploadState.frameCount = (Number.isFinite(fps) && Number.isFinite(duration)) ? Math.round(fps * duration) : null;
    movieStatus = {
      splitImages: Number.isFinite(splitImages) ? Math.max(0, splitImages) : 0,
      mergedImages: Number.isFinite(mergedImages) ? Math.max(0, mergedImages) : 0,
      mosaicImages: Number.isFinite(mosaicImages) ? Math.max(0, mosaicImages) : 0,
    };
    splitState = {
      outputDir: Number.isFinite(splitImages) && splitImages > 0 && uploadState.filename ? `images/${uploadState.filename.replace(/\.[^.]+$/, "")}_frames` : null,
      frameCount: Number.isFinite(splitImages) && splitImages > 0 ? splitImages : null,
    };
    if (Number.isFinite(splitImages) && splitImages > 0) {
      document.getElementById("splitStart").value = String(Number(data.start_frame ?? 0));
      document.getElementById("splitEnd").value   = String(Number(data.end_frame   ?? 0));
    } else {
      document.getElementById("splitStart").value = "0";
      document.getElementById("splitEnd").value   = "";
    }
    mergeframeState = { mergedDir: null, outputFrames: null };
    mosaicState = {
      mosaicDir: Number.isFinite(mosaicImages) && mosaicImages > 0 && splitState.outputDir ? `${splitState.outputDir}/mosaic` : null,
      outputFrames: Number.isFinite(mosaicImages) && mosaicImages > 0 ? mosaicImages : null,
    };
    updateSplitPanel();
    updateMosaicPanel();
    updatePanelResultSummaries();
  } catch (error) {
    if (serial !== movieInfoRequestSerial) return;
    clearInformation();
    movieStatus = { splitImages: 0, mergedImages: 0, mosaicImages: 0 };
    splitState = { outputDir: null, frameCount: null };
    mergeframeState = { mergedDir: null, outputFrames: null };
    mosaicState = { mosaicDir: null, outputFrames: null };
    updateSplitPanel();
    updateMosaicPanel();
    updatePanelResultSummaries();
    setResultMessage(result, `movie info load failed: ${error}`, "error");
  }
}

function applyUploadResponse(data) {
  if (data.movie_url) {
    if (previewObjectUrl) {
      URL.revokeObjectURL(previewObjectUrl);
      previewObjectUrl = null;
    }
    preview.src = data.movie_url;
    preview.classList.remove("hidden");
    previewPlaceholder.classList.add("hidden");
    preview.load();
    setSplitPreviewSource(data.movie_url);
  }
  const info = data.information || {};
  const fps = Number(info.fps);
  const duration = Number(info.duration);
  uploadState = {
    savedPath: data.saved_path,
    frameCount: (Number.isFinite(fps) && Number.isFinite(duration)) ? Math.round(fps * duration) : null,
    filename: data.saved_name ?? data.saved_path?.split(/[\\/]/).pop() ?? null,
  };
  if (uploadState.filename) {
    uploadedMovieSelect.value = uploadState.filename;
  }
  updateSplitPanel();
  renderMovieInfoForFilename(uploadState.filename);
  refreshUploadedMovieList(uploadState.filename, false);
}

function selectUploadedMovie(filename) {
  if (!filename) return;

  preview.src = `/movies/${encodeURIComponent(filename)}`;
  preview.classList.remove("hidden");
  previewPlaceholder.classList.add("hidden");
  preview.load();
  setSplitPreviewSource(`/movies/${encodeURIComponent(filename)}`);

  clearInformation();
  movieStatus = { splitImages: 0, mergedImages: 0, mosaicImages: 0 };
  splitState = { outputDir: null, frameCount: null };
  mergeframeState = { mergedDir: null, outputFrames: null };
  mosaicState = { mosaicDir: null, outputFrames: null };
  uploadState = {
    savedPath: `movies/${filename}`,
    frameCount: null,
    filename,
  };
  updateSplitPanel();
  updateMosaicPanel();
  updatePanelResultSummaries();
  renderMovieInfoForFilename(filename);
  autoSetPlaylistToCurrentMovie();
}

async function refreshUploadedMovieList(selectedFilename = null, applySelection = true) {
  const previousValue = selectedFilename ?? uploadedMovieSelect.value;
  try {
    const response = await fetch("/movie_list");
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.detail || "failed to load movie list");
    }

    const movies = Array.isArray(data.movies) ? data.movies : [];
    uploadedMovies = movies;
    uploadedMovieSelect.innerHTML = "";

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = movies.length > 0 ? "-- choose uploaded mp4 --" : "no uploaded mp4";
    uploadedMovieSelect.appendChild(placeholder);

    movies.forEach((filename) => {
      const option = document.createElement("option");
      option.value = filename;
      option.textContent = filename;
      uploadedMovieSelect.appendChild(option);
    });

    if (applySelection && previousValue && movies.includes(previousValue)) {
      uploadedMovieSelect.value = previousValue;
      selectUploadedMovie(previousValue);
    } else if (previousValue && movies.includes(previousValue)) {
      uploadedMovieSelect.value = previousValue;
    }
    renderVideoAvailableMovies();
  } catch (error) {
    setResultMessage(result, `movie list load failed: ${error}`, "error");
  }
}

uploadedMovieSelect.addEventListener("change", () => {
  const filename = uploadedMovieSelect.value;
  if (!filename) {
    return;
  }
  setResultMessage(result, `Selected target: movies/${filename}`, "info");
  selectUploadedMovie(filename);
});

uploadButton.addEventListener("click", async () => {
  const file = movieInput.files[0];
  if (!file) {
    setResultMessage(result, "Please select an mp4 file.", "error");
    clearInformation();
    return;
  }

  const formData = new FormData();
  formData.append("movie", file);

  try {
    const response = await fetch("/upload", {
      method: "POST",
      body: formData
    });

    const data = await response.json();
    if (!response.ok) {
      setResultMessage(result, `Upload failed: ${data.detail || "unknown error"}`, "error");
      clearInformation();
      return;
    }

    setResultMessage(result, `Uploaded: ${data.saved_path}`, "success");
    applyUploadResponse(data);
  } catch (error) {
    setResultMessage(result, `Upload failed: ${error}`, "error");
    clearInformation();
  }
});

gdriveImportButton.addEventListener("click", async () => {
  const url = gdriveUrlInput.value.trim();
  if (!url) {
    setResultMessage(result, "Google Drive URL を入力してください。", "error");
    return;
  }

  if (!(/[?&]usp=sharing/.test(url))) {
    setResultMessage(result, "このリンクはダウンロードできません。共有設定を「リンクを知っている全員」に変更して取得した URL を使用してください。", "error");
    return;
  }

  setElementDisabled(gdriveImportButton, true);
  setResultMessage(result, "ダウンロード中...", "processing");
  try {
    const response = await fetch("/download_from_gdrive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url })
    });

    const data = await response.json();
    if (!response.ok) {
      setResultMessage(result, `Download failed: ${data.detail || "unknown error"}`, "error");
      return;
    }

    setResultMessage(result, `Downloaded: ${data.saved_path}`, "success");
    gdriveUrlInput.value = "";
    applyUploadResponse(data);
  } catch (error) {
    setResultMessage(result, `Download failed: ${error}`, "error");
  } finally {
    setElementDisabled(gdriveImportButton, false);
  }
});

deleteMovieButton.addEventListener("click", async () => {
  const filename = uploadedMovieSelect.value || uploadState.filename;
  if (!filename) {
    setResultMessage(result, "削除対象の mp4 を選択してください。", "error");
    return;
  }

  const confirmed = window.confirm(`この操作は取り消せません。\n${filename} と関連する全ての画像を削除しますか？`);
  if (!confirmed) {
    setResultMessage(result, "削除をキャンセルしました。", "info");
    return;
  }

  setResultMessage(result, "削除中...", "processing");

  try {
    const response = await fetch(`/delete_movie?file=${encodeURIComponent(filename)}`);
    const data = await response.json();
    if (!response.ok) {
      setResultMessage(result, `Delete failed: ${data.detail || "unknown error"}`, "error");
      return;
    }

    movieInfoRequestSerial += 1;
    uploadState = { savedPath: null, frameCount: null, filename: null };
    movieStatus = { splitImages: 0, mergedImages: 0, mosaicImages: 0 };
    splitState = { outputDir: null, frameCount: null };
    mergeframeState = { mergedDir: null, outputFrames: null };
    mosaicState = { mosaicDir: null, outputFrames: null };
    uploadedMovieSelect.value = "";

    if (previewObjectUrl) {
      URL.revokeObjectURL(previewObjectUrl);
      previewObjectUrl = null;
    }
    preview.removeAttribute("src");
    preview.classList.add("hidden");
    previewPlaceholder.classList.remove("hidden");
    previewPlaceholder.textContent = "選択してください";
    setSplitPreviewSource(null);
    clearInformation();
    updateSplitPanel();
    updateMosaicPanel();
    updatePanelResultSummaries();
    await refreshUploadedMovieList();

    setResultMessage(result, `Deleted: ${filename}`, "success");
  } catch (error) {
    setResultMessage(result, `Delete failed: ${error}`, "error");
  }
});

refreshUploadedMovieList();
