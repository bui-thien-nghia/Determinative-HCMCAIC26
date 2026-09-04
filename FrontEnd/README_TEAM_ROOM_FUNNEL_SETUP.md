# AIC2026 Team Room - Competition Startup

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

# Host

macOS:

```sh
./scripts/start_host.sh
```

Windows PowerShell:

```powershell
.\scripts\start_host.ps1
```

# Teammate

macOS:

```sh
./scripts/start_client.sh https://xxxxx.ts.net
```

Windows PowerShell:

```powershell
.\scripts\start_client.ps1 https://xxxxx.ts.net
```

# Competition Flow

1. Open http://localhost:5173.
2. One user clicks `CREATE NEW ROOM`.
3. Send the `AIC-XXXXXXX` room code.
4. Others enter name + room code and click `JOIN`.

# What The Scripts Do

The host script checks Qdrant, frontend dependencies, Tailscale login, Team Room health, Team Room isolation, Django allowed hosts, Funnel public health, and public `/api/search/` isolation before printing the teammate URL.

Both host and teammate scripts preserve unrelated values in `FrontEnd/.env.local` and set `VITE_TEAM_ROOM_BACKEND_URL`.

# Manual Fallback

Run the normal app:

```sh
cd FrontEnd
npm install
npm run start:all
```

Run Team Room only:

```sh
./scripts/start_team_room.sh your-host.xxxxx.ts.net
```

Check isolation before Funnel:

```sh
curl http://127.0.0.1:8100/api/team-room/health/
curl -i http://127.0.0.1:8100/api/search/
```

Only if health is `200` and `/api/search/` is `404`:

```sh
tailscale funnel --bg 8100
tailscale funnel status
```

> IMPORTANT:
> - Never Funnel port `8000`.
> - Never Funnel port `6333`.
> - Never Funnel port `5173`.
> - Only Funnel Team Room port `8100`.
> - `.env.local` is not committed.
> - Restart Vite after changing `.env.local`.
> - Funnel is public Internet; turn it off after use.
