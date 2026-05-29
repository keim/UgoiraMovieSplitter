// プレイリスト有無に応じてダウンロードボタンを切り替える
function _updatePreviewDownloadButton() {
  const hasPlaylist = _videoPlaylist.length > 0;
  setElementDisabled(_previewDownloadButton, !hasPlaylist);
  _previewDownloadButton.textContent = hasPlaylist
    ? `download playlist (${_videoPlaylist.length} movies)`
    : "download playlist";
}

async function downloadPlaylistFrames() {
  setElementDisabled(_previewDownloadButton, true);
  _previewDownloadButton.textContent = "読み込み中...";
  try {
    const frames = await _loadAllPlaylistFrames();
    if (frames.length === 0) {
      alert("ダウンロード可能なフレームがありません（先に split を実行してください）");
      return;
    }
    const zipName = "playlist.zip";
    const resp = await fetch("/download_playlist_frames", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ frames: frames.map(f => ({ dir: f.dir, index: f.frameIndex })), name: zipName })
    });
    if (!resp.ok) throw new Error(await resp.text());
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = zipName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (e) {
    alert(`ダウンロードエラー: ${e}`);
  } finally {
    _updatePreviewDownloadButton();
  }
}

// --- preview & playlist (unified) ---
const _previewFrameImage = document.getElementById("previewFrameImage");
const _previewImagePlaceholder = document.getElementById("previewImagePlaceholder");
const _previewFrameInfo = document.getElementById("previewFrameInfo");
const _previewPlayInfo = document.getElementById("previewPlayInfo");
const _previewPlayButton = document.getElementById("previewPlayButton");
const _previewFramerateInput = document.getElementById("previewFramerate");
const _previewLoopCheckbox = document.getElementById("previewLoop");
const _previewDownloadButton = document.getElementById("previewDownloadButton");
const _videoAvailableListEl = document.getElementById("videoAvailableList");
const _videoPlaylistListEl = document.getElementById("videoPlaylistList");

let _videoPlaylist = [];
let _videoPlaylistCurrentIndex = -1;
let _videoPlaylistAllFrames = [];
let _videoPlaylistFrameIndex = 0;
let _activePlayInterval = null;
let _playMode = null; // 'single' | 'playlist'
let _playlistLoading = false;
const _videoPlaylistFrameCounts = {}; // filename -> count
const _videoThumbnailCache = {};       // filename -> url | null

// タブ切り替え時: インターバルのみ停止、表示はそのまま
function stopPreviewPlay() {
  if (_activePlayInterval !== null) {
    clearInterval(_activePlayInterval);
    _activePlayInterval = null;
  }
  _playMode = null;
  _playlistLoading = false;
  _videoPlaylistCurrentIndex = -1;
  _videoPlaylistAllFrames = [];
  _videoPlaylistFrameIndex = 0;
  _previewPlayInfo.textContent = "";
  _previewPlayButton.textContent = "▶ Play";
  _renderVideoPlaylist();
}

// 明示的停止 / プレイリスト変更時: インターバル停止 + プレースホルダー表示
function _stopPlay() {
  stopPreviewPlay();
  _updatePreviewDownloadButton();
  _previewFrameImage.classList.add("hidden");
  _previewImagePlaceholder.classList.remove("hidden");
  _previewFrameInfo.textContent = "";
  setElementDisabled(_previewPlayButton, _videoPlaylist.length === 0);
}

function _showVideoPlaylistFrame(index) {
  if (_videoPlaylistAllFrames.length === 0) return;
  _videoPlaylistFrameIndex = ((index % _videoPlaylistAllFrames.length) + _videoPlaylistAllFrames.length) % _videoPlaylistAllFrames.length;
  const frame = _videoPlaylistAllFrames[_videoPlaylistFrameIndex];
  _previewFrameImage.src = frame.url;
  _previewFrameImage.classList.remove("hidden");
  _previewImagePlaceholder.classList.add("hidden");
  if (frame.movieIndex !== _videoPlaylistCurrentIndex) {
    _videoPlaylistCurrentIndex = frame.movieIndex;
    _renderVideoPlaylist();
  }
  _previewFrameInfo.textContent = `${_videoPlaylistFrameIndex + 1} / ${_videoPlaylistAllFrames.length}`;
  _previewPlayInfo.textContent = `Movie ${frame.movieIndex + 1}/${_videoPlaylist.length}  ${frame.filename}`;
}

