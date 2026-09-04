$ErrorActionPreference = "Stop"

$ScriptDir = $PSScriptRoot
if (-not $ScriptDir) {
    $ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
}
$RepoRoot = Split-Path -Parent $ScriptDir
$FrontendDir = Join-Path $RepoRoot "FrontEnd"
$TeamRoomScript = Join-Path $ScriptDir "start_team_room.ps1"
$TeamRoomProcess = $null
$FunnelStarted = $false
$FunnelUrl = ""

function Write-Fail {
    param([string]$Message)
    Write-Error $Message
}

function Test-CommandAvailable {
    param([string]$Name)
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Require-Command {
    param([string]$Name)
    if (-not (Test-CommandAvailable $Name)) {
        Write-Fail "$Name was not found. Install or activate it, then retry."
        exit 1
    }
}

function Normalize-TailscaleHost {
    param([string]$Value)

    $candidate = [string]$Value
    $candidate = $candidate.Trim()
    if ($candidate.Length -eq 0) {
        return ""
    }

    $uri = $null
    if ([System.Uri]::TryCreate($candidate, [System.UriKind]::Absolute, [ref]$uri) -and $uri.Host) {
        return $uri.Host.TrimEnd(".").ToLowerInvariant()
    }

    $hostPart = $candidate.Split("/")[0]
    if ($hostPart.Contains("@")) {
        $hostPart = $hostPart.Split("@")[-1]
    }
    if ($hostPart.Contains(":") -and -not $hostPart.StartsWith("[")) {
        $hostPart = $hostPart.Split(":")[0]
    }
    return $hostPart.Trim().TrimEnd(".").ToLowerInvariant()
}

function Normalize-HttpsUrl {
    param([string]$Value)
    $hostName = Normalize-TailscaleHost $Value
    if (-not $hostName) {
        return ""
    }
    return "https://$hostName"
}

function Get-HttpStatus {
    param(
        [string]$Url,
        [string]$HostHeader = ""
    )

    if ($HostHeader -and (Test-CommandAvailable "curl.exe")) {
        try {
            $status = & curl.exe -sS -o NUL -w "%{http_code}" --max-time 5 -H "Host: $HostHeader" $Url
            if ($LASTEXITCODE -eq 0 -and $status -match "^\d+$") {
                return [int]$status
            }
        } catch {
        }
    }

    try {
        $headers = @{}
        if ($HostHeader) {
            $headers["Host"] = $HostHeader
        }
        $response = Invoke-WebRequest -Uri $Url -Method Get -Headers $headers -UseBasicParsing -TimeoutSec 5
        return [int]$response.StatusCode
    } catch {
        if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
            return [int]$_.Exception.Response.StatusCode
        }
        return 0
    }
}

function Wait-ForStatus {
    param(
        [string]$Url,
        [int]$ExpectedStatus,
        [int]$Seconds,
        [string]$HostHeader = ""
    )

    for ($i = 0; $i -lt $Seconds; $i++) {
        if ((Get-HttpStatus -Url $Url -HostHeader $HostHeader) -eq $ExpectedStatus) {
            return $true
        }
        Start-Sleep -Seconds 1
    }
    return $false
}

function Ensure-FrontendDependencies {
    Write-Host "Checking frontend dependencies..."
    Require-Command npm
    $concurrentlyPath = Join-Path $FrontendDir "node_modules\.bin\concurrently.cmd"
    $concurrentlyUnixPath = Join-Path $FrontendDir "node_modules\.bin\concurrently"
    if (-not (Test-Path $concurrentlyPath) -and -not (Test-Path $concurrentlyUnixPath)) {
        Write-Host "Frontend dependencies are missing. Running npm install..."
        Push-Location $FrontendDir
        try {
            npm install
            if ($LASTEXITCODE -ne 0) {
                Write-Fail "npm install failed."
                exit $LASTEXITCODE
            }
        } finally {
            Pop-Location
        }
    }

    if (-not (Test-Path $concurrentlyPath) -and -not (Test-Path $concurrentlyUnixPath)) {
        Write-Fail "concurrently is still unavailable after npm install."
        exit 1
    }
    Write-Host "Frontend dependencies are ready."
}

function Get-TailscaleHostname {
    try {
        $status = tailscale status --json | ConvertFrom-Json
        return Normalize-TailscaleHost $status.Self.DNSName
    } catch {
        return ""
    }
}

function Prompt-TailscaleHostname {
    $hostName = Read-Host "Enter your Tailscale .ts.net hostname"
    return Normalize-TailscaleHost $hostName
}

function Stop-Funnel {
    try {
        $help = tailscale funnel --help 2>&1 | Out-String
        if ($help -match "--https") {
            tailscale funnel --https=443 off | Out-Null
        } else {
            tailscale funnel off | Out-Null
        }
    } catch {
        try {
            tailscale funnel off | Out-Null
        } catch {
            try {
                tailscale funnel --https=443 off | Out-Null
            } catch {
            }
        }
    }
}

function Get-FunnelUrl {
    param([string]$HostName)
    try {
        $status = tailscale funnel status 2>$null | Out-String
        $match = [regex]::Match($status, "https://[A-Za-z0-9.-]+(?::443)?/?")
        if ($match.Success) {
            return (Normalize-HttpsUrl $match.Value)
        }
    } catch {
    }
    return "https://$HostName"
}

