[CmdletBinding()]
param(
  [string]$SeedToken,
  [int]$Port = 8787
)

$ErrorActionPreference = 'Stop'

function New-SeedToken {
  $bytes = New-Object byte[] 32
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $rng.GetBytes($bytes)
  return [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

if (-not $SeedToken) {
  $SeedToken = if ($env:SEED_TOKEN) { $env:SEED_TOKEN } else { New-SeedToken }
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$apiDir = Join-Path $repoRoot 'apps\api'
$wrangler = Join-Path $repoRoot 'node_modules\.bin\wrangler.cmd'

if (-not (Test-Path -LiteralPath $wrangler)) {
  throw "wrangler.cmd was not found at $wrangler. Run npm install first."
}

$seedUrl = "http://127.0.0.1:$Port/seed"
$logDir = Join-Path $apiDir '.wrangler'
$outLog = Join-Path $logDir 'seed-remote.out.log'
$errLog = Join-Path $logDir 'seed-remote.err.log'

New-Item -ItemType Directory -Force -Path $logDir | Out-Null
Remove-Item -LiteralPath $outLog, $errLog -ErrorAction SilentlyContinue

$wranglerArgs = @(
  'dev', 'src/db/seed.ts',
  '--remote',
  '--ip', '127.0.0.1',
  '--port', "$Port",
  '--show-interactive-dev-session', 'false',
  '--var', "SEED_TOKEN:$SeedToken"
)

Write-Host "Starting a temporary remote seed Worker on 127.0.0.1:$Port ..."

$process = Start-Process -FilePath $wrangler -ArgumentList $wranglerArgs -WorkingDirectory $apiDir -WindowStyle Hidden -PassThru -RedirectStandardOutput $outLog -RedirectStandardError $errLog

try {
  $ready = $false
  for ($attempt = 0; $attempt -lt 300; $attempt++) {
    if ($process.HasExited) {
      break
    }

    $tcpClient = New-Object Net.Sockets.TcpClient
    try {
      $connect = $tcpClient.BeginConnect('127.0.0.1', $Port, $null, $null)
      if ($connect.AsyncWaitHandle.WaitOne(500)) {
        $tcpClient.EndConnect($connect)
        $ready = $true
        break
      }
    } catch {
      # Server is not listening yet.
    } finally {
      $tcpClient.Close()
    }

    Start-Sleep -Milliseconds 300
  }
  if (-not $ready) {
    $stdout = if (Test-Path -LiteralPath $outLog) { Get-Content -LiteralPath $outLog -Raw } else { '' }
    $stderr = if (Test-Path -LiteralPath $errLog) { Get-Content -LiteralPath $errLog -Raw } else { '' }
    throw "wrangler dev --remote did not become ready. Run 'npx wrangler login' first and confirm the Worker is deployed.`nSTDOUT:`n$stdout`nSTDERR:`n$stderr"
  }

  $headers = @{ Authorization = "Bearer $SeedToken" }
  $seedResponse = Invoke-WebRequest -Uri $seedUrl -Method Post -Headers $headers -UseBasicParsing -TimeoutSec 60
  if ($seedResponse.StatusCode -ne 200) {
    throw "Seed endpoint returned HTTP $($seedResponse.StatusCode): $($seedResponse.Content)"
  }

  Write-Host "Remote D1 seed completed."
} finally {
  if ($process -and -not $process.HasExited) {
    & taskkill.exe /PID $process.Id /T /F 2>$null | Out-Null
  }
}