async function _startPlaylistPlay() {
  if (_playlistLoading) return;
  _playlistLoading = true;
  _playMode = 'playlist';
  _previewPlayInfo.textContent = "読み込み中...";
  setElementDisabled(_previewPlayButton, true);

  const frames = await _loadAllPlaylistFrames();
  _playlistLoading = false;
  if (frames.length === 0) {
    _previewPlayInfo.textContent = "再生可能なフレームがありません（先に split を実行してください）";
    _playMode = null;
    setElementDisabled(_previewPlayButton, false);
    return;
  }
  _videoPlaylistAllFrames = frames;
  _videoPlaylistFrameIndex = 0;
  _showVideoPlaylistFrame(0);
  _updatePreviewDownloadButton();
  setElementDisabled(_previewPlayButton, false);
  _previewPlayButton.textContent = "⏹ Stop";

  const msec = Math.max(1, Number(_previewFramerateInput.value) || 125);
  _activePlayInterval = setInterval(() => {
    const next = _videoPlaylistFrameIndex + 1;
    if (next >= _videoPlaylistAllFrames.length) {
      if (_previewLoopCheckbox.checked) {
        _showVideoPlaylistFrame(0);
      } else {
        _stopPlay();
      }
    } else {
      _showVideoPlaylistFrame(next);
    }
  }, msec);
}

// 処理完了時にプレイリストを現在の動画1本に更新する
async function autoSetPlaylistToCurrentMovie() {
  if (!uploadState.filename) return;
  const filename = uploadState.filename;
  // フレームレートのデフォルト値を更新
  const mergeCount = Number(document.getElementById("mergeframeFrames")?.value) || 1;
  if (Number.isFinite(currentFps) && currentFps > 0) {
    _previewFramerateInput.value = String(Math.round((mergeCount * 1000) / currentFps));
  }
  _stopPlay();
  // プレイリストを現在の動画1本に置き換え
  _videoPlaylist = [filename];
  delete _videoThumbnailCache[filename]; // サムネイルを再取得させる
  Object.keys(_videoPlaylistFrameCounts).forEach(k => delete _videoPlaylistFrameCounts[k]);
  renderVideoAvailableMovies();
  _renderVideoPlaylist();
  _getMovieBestDirAndCount(filename).then(info => {
    _videoPlaylistFrameCounts[filename] = info ? info.count : 0;
    _renderVideoPlaylist();
  });
}

async function _loadPreviewFramesAndShow() {
  await autoSetPlaylistToCurrentMovie();
}

// --- playlist management ---
function renderVideoAvailableMovies() {
  _videoAvailableListEl.innerHTML = "";
  if (uploadedMovies.length === 0) {
    const li = document.createElement("li");
    li.className = "text-xs text-slate-400";
    li.textContent = "アップロードされた動画がありません";
    _videoAvailableListEl.appendChild(li);
    return;
  }
  uploadedMovies.forEach((filename) => {
    const inPlaylist = _videoPlaylist.includes(filename);
    const li = document.createElement("li");
    li.className = "flex items-center gap-2 px-2 py-1 rounded cursor-pointer hover:bg-slate-100 select-none" + (inPlaylist ? " bg-slate-100" : "");

    const thumbContainer = document.createElement("div");
    thumbContainer.className = "relative shrink-0 w-12 h-12";
    const thumb = document.createElement("img");
    thumb.className = "w-12 h-12 object-contain bg-slate-200 rounded";
    thumb.alt = "";
    thumbContainer.appendChild(thumb);
    _loadThumbnail(filename, thumb);
    if (inPlaylist) {
      const badge = document.createElement("span");
      badge.className = "absolute bottom-0 right-0 text-emerald-600 font-bold text-xs leading-none drop-shadow-sm";
      badge.textContent = "\u2713";
      thumbContainer.appendChild(badge);
    }

    const name = document.createElement("span");
    name.className = "flex-1 text-xs text-slate-700 break-all";
    name.textContent = filename;

    li.appendChild(thumbContainer);
    li.appendChild(name);
    li.addEventListener("click", () => {
      if (_videoPlaylist.includes(filename)) {
        _removeFromVideoPlaylist(filename);
      } else {
        _addToVideoPlaylist(filename);
      }
    });
    _videoAvailableListEl.appendChild(li);
  });
}

