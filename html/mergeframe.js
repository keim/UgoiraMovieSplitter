// --- mergeframe パネル ---
const mergeframeFrames = document.getElementById("mergeframeFrames");
const mergeframeExecuteButton = document.getElementById("mergeframeExecuteButton");
const mergeframeDeleteButton = document.getElementById("mergeframeDeleteButton");
const mergeframeResult = document.getElementById("mergeframeResult");
const mergeframeDownloadButton = document.getElementById("mergeframeDownloadButton");

mergeframeFrames.addEventListener("input", updateMergeframeTimingDisplay);
mergeframeFrames.addEventListener("change", updateMergeframeTimingDisplay);

mergeframeDownloadButton.addEventListener("click", () => downloadImagesFromButton(mergeframeDownloadButton));

mergeframeExecuteButton.addEventListener("click", async () => {
  if (!uploadState.filename) {
    setResultMessage(mergeframeResult, "先に upload タブでファイルをアップロードしてください。", "error");
    return;
  }
  if (!splitState.outputDir) {
    setResultMessage(mergeframeResult, "先に split タブで JPEG を展開してください。", "error");
    return;
  }

  const frames = Number(mergeframeFrames.value);
  const dir = buildDirParam(splitState.outputDir);
  const params = new URLSearchParams({
    dir,
    frames: String(frames),
  });

  setResultMessage(mergeframeResult, `実行中... ${formatFrameProgress(0, null)}`, "processing");

  try {
    const response = await fetch(`/mergeframe?${params}`);
    const startData = await response.json();
    if (!response.ok) {
      setResultMessage(mergeframeResult, `Error: ${startData.detail || "unknown error"}`, "error");
      return;
    }
    pollJob(startData.job_id, mergeframeResult,
      (result) => {
        mergeframeState = {
          mergedDir: result.merged_dir,
          outputFrames: result.output_frames,
        };
        movieStatus.mergedImages = Number.isFinite(Number(result.output_frames)) ? Number(result.output_frames) : 0;
        movieStatus.mosaicImages = 0;
        mosaicState = { mosaicDir: null, outputFrames: null };
        updateMosaicPanel();
        setResultMessage(
          mergeframeResult,
          `完了: ${formatFrameProgress(result.done, result.total)} → ${result.merged_dir}`,
          "success"
        );
        updatePanelResultSummaries();
        autoSetPlaylistToCurrentMovie();
      },
      (detail) => setResultMessage(mergeframeResult, `Error: ${detail}`, "error")
    );
  } catch (error) {
    setResultMessage(mergeframeResult, `Error: ${error}`, "error");
  }
});

mergeframeDeleteButton.addEventListener("click", async () => {
  if (!splitState.outputDir) {
    setResultMessage(mergeframeResult, "先に split タブで JPEG を展開してください。", "error");
    return;
  }

  const dir = buildDirParam(splitState.outputDir);
  if (!dir) {
    setResultMessage(mergeframeResult, "削除対象ディレクトリの解決に失敗しました。", "error");
    return;
  }

  setResultMessage(mergeframeResult, "削除中...", "processing");

  try {
    const response = await fetch(`/mergeframe_delete?dir=${encodeURIComponent(dir)}`);
    const data = await response.json();
    if (!response.ok) {
      setResultMessage(mergeframeResult, `Error: ${data.detail || "unknown error"}`, "error");
      return;
    }

    mergeframeState = { mergedDir: null, outputFrames: null };
    movieStatus.mergedImages = 0;
    movieStatus.mosaicImages = 0;
    mosaicState = { mosaicDir: null, outputFrames: null };
    updateMosaicPanel();
    updateSplitPanel();

    if (data.deleted) {
      setResultMessage(mergeframeResult, `削除完了: ${data.merged_dir}`, "success");
    } else {
      setResultMessage(mergeframeResult, "merged ディレクトリは存在しませんでした。", "info");
    }
    updatePanelResultSummaries();
  } catch (error) {
    setResultMessage(mergeframeResult, `Error: ${error}`, "error");
  }
});
