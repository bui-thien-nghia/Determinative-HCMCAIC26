[CmdletBinding()]
param(
    [string]$FunnelHostname = ""
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent $ScriptDir
$ManagePy = Join-Path $RepoRoot "BackEnd\API\manage.py"

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

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Error "python was not found. Activate your project venv first, then rerun this script."
    exit 1
}

if (-not (Test-Path $ManagePy)) {
    Write-Error "Django manage.py was not found at $ManagePy"
    exit 1
}

$NormalizedHostname = Normalize-TailscaleHost $FunnelHostname
$AllowedHosts = @("localhost", "127.0.0.1")
if ($NormalizedHostname) {
    $AllowedHosts += $NormalizedHostname
}

$env:DJANGO_SETTINGS_MODULE = "API.team_room_settings"
$env:DJANGO_ALLOWED_HOSTS = ($AllowedHosts -join ",")
$env:PYTHONPATH = "$RepoRoot;$RepoRoot\BackEnd\src"

Set-Location $RepoRoot
python $ManagePy runserver 127.0.0.1:8100
