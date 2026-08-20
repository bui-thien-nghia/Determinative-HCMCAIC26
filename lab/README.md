# AIC2026 Local Setup Guide

## 1. Project Overview

This repository is the local retrieval system for the AIC2026 multimedia video retrieval workflow.

- `FrontEnd/` contains the React + Vite UI.
- `BackEnd/API/` contains the official Django REST API.
- `BackEnd/src/` contains retrieval code, including `QueryManager`, model wrappers, and `DataLoader`.
- Qdrant stores dense and sparse vectors for video keyframes.
- The local AIC26 dataset can live anywhere on your machine. Set `AIC_DATASET_ROOT` to its path, or omit it to use the default repository-root `AIC26/` folder.

The current working Qdrant collection is:

```text
aic2026_v2
```

## 2. Repository Structure

Important folders:

```text
AIC26/              Default local dataset location if AIC_DATASET_ROOT is not set. Not committed to git.
BackEnd/API/        Django project and API app.
BackEnd/src/        Retrieval models, QueryManager, DataLoader, and requirements.
FrontEnd/           React/Vite frontend.
lab/                Team notes, notebooks, and experimental helper code.
qdrant_storage/     Local persistent Qdrant storage. Not committed to git.
```

## 3. Prerequisites

Install these before setting up the project:

- Git
- Python compatible with the backend environment. The backend notes reference Python 3.12.
- Node.js and npm
- Docker, for running Qdrant locally

No required `.env` file was found in the current repository. The Django backend loads retrieval models when it starts, so the first startup may take time and may require model files to be available or downloadable by the installed model libraries.

## 4. Dataset Root Configuration

The dataset root is configurable with one environment variable:

```text
AIC_DATASET_ROOT
```

Set it to the folder that directly contains:

```text
imgs/
maps/
mets/
trans/
vids/
feats/
```

If `AIC_DATASET_ROOT` is not set, the code falls back to:

```text
AIC26
```

macOS/Linux example:

```bash
export AIC_DATASET_ROOT="/path/to/AIC26"
```

Windows PowerShell example:

```powershell
$env:AIC_DATASET_ROOT="D:\Datasets\AIC26"
```

Use the same value in any terminal that runs DataLoader or the Vite frontend. The Django search API itself reads from Qdrant, but keeping the variable set consistently avoids surprises when running tools.

## 5. Clone / Pull the Repository

Fresh clone:

```bash
git clone https://github.com/bui-thien-nghia/Determinative-HCMCAIC26.git
cd Determinative-HCMCAIC26
```

Update an existing clone from `main`:

```bash
git fetch origin
git checkout main
git pull origin main
```

If you are working on a feature branch, pull or merge using the team workflow for that branch.

## 6. Python Virtual Environment Setup

Run from the repository root:

```bash
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r BackEnd/src/requirements.txt
```

If `python3.12` is not available, use the Python 3.12 interpreter installed on your machine.

The backend source imports modules such as `models` directly from `BackEnd/src`, so run backend-related commands with this `PYTHONPATH`:

```bash
PYTHONPATH="$PWD/BackEnd/src:$PWD"
```

Use it inline with commands, for example:

```bash
PYTHONPATH="$PWD/BackEnd/src:$PWD" python BackEnd/API/manage.py runserver 127.0.0.1:8000
```

## 7. Dataset Setup

Place the dataset at `AIC_DATASET_ROOT`, or at repository-root `AIC26/` if the variable is not set:

```text
<dataset-root>/
  imgs/<video_id>/<frame_id>.jpg
  maps/<video_id>.csv
  mets/<video_id>.json
  trans/<video_id>/<frame_id>.txt
  vids/<video_id>.mp4
  feats/<video_id>/<frame_id>.npz
```

Do not commit or download the dataset through git.

Current feature files are `.npz` files, not the old `.npy` feature directory format. The current `DataLoader` expects one `.npz` file per frame under:

```text
<dataset-root>/feats/<video_id>/<frame_id>.npz
```

Each `.npz` frame feature file is loaded with these keys:

```text
feat_siglip2_dense
feat_beit3_dense
feat_bgem3_dense
feat_bgem3_sparse_token_ids
feat_bgem3_sparse_weights
```

For a fresh Qdrant upload, the current `DataLoader` also expects enriched map CSV files with these columns:

```text
vid_id,frame_id,frame_order,time_order,fps,transcript,base_yt_link
```

If your map CSV files only contain `frame_id,frame_order,time_order,fps`, use the existing packaging code in `lab/extract_code/extraction_tools.py` to enrich maps before uploading, or use an already populated `aic2026_v2` Qdrant storage.

