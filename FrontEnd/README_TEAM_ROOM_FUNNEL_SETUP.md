# AIC2026 Team Room - Competition Startup

Shared Team Room is independent from Qdrant. The host exposes only Team Room through Tailscale Funnel; teammates use the Funnel HTTPS URL from their local frontend.

## Host Startup

macOS:

```sh
./scripts/start_host.sh
```

Windows:

```powershell
.\scripts\start_host.ps1
```

## Client Startup

macOS:

```sh
./scripts/start_client.sh https://xxxxx.ts.net
```

Windows:

```powershell
.\scripts\start_client.ps1 https://xxxxx.ts.net
```

Then open:

http://localhost:5173

## Competition Flow

1. Host sends the Funnel HTTPS URL to teammates.
2. Everyone opens http://localhost:5173.
3. One user clicks `CREATE NEW ROOM`.
4. Send the `AIC-XXXXXXX` room code.
5. Others enter name + room code and click `JOIN`.

## Notes

Qdrant is part of local retrieval only. These Team Room startup scripts do not check or manage Docker/Qdrant.

Only Funnel Team Room port `8100`. Never Funnel port `8000`, `5173`, or local retrieval services.
