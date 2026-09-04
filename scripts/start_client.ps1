param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$FunnelUrl
)

$ErrorActionPreference = "Stop"

$ScriptDir = $PSScriptRoot
if (-not $ScriptDir) {
    $ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
}
$RepoRoot = Split-Path -Parent $ScriptDir
$FrontendDir = Join-Path $RepoRoot "FrontEnd"

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

function Normalize-TeamRoomUrl {
    param([string]$Value)

    $candidate = [string]$Value
    $candidate = $candidate.Trim()
    if ($candidate.Length -eq 0) {
        return ""
    }

    $uri = $null
    if ([System.Uri]::TryCreate($candidate, [System.UriKind]::Absolute, [ref]$uri)) {
        if ($uri.Scheme -ne "https") {
            return "INVALID_SCHEME"
        }
        return "https://$($uri.Host.TrimEnd(".").ToLowerInvariant())"
    }

    $hostPart = $candidate.Split("/")[0]
    if ($hostPart.Contains("@")) {
        $hostPart = $hostPart.Split("@")[-1]
    }
    if ($hostPart.Contains(":") -and -not $hostPart.StartsWith("[")) {
        $hostPart = $hostPart.Split(":")[0]
    }
    $hostPart = $hostPart.Trim().TrimEnd(".").ToLowerInvariant()
    if (-not $hostPart) {
        return ""
    }
    return "https://$hostPart"
}

function Get-HttpStatus {
    param([string]$Url)
    try {
        $response = Invoke-WebRequest -Uri $Url -Method Get -UseBasicParsing -TimeoutSec 5
        return [int]$response.StatusCode
    } catch {
        if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
            return [int]$_.Exception.Response.StatusCode
        }
        return 0
    }
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

Require-Command python
Require-Command npm

$NormalizedFunnelUrl = Normalize-TeamRoomUrl $FunnelUrl
if ($NormalizedFunnelUrl -eq "INVALID_SCHEME" -or -not $NormalizedFunnelUrl) {
    Write-Fail "Competition Team Room URL must use HTTPS, for example https://xxxxx.ts.net."
    exit 1
}

$healthStatus = Get-HttpStatus "$NormalizedFunnelUrl/api/team-room/health/"
if ($healthStatus -eq 200) {
    Write-Host "Team Room ONLINE."
} else {
    Write-Warning "Team Room health returned HTTP $healthStatus. Local retrieval can still start, but shared Team Room may be unavailable."
}

Ensure-FrontendDependencies
Set-FrontendTeamRoomUrl $NormalizedFunnelUrl
Write-Host "Updated FrontEnd/.env.local with VITE_TEAM_ROOM_BACKEND_URL."

Write-Host "========================================"
Write-Host "AIC2026 CLIENT READY"
Write-Host ""
Write-Host "Frontend:"
Write-Host "http://localhost:5173"
Write-Host ""
Write-Host "Shared Team Room:"
Write-Host "ONLINE"
Write-Host $NormalizedFunnelUrl
Write-Host ""
Write-Host "Local Retrieval:"
Write-Host "Managed independently by the local retrieval stack."
Write-Host "========================================"

Push-Location $FrontendDir
try {
    npm run start:retrieve
    exit $LASTEXITCODE
} finally {
    Pop-Location
}