function _renderVideoPlaylist() {
  _videoPlaylistListEl.innerHTML = "";
  if (_videoPlaylist.length === 0) {
    const li = document.createElement("li");
    li.className = "text-xs text-slate-400";
    li.textContent = "プレイリストが空です";
    _videoPlaylistListEl.appendChild(li);
    setElementDisabled(_previewPlayButton, true);
    _updatePreviewDownloadButton();
    return;
  }
  _videoPlaylist.forEach((filename, index) => {
    const isPlaying = index === _videoPlaylistCurrentIndex;
    const li = document.createElement("li");
    li.className = "flex items-center gap-1 px-2 py-1 rounded text-xs" + (isPlaying ? " bg-slate-800 text-white" : " text-slate-700");

    const num = document.createElement("span");
    num.className = "shrink-0 w-5 text-right font-medium";
    num.textContent = String(index + 1);

    const name = document.createElement("span");
    name.className = "flex-1 break-all";
    name.textContent = filename;

    const countBadge = document.createElement("span");
    countBadge.className = "shrink-0 text-xs" + (isPlaying ? " text-slate-300" : " text-slate-400");
    const fc = _videoPlaylistFrameCounts[filename];
    countBadge.textContent = fc != null ? `(${fc}frames)` : "(…)";

    const upBtn = document.createElement("button");
    upBtn.type = "button";
    upBtn.textContent = "↑";
    upBtn.className = "shrink-0 px-1 rounded hover:bg-slate-200" + (isPlaying ? " text-slate-300 hover:text-slate-800" : " text-slate-400");
    upBtn.disabled = index === 0;
    upBtn.addEventListener("click", (e) => { e.stopPropagation(); _moveVideoPlaylistItem(index, -1); });

    const downBtn = document.createElement("button");
    downBtn.type = "button";
    downBtn.textContent = "↓";
    downBtn.className = "shrink-0 px-1 rounded hover:bg-slate-200" + (isPlaying ? " text-slate-300 hover:text-slate-800" : " text-slate-400");
    downBtn.disabled = index === _videoPlaylist.length - 1;
    downBtn.addEventListener("click", (e) => { e.stopPropagation(); _moveVideoPlaylistItem(index, 1); });

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.textContent = "✕";
    delBtn.className = "shrink-0 px-1 rounded" + (isPlaying ? " text-slate-300 hover:text-white" : " text-slate-400 hover:text-rose-600");
    delBtn.addEventListener("click", (e) => { e.stopPropagation(); _removeFromVideoPlaylist(filename); });

    li.appendChild(num);
    li.appendChild(name);
    li.appendChild(countBadge);
    li.appendChild(upBtn);
    li.appendChild(downBtn);
    li.appendChild(delBtn);
    _videoPlaylistListEl.appendChild(li);
  });
  setElementDisabled(_previewPlayButton, false);
  _updatePreviewDownloadButton();
}

function _addToVideoPlaylist(filename) {
  if (!_videoPlaylist.includes(filename)) {
    _videoPlaylist.push(filename);
    renderVideoAvailableMovies();
    _renderVideoPlaylist();
    // フレーム数を非同期取得してキャッシュ後に再描画
    _getMovieBestDirAndCount(filename).then(info => {
      _videoPlaylistFrameCounts[filename] = info ? info.count : 0;
      _renderVideoPlaylist();
    });
  }
}

