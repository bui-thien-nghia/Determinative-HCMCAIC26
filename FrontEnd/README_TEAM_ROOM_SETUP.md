# Shared Team Room Setup

## 1. Architecture Overview

Each teammate runs their own frontend, Django retrieval backend, Qdrant, collections, and dataset folder locally. Only Shared Team Room traffic goes to one shared Django host through Tailscale.

Normal search:

```text
browser -> local Vite -> local Django -> local Qdrant
```

Shared Team Room:

```text
browser -> local Vite dedicated Team Room proxy -> Tailscale -> shared Django -> TeamRoom DB
```

Do not expose Qdrant through Tailscale for Team Room.

## 2. What Stays Local

- Collection name
- Dataset folder
- Qdrant
- Top K
- Fast / Deep
- Visual / Textual / Hybrid
- Schema filters
- Search text and search results
- Search history
- Preview and video modal state
- Current video and current frame
- Active query navigation

## 3. What Is Shared

- Team Answer Workspace package structure
- Query count
- Filename template
- Query types
- KIS candidates
- Q&A candidates and answers
- TRAKE sequences
- Required TRAKE event count
- Submission-relevant package data

## 4. Host Setup - macOS

1. Pull the current repository branch.
2. Activate the Python environment.
3. From the repository root, apply migrations:

```sh
PYTHONPATH="$PWD:$PWD/BackEnd/src" python BackEnd/API/manage.py migrate
```

4. Verify the Team Room migration:

```sh
PYTHONPATH="$PWD:$PWD/BackEnd/src" python BackEnd/API/manage.py showmigrations api_app
```

Confirm `0001_team_room` is marked `[X]`.

5. Connect Tailscale.
6. Get the Tailscale IPv4:

```sh
tailscale ip -4
```

7. Allow the host name/IP through Django:

```sh
export DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,<HOST_TAILSCALE_IP>
```

8. Start Django on all interfaces:

```sh
PYTHONPATH="$PWD:$PWD/BackEnd/src" python BackEnd/API/manage.py runserver 0.0.0.0:8000
```

9. If teammates cannot reach the host, check whether macOS Firewall needs to allow incoming Python connections.
10. Give teammates this Shared Room URL:

```text
http://<HOST_TAILSCALE_IP>:8000
```

## 5. Host Setup - Windows

1. Pull the current repository branch.
2. Activate the Python environment in PowerShell.
3. From the repository root, apply migrations:

```powershell
$env:PYTHONPATH="$PWD;$PWD\BackEnd\src"
python BackEnd\API\manage.py migrate
```

4. Verify the Team Room migration:

```powershell
$env:PYTHONPATH="$PWD;$PWD\BackEnd\src"
python BackEnd\API\manage.py showmigrations api_app
```

Confirm `0001_team_room` is marked `[X]`.

5. Connect Tailscale.
6. Get the Tailscale IPv4:

```powershell
tailscale ip -4
```

7. Allow the host name/IP through Django:

```powershell
$env:DJANGO_ALLOWED_HOSTS="localhost,127.0.0.1,<HOST_TAILSCALE_IP>"
```

8. Start Django on all interfaces:

```powershell
$env:PYTHONPATH="$PWD;$PWD\BackEnd\src"
python BackEnd\API\manage.py runserver 0.0.0.0:8000
```

9. Windows Defender Firewall may prompt for Python/Django network access. Allow it if this Windows machine is the Team Room host.
10. Give teammates this Shared Room URL:

```text
http://<HOST_TAILSCALE_IP>:8000
```

## 6. Client Setup - macOS

Run local Qdrant, local Django, and local Vite as usual. In `FrontEnd/.env.local`, set:

```sh
VITE_TEAM_ROOM_BACKEND_URL=http://<HOST_TAILSCALE_IP>:8000
```

Then restart Vite:

```sh
cd FrontEnd
npm run dev
```

Vite reads environment variables at startup.

## 7. Client Setup - Windows

Run local Qdrant, local Django, and local Vite as usual. In `FrontEnd\.env.local`, set:

```text
VITE_TEAM_ROOM_BACKEND_URL=http://<HOST_TAILSCALE_IP>:8000
```

Then restart Vite:

```powershell
cd FrontEnd
npm run dev
```

Vite reads environment variables at startup.

## 8. Tailscale Setup

All teammates must be connected to the same Tailscale network or shared device network. Clients only need access to the shared Django port. They do not need access to the host machine's Qdrant.

## 9. Connectivity Test

From a client machine:

```sh
curl http://<HOST_TAILSCALE_IP>:8000/api/team-room/AIC-2222222/
```

A `404` JSON response with `Room not found.` proves Django is reachable. A connection failure means the host, Tailscale, bind address, or firewall is blocking access.

## 10. Create/Join Room

1. The host starts Django on `0.0.0.0:8000`.
2. Every client sets `VITE_TEAM_ROOM_BACKEND_URL` to the host Tailscale URL and restarts Vite.
3. One teammate clicks `Create New Room`.
4. Share the generated `AIC-XXXXXXX` room code.
5. Other teammates enter the code and join.

## 11. Troubleshooting

- `Could not reach Shared Room server.`: verify Tailscale, host Django, firewall, and `VITE_TEAM_ROOM_BACKEND_URL`.
- `Room not found.`: verify the room code.
- `DisallowedHost`: add the Tailscale IP or hostname to `DJANGO_ALLOWED_HOSTS` and restart Django.
- Browser CORS errors: use the Vite proxy path by keeping `VITE_TEAM_ROOM_BACKEND_URL` in `FrontEnd/.env.local`; do not call the remote host directly from browser code.
- Normal search failing while Team Room works: check the local Django/Qdrant setup on that teammate's machine.
- Team Room offline while search works: check the shared Django host only.

## 12. Competition-Day Checklist

- Host has applied migrations.
- Host confirmed `api_app 0001_team_room` is `[X]`.
- Host is connected to Tailscale.
- Host Django is running on `0.0.0.0:8000`.
- Host `DJANGO_ALLOWED_HOSTS` includes localhost and the Tailscale IP/hostname.
- Clients have local Qdrant, local Django, and local Vite running.
- Clients have `FrontEnd/.env.local` pointing to the shared Django URL.
- Clients restarted Vite after editing `.env.local`.
- One teammate can create a room.
- Another teammate can join the room.
- Presence shows the joined teammates.
- Query edits sync both ways.
- Normal search still uses local Django and local Qdrant on each machine.