Qdrant payload media paths should stay dataset-relative, for example `imgs/L27_V015/057.jpg` and `vids/L27_V015.mp4`. This avoids storing personal absolute paths in shared Qdrant data.

## 8. Start Qdrant

No repository-specific Docker Compose file was found. The current code expects Qdrant at:

- HTTP: `127.0.0.1:6333`
- gRPC: `127.0.0.1:6334`

Start Qdrant with persistent local storage:

```bash
mkdir -p qdrant_storage
docker run --name aic-qdrant \
  -p 6333:6333 \
  -p 6334:6334 \
  -v "$PWD/qdrant_storage:/qdrant/storage" \
  qdrant/qdrant
```

If the container already exists:

```bash
docker start aic-qdrant
```

Verify Qdrant is running:

```bash
curl http://127.0.0.1:6333/collections
```

## 9. Prepare / Verify the Qdrant Collection

### A. If `aic2026_v2` Already Exists

List collections:

```bash
curl -s http://127.0.0.1:6333/collections | python -m json.tool
```

Inspect the working collection:

```bash
curl -s http://127.0.0.1:6333/collections/aic2026_v2 | python -m json.tool
```

A populated collection should report a non-zero point count.

### B. If No Collection Exists Yet

The current upload API is `DataLoader` in `BackEnd/src/db_management_tools.py`.

Important behavior:

- `DataLoader()` reads from `AIC_DATASET_ROOT` when set, otherwise from `AIC26`.
- `DataLoader("AIC26")` still works for the default repository-root dataset.
- It connects to Qdrant using gRPC at `http://localhost:6334`.
- `create_and_fill_database("aic2026_v2", upload_batch_size=256, upload_num_workers=1)` creates the collection and uploads points.
- Point IDs are generated as UUIDs.
- Uploading the full dataset can take a long time.
- If the collection already exists, the loader asks before deleting and recreating it.

On macOS, do not run the full upload through `python -` or a heredoc because multiprocessing/import behavior is more reliable from an actual `.py` file.

Create a temporary local upload file, for example `tmp/upload_aic2026_v2.py`:

```python
from db_management_tools import DataLoader

loader = DataLoader()
loader.create_and_fill_database(
    "aic2026_v2",
    upload_batch_size=256,
    upload_num_workers=1,
)
```

Run it from the repository root:

```bash
mkdir -p tmp
export AIC_DATASET_ROOT="/path/to/AIC26"
PYTHONPATH="$PWD/BackEnd/src:$PWD" python tmp/upload_aic2026_v2.py
```

Use a higher `upload_num_workers` only after confirming the single-worker upload works on your machine.

## 10. Start Django Backend

From the repository root:

```bash
source .venv/bin/activate
PYTHONPATH="$PWD/BackEnd/src:$PWD" python BackEnd/API/manage.py runserver 127.0.0.1:8000
```

Expected API base:

```text
http://127.0.0.1:8000/api/
```

Current Django API endpoints:

```text
POST /api/search/
POST /api/aggregatedsearch/
GET  /api/collections/
POST /api/describeschema/
POST /api/continuoussearch/
POST /api/filter/
```

## 11. Backend Smoke Tests

List collections:

```bash
curl -s http://127.0.0.1:8000/api/collections/ | python -m json.tool
```

Describe the working collection schema:

```bash
curl -s -X POST http://127.0.0.1:8000/api/describeschema/ \
  -H "Content-Type: application/json" \
  -d '{"collection":"aic2026_v2"}' | python -m json.tool
```

Run a normal search:

```bash
curl -s -X POST http://127.0.0.1:8000/api/search/ \
  -H "Content-Type: application/json" \
  -d '{
    "query": "một người đang câu cá",
    "mode": "AUTO",
    "collection": "aic2026_v2",
    "model_id": "siglip2",
    "top_k": 5,
    "language": "AUTO"
  }' | python -m json.tool
```

A successful search response should return HTTP success and a JSON object with a `results` array. Result items include fields such as `id`, `score`, `image_path`, `video_id`, `timestamp`, and a `payload` object containing frame/video metadata such as `vid_id`, `frame_id`, `time_order`, `frame_order`, `transcript`, and `yt_link` when available.

## 12. Start Frontend

From the repository root:

```bash
cd FrontEnd
npm install
npm run dev
```

Vite normally serves the frontend at:

```text
http://localhost:5173/
```

The Vite dev server proxies `/api` to:

