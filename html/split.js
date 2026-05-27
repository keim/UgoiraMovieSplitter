// --- split パネル ---
const splitExecuteButton = document.getElementById("splitExecuteButton");
const splitResult = document.getElementById("splitResult");
const splitDownloadButton = document.getElementById("splitDownloadButton");

splitDownloadButton.addEventListener("click", () => downloadImagesFromButton(splitDownloadButton));

splitExecuteButton.addEventListener("click", async () => {
  if (!uploadState.filename) {
    setResultMessage(splitResult, "先に upload タブでファイルをアップロードしてください。", "error");
    return;
  }

  const start    = Number(document.getElementById("splitStart").value);
  const endVal   = document.getElementById("splitEnd").value;
  const end      = endVal !== "" ? Number(endVal) : (uploadState.frameCount != null ? uploadState.frameCount - 1 : undefined);

  const params = new URLSearchParams({
    file: uploadState.filename,
    start: String(start),
  });
  if (end !== undefined) params.set("end", String(end));

  try {
    const response = await fetch(`/split?${params}`);
    setResultMessage(splitResult, `実行中... ${formatFrameProgress(0, null)}`, "processing");
    const startData = await response.json();
    if (!response.ok) {
      setResultMessage(splitResult, `Error: ${startData.detail || "unknown error"}`, "error");
      return;
    }
    pollJob(startData.job_id, splitResult,
      (result) => {
        splitState = {
          outputDir: result.output_dir,
          frameCount: result.frame_count,
        };
        movieStatus.splitImages = Number.isFinite(Number(result.frame_count)) ? Number(result.frame_count) : 0;
        movieStatus.mergedImages = 0;
        movieStatus.mosaicImages = 0;
        mergeframeState = { mergedDir: null, outputFrames: null };
        mosaicState = { mosaicDir: null, outputFrames: null };
        updateSplitPanel();
        updateMosaicPanel();
        setResultMessage(splitResult, `完了: ${result.frame_count} フレーム → ${result.output_dir}`, "success");
        updatePanelResultSummaries();
        autoSetPlaylistToCurrentMovie();
      },
      (detail) => setResultMessage(splitResult, `Error: ${detail}`, "error")
    );
  } catch (error) {
    setResultMessage(splitResult, `Error: ${error}`, "error");
  }
});
