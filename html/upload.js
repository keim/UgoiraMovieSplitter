// --- upload パネル ---
const _movieInput = document.getElementById("movie");
const _uploadButton = document.getElementById("uploadButton");
const _gdriveUrlInput = document.getElementById("gdriveUrlInput");
const _gdriveImportButton = document.getElementById("gdriveImportButton");
const _deleteMovieButton = document.getElementById("deleteMovieButton");
const _uploadedMovieSelect = document.getElementById("uploadedMovieSelect");
const _result = document.getElementById("result");
const _informationPanel = document.getElementById("informationPanel");
const _informationList = document.getElementById("informationList");
const _imageStatusPanel = document.getElementById("imageStatusPanel");
const _imageStatusList = document.getElementById("imageStatusList");
const _preview = document.getElementById("preview");
const _previewPlaceholder = document.getElementById("previewPlaceholder");
const _splitPreview = document.getElementById("splitPreview");
const _splitPreviewPlaceholder = document.getElementById("splitPreviewPlaceholder");
const _splitFrameSeekArea = document.getElementById("splitFrameSeekArea");
const _splitFrameSeekInput = document.getElementById("splitFrameSeekInput");
const _splitSetStartButton = document.getElementById("splitSetStartButton");
const _splitSetEndButton = document.getElementById("splitSetEndButton");
const _splitFrameSeekMax = document.getElementById("splitFrameSeekMax");
const _mergeframeMsecPerFrame = document.getElementById("mergeframeMsecPerFrame");
const _mergeframeDisabledHint = document.getElementById("mergeframeDisabledHint");
const _mosaicDisabledHint = document.getElementById("mosaicDisabledHint");
let _previewObjectUrl = null;

const _informationKeys = [
  "video_codec",
  "audio_codec",
  "width",
  "height",
  "fps",
  "bitrate",
  "duration",
  "creation_time"
];

function _clearInformation() {
  _informationList.innerHTML = "";
  _informationPanel.open = false;
  _informationPanel.classList.add("hidden");

  _imageStatusList.innerHTML = "";
  _imageStatusPanel.classList.add("hidden");

  currentFps = null;
  updateMergeframeTimingDisplay();
}

function updateMergeframeTimingDisplay() {
  const mergeCount = Number(document.getElementById("mergeframeFrames")?.value);
  if (!Number.isFinite(mergeCount) || mergeCount <= 0 || !Number.isFinite(currentFps) || currentFps == null || currentFps <= 0) {
    _mergeframeMsecPerFrame.textContent = "-";
    return;
  }

  const msecPerFrame = (mergeCount * 1000) / currentFps;
  _mergeframeMsecPerFrame.textContent = `${msecPerFrame.toFixed(2)} ms`;
}

function _renderImageStatus(data) {
  _imageStatusList.innerHTML = "";

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
    _imageStatusList.appendChild(item);
  });

  _imageStatusPanel.classList.remove("hidden");
}

function _renderInformation(information) {
  _informationList.innerHTML = "";

  const enrichedInformation = { ...(information || {}) };
  const fps = Number(enrichedInformation.fps);
  const duration = Number(enrichedInformation.duration);
  if (Number.isFinite(fps) && Number.isFinite(duration)) {
    enrichedInformation.frame_count = Math.round(fps * duration);
  }

  const displayKeys = [..._informationKeys, "frame_count"];

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
    _informationList.appendChild(item);
  });

  _informationPanel.classList.remove("hidden");
  _informationPanel.open = true;

  const frameCount = enrichedInformation.frame_count;
  if (Number.isFinite(fps) && fps > 0) {
    currentFps = fps;
  }
  updateMergeframeTimingDisplay();
}

function _updateVideoAspectClass(videoElement) {
  const isPortrait = videoElement.videoHeight > videoElement.videoWidth;
  videoElement.classList.toggle("aspect-square", isPortrait);
}

function _syncSplitFrameSeekFromVideo() {
  if (currentFps == null || !Number.isFinite(currentFps) || currentFps <= 0) return;
  if (!_splitPreview.src) return;

  const frame = Math.max(0, Math.round(_splitPreview.currentTime * currentFps));
  _splitFrameSeekInput.value = String(frame);
}

function _setSplitPreviewSource(src) {
  if (!src) {
    _splitPreview.removeAttribute("src");
    _splitPreview.classList.add("hidden");
    _splitPreviewPlaceholder.classList.remove("hidden");
    _splitPreviewPlaceholder.textContent = "ターゲットムービーを選択してください";
    _splitFrameSeekArea.classList.add("hidden");
    _splitFrameSeekInput.value = 0;
    _splitFrameSeekMax.textContent = "";
    return;
  }

  _splitPreview.src = src;
  _splitPreview.classList.remove("hidden");
  _splitPreviewPlaceholder.classList.add("hidden");
  _splitPreview.load();

  if (currentFps != null && uploadState.frameCount != null) {
    _splitFrameSeekInput.value = 0;
    _splitFrameSeekInput.max = String(uploadState.frameCount - 1);
    _splitFrameSeekMax.textContent = `/ ${uploadState.frameCount - 1}`;
    _splitFrameSeekArea.classList.remove("hidden");
  }
}

