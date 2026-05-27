from pathlib import Path
import asyncio
import io
import re
import subprocess
import shutil
import time
import zipfile

import imageio_ffmpeg
import httpx
import numpy as np
from PIL import Image
from fastapi import FastAPI, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

app = FastAPI()

# JS・CSS ファイルのブラウザキャッシュを無効化（開発中のファイル更新を即反映）
@app.middleware("http")
async def no_cache_static(request: Request, call_next):
    response = await call_next(request)
    path = request.url.path
    if path.startswith("/html/") and path.endswith((".js", ".css", ".html")):
        response.headers["Cache-Control"] = "no-store"
    return response

TEMP_DIR = Path("movies")
TEMP_DIR.mkdir(exist_ok=True)

IMAGES_DIR = Path("images")
IMAGES_DIR.mkdir(exist_ok=True)

job_store: dict[str, dict] = {}

# ジョブ管理ストアに新しい処理ジョブを登録してIDを返す。
def _new_job(total: int) -> str:
	job_id = time.strftime("%Y%m%d%H%M%S")
	job_store[job_id] = {"status": "processing", "done": 0, "total": total}
	return job_id


app.mount("/html", StaticFiles(directory="html", html=True), name="html")
app.mount("/images", StaticFiles(directory="images"), name="images")
app.mount("/movies", StaticFiles(directory="movies"), name="movies")


# ffmpegの標準エラー出力から動画メタ情報を抽出して辞書で返す。
def parse_ffmpeg_information(stderr_text: str) -> dict[str, str | int | float | None]:
	information: dict[str, str | int | float | None] = {
		"video_codec": None,
		"audio_codec": None,
		"width": None,
		"height": None,
		"fps": None,
		"bitrate": None,
		"duration": None,
		"creation_time": None,
	}

	video_line = next((line for line in stderr_text.splitlines() if " Video: " in line), "")
	audio_line = next((line for line in stderr_text.splitlines() if " Audio: " in line), "")
	duration_line = next((line for line in stderr_text.splitlines() if "Duration:" in line), "")
	creation_time_line = next((line for line in stderr_text.splitlines() if "creation_time" in line), "")

	video_codec_match = re.search(r"Video:\s*([^,]+)", video_line)
	if video_codec_match:
		information["video_codec"] = video_codec_match.group(1).strip()

	audio_codec_match = re.search(r"Audio:\s*([^,]+)", audio_line)
	if audio_codec_match:
		information["audio_codec"] = audio_codec_match.group(1).strip()

	resolution_match = re.search(r"(\d{2,5})x(\d{2,5})", video_line)
	if resolution_match:
		information["width"] = int(resolution_match.group(1))
		information["height"] = int(resolution_match.group(2))

	fps_match = re.search(r"([0-9]+(?:\.[0-9]+)?)\s*fps", video_line)
	if fps_match:
		information["fps"] = float(fps_match.group(1))

	bitrate_match = re.search(r"bitrate:\s*([0-9]+(?:\.[0-9]+)?)\s*kb/s", duration_line)
	if bitrate_match:
		information["bitrate"] = float(bitrate_match.group(1))

	duration_match = re.search(r"Duration:\s*(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)", duration_line)
	if duration_match:
		hours = int(duration_match.group(1))
		minutes = int(duration_match.group(2))
		seconds = float(duration_match.group(3))
		information["duration"] = round((hours * 3600) + (minutes * 60) + seconds, 3)

	creation_time_match = re.search(r"creation_time\s*:\s*(.+)$", creation_time_line)
	if creation_time_match:
		information["creation_time"] = creation_time_match.group(1).strip()

	return information


