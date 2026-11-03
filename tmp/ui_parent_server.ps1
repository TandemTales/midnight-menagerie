param(
  [Parameter(Mandatory=$true)][ValidateSet('Start','Stop')][string]$Action,
  [Parameter(Mandatory=$true)][string]$Worktree,
  [Parameter(Mandatory=$true)][int]$Port,
  [Parameter(Mandatory=$true)][string]$Evidence
)
$ErrorActionPreference = 'Stop'
$wt = (Resolve-Path -LiteralPath $Worktree).Path
if ($wt -notmatch '^D:\\UILOOP\\r\d+-20261029\\[abc]$') { throw 'Unexpected isolated worktree' }
if ($Port -lt 9500 -or $Port -gt 9999) { throw 'Unexpected loop port' }
$out = [IO.Path]::GetFullPath($Evidence)
if (-not $out.StartsWith((Split-Path -Parent $wt) + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Evidence must remain inside round directory' }
New-Item -ItemType Directory -Path $out -Force | Out-Null
$record = Join-Path $out 'server.json'
if ($Action -eq 'Start') {
  if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) { throw 'Port already in use' }
  if (Test-Path -LiteralPath $record) { throw 'Server record exists; inspect before starting another server' }
  $owned = Start-Process -FilePath 'C:\Users\Josh\AppData\Local\Programs\Python\Python313\python.exe' -ArgumentList @('tools/devserver.py', "$Port") -WorkingDirectory $wt -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $out 'server.stdout.log') -RedirectStandardError (Join-Path $out 'server.stderr.log')
  Start-Sleep -Seconds 1
  $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$($owned.Id)"
  $listeners = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
  if (-not $proc -or $proc.CommandLine -notmatch "tools[/\\]devserver\.py\s+$Port(?:\s|$)" -or -not ($listeners.OwningProcess -contains $owned.Id)) { throw "Started server $($owned.Id), but verification failed; inspect it before retrying" }
  @{pid=$owned.Id;port=$Port;command=$proc.CommandLine;worktree=$wt;verified=$true} | ConvertTo-Json | Set-Content -LiteralPath $record -Encoding utf8
  Get-Content -LiteralPath $record
} else {
  $saved = Get-Content -LiteralPath $record -Raw | ConvertFrom-Json
  if ($saved.port -ne $Port -or $saved.worktree -ne $wt) { throw 'Server record mismatch' }
  $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$($saved.pid)"
  $listeners = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
  if (-not $proc -or $proc.CommandLine -ne $saved.command -or -not ($listeners.OwningProcess -contains $saved.pid)) { throw 'Owned server identity mismatch; no process stopped' }
  Stop-Process -Id $saved.pid
  Start-Sleep -Seconds 1
  $absent = -not (Get-Process -Id $saved.pid -ErrorAction SilentlyContinue)
  $clear = -not (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
  if (-not $absent -or -not $clear) { throw 'Server shutdown incomplete' }
  @{pid=$saved.pid;port=$Port;pidAbsent=$absent;portClear=$clear;verifiedCommand=$saved.command} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $out 'server-shutdown.json') -Encoding utf8
  Get-Content -LiteralPath (Join-Path $out 'server-shutdown.json')
}
