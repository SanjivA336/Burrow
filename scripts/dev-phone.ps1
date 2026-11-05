# Starts everything the "Burrow Dev" phone app needs, each in its own window:
#   1. the backend (this computer), allowed to be called from the dev app's address
#   2. the frontend dev server in phone mode
#   3. the Cloudflare tunnel that makes both reachable at dev.burrowapp.site / dev-api.burrowapp.site
# Close the three windows to stop. The dev app on the phone then simply stops loading.
#
#   powershell -ExecutionPolicy Bypass -File scripts\dev-phone.ps1
#
# One-time setup is in DEPLOYMENT.md ("Testing on a phone without deploying").

$repo = Split-Path -Parent $PSScriptRoot
$cloudflared = 'C:\Program Files (x86)\cloudflared\cloudflared.exe'

# Environment variables beat .env, so this allows the dev app's address without editing .env.
$backend = "`$env:CORS_ORIGINS='http://localhost:5173,https://dev.burrowapp.site'; " +
  "Set-Location '$repo\backend'; uv run uvicorn app.main:app --reload --port 8000"
$frontend = "Set-Location '$repo\frontend'; npm run dev:phone"
$tunnel = "& '$cloudflared' tunnel run burrow-dev"

foreach ($command in @($backend, $frontend, $tunnel)) {
  Start-Process powershell -ArgumentList '-NoExit', '-Command', $command
}
Write-Host 'Started. Open the Burrow Dev app on your phone (dev.burrowapp.site).'