# 画像の指定矩形領域にピクセル化モザイクを適用する。
def apply_mosaic_region(image: Image.Image, x: int, y: int, width: int, height: int, pixel_size: int) -> None:
	if pixel_size < 2:
		return

	box = (x, y, x + width, y + height)
	region = image.crop(box)
	small_width = max(1, width // pixel_size)
	small_height = max(1, height // pixel_size)
	region = region.resize((small_width, small_height), Image.NEAREST)
	region = region.resize((width, height), Image.NEAREST)
	image.paste(region, box)


# 動画ファイルの情報と関連フレーム数をまとめてAPIレスポンス形式で返す。
def build_movie_information_response(movie_path: Path) -> dict[str, str | int | dict[str, str | int | float | None]]:
	ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
	ffmpeg_result = subprocess.run(
		[ffmpeg_exe, "-hide_banner", "-i", str(movie_path)],
		capture_output=True,
		text=True,
		check=False,
	)

	information = parse_ffmpeg_information(ffmpeg_result.stderr)
	relative_movie_path = movie_path.relative_to(TEMP_DIR).as_posix()
	movie_url = f"/movies/{relative_movie_path}"
	frames_dir = IMAGES_DIR / f"{movie_path.stem}_frames"
	merged_dir = frames_dir / "merged"
	mosaic_dir = frames_dir / "mosaic"
	frame_files = list(frames_dir.glob("*.jpg")) if frames_dir.is_dir() else []

	split_images = len(frame_files)
	frame_numbers = [int(path.stem) for path in frame_files if path.stem.isdigit()]
	start_frame = min(frame_numbers) if frame_numbers else 0
	end_frame = max(frame_numbers) if frame_numbers else 0
	merged_images = len(list(merged_dir.glob("*.jpg"))) if merged_dir.is_dir() else 0
	mosaic_images = len(list(mosaic_dir.glob("*.jpg"))) if mosaic_dir.is_dir() else 0
	
	return {
		"saved_path": str(movie_path),
		"saved_name": movie_path.name,
		"movie_url": movie_url,
		"information": information,
		"start_frame": start_frame,
		"end_frame": end_frame,
		"split_images": split_images,
		"merged_images": merged_images,
		"mosaic_images": mosaic_images,
	}


# API Endpoints
# Note: The movie_list endpoint returns a sorted list of all mp4 filenames under the /movies directory.
@app.get("/job/{job_id}")
# ジョブIDをもとに進捗状態を返し、完了または失敗時はストアから削除する。
async def get_job(job_id: str) -> dict:
	job = job_store.get(job_id)
	if job is None:
		raise HTTPException(status_code=404, detail=f"job not found: {job_id}")
	if job["status"] in ("completed", "error"):
		del job_store[job_id]
	return job


# Note: The movie_list endpoint returns a sorted list of all mp4 filenames under the /movies directory.
@app.get("/movie_list")
# /movies配下のmp4ファイル一覧をソートして返す。
async def movie_list() -> dict[str, list[str]]:
	movies = sorted(path.name for path in TEMP_DIR.rglob("*.mp4") if path.is_file())
	return {"movies": movies}


# Note: movie_info, split, and frame_image endpoints assume that the filename provided in the query uniquely 
# identifies a single mp4 file under /movies. If multiple files match, an error is raised to avoid ambiguity.
@app.get("/movie_info")
# 指定されたmp4ファイルのメタ情報と画像処理の進捗情報を返す。
async def movie_info(file: str = Query(..., description="target mp4 filename under /movies")) -> dict[str, str | int | dict[str, str | int | float | None]]:
	if not file.lower().endswith(".mp4"):
		raise HTTPException(status_code=400, detail="file must be an mp4 filename")

	movie_candidates = [path for path in TEMP_DIR.rglob(file) if path.is_file() and path.suffix.lower() == ".mp4"]
	if not movie_candidates:
		raise HTTPException(status_code=404, detail=f"mp4 not found under /movies: {file}")
	if len(movie_candidates) > 1:
		raise HTTPException(status_code=400, detail=f"multiple files matched under /movies: {file}")

	movie_path = movie_candidates[0]
	return build_movie_information_response(movie_path)


# Note: The delete_movie endpoint deletes the specified mp4 under /movies and also removes
# the corresponding extracted-images directory under /images (<movie_stem>_frames) if present.
@app.get("/delete_movie")
# 指定mp4と対応するフレーム保存ディレクトリをまとめて削除する。
async def delete_movie(file: str = Query(..., description="target mp4 filename under /movies")) -> dict[str, str | bool]:
	if not file.lower().endswith(".mp4"):
		raise HTTPException(status_code=400, detail="file must be an mp4 filename")

	movie_candidates = [path for path in TEMP_DIR.rglob(file) if path.is_file() and path.suffix.lower() == ".mp4"]
	if not movie_candidates:
		raise HTTPException(status_code=404, detail=f"mp4 not found under /movies: {file}")
	if len(movie_candidates) > 1:
		raise HTTPException(status_code=400, detail=f"multiple files matched under /movies: {file}")

	movie_path = movie_candidates[0]
	frames_dir = IMAGES_DIR / f"{movie_path.stem}_frames"
	frames_deleted = False

	if frames_dir.exists():
		if not frames_dir.is_dir():
			raise HTTPException(status_code=400, detail=f"frames path is not a directory: {frames_dir}")
		shutil.rmtree(frames_dir)
		frames_deleted = True

	movie_path.unlink()

	return {
		"file": str(movie_path),
		"deleted": True,
		"images_dir": str(frames_dir),
		"images_deleted": frames_deleted,
	}


# Note: The upload endpoint saves the uploaded mp4 file to the /movies directory with a unique name to avoid conflicts. 
# It then extracts and returns the movie information using ffmpeg.
@app.post("/upload")
# アップロードされたmp4を保存し、保存後の動画情報を返す。
async def upload(movie: UploadFile = File(...)) -> dict[str, str | int | dict[str, str | int | float | None]]:
	filepath = Path(movie.filename or "")
	filename = filepath.name
	if not filename.lower().endswith(".mp4"):
		raise HTTPException(status_code=400, detail="movie must be an mp4 file")

	save_name = f"{filepath.stem}_{time.strftime('%Y%m%d%H%M%S')}.mp4"
	save_path = TEMP_DIR / save_name
	file_bytes = await movie.read()
	save_path.write_bytes(file_bytes)

	return build_movie_information_response(save_path)


# Note: The split endpoint extracts frames from the specified mp4 file and saves them as jpg images in a new subdirectory under /images.
@app.get("/split")
# 指定mp4をフレーム分割し、jpg連番として保存するジョブを開始する。
async def split(
	file: str = Query(..., description="target mp4 filename under /movies"),
	start: int | None = Query(default=None, ge=0, description="start frame number (inclusive)"),
	end: int | None = Query(default=None, ge=0, description="end frame number (inclusive)"),
) -> dict[str, str]:
	if not file.lower().endswith(".mp4"):
		raise HTTPException(status_code=400, detail="file must be an mp4 filename")

	if start is not None and end is not None and end < start:
		raise HTTPException(status_code=400, detail="end must be >= start")

	movie_candidates = [path for path in TEMP_DIR.rglob(file) if path.is_file() and path.suffix.lower() == ".mp4"]
	if not movie_candidates:
		raise HTTPException(status_code=404, detail=f"mp4 not found under /movies: {file}")
	if len(movie_candidates) > 1:
		raise HTTPException(status_code=400, detail=f"multiple files matched under /movies: {file}")

	movie_path = movie_candidates[0]
	output_dir = IMAGES_DIR / f"{movie_path.stem}_frames"
	if output_dir.exists():
		if output_dir.is_dir():
			shutil.rmtree(output_dir)
		else:
			output_dir.unlink()
	output_dir.mkdir(parents=True, exist_ok=True)

	output_pattern = output_dir / "%04d.jpg"
	ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()

	cmd = [ffmpeg_exe, "-i", str(movie_path)]

	if start is not None or end is not None:
		lo = start if start is not None else 0
		hi = end
		if hi is not None:
			select_expr = f"between(n,{lo},{hi})"
		else:
			select_expr = f"gte(n,{lo})"
		cmd += ["-vf", f"select='{select_expr}'", "-vsync", "vfr"]

	frame_start_number = start if start is not None else 0

	cmd += ["-start_number", str(frame_start_number), "-q:v", "2", "-f", "image2", str(output_pattern)]

	total = (end - start + 1) if (start is not None and end is not None) else 0
	job_id = _new_job(total)
	asyncio.create_task(asyncio.to_thread(_run_split, job_id, cmd, output_dir, movie_path, start, end, total))
	return {"job_id": job_id}


# splitジョブ本体を実行し、進捗と完了結果をジョブストアに反映する。
def _run_split(job_id: str, cmd: list, output_dir: Path, movie_path: Path, start: int | None, end: int | None, total: int) -> None:
	job_store[job_id]["total"] = total
	try:
		process = subprocess.Popen(cmd, stderr=subprocess.DEVNULL, stdout=subprocess.DEVNULL)
		while process.poll() is None:
			job_store[job_id]["done"] = len(list(output_dir.glob("*.jpg")))
			time.sleep(0.5)
		if process.returncode != 0:
			job_store[job_id].update({"status": "error", "detail": "ffmpeg failed"})
			return
		frame_count = len(list(output_dir.glob("*.jpg")))
		job_store[job_id].update({
			"status": "completed",
			"done": frame_count,
			"total": frame_count,
			"file": str(movie_path),
			"start": start,
			"end": end,
			"output_dir": str(output_dir),
			"pattern": "%04d.jpg",
			"frame_count": frame_count,
		})
	except Exception as exc:
		job_store[job_id].update({"status": "error", "detail": str(exc)})


# Note: The mergeframe endpoint takes a subdirectory name under /images and a number of frames to merge.
# 指定枚数ごとに画像を平均合成してmerged配下へ出力するジョブ本体。
def _run_mergeframe(job_id: str, jpg_files: list, group_size: int, source_dir: Path, merged_dir: Path) -> None:
	output_total = len(jpg_files) // group_size
	job_store[job_id]["total"] = output_total
	out_count = 0
	try:
		for i in range(0, output_total * group_size, group_size):
			group = [Image.open(jpg_files[i + j]) for j in range(group_size)]
			if group_size == 2:
				merged = Image.blend(group[0], group[1], 0.5)
			else:
				arrays = [np.array(img) for img in group]
				merged = Image.fromarray(np.mean(arrays, axis=0).astype(np.uint8))
			out_count += 1
			merged.save(merged_dir / f"{out_count:04d}.jpg")
			job_store[job_id]["done"] = out_count
		job_store[job_id].update({
			"status": "completed",
			"done": out_count,
			"total": output_total,
			"source_dir": str(source_dir),
			"merged_dir": str(merged_dir),
			"group_size": group_size,
			"input_frames": len(jpg_files),
			"output_frames": out_count,
		})
	except Exception as exc:
		job_store[job_id].update({"status": "error", "detail": str(exc)})


# Note: The mergeframe endpoint takes a subdirectory name under /images and a number of frames to merge.
# It processes the jpg files in the specified directory in groups of the given size, 
# merging them together (using simple averaging) and saving the results in a "merged" subdirectory. 
# The response includes information about the source directory, merged directory, group size, input frame count, and output frame count.
@app.get("/mergeframe")
# フレーム合成ジョブを開始し、ジョブIDを返す。
async def mergeframe(
	dir: str = Query(..., description="subdirectory name under images/"),
	frames: int = Query(..., ge=2, description="number of frames to merge"),
) -> dict[str, str]:
	source_dir = IMAGES_DIR / dir
	if not source_dir.is_dir():
		raise HTTPException(status_code=404, detail=f"directory not found under images/: {dir}")

	jpg_files = sorted(source_dir.glob("*.jpg"))
	if not jpg_files:
		raise HTTPException(status_code=404, detail=f"no jpg files found in images/{dir}")

	group_size = frames
	merged_dir = source_dir / "merged"
	merged_dir.mkdir(exist_ok=True)
	for old in merged_dir.glob("*.jpg"):
		old.unlink()

	job_id = _new_job(len(jpg_files) // group_size)
	asyncio.create_task(asyncio.to_thread(_run_mergeframe, job_id, jpg_files, group_size, source_dir, merged_dir))
	return {"job_id": job_id}


# Note: The mergeframe_delete endpoint takes a subdirectory name under /images and deletes the "merged" subdirectory if it exists.
@app.get("/mergeframe_delete")
# mergedディレクトリを削除して、削除結果を返す。
async def mergeframe_delete(
	dir: str = Query(..., description="subdirectory name under images/"),
) -> dict[str, str | bool]:
	source_dir = IMAGES_DIR / dir
	if not source_dir.is_dir():
		raise HTTPException(status_code=404, detail=f"directory not found under images/: {dir}")

	merged_dir = source_dir / "merged"
	if not merged_dir.exists():
		return {
			"source_dir": str(source_dir),
			"merged_dir": str(merged_dir),
			"deleted": False,
		}

	if not merged_dir.is_dir():
		raise HTTPException(status_code=400, detail=f"merged path is not a directory: {merged_dir}")

	shutil.rmtree(merged_dir)
	return {
		"source_dir": str(source_dir),
		"merged_dir": str(merged_dir),
		"deleted": True,
	}


# Note: The frame_image endpoint takes a subdirectory name under /images and a 0-based frame index, 
# and returns information about the specified frame, including its URL, name, index, total frame count, 
# and dimensions. It validates that the directory exists, contains jpg files, and that the index is within range.
@app.get("/frame_image")
# 指定ディレクトリの指定インデックス画像のURLとサイズ情報を返す。
async def frame_image(
	dir: str = Query(..., description="subdirectory name under images/"),
	index: int = Query(..., ge=0, description="0-based frame index"),
) -> dict[str, str | int]:
	source_dir = IMAGES_DIR / dir
	if not source_dir.is_dir():
		raise HTTPException(status_code=404, detail=f"directory not found under images/: {dir}")

	jpg_files = sorted(source_dir.glob("*.jpg"))
	if not jpg_files:
		raise HTTPException(status_code=404, detail=f"no jpg files found in images/{dir}")
	if index >= len(jpg_files):
		raise HTTPException(status_code=400, detail=f"index out of range: {index} (max {len(jpg_files) - 1})")

	target_file = jpg_files[index]

	with Image.open(target_file) as img:
		width, height = img.size

	dir_url = dir.replace("\\", "/").strip("/")
	frame_url = f"/images/{dir_url}/{target_file.name}"

	return {
		"frame_url": frame_url,
		"frame_name": target_file.name,
		"frame_index": index,
		"frame_count": len(jpg_files),
		"width": width,
		"height": height,
	}


# Note: The download_images endpoint returns all jpg files in the specified images subdirectory as a zip file.
@app.get("/download_images")
# 指定ディレクトリ内のjpgをzip化してダウンロードレスポンスとして返す。
async def download_images(
	dir: str = Query(..., description="subdirectory name under images/"),
	name: str | None = Query(default=None, description="optional zip filename"),
) -> Response:
	source_dir = (IMAGES_DIR / dir).resolve()
	images_root = IMAGES_DIR.resolve()
	if images_root not in source_dir.parents and source_dir != images_root:
		raise HTTPException(status_code=400, detail=f"invalid directory: {dir}")

	if not source_dir.is_dir():
		raise HTTPException(status_code=404, detail=f"directory not found under images/: {dir}")

	jpg_files = sorted(source_dir.glob("*.jpg"))
	if not jpg_files:
		raise HTTPException(status_code=404, detail=f"no jpg files found in images/{dir}")

	if name:
		zip_name = Path(name).name
		if not zip_name.lower().endswith(".zip"):
			zip_name = f"{zip_name}.zip"
	else:
		zip_name = f"{source_dir.name}.zip"

	zip_buffer = io.BytesIO()
	with zipfile.ZipFile(zip_buffer, "w", compression=zipfile.ZIP_DEFLATED) as zf:
		for jpg_file in jpg_files:
			zf.write(jpg_file, arcname=jpg_file.name)
	zip_buffer.seek(0)

	headers = {"Content-Disposition": f'attachment; filename="{zip_name}"'}
	return Response(content=zip_buffer.getvalue(), media_type="application/zip", headers=headers)


class PlaylistFrameRef(BaseModel):
	dir: str
	index: int

class PlaylistDownloadRequest(BaseModel):
	frames: list[PlaylistFrameRef]
	name: str | None = None

class GdriveDownloadRequest(BaseModel):
	url: str


# Google Drive URL から File ID を抽出する。
def _extract_gdrive_file_id(url: str) -> str | None:
	for pattern in [r'/file/d/([a-zA-Z0-9_-]{10,})', r'[?&]id=([a-zA-Z0-9_-]{10,})']:
		m = re.search(pattern, url)
		if m:
			return m.group(1)
	return None


# Google Drive の共有ファイルをダウンロードする (SSL 検証無効・リダイレクト追従)。
def _download_gdrive_file(url: str, output_path: Path) -> None:
	file_id = _extract_gdrive_file_id(url)
	download_url = (
		f"https://drive.usercontent.google.com/download?id={file_id}&export=download&confirm=t"
		if file_id else url
	)
	with httpx.Client(verify=False, follow_redirects=True, timeout=300) as client:
		with client.stream("GET", download_url) as resp:
			resp.raise_for_status()
			with open(output_path, "wb") as f:
				for chunk in resp.iter_bytes(65536):
					f.write(chunk)


@app.post("/download_from_gdrive")
# Google Drive の共有リンクから mp4 をダウンロードして保存する。
async def download_from_gdrive(body: GdriveDownloadRequest) -> dict[str, str | int | dict[str, str | int | float | None]]:
	url = body.url.strip()
	if not url:
		raise HTTPException(status_code=400, detail="url は必須です")

	save_name = f"gdrive_{time.strftime('%Y%m%d%H%M%S')}.mp4"
	save_path = TEMP_DIR / save_name

	try:
		await asyncio.to_thread(_download_gdrive_file, url, save_path)
	except Exception as exc:
		if save_path.exists():
			save_path.unlink()
		raise HTTPException(status_code=422, detail=f"ダウンロードエラー: {exc}")

	if not save_path.exists() or save_path.stat().st_size == 0:
		if save_path.exists():
			save_path.unlink()
		raise HTTPException(status_code=422, detail="ダウンロードに失敗しました。URLが正しいか、ファイルが公開共有されているか確認してください。")

	return build_movie_information_response(save_path)

@app.post("/download_playlist_frames")
# プレイリストフレームリストをzip化して連番ファイル名でダウンロードレスポンスとして返す。
async def download_playlist_frames(body: PlaylistDownloadRequest) -> Response:
	images_root = IMAGES_DIR.resolve()
	collected: list[tuple[Path, str]] = []

	for i, ref in enumerate(body.frames):
		source_dir = (IMAGES_DIR / ref.dir).resolve()
		if images_root not in source_dir.parents and source_dir != images_root:
			raise HTTPException(status_code=400, detail=f"invalid directory: {ref.dir}")
		if not source_dir.is_dir():
			raise HTTPException(status_code=404, detail=f"directory not found: {ref.dir}")
		jpg_files = sorted(source_dir.glob("*.jpg"))
		if ref.index < 0 or ref.index >= len(jpg_files):
			raise HTTPException(status_code=400, detail=f"index out of range: {ref.index} in {ref.dir}")
		collected.append((jpg_files[ref.index], f"{i + 1:05d}.jpg"))

	if not collected:
		raise HTTPException(status_code=400, detail="no frames specified")

	zip_name = Path(body.name).name if body.name else "playlist.zip"
	if not zip_name.lower().endswith(".zip"):
		zip_name += ".zip"

	zip_buffer = io.BytesIO()
	with zipfile.ZipFile(zip_buffer, "w", compression=zipfile.ZIP_DEFLATED) as zf:
		for file_path, arcname in collected:
			zf.write(file_path, arcname=arcname)
	zip_buffer.seek(0)

	headers = {"Content-Disposition": f'attachment; filename="{zip_name}"'}
	return Response(content=zip_buffer.getvalue(), media_type="application/zip", headers=headers)


# Note: The mosaic endpoint takes a subdirectory name under /images and parameters for one mosaic region.
# 画像群へモザイクを適用して出力し、進捗をジョブストアへ反映するジョブ本体。
def _run_mosaic(job_id: str, jpg_files: list, x1: int, y1: int, w1: int, h1: int, size1: int, source_dir: Path, mosaic_dir: Path, write_dir: Path, is_in_place_update: bool) -> None:
	total = len(jpg_files)
	job_store[job_id]["total"] = total
	processed = 0
	try:
		for jpg_file in jpg_files:
			output_path = write_dir / jpg_file.name
			img = Image.open(jpg_file)
			if size1 < 2:
				shutil.copy(jpg_file, output_path)
			else:
				apply_mosaic_region(img, x1, y1, w1, h1, size1)
				img.save(output_path)
			processed += 1
			job_store[job_id]["done"] = processed
		if is_in_place_update:
			for old in mosaic_dir.glob("*.jpg"):
				old.unlink()
			for new_file in write_dir.glob("*.jpg"):
				new_file.replace(mosaic_dir / new_file.name)
			shutil.rmtree(write_dir)
		job_store[job_id].update({
			"status": "completed",
			"done": processed,
			"total": total,
			"source_dir": str(source_dir),
			"mosaic_dir": str(mosaic_dir),
			"input_frames": total,
			"output_frames": processed,
		})
	except Exception as exc:
		job_store[job_id].update({"status": "error", "detail": str(exc)})


# Note: The mosaic endpoint takes a subdirectory name under /images and parameters for one mosaic region.
# It applies a mosaic effect to the specified region of each jpg file in the directory and saves the results in a "mosaic" subdirectory. 
# The response includes information about the source directory, mosaic directory, input frame count, and output frame count.
@app.get("/mosaic")
# モザイク処理ジョブを開始し、ジョブIDを返す。
async def mosaic(
	dir: str = Query(..., description="subdirectory name under images/"),
	x1: int = Query(..., ge=0),
	y1: int = Query(..., ge=0),
	w1: int = Query(..., ge=1),
	h1: int = Query(..., ge=1),
	size1: int = Query(..., ge=1),
) -> dict[str, str]:
	source_dir = IMAGES_DIR / dir
	if not source_dir.is_dir():
		raise HTTPException(status_code=404, detail=f"directory not found under images/: {dir}")

	jpg_files = sorted(source_dir.glob("*.jpg"))
	if not jpg_files:
		raise HTTPException(status_code=404, detail=f"no jpg files found in images/{dir}")

	# Output directory is always "..._frames/mosaic" (never ".../merged/mosaic").
	base_dir = source_dir.parent if source_dir.name in {"merged", "mosaic"} else source_dir
	mosaic_dir = base_dir / "mosaic"

	# If source is already the mosaic directory, write to a temp directory first,
	# then replace mosaic files after processing to avoid deleting input files.
	is_in_place_update = source_dir.resolve() == mosaic_dir.resolve()
	write_dir = base_dir / "mosaic_tmp" if is_in_place_update else mosaic_dir

	if write_dir.exists():
		if write_dir.is_dir():
			shutil.rmtree(write_dir)
		else:
			write_dir.unlink()
	write_dir.mkdir(exist_ok=True)

	job_id = _new_job(len(jpg_files))
	asyncio.create_task(asyncio.to_thread(_run_mosaic, job_id, jpg_files, x1, y1, w1, h1, size1, source_dir, mosaic_dir, write_dir, is_in_place_update))
	return {"job_id": job_id}

