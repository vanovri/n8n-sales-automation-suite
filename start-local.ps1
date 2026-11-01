$ErrorActionPreference = 'Stop'
try {
    $health = Invoke-WebRequest -Uri 'http://127.0.0.1:5678/healthz' -UseBasicParsing -TimeoutSec 3
    if ($health.StatusCode -eq 200) { Write-Output 'n8n sudah berjalan: http://localhost:5678'; exit 0 }
} catch { }
$env:N8N_LISTEN_ADDRESS = '127.0.0.1'
$env:N8N_HOST = 'localhost'
$env:NODE_FUNCTION_ALLOW_BUILTIN = 'crypto'
$env:GENERIC_TIMEZONE = 'Asia/Jakarta'
$env:TZ = 'Asia/Jakarta'
$n8nCommand = Join-Path $env:APPDATA 'npm\n8n.cmd'
if (-not (Test-Path -LiteralPath $n8nCommand)) { throw 'Instalasi n8n tidak ditemukan.' }
& $n8nCommand start