async function _renderMovieInfoForFilename(filename) {
  if (!filename) {
    _clearInformation();
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

    _renderInformation(data.information);
    _renderImageStatus(data);
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
    _clearInformation();
    movieStatus = { splitImages: 0, mergedImages: 0, mosaicImages: 0 };
    splitState = { outputDir: null, frameCount: null };
    mergeframeState = { mergedDir: null, outputFrames: null };
    mosaicState = { mosaicDir: null, outputFrames: null };
    updateSplitPanel();
    updateMosaicPanel();
    updatePanelResultSummaries();
    setResultMessage(_result, `movie info load failed: ${error}`, "error");
  }
}

function _applyUploadResponse(data) {
  if (data.movie_url) {
    if (_previewObjectUrl) {
      URL.revokeObjectURL(_previewObjectUrl);
      _previewObjectUrl = null;
    }
    _preview.src = data.movie_url;
    _preview.classList.remove("hidden");
    _previewPlaceholder.classList.add("hidden");
    _preview.load();
    _setSplitPreviewSource(data.movie_url);
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
    _uploadedMovieSelect.value = uploadState.filename;
  }
  updateSplitPanel();
  _renderMovieInfoForFilename(uploadState.filename);
  _refreshUploadedMovieList(uploadState.filename, false);
}

function _selectUploadedMovie(filename) {
  if (!filename) return;

  _preview.src = `/movies/${encodeURIComponent(filename)}`;
  _preview.classList.remove("hidden");
  _previewPlaceholder.classList.add("hidden");
  _preview.load();
  _setSplitPreviewSource(`/movies/${encodeURIComponent(filename)}`);

  _clearInformation();
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
  _renderMovieInfoForFilename(filename);
  autoSetPlaylistToCurrentMovie();
}

async function _refreshUploadedMovieList(selectedFilename = null, applySelection = true) {
  const previousValue = selectedFilename ?? _uploadedMovieSelect.value;
  try {
    const response = await fetch("/movie_list");
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.detail || "failed to load movie list");
    }

    const movies = Array.isArray(data.movies) ? data.movies : [];
    uploadedMovies = movies;
    _uploadedMovieSelect.innerHTML = "";

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = movies.length > 0 ? "-- choose uploaded mp4 --" : "no uploaded mp4";
    _uploadedMovieSelect.appendChild(placeholder);

    movies.forEach((filename) => {
      const option = document.createElement("option");
      option.value = filename;
      option.textContent = filename;
      _uploadedMovieSelect.appendChild(option);
    });

    if (applySelection && previousValue && movies.includes(previousValue)) {
      _uploadedMovieSelect.value = previousValue;
      _selectUploadedMovie(previousValue);
    } else if (previousValue && movies.includes(previousValue)) {
      _uploadedMovieSelect.value = previousValue;
    }
    renderVideoAvailableMovies();
  } catch (error) {
    setResultMessage(_result, `movie list load failed: ${error}`, "error");
  }
}

function updateSplitSeekPanel() {
  if (uploadState.frameCount != null) {
    document.getElementById("splitEnd").placeholder = String(uploadState.frameCount - 1);
    _splitFrameSeekInput.max = String(uploadState.frameCount - 1);
    _splitFrameSeekMax.textContent = `/ ${uploadState.frameCount - 1}`;
    if (_splitPreview.src && currentFps != null) {
      _splitFrameSeekArea.classList.remove("hidden");
    }
  } else {
    _splitFrameSeekArea.classList.add("hidden");
    _splitFrameSeekInput.value = 0;
    _splitFrameSeekMax.textContent = "";
  }
  setElementDisabled(_deleteMovieButton, !Boolean(uploadState.filename));
}

function setUploadButtonState(hasMovie, hasSplitImages) {
  _mergeframeDisabledHint.classList.toggle("hidden", hasSplitImages);
  _mosaicDisabledHint.classList.toggle("hidden", hasSplitImages);
}