function Set-FrontendTeamRoomUrl {
    param([string]$Url)

    $envFile = Join-Path $FrontendDir ".env.local"
    $updated = New-Object System.Collections.Generic.List[string]
    $found = $false

    if (Test-Path $envFile) {
        foreach ($line in [System.IO.File]::ReadAllLines($envFile)) {
            if ($line -match "^VITE_TEAM_ROOM_BACKEND_URL=") {
                if (-not $found) {
                    $updated.Add("VITE_TEAM_ROOM_BACKEND_URL=$Url")
                    $found = $true
                }
            } else {
                $updated.Add($line)
            }
        }
    }

    if (-not $found) {
        $updated.Add("VITE_TEAM_ROOM_BACKEND_URL=$Url")
    }

    $encoding = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($envFile, (($updated.ToArray() -join [Environment]::NewLine) + [Environment]::NewLine), $encoding)
}

function Cleanup {
    if ($script:FunnelStarted) {
        Stop-Funnel
    }
    if ($script:TeamRoomProcess -and -not $script:TeamRoomProcess.HasExited) {
        Stop-Process -Id $script:TeamRoomProcess.Id -ErrorAction SilentlyContinue
    }
}

try {
    Require-Command python
    Require-Command npm
    Require-Command tailscale

    Set-Location $RepoRoot

    Write-Host "Checking Tailscale..."
    tailscale status | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "Tailscale is not logged in or connected. Connect Tailscale, then retry."
        exit 1
    }

    $TailscaleHostname = Get-TailscaleHostname
    if (-not $TailscaleHostname) {
        $TailscaleHostname = Prompt-TailscaleHostname
    }
    if (-not $TailscaleHostname) {
        Write-Fail "No Tailscale hostname was provided. DJANGO_ALLOWED_HOSTS will not use a wildcard."
        exit 1
    }

    Write-Host "Tailscale hostname: $TailscaleHostname"
    Write-Host "DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,$TailscaleHostname"

    Write-Host "Starting Team Room on 127.0.0.1:8100..."
    $PowerShellCommand = Get-Command powershell -ErrorAction SilentlyContinue
    if (-not $PowerShellCommand) {
        $PowerShellCommand = Get-Command pwsh -ErrorAction SilentlyContinue
    }
    if (-not $PowerShellCommand) {
        Write-Fail "PowerShell executable was not found for starting Team Room."
        exit 1
    }
    $PowerShellExe = $PowerShellCommand.Source
    $TeamRoomArgs = "-NoProfile -ExecutionPolicy Bypass -File `"$TeamRoomScript`" `"$TailscaleHostname`""
    $TeamRoomProcess = Start-Process -FilePath $PowerShellExe -ArgumentList $TeamRoomArgs -PassThru -NoNewWindow

    if (-not (Wait-ForStatus "http://127.0.0.1:8100/api/team-room/health/" 200 60)) {
        Write-Fail "Team Room did not become healthy on 127.0.0.1:8100."
        exit 1
    }
    Write-Host "Team Room health: 200"

    $searchStatus = Get-HttpStatus "http://127.0.0.1:8100/api/search/"
    $filterStatus = Get-HttpStatus "http://127.0.0.1:8100/api/filter/"
    if ($searchStatus -ne 404 -or $filterStatus -ne 404) {
        Write-Error "Team Room isolation failed. Funnel was NOT started."
        exit 1
    }
    Write-Host "Team Room isolation: /api/search/ 404, /api/filter/ 404"

    $hostHeaderStatus = Get-HttpStatus -Url "http://127.0.0.1:8100/api/team-room/health/" -HostHeader $TailscaleHostname
    if ($hostHeaderStatus -ne 200) {
        Write-Fail "Host-header health check failed for $TailscaleHostname with HTTP $hostHeaderStatus. Funnel was NOT started."
        exit 1
    }
    Write-Host "Host-header health: 200"

    Write-Host "Starting Tailscale Funnel for port 8100..."
    tailscale funnel --bg 8100
    $FunnelStarted = $true
    $FunnelUrl = Get-FunnelUrl $TailscaleHostname
    Write-Host "Funnel URL: $FunnelUrl"

    if (-not (Wait-ForStatus "$FunnelUrl/api/team-room/health/" 200 60)) {
        Write-Fail "Public Team Room health failed at $FunnelUrl/api/team-room/health/."
        exit 1
    }
    Write-Host "Public Team Room health: 200"

    $publicSearchStatus = Get-HttpStatus "$FunnelUrl/api/search/"
    if ($publicSearchStatus -ne 404) {
        Write-Error "SECURITY CHECK FAILED."
        Write-Error "Public /api/search/ returned HTTP $publicSearchStatus, expected 404. Disabling Funnel."
        Stop-Funnel
        $FunnelStarted = $false
        exit 1
    }
    Write-Host "Public Team Room isolation: /api/search/ 404"

    Set-FrontendTeamRoomUrl $FunnelUrl
    Write-Host "Updated FrontEnd/.env.local with VITE_TEAM_ROOM_BACKEND_URL."

    Ensure-FrontendDependencies

    Write-Host "========================================"
    Write-Host "AIC2026 HOST READY"
    Write-Host ""
    Write-Host "Frontend:"
    Write-Host "http://localhost:5173"
    Write-Host ""
    Write-Host "Team Room:"
    Write-Host "http://127.0.0.1:8100"
    Write-Host ""
    Write-Host "Shared Team Room:"
    Write-Host $FunnelUrl
    Write-Host ""
    Write-Host "SEND THIS URL TO TEAMMATES:"
    Write-Host $FunnelUrl
    Write-Host "========================================"

    Push-Location $FrontendDir
    try {
        npm run start:all
        exit $LASTEXITCODE
    } finally {
        Pop-Location
    }
} finally {
    Cleanup
}
