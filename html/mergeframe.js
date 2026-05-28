// --- mergeframe パネル ---
const _mergeframeFrames = document.getElementById("mergeframeFrames");
const _mergeframeExecuteButton = document.getElementById("mergeframeExecuteButton");
const _mergeframeDeleteButton = document.getElementById("mergeframeDeleteButton");
const _mergeframeResult = document.getElementById("mergeframeResult");
const _mergeframeDownloadButton = document.getElementById("mergeframeDownloadButton");

function setMergeframeButtonState(hasMovie, hasSplitImages) {
  setElementDisabled(_mergeframeFrames, !hasSplitImages);
  setElementDisabled(_mergeframeExecuteButton, !hasSplitImages);
  setElementDisabled(_mergeframeDeleteButton, !hasSplitImages);
}

function setupMergeframe() {
  _mergeframeFrames.addEventListener("input", updateMergeframeTimingDisplay);
  _mergeframeFrames.addEventListener("change", updateMergeframeTimingDisplay);

  _mergeframeDownloadButton.addEventListener("click", () => downloadImagesFromButton(_mergeframeDownloadButton));

  _mergeframeExecuteButton.addEventListener("click", async () => {
    if (!uploadState.filename) {
      setResultMessage(_mergeframeResult, "先に upload タブでファイルをアップロードしてください。", "error");
      return;
    }
    if (!splitState.outputDir) {
      setResultMessage(_mergeframeResult, "先に split タブで JPEG を展開してください。", "error");
      return;
    }

    const frames = Number(_mergeframeFrames.value);
    const dir = buildDirParam(splitState.outputDir);
    const params = new URLSearchParams({
      dir,
      frames: String(frames),
    });

    setResultMessage(_mergeframeResult, `実行中... ${formatFrameProgress(0, null)}`, "processing");

    try {
      const response = await fetch(`/mergeframe?${params}`);
      const startData = await response.json();
      if (!response.ok) {
        setResultMessage(_mergeframeResult, `Error: ${startData.detail || "unknown error"}`, "error");
        return;
      }
      pollJob(startData.job_id, _mergeframeResult,
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
            _mergeframeResult,
            `完了: ${formatFrameProgress(result.done, result.total)} → ${result.merged_dir}`,
            "success"
          );
          updatePanelResultSummaries();
          autoSetPlaylistToCurrentMovie();
        },
        (detail) => setResultMessage(_mergeframeResult, `Error: ${detail}`, "error")
      );
    } catch (error) {
      setResultMessage(_mergeframeResult, `Error: ${error}`, "error");
    }
  });

  _mergeframeDeleteButton.addEventListener("click", async () => {
    if (!splitState.outputDir) {
      setResultMessage(_mergeframeResult, "先に split タブで JPEG を展開してください。", "error");
      return;
    }

    const dir = buildDirParam(splitState.outputDir);
    if (!dir) {
      setResultMessage(_mergeframeResult, "削除対象ディレクトリの解決に失敗しました。", "error");
      return;
    }

    setResultMessage(_mergeframeResult, "削除中...", "processing");

    try {
      const response = await fetch(`/mergeframe_delete?dir=${encodeURIComponent(dir)}`);
      const data = await response.json();
      if (!response.ok) {
        setResultMessage(_mergeframeResult, `Error: ${data.detail || "unknown error"}`, "error");
        return;
      }

      mergeframeState = { mergedDir: null, outputFrames: null };
      movieStatus.mergedImages = 0;
      movieStatus.mosaicImages = 0;
      mosaicState = { mosaicDir: null, outputFrames: null };
      updateMosaicPanel();
      updateSplitPanel();

      if (data.deleted) {
        setResultMessage(_mergeframeResult, `削除完了: ${data.merged_dir}`, "success");
      } else {
        setResultMessage(_mergeframeResult, "merged ディレクトリは存在しませんでした。", "info");
      }
      updatePanelResultSummaries();
    } catch (error) {
      setResultMessage(_mergeframeResult, `Error: ${error}`, "error");
    }
  });
}
