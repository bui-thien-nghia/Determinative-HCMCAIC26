$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent $ScriptDir
$ManagePy = Join-Path $RepoRoot "BackEnd\API\manage.py"

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Error "python was not found. Activate your project venv first, then rerun this script."
    exit 1
}

if (-not (Test-Path $ManagePy)) {
    Write-Error "Django manage.py was not found at $ManagePy"
    exit 1
}

$env:DJANGO_SETTINGS_MODULE = "API.team_room_settings"
$env:PYTHONPATH = "$RepoRoot;$RepoRoot\BackEnd\src"

Set-Location $RepoRoot
python $ManagePy runserver 127.0.0.1:8100
