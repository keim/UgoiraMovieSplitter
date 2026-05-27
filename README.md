# うごイラ 動画 splitter

Pixiv うごイラ用の連番jpgファイルをmp4ファイルから抽出します。
ブラウザ上で mp4 を フレーム分割・フレーム合成・モザイク処理を行えます。
ローカル環境での起動を想定しており、フレーム分割した jpg ファイルは特定のフォルダに保存されています。

## TL;DR
1. `./install.sh` でインストール
2. `./run.sh` で起動
3. `http://localhost:8000/html/` で UI にアクセス
4. **upload** タブ: 動画をアップロード（ファイル選択 または Google Drive URL 貼り付け）
5. **split** タブ: フレーム数を指定して JPG 切り出し
6. **mergeframe** タブ: 複数フレームを平均合成（省略可）
7. **mosaic** タブ: エリア指定してモザイク処理（省略可）
8. **preview** タブ: プレイリスト再生・ZIP ダウンロード
9. `./uninstall.sh` でアンインストール


## 概要

- mp4 動画を JPG 連番に分割
- 複数フレームを平均合成して枚数を削減
- 指定範囲にモザイクを適用
- 処理結果を ZIP でダウンロード
- フレームをブラウザ上でプレイリスト再生

フロントエンドは `html/` 配下の複数 JS ファイルで構成されています（`tabs.js`, `state.js`, `upload.js`, `split.js`, `mergeframe.js`, `mosaic.js`, `preview.js`）。バックエンドは `server.py`（FastAPI）です。

## 動作環境

- Python 3.10 以上（3.12 未満は `requirement310.txt` を自動選択）
- bash 実行環境（Linux / macOS / Git Bash / Termux）
- Termux（Android）対応

## インストール手順

### 1) スクリプトに実行権限を付与（Linux / macOS / Termux のみ）

```bash
chmod +x install.sh run.sh uninstall.sh
```

### 2) 依存関係をインストール

```bash
./install.sh
```

`install.sh` の挙動:

- **Python バージョン検出**: `python3` / `python` / `py -3` を順に試行
- **requirements 選択**: Python < 3.12 は `requirement310.txt`、それ以降は `requirements.txt` を使用
- **通常環境**:
  - `.venv` を作成して `pip install`
- **Termux 環境**:
  - `pkg upgrade -y` で ABI 一貫性を確保
  - `pkg install -y python-numpy python-pillow ffmpeg rust` を実行
  - `pip install` は `numpy` / `pillow` / `ffmpeg` を除外し `--prefer-binary` で実行

### 3) アンインストール

```bash
./uninstall.sh
```

- `.venv` ディレクトリを削除
- Termux では `python-numpy` / `python-pillow` / `ffmpeg` / `rust` の個別削除を確認して実行

## 起動手順

```bash
./run.sh
```

デフォルト起動:

- アプリファイル: `server.py`
- ポート: `8000`

環境変数で変更可能:

```bash
APP_FILE=server.py PORT=9000 ./run.sh
```

起動後のアクセス先:

- UI: `http://localhost:8000/html/`

## 各機能説明

### UI 機能（タブ）

タブバーはデスクトップ（768px 以上）ではタブ形式、モバイル（767px 以下）ではハンバーガーメニューで表示されます。

#### 1. upload
- **ファイルアップロード**: ローカルの mp4 を選択してサーバーに送信
- **Google Drive インポート**: 共有リンク（`?usp=sharing`）を貼り付けて直接ダウンロード
- 動画情報表示（codec / fps / duration など）
- アップロード済み mp4 の選択・削除
- **split タブはファイル選択後にのみ有効化**

#### 2. split
- 開始フレーム / 終了フレームを指定して JPG 連番を書き出し
- 出力先: `images/<movie_stem>_frames/`
- 分割画像を ZIP ダウンロード
- split 完了時に preview タブのプレイリストを自動更新

#### 3. mergeframe
- 分割済み JPG を N 枚ずつ平均合成して枚数を削減
- 出力先: `images/<movie_stem>_frames/merged/`
- 合成結果を ZIP ダウンロード
- mergeframe 完了時に preview タブのプレイリストを自動更新

