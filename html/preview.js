// プレイリスト有無に応じてダウンロードボタンを切り替える
function updatePreviewDownloadButton() {
  const hasPlaylist = videoPlaylist.length > 0;
  setElementDisabled(previewDownloadButton, !hasPlaylist);
  previewDownloadButton.textContent = hasPlaylist
    ? `download playlist (${videoPlaylist.length} movies)`
    : "download playlist";
}

async function downloadPlaylistFrames() {
  setElementDisabled(previewDownloadButton, true);
  previewDownloadButton.textContent = "読み込み中...";
  try {
    const frames = await loadAllPlaylistFrames();
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
    updatePreviewDownloadButton();
  }
}

// --- preview & playlist (unified) ---
const previewFrameImage = document.getElementById("previewFrameImage");
const previewImagePlaceholder = document.getElementById("previewImagePlaceholder");
const previewFrameInfo = document.getElementById("previewFrameInfo");
const previewPlayInfo = document.getElementById("previewPlayInfo");
const previewPlayButton = document.getElementById("previewPlayButton");
const previewFramerateInput = document.getElementById("previewFramerate");
const previewLoopCheckbox = document.getElementById("previewLoop");
const videoAvailableListEl = document.getElementById("videoAvailableList");
const videoPlaylistListEl = document.getElementById("videoPlaylistList");

let videoPlaylist = [];
let videoPlaylistCurrentIndex = -1;
let videoPlaylistAllFrames = [];
let videoPlaylistFrameIndex = 0;
let activePlayInterval = null;
let playMode = null; // 'single' | 'playlist'
let playlistLoading = false;
const videoPlaylistFrameCounts = {}; // filename -> count
const videoThumbnailCache = {};       // filename -> url | null

// タブ切り替え時: インターバルのみ停止、表示はそのまま
function stopPreviewPlay() {
  if (activePlayInterval !== null) {
    clearInterval(activePlayInterval);
    activePlayInterval = null;
  }
  playMode = null;
  playlistLoading = false;
  videoPlaylistCurrentIndex = -1;
  videoPlaylistAllFrames = [];
  videoPlaylistFrameIndex = 0;
  previewPlayInfo.textContent = "";
  previewPlayButton.textContent = "▶ Play";
  renderVideoPlaylist();
}

// 明示的停止 / プレイリスト変更時: インターバル停止 + プレースホルダー表示
function stopPlay() {
  stopPreviewPlay();
  updatePreviewDownloadButton();
  previewFrameImage.classList.add("hidden");
  previewImagePlaceholder.classList.remove("hidden");
  previewFrameInfo.textContent = "";
  setElementDisabled(previewPlayButton, videoPlaylist.length === 0);
}

function showVideoPlaylistFrame(index) {
  if (videoPlaylistAllFrames.length === 0) return;
  videoPlaylistFrameIndex = ((index % videoPlaylistAllFrames.length) + videoPlaylistAllFrames.length) % videoPlaylistAllFrames.length;
  const frame = videoPlaylistAllFrames[videoPlaylistFrameIndex];
  previewFrameImage.src = frame.url;
  previewFrameImage.classList.remove("hidden");
  previewImagePlaceholder.classList.add("hidden");
  if (frame.movieIndex !== videoPlaylistCurrentIndex) {
    videoPlaylistCurrentIndex = frame.movieIndex;
    renderVideoPlaylist();
  }
  previewFrameInfo.textContent = `${videoPlaylistFrameIndex + 1} / ${videoPlaylistAllFrames.length}`;
  previewPlayInfo.textContent = `Movie ${frame.movieIndex + 1}/${videoPlaylist.length}  ${frame.filename}`;
}