function setupUpload() {
  _splitFrameSeekInput.addEventListener("input", () => {
    if (currentFps == null || !_splitPreview.src) return;
    const frame = Math.max(0, Number(_splitFrameSeekInput.value));
    _splitPreview.currentTime = frame / currentFps;
  });

  _preview.addEventListener("loadedmetadata", () => _updateVideoAspectClass(_preview));
  _splitPreview.addEventListener("loadedmetadata", () => _updateVideoAspectClass(_splitPreview));

  _splitPreview.addEventListener("timeupdate", _syncSplitFrameSeekFromVideo);
  _splitPreview.addEventListener("seeked", _syncSplitFrameSeekFromVideo);

  _splitSetStartButton.addEventListener("click", () => {
    const frame = Math.max(0, Number(_splitFrameSeekInput.value));
    document.getElementById("splitStart").value = String(frame);
  });

  _splitSetEndButton.addEventListener("click", () => {
    const frame = Math.max(0, Number(_splitFrameSeekInput.value));
    document.getElementById("splitEnd").value = String(frame);
  });

  _movieInput.addEventListener("change", () => {
    const file = _movieInput.files[0];
    if (_previewObjectUrl) {
      URL.revokeObjectURL(_previewObjectUrl);
      _previewObjectUrl = null;
    }
    if (!file) {
      _preview.removeAttribute("src");
      _preview.classList.add("hidden");
      _previewPlaceholder.classList.remove("hidden");
      _previewPlaceholder.textContent = "選択してください";
      _setSplitPreviewSource(null);
      _clearInformation();
      return;
    }

    _previewObjectUrl = URL.createObjectURL(file);
    _preview.src = _previewObjectUrl;
    _preview.classList.remove("hidden");
    _previewPlaceholder.classList.add("hidden");
    _preview.load();
    _setSplitPreviewSource(null);
    _clearInformation();
  });

  _uploadedMovieSelect.addEventListener("change", () => {
    const filename = _uploadedMovieSelect.value;
    if (!filename) {
      return;
    }
    setResultMessage(_result, `Selected target: movies/${filename}`, "info");
    _selectUploadedMovie(filename);
  });

  _uploadButton.addEventListener("click", async () => {
    const file = _movieInput.files[0];
    if (!file) {
      setResultMessage(_result, "Please select an mp4 file.", "error");
      _clearInformation();
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
        setResultMessage(_result, `Upload failed: ${data.detail || "unknown error"}`, "error");
        _clearInformation();
        return;
      }

      setResultMessage(_result, `Uploaded: ${data.saved_path}`, "success");
      _applyUploadResponse(data);
    } catch (error) {
      setResultMessage(_result, `Upload failed: ${error}`, "error");
      _clearInformation();
    }
  });

  _gdriveImportButton.addEventListener("click", async () => {
    const url = _gdriveUrlInput.value.trim();
    if (!url) {
      setResultMessage(_result, "Google Drive URL を入力してください。", "error");
      return;
    }

    setElementDisabled(_gdriveImportButton, true);
    setResultMessage(_result, "ダウンロード中...", "processing");
    try {
      const response = await fetch("/download_from_gdrive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url })
      });

      const data = await response.json();
      if (!response.ok) {
        setResultMessage(_result, `Download failed: ${data.detail || "unknown error"}`, "error");
        return;
      }

      setResultMessage(_result, `Downloaded: ${data.saved_path}`, "success");
      _gdriveUrlInput.value = "";
      _applyUploadResponse(data);
    } catch (error) {
      setResultMessage(_result, `Download failed: ${error}`, "error");
    } finally {
      setElementDisabled(_gdriveImportButton, false);
    }
  });

  deleteMovieButton.addEventListener("click", async () => {
    const filename = _uploadedMovieSelect.value || uploadState.filename;
    if (!filename) {
      setResultMessage(_result, "削除対象の mp4 を選択してください。", "error");
      return;
    }

    const confirmed = window.confirm(`この操作は取り消せません。\n${filename} と関連する全ての画像を削除しますか？`);
    if (!confirmed) {
      setResultMessage(_result, "削除をキャンセルしました。", "info");
      return;
    }

    setResultMessage(_result, "削除中...", "processing");

    try {
      const response = await fetch(`/delete_movie?file=${encodeURIComponent(filename)}`);
      const data = await response.json();
      if (!response.ok) {
        setResultMessage(_result, `Delete failed: ${data.detail || "unknown error"}`, "error");
        return;
      }

      movieInfoRequestSerial += 1;
      uploadState = { savedPath: null, frameCount: null, filename: null };
      movieStatus = { splitImages: 0, mergedImages: 0, mosaicImages: 0 };
      splitState = { outputDir: null, frameCount: null };
      mergeframeState = { mergedDir: null, outputFrames: null };
      mosaicState = { mosaicDir: null, outputFrames: null };
      _uploadedMovieSelect.value = "";

      if (_previewObjectUrl) {
        URL.revokeObjectURL(_previewObjectUrl);
        _previewObjectUrl = null;
      }
      _preview.removeAttribute("src");
      _preview.classList.add("hidden");
      _previewPlaceholder.classList.remove("hidden");
      _previewPlaceholder.textContent = "選択してください";
      _setSplitPreviewSource(null);
      _clearInformation();
      updateSplitPanel();
      updateMosaicPanel();
      updatePanelResultSummaries();
      await _refreshUploadedMovieList();

      setResultMessage(_result, `Deleted: ${filename}`, "success");
    } catch (error) {
      setResultMessage(_result, `Delete failed: ${error}`, "error");
    }
  });

  _refreshUploadedMovieList();
}
