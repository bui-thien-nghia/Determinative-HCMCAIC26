# AIC2026 Team Room - Quick Setup

- Everyone runs Search/Qdrant locally.
- Only Team Room is shared.
- Host exposes Team Room through Tailscale Funnel.
- Teammates do not need Tailscale.

| Port | Purpose |
| --- | --- |
| 5173 | Frontend |
| 8000 | Local Search Django |
| 6333 | Local Qdrant |
| 8100 | Host Team Room only |

# 1. HOST - macOS

### A. Go to repo

Replace the path if your repo is elsewhere.

```sh
cd "/Users/kentnguyen/Documents/AIC2026/Team Repository"
```

### B. Activate venv

```sh
source "/Users/kentnguyen/Documents/AIC2026/TEST/.venv/bin/activate"
```

### C. Pull latest code

```sh
git checkout main
git pull origin main
```

### D. Migrate

```sh
PYTHONPATH="$PWD:$PWD/BackEnd/src" \
python BackEnd/API/manage.py migrate
```

### E. Terminal 1 - Local Search Backend

```sh
PYTHONPATH="$PWD:$PWD/BackEnd/src" \
python BackEnd/API/manage.py runserver 127.0.0.1:8000
```

### F. Terminal 2 - Team Room Backend

```sh
DJANGO_SETTINGS_MODULE=API.team_room_settings \
PYTHONPATH="$PWD:$PWD/BackEnd/src" \
python BackEnd/API/manage.py runserver 127.0.0.1:8100
```

### G. Check Team Room

```sh
curl http://127.0.0.1:8100/api/team-room/health/
curl -i http://127.0.0.1:8100/api/search/
```

Expected health: `{"status":"ok","service":"team-room"}`

Expected `/api/search/`: `404`. If `/api/search/` is not `404`, do not start Funnel.

### H. Terminal 3 - Funnel

```sh
tailscale funnel --help
tailscale funnel --bg 8100
tailscale funnel status
```

Copy the HTTPS URL shown by Tailscale. Example only: `https://your-host.xxxxx.ts.net`

### I. Set Funnel URL

Create `FrontEnd/.env.local`:

```sh
VITE_TEAM_ROOM_BACKEND_URL=https://your-host.xxxxx.ts.net
```

### J. Terminal 4 - Frontend

```sh
cd FrontEnd
npm install
npm run dev
```

Open: http://localhost:5173

# 2. HOST - Windows

Use PowerShell and your actual repo/venv paths.

```powershell
cd "C:\path\to\Team Repository"
.\.venv\Scripts\Activate.ps1
git checkout main
git pull origin main
$env:PYTHONPATH="$PWD;$PWD\BackEnd\src"
python BackEnd\API\manage.py migrate
```

Terminal 1 - Local Search Backend:

```powershell
$env:PYTHONPATH="$PWD;$PWD\BackEnd\src"
python BackEnd\API\manage.py runserver 127.0.0.1:8000
```

Terminal 2 - Team Room Backend:

```powershell
$env:DJANGO_SETTINGS_MODULE="API.team_room_settings"
$env:PYTHONPATH="$PWD;$PWD\BackEnd\src"
python BackEnd\API\manage.py runserver 127.0.0.1:8100
```

Check Team Room:

```powershell
curl.exe http://127.0.0.1:8100/api/team-room/health/
curl.exe -i http://127.0.0.1:8100/api/search/
```

Expected `/api/search/`: `404`. If `/api/search/` is not `404`, do not start Funnel.

Terminal 3 - Funnel:

```powershell
tailscale funnel --help
tailscale funnel --bg 8100
tailscale funnel status
```

Create `FrontEnd\.env.local`:

```text
VITE_TEAM_ROOM_BACKEND_URL=https://your-host.xxxxx.ts.net
```

Terminal 4 - Frontend:

```powershell
cd FrontEnd
npm install
npm run dev
```

Open: http://localhost:5173

# 3. TEAMMATE - macOS

Teammates do not need Tailscale. Start your normal local Qdrant first.

```sh
cd "/path/to/Team Repository"
source "/path/to/venv/bin/activate"
git checkout main
git pull origin main
PYTHONPATH="$PWD:$PWD/BackEnd/src" \
python BackEnd/API/manage.py runserver 127.0.0.1:8000
```

Create `FrontEnd/.env.local`:

```sh
VITE_TEAM_ROOM_BACKEND_URL=https://<FUNNEL_URL_FROM_HOST>
```

```sh
cd FrontEnd
npm install
npm run dev
```

Open: http://localhost:5173

# 4. TEAMMATE - Windows

Teammates do not need Tailscale. Start your normal local Qdrant first.

```powershell
cd "C:\path\to\Team Repository"
.\.venv\Scripts\Activate.ps1
git checkout main
git pull origin main
$env:PYTHONPATH="$PWD;$PWD\BackEnd\src"
python BackEnd\API\manage.py runserver 127.0.0.1:8000
```

Create `FrontEnd\.env.local`:

```text
VITE_TEAM_ROOM_BACKEND_URL=https://<FUNNEL_URL_FROM_HOST>
```

```powershell
cd FrontEnd
npm install
npm run dev
```

Open: http://localhost:5173

# 5. Create / Join Room

1. Everyone opens http://localhost:5173.
2. Everyone must use the same Funnel URL in `.env.local`.
3. Host/member clicks `CREATE NEW ROOM`.
4. Copy `AIC-XXXXXXX`.
5. Send the room code to teammates.
6. Teammates enter name + room code, then click `JOIN`.
7. Confirm member count is correct.

Only one browser tab is needed.

# 6. Quick Test

- [ ] Host health endpoint returns `200`.
- [ ] Public Funnel health works.
- [ ] Public Funnel `/api/search/` returns `404`.
- [ ] Two teammates can join the same room.
- [ ] User A edits Query 3 -> User B sees it.
- [ ] User B edits Query 20 -> User A sees it.
- [ ] Each machine keeps its own Collection.
- [ ] Each machine keeps its own Top K.
- [ ] Local Search still works if Team Room goes offline.

# 7. Stop After Competition

```sh
tailscale funnel status
tailscale funnel reset
```

Stop Team Room Django `:8100` with Ctrl+C.

# Troubleshooting

| Problem | Check |
| --- | --- |
| Create Room fails | Check `:8100` health and `tailscale funnel status`. |
| Team Room offline | Check `.env.local`, Funnel URL, then restart Vite. |
| Changed `.env.local` but nothing changed | Restart `npm run dev`. |
| Search does not work | Check local Django `:8000` and Qdrant. |
| Funnel public `/api/search/` works | Stop Funnel immediately; Team Room isolation is wrong. |
| Port already in use | Stop the old process before starting another server. |

> IMPORTANT:
> - Never Funnel port `8000`.
> - Never Funnel port `6333`.
> - Never Funnel port `5173`.
> - Only Funnel Team Room port `8100`.
> - `.env.local` is not committed.
> - Restart Vite after changing `.env.local`.
> - Funnel is public Internet; turn it off after use.