#### 4. mosaic
- 指定矩形（x, y, w, h, size）にピクセル化モザイクを適用
- プレビューキャンバス上でドラッグして矩形を指定可能
- 出力先: `images/<movie_stem>_frames/mosaic/`
- モザイク結果を ZIP ダウンロード
- mosaic 完了時に preview タブのプレイリストを自動更新

#### 5. preview
- **プレイリスト再生のみ対応**（常時有効）
- split / mergeframe / mosaic の処理完了、またはファイル選択時に、その動画1本がプレイリストに自動セットされる
  - 優先順位: mosaic → merged → split フレームを自動選択して再生・ダウンロード
- **Available Movies**: サムネイル付きの一覧からクリックでプレイリストに追加・除去
- **Playlist**:
  - ↑ / ↓ で順序変更、✕ で削除
  - Loop チェックで末尾到達後に先頭へ折り返し
- フレームレート（msec/frame）をリアルタイム変更可能
- **Download**: プレイリストに動画がある場合に有効。クリック時に最新フレームを取得して連番 ZIP でダウンロード

### API 機能（主要エンドポイント）

- `GET /movie_list`:
  - `movies/` 配下の mp4 一覧を返す
- `POST /upload`:
  - mp4 を保存し、movie 情報を返す（ファイル名は `<stem>_YYYYMMDDHHMMSS.mp4`）
- `POST /download_from_gdrive`:
  - リクエストボディ: `{"url": "https://drive.google.com/..."}`
  - Google Drive 共有リンクから mp4 をダウンロードして保存
- `GET /movie_info?file=<name>.mp4`:
  - 指定 mp4 の情報と処理状況を返す
- `GET /delete_movie?file=<name>.mp4`:
  - mp4 と対応フレームディレクトリを削除
- `GET /split?file=<name>.mp4&start=0&end=120`:
  - フレーム分割（ジョブ方式、`GET /job/<job_id>` でポーリング）
- `GET /frame_image?dir=<dir>&index=0`:
  - 指定ディレクトリ内のフレーム情報を返す
- `GET /mergeframe?dir=<dir>&frames=2`:
  - フレーム合成（ジョブ方式）
- `GET /mergeframe_delete?dir=<dir>`:
  - merged ディレクトリ削除
- `GET /mosaic?dir=<dir>&x1=100&y1=100&w1=80&h1=80&size1=8`:
  - モザイク処理（ジョブ方式）
- `GET /download_images?dir=<dir>&name=result.zip`:
  - JPG 群を ZIP で返す
- `POST /download_playlist_frames`:
  - リクエストボディ: `{"frames": [{"dir": "<dir>", "index": 0}, ...], "name": "playlist.zip"}`
  - 指定フレームを `00001.jpg`, `00002.jpg`, ... と連番リネームして ZIP で返す

## フロントエンド構成

`html/` 配下の JS ファイルはロード順に依存します。`index.html` が以下の順で読み込みます:

| ファイル | 主な内容 |
|---|---|
| `tabs.js` | デスクトップ/モバイル TAB 定数・`activateTab()` |
| `state.js` | 共有ステート変数・ユーティリティ関数・パネル更新関数 |
| `upload.js` | upload DOM 参照・映画管理・Google Drive インポート・各リスナー |
| `split.js` | split DOM 参照・実行リスナー |
| `mergeframe.js` | mergeframe DOM 参照・各リスナー |
| `mosaic.js` | mosaic DOM 参照・キャンバス描画・`activateTab` オーバーライド |
| `preview.js` | プレイリスト再生・サムネイル・ダウンロード全機能 |

## ディレクトリ構成

```
splitter/
├── server.py           # FastAPI バックエンド
├── html/               # フロントエンド（静的ファイル）
├── movies/             # アップロードされた mp4
├── images/             # 分割・処理済みフレーム
│   └── <stem>_frames/
│       ├── *.jpg           # split フレーム
│       ├── merged/*.jpg    # mergeframe フレーム
│       └── mosaic/*.jpg    # mosaic フレーム
├── requirements.txt        # Python 3.12+ 用
├── requirement310.txt      # Python 3.10/3.11 用
├── install.sh
├── uninstall.sh
└── run.sh
```

## 補足

- 通常利用は `server.py` + `html/` の Web UI を推奨します。
- JS ファイルは `Cache-Control: no-store` で配信されるため、ブラウザキャッシュなしで即時反映されます。


## 補足

- 通常利用は `server.py` + `html/` の Web UI を推奨します。