async function startPlaylistPlay() {
  if (playlistLoading) return;
  playlistLoading = true;
  playMode = 'playlist';
  previewPlayInfo.textContent = "読み込み中...";
  setElementDisabled(previewPlayButton, true);

  const frames = await loadAllPlaylistFrames();
  playlistLoading = false;
  if (frames.length === 0) {
    previewPlayInfo.textContent = "再生可能なフレームがありません（先に split を実行してください）";
    playMode = null;
    setElementDisabled(previewPlayButton, false);
    return;
  }
  videoPlaylistAllFrames = frames;
  videoPlaylistFrameIndex = 0;
  showVideoPlaylistFrame(0);
  updatePreviewDownloadButton();
  setElementDisabled(previewPlayButton, false);
  previewPlayButton.textContent = "⏹ Stop";

  const msec = Math.max(1, Number(previewFramerateInput.value) || 125);
  activePlayInterval = setInterval(() => {
    const next = videoPlaylistFrameIndex + 1;
    if (next >= videoPlaylistAllFrames.length) {
      if (previewLoopCheckbox.checked) {
        showVideoPlaylistFrame(0);
      } else {
        stopPlay();
      }
    } else {
      showVideoPlaylistFrame(next);
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
    previewFramerateInput.value = String(Math.round((mergeCount * 1000) / currentFps));
  }
  stopPlay();
  // プレイリストを現在の動画1本に置き換え
  videoPlaylist = [filename];
  delete videoThumbnailCache[filename]; // サムネイルを再取得させる
  Object.keys(videoPlaylistFrameCounts).forEach(k => delete videoPlaylistFrameCounts[k]);
  renderVideoAvailableMovies();
  renderVideoPlaylist();
  getMovieBestDirAndCount(filename).then(info => {
    videoPlaylistFrameCounts[filename] = info ? info.count : 0;
    renderVideoPlaylist();
  });
}

async function loadPreviewFramesAndShow() {
  await autoSetPlaylistToCurrentMovie();
}

previewPlayButton.addEventListener("click", async () => {
  if (activePlayInterval !== null || playlistLoading) {
    stopPlay();
    return;
  }
  if (videoPlaylist.length > 0) {
    await startPlaylistPlay();
  }
});

previewFramerateInput.addEventListener("change", () => {
  if (activePlayInterval !== null) {
    clearInterval(activePlayInterval);
    const msec = Math.max(1, Number(previewFramerateInput.value) || 125);
    activePlayInterval = setInterval(() => {
      const next = videoPlaylistFrameIndex + 1;
      if (next >= videoPlaylistAllFrames.length) {
        if (previewLoopCheckbox.checked) { showVideoPlaylistFrame(0); } else { stopPlay(); }
      } else { showVideoPlaylistFrame(next); }
    }, msec);
  }
});

// --- playlist management ---
function renderVideoAvailableMovies() {
  videoAvailableListEl.innerHTML = "";
  if (uploadedMovies.length === 0) {
    const li = document.createElement("li");
    li.className = "text-xs text-slate-400";
    li.textContent = "アップロードされた動画がありません";
    videoAvailableListEl.appendChild(li);
    return;
  }
  uploadedMovies.forEach((filename) => {
    const inPlaylist = videoPlaylist.includes(filename);
    const li = document.createElement("li");
    li.className = "flex items-center gap-2 px-2 py-1 rounded cursor-pointer hover:bg-slate-100 select-none" + (inPlaylist ? " bg-slate-100" : "");

    const thumbContainer = document.createElement("div");
    thumbContainer.className = "relative shrink-0 w-12 h-12";
    const thumb = document.createElement("img");
    thumb.className = "w-12 h-12 object-contain bg-slate-200 rounded";
    thumb.alt = "";
    thumbContainer.appendChild(thumb);
    loadThumbnail(filename, thumb);
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
      if (videoPlaylist.includes(filename)) {
        removeFromVideoPlaylist(filename);
      } else {
        addToVideoPlaylist(filename);
      }
    });
    videoAvailableListEl.appendChild(li);
  });
}