function _removeFromVideoPlaylist(filename) {
  const index = _videoPlaylist.indexOf(filename);
  if (index === -1) return;
  _stopPlay();
  _videoPlaylist.splice(index, 1);
  delete _videoPlaylistFrameCounts[filename];
  renderVideoAvailableMovies();
  _renderVideoPlaylist();
}

function _moveVideoPlaylistItem(index, dir) {
  const newIndex = index + dir;
  if (newIndex < 0 || newIndex >= _videoPlaylist.length) return;
  _stopPlay();
  [_videoPlaylist[index], _videoPlaylist[newIndex]] = [_videoPlaylist[newIndex], _videoPlaylist[index]];
  _renderVideoPlaylist();
}

async function _loadThumbnail(filename, imgEl) {
  if (_videoThumbnailCache[filename] !== undefined) {
    if (_videoThumbnailCache[filename]) imgEl.src = _videoThumbnailCache[filename];
    return;
  }
  const info = await _getMovieBestDirAndCount(filename);
  if (!info) { _videoThumbnailCache[filename] = null; return; }
  try {
    const resp = await fetch(`/frame_image?dir=${encodeURIComponent(info.dir)}&index=0`);
    const data = await resp.json();
    _videoThumbnailCache[filename] = data.frame_url || null;
    if (data.frame_url) imgEl.src = data.frame_url;
  } catch { _videoThumbnailCache[filename] = null; }
}

async function _getMovieBestDirAndCount(filename) {  const base = filename.replace(/\.[^.]+$/, "");
  try {
    const response = await fetch(`/movie_info?file=${encodeURIComponent(filename)}`);
    const data = await response.json();
    if (!response.ok) return null;
    const mosaic = Number(data.mosaic_images ?? 0);
    const merged = Number(data.merged_images ?? 0);
    const split  = Number(data.split_images  ?? 0);
    if (mosaic > 0) return { dir: `${base}_frames/mosaic`, count: mosaic };
    if (merged > 0) return { dir: `${base}_frames/merged`, count: merged };
    if (split  > 0) return { dir: `${base}_frames`,        count: split  };
    return null;
  } catch { return null; }
}

async function _loadAllPlaylistFrames() {
  const timestamp = Date.now();
  const allFrames = [];
  for (let mi = 0; mi < _videoPlaylist.length; mi++) {
    const filename = _videoPlaylist[mi];
    const info = await _getMovieBestDirAndCount(filename);
    if (!info) continue;
    const { dir, count } = info;
    try {
      const responses = await Promise.all(
        Array.from({ length: count }, (_, i) =>
          fetch(`/frame_image?dir=${encodeURIComponent(dir)}&index=${i}`).then(r => r.json())
        )
      );
      responses.forEach((d, i) => allFrames.push({ url: `${d.frame_url}?v=${timestamp}`, movieIndex: mi, filename, dir, frameIndex: i }));
    } catch { /* skip broken movies */ }
  }
  return allFrames;
}

function setupPreview() {
  _previewPlayButton.addEventListener("click", async () => {
    if (_activePlayInterval !== null || _playlistLoading) {
      _stopPlay();
      return;
    }
    if (_videoPlaylist.length > 0) {
      await _startPlaylistPlay();
    }
  });

  _previewDownloadButton.addEventListener("click", downloadPlaylistFrames);

  _previewFramerateInput.addEventListener("change", () => {
    if (_activePlayInterval !== null) {
      clearInterval(_activePlayInterval);
      const msec = Math.max(1, Number(_previewFramerateInput.value) || 125);
      _activePlayInterval = setInterval(() => {
        const next = _videoPlaylistFrameIndex + 1;
        if (next >= _videoPlaylistAllFrames.length) {
          if (_previewLoopCheckbox.checked) { _showVideoPlaylistFrame(0); } else { _stopPlay(); }
        } else { _showVideoPlaylistFrame(next); }
      }, msec);
    }
  });

  renderVideoAvailableMovies();
  _renderVideoPlaylist();
}
