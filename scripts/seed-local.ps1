[CmdletBinding()]
param(
  [string]$AdminUsername,
  [string]$AdminPasswordHash,
  [string]$SuperCoursePasswordHash,
  [string]$AnbuCoursePasswordHash
)

$ErrorActionPreference = 'Stop'

if (-not $AdminUsername) {
  $AdminUsername = if ($env:ADMIN_USERNAME) { $env:ADMIN_USERNAME } else { 'admin' }
}
if (-not $AdminPasswordHash) {
  $AdminPasswordHash = if ($env:ADMIN_PASSWORD_HASH) { $env:ADMIN_PASSWORD_HASH } else { 'local-dev-admin-hash' }
}
if (-not $SuperCoursePasswordHash) {
  $SuperCoursePasswordHash = if ($env:SUPER_COURSE_PASSWORD_HASH) { $env:SUPER_COURSE_PASSWORD_HASH } else { 'local-dev-super-hash' }
}
if (-not $AnbuCoursePasswordHash) {
  $AnbuCoursePasswordHash = if ($env:ANBU_COURSE_PASSWORD_HASH) { $env:ANBU_COURSE_PASSWORD_HASH } else { 'local-dev-anbu-hash' }
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$apiDir = Join-Path $repoRoot 'apps\api'
$wrangler = Join-Path $repoRoot 'node_modules\.bin\wrangler.cmd'

if (-not (Test-Path -LiteralPath $wrangler)) {
  throw "wrangler.cmd was not found at $wrangler. Run npm install first."
}

$port = 8787
$seedUrl = "http://127.0.0.1:$port/seed"
$logDir = Join-Path $apiDir '.wrangler'
$outLog = Join-Path $logDir 'seed-local.out.log'
$errLog = Join-Path $logDir 'seed-local.err.log'

New-Item -ItemType Directory -Force -Path $logDir | Out-Null
Remove-Item -LiteralPath $outLog, $errLog -ErrorAction SilentlyContinue

$wranglerArgs = @(
  'dev', 'src/db/seed.ts',
  '--local',
  '--ip', '127.0.0.1',
  '--port', "$port",
  '--show-interactive-dev-session', 'false',
  '--var', "SUPER_COURSE_PASSWORD_HASH:$SuperCoursePasswordHash",
  '--var', "ANBU_COURSE_PASSWORD_HASH:$AnbuCoursePasswordHash",
  '--var', "ADMIN_PASSWORD_HASH:$AdminPasswordHash",
  '--var', "ADMIN_USERNAME:$AdminUsername"
)

$process = Start-Process -FilePath $wrangler -ArgumentList $wranglerArgs -WorkingDirectory $apiDir -WindowStyle Hidden -PassThru -RedirectStandardOutput $outLog -RedirectStandardError $errLog

try {
  $ready = $false
  for ($attempt = 0; $attempt -lt 240; $attempt++) {
    if ($process.HasExited) {
      break
    }

    $tcpClient = New-Object Net.Sockets.TcpClient
    try {
      $connect = $tcpClient.BeginConnect('127.0.0.1', $port, $null, $null)
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
    throw "wrangler dev did not become ready.`nSTDOUT:`n$stdout`nSTDERR:`n$stderr"
  }

  $seedResponse = Invoke-WebRequest -Uri $seedUrl -UseBasicParsing -TimeoutSec 30
  if ($seedResponse.StatusCode -ne 200) {
    throw "Seed endpoint returned HTTP $($seedResponse.StatusCode): $($seedResponse.Content)"
  }

  Write-Host "Local D1 seed completed."
} finally {
  if ($process -and -not $process.HasExited) {
    & taskkill.exe /PID $process.Id /T /F 2>$null | Out-Null
  }
}
