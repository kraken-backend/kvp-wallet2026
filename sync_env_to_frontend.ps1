$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$envFile = Join-Path $root ".env.local"
$outFile = Join-Path $root "frontend\env.js"

if (-not (Test-Path $envFile)) {
  Write-Error ".env.local not found at $envFile"
  exit 1
}

$map = @{
  "WALLET_BACKEND_URL" = "http://localhost:8098"
  "WALLET_PUBLIC_TUNNEL_URL" = "https://your-wallet-tunnel.trycloudflare.com"
  "BLOCKCHAIN_PUBLIC_TUNNEL_URL" = "https://your-blockchain-tunnel.trycloudflare.com"
}

Get-Content $envFile | ForEach-Object {
  $line = $_.Trim()
  if (-not $line -or $line.StartsWith("#")) { return }
  $parts = $line -split "=", 2
  if ($parts.Length -ne 2) { return }
  $key = $parts[0].Trim()
  $val = $parts[1].Trim()
  if ($map.ContainsKey($key)) { $map[$key] = $val }
}

$content = @"
window.__WALLET_CONFIG__ = {
  WALLET_BACKEND_URL: "$($map["WALLET_BACKEND_URL"])",
  WALLET_PUBLIC_TUNNEL_URL: "$($map["WALLET_PUBLIC_TUNNEL_URL"])",
  BLOCKCHAIN_PUBLIC_TUNNEL_URL: "$($map["BLOCKCHAIN_PUBLIC_TUNNEL_URL"])",
};
"@

Set-Content -Path $outFile -Value $content -NoNewline
Write-Output "Generated frontend/env.js from .env.local"