```text
http://localhost:8000
```

It also serves local dataset media from `AIC_DATASET_ROOT`, falling back to repository-root `AIC26/` when the variable is not set.

If the dataset is outside the repository, export the variable in the frontend terminal before running Vite:

```bash
export AIC_DATASET_ROOT="/path/to/AIC26"
cd FrontEnd
npm run dev
```

## 13. Verify the Full System

Check this sequence:

- Qdrant is running on `127.0.0.1:6333` and `127.0.0.1:6334`.
- Collection `aic2026_v2` exists and has points.
- Django is running on `127.0.0.1:8000`.
- Vite frontend is running on `localhost:5173`.
- The frontend uses `aic2026_v2`.
- A text query returns search results.
- Result images load from `<dataset-root>/imgs`.
- Video preview opens from `<dataset-root>/vids`.
- Timestamp seeking opens near the selected frame time.

## 14. Common Problems / Troubleshooting

### `ModuleNotFoundError: No module named 'models'`

Run Django or DataLoader with:

```bash
PYTHONPATH="$PWD/BackEnd/src:$PWD"
```

### Qdrant Connection Refused

Qdrant is not running or the ports are not exposed. Check:

```bash
docker ps
curl http://127.0.0.1:6333/collections
```

### Frontend API Errors

Make sure Django is running at `127.0.0.1:8000`. The Vite proxy sends `/api` requests there.

### No Search Results

Verify that `aic2026_v2` exists and is populated:

```bash
curl -s http://127.0.0.1:6333/collections/aic2026_v2 | python -m json.tool
```

### Dataset Files Missing

Check that `AIC_DATASET_ROOT` points to the folder that directly contains `imgs/`, `maps/`, `mets/`, `trans/`, `vids/`, and `feats/`. If the variable is not set, the fallback is repository-root `AIC26/`.

### Old `.npy` Features

The current loader expects packed per-frame `.npz` files under `<dataset-root>/feats/<video_id>/<frame_id>.npz`. Old expanded `.npy` feature folders are not the current upload format.

### Map CSV Key Errors During Upload

The current loader expects enriched map columns:

```text
vid_id,frame_id,frame_order,time_order,fps,transcript,base_yt_link
```

If those columns are missing, prepare enriched maps before running the full upload.

### Image or Video Does Not Load

The Vite dev server serves local media from `AIC_DATASET_ROOT`, falling back to repository-root `AIC26/`. Confirm:

```text
<dataset-root>/imgs/<video_id>/<frame_id>.jpg
<dataset-root>/vids/<video_id>.mp4
```

### Wrong Collection

The current frontend should show and use only `aic2026_v2`. Verify the backend has that collection:

```bash
curl -s http://127.0.0.1:8000/api/collections/ | python -m json.tool
```

### Dataset Outside the Repository

Set `AIC_DATASET_ROOT` in every terminal that needs local dataset access, especially the Vite frontend terminal:

```bash
export AIC_DATASET_ROOT="/path/to/AIC26"
```

For PowerShell:

```powershell
$env:AIC_DATASET_ROOT="D:\Datasets\AIC26"
```

## 15. Quick Start

Use this when the dataset and populated `aic2026_v2` collection are already ready.

Terminal 1: start Qdrant.

```bash
docker start aic-qdrant
```

If the container does not exist yet:

```bash
mkdir -p qdrant_storage
docker run --name aic-qdrant \
  -p 6333:6333 \
  -p 6334:6334 \
  -v "$PWD/qdrant_storage:/qdrant/storage" \
  qdrant/qdrant
```

Terminal 2: start Django.

```bash
source .venv/bin/activate
export AIC_DATASET_ROOT="/path/to/AIC26"
PYTHONPATH="$PWD/BackEnd/src:$PWD" python BackEnd/API/manage.py runserver 127.0.0.1:8000
```

Terminal 3: start Vite.

```bash
cd FrontEnd
npm install
export AIC_DATASET_ROOT="/path/to/AIC26"
npm run dev
```

Open:

```text
http://localhost:5173/
```

Search for:

```text
một người đang câu cá
```

If your dataset is at repository-root `AIC26/`, you can omit both `export AIC_DATASET_ROOT=...` lines.

## 16. Current Known Working Configuration

```text
Collection:   aic2026_v2
Qdrant HTTP: 127.0.0.1:6333
Qdrant gRPC: 127.0.0.1:6334
Django API:  127.0.0.1:8000
Frontend:    Vite dev server
Dataset:     AIC_DATASET_ROOT, or AIC26/ when unset
```
