# BF2 Round Replay - on the BF2 server (Windows): send every finished demo (and round logger file) to one or more replay
# servers over SFTP (the OpenSSH client built into Windows). Run every 2 minutes by a scheduled task (see README);
# each file goes to each target once (marks in state\sent.N\). Settings: bf2replay-upload.conf.ps1 next to this script.
param([string]$Conf = (Join-Path $PSScriptRoot 'bf2replay-upload.conf.ps1'))
$ErrorActionPreference = 'Stop'
$MinAgeSec = 60; $MinBytes = 0; $Since = ''; $StateDir = ''
. $Conf
$State = if ($StateDir) { $StateDir } else { Join-Path $PSScriptRoot 'state' }
New-Item -ItemType Directory -Force -Path $State | Out-Null
$logFile = Join-Path $State 'upload.log'
function Log([string]$m) { Add-Content -Path $logFile -Value ((Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + ' ' + $m) }
# one run at a time
$mutex = New-Object System.Threading.Mutex($false, 'Global\BF2ReplayUpload')
if (-not $mutex.WaitOne(0)) { exit 0 }
try {
  $sftp = Join-Path $env:WINDIR 'System32\OpenSSH\sftp.exe'
  if (-not (Test-Path $sftp)) { $sftp = 'sftp.exe' }
  $files = @(Get-ChildItem -Path $DemoDir -File -Filter '*.bf2demo') + @(Get-ChildItem -Path $DemoDir -File -Filter 'round_*.json')
  foreach ($f in ($files | Sort-Object LastWriteTime)) {
    if (((Get-Date) - $f.LastWriteTime).TotalSeconds -lt $MinAgeSec) { continue }      # still being written
    if ($Since -and $f.LastWriteTime -lt [datetime]$Since) { continue }
    if ($f.Extension -eq '.bf2demo' -and $f.Length -lt $MinBytes) { continue }
    for ($i = 0; $i -lt $Targets.Count; $i++) {
      $sent = Join-Path $State "sent.$i"
      New-Item -ItemType Directory -Force -Path $sent | Out-Null
      $mark = Join-Path $sent $f.Name
      if (Test-Path $mark) { continue }
      $t = $Targets[$i]; $hostPart = $t; $port = '22'
      if ($t -match '^(.+):(\d+)$') { $hostPart = $Matches[1]; $port = $Matches[2] }
      # (sftp batch files want / in paths; under a .part name first, renamed when complete; chmod: the site's decoder runs
      # as another user and must be able to read the file)
      $local = $f.FullName -replace '\\', '/'
      $batch = Join-Path $State 'batch.txt'
      Set-Content -Path $batch -Encoding ASCII -Value @(
        "-rm `"incoming/$($f.Name).part`"",
        "put `"$local`" `"incoming/$($f.Name).part`"",
        "chmod 644 `"incoming/$($f.Name).part`"",
        "rename `"incoming/$($f.Name).part`" `"incoming/$($f.Name)`"")
      $errFile = Join-Path $State 'sftp-error.txt'
      $argLine = "-b `"$batch`" -i `"$Key`" -P $port -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20 $hostPart"
      $p = Start-Process -FilePath $sftp -ArgumentList $argLine -NoNewWindow -Wait -PassThru -RedirectStandardOutput (Join-Path $State 'sftp-out.txt') -RedirectStandardError $errFile
      if ($p.ExitCode -eq 0) { New-Item -ItemType File -Path $mark -Force | Out-Null; Log "sent $($f.Name) to $hostPart" }
      else { Log "FAILED $($f.Name) to $hostPart (exit $($p.ExitCode)): $((Get-Content $errFile -ErrorAction SilentlyContinue) -join ' ')" }
    }
  }
}
catch { Log "ERROR $($_.Exception.Message)" }
finally { $mutex.ReleaseMutex() }
