$ErrorActionPreference = "Stop"

Write-Host "FounderChatters preflight"

$required = @("node", "npm", "docker")
foreach ($cmd in $required) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
    throw "Missing required command: $cmd"
  }
}

node --version
npm --version
docker --version

Write-Host "Preflight OK"
