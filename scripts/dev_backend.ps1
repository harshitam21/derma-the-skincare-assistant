$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$python = Resolve-Path (Join-Path $root "..\venv\Scripts\python.exe")

Set-Location -LiteralPath $root
& $python -m uvicorn backend.main:app --host 127.0.0.1 --port 8001