function renderVideoPlaylist() {
  videoPlaylistListEl.innerHTML = "";
  if (videoPlaylist.length === 0) {
    const li = document.createElement("li");
    li.className = "text-xs text-slate-400";
    li.textContent = "プレイリストが空です";
    videoPlaylistListEl.appendChild(li);
    setElementDisabled(previewPlayButton, true);
    updatePreviewDownloadButton();
    return;
  }
  videoPlaylist.forEach((filename, index) => {
    const isPlaying = index === videoPlaylistCurrentIndex;
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
    const fc = videoPlaylistFrameCounts[filename];
    countBadge.textContent = fc != null ? `(${fc}frames)` : "(…)";

    const upBtn = document.createElement("button");
    upBtn.type = "button";
    upBtn.textContent = "↑";
    upBtn.className = "shrink-0 px-1 rounded hover:bg-slate-200" + (isPlaying ? " text-slate-300 hover:text-slate-800" : " text-slate-400");
    upBtn.disabled = index === 0;
    upBtn.addEventListener("click", (e) => { e.stopPropagation(); moveVideoPlaylistItem(index, -1); });

    const downBtn = document.createElement("button");
    downBtn.type = "button";
    downBtn.textContent = "↓";
    downBtn.className = "shrink-0 px-1 rounded hover:bg-slate-200" + (isPlaying ? " text-slate-300 hover:text-slate-800" : " text-slate-400");
    downBtn.disabled = index === videoPlaylist.length - 1;
    downBtn.addEventListener("click", (e) => { e.stopPropagation(); moveVideoPlaylistItem(index, 1); });

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.textContent = "✕";
    delBtn.className = "shrink-0 px-1 rounded" + (isPlaying ? " text-slate-300 hover:text-white" : " text-slate-400 hover:text-rose-600");
    delBtn.addEventListener("click", (e) => { e.stopPropagation(); removeFromVideoPlaylist(filename); });

    li.appendChild(num);
    li.appendChild(name);
    li.appendChild(countBadge);
    li.appendChild(upBtn);
    li.appendChild(downBtn);
    li.appendChild(delBtn);
    videoPlaylistListEl.appendChild(li);
  });
  setElementDisabled(previewPlayButton, false);
  updatePreviewDownloadButton();
}

function addToVideoPlaylist(filename) {
  if (!videoPlaylist.includes(filename)) {
    videoPlaylist.push(filename);
    renderVideoAvailableMovies();
    renderVideoPlaylist();
    // フレーム数を非同期取得してキャッシュ後に再描画
    getMovieBestDirAndCount(filename).then(info => {
      videoPlaylistFrameCounts[filename] = info ? info.count : 0;
      renderVideoPlaylist();
    });
  }
}

function removeFromVideoPlaylist(filename) {
  const index = videoPlaylist.indexOf(filename);
  if (index === -1) return;
  stopPlay();
  videoPlaylist.splice(index, 1);
  delete videoPlaylistFrameCounts[filename];
  renderVideoAvailableMovies();
  renderVideoPlaylist();
}

function moveVideoPlaylistItem(index, dir) {
  const newIndex = index + dir;
  if (newIndex < 0 || newIndex >= videoPlaylist.length) return;
  stopPlay();
  [videoPlaylist[index], videoPlaylist[newIndex]] = [videoPlaylist[newIndex], videoPlaylist[index]];
  renderVideoPlaylist();
}

async function loadThumbnail(filename, imgEl) {
  if (videoThumbnailCache[filename] !== undefined) {
    if (videoThumbnailCache[filename]) imgEl.src = videoThumbnailCache[filename];
    return;
  }
  const info = await getMovieBestDirAndCount(filename);
  if (!info) { videoThumbnailCache[filename] = null; return; }
  try {
    const resp = await fetch(`/frame_image?dir=${encodeURIComponent(info.dir)}&index=0`);
    const data = await resp.json();
    videoThumbnailCache[filename] = data.frame_url || null;
    if (data.frame_url) imgEl.src = data.frame_url;
  } catch { videoThumbnailCache[filename] = null; }
}

async function getMovieBestDirAndCount(filename) {  const base = filename.replace(/\.[^.]+$/, "");
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

async function loadAllPlaylistFrames() {
  const timestamp = Date.now();
  const allFrames = [];
  for (let mi = 0; mi < videoPlaylist.length; mi++) {
    const filename = videoPlaylist[mi];
    const info = await getMovieBestDirAndCount(filename);
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

renderVideoAvailableMovies();
renderVideoPlaylist();
