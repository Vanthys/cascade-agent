param(
    [string]$SecretName = "gene-agent",
    [string]$ModalFile = "modal_app.py"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$webDir = Join-Path $repoRoot "web"
$envFile = Join-Path $repoRoot ".env"
$modalPath = Join-Path $repoRoot $ModalFile

if (-not (Test-Path $envFile)) {
    throw "Missing .env file at $envFile"
}

if (-not (Test-Path $modalPath)) {
    throw "Missing Modal entrypoint at $modalPath"
}

Write-Host "Building frontend..."
Push-Location $webDir
try {
    npm install
    npm run build
}
finally {
    Pop-Location
}

Write-Host "Refreshing Modal secret '$SecretName' from .env..."
Push-Location $repoRoot
try {
    uv run modal secret create $SecretName --from-dotenv .env --force

    Write-Host "Deploying Modal app from $ModalFile..."
    $env:PYTHONUTF8 = "1"
    $env:PYTHONIOENCODING = "utf-8"
    uv run modal deploy $ModalFile
}
finally {
    Pop-Location
}
