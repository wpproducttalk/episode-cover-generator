# Start the WPPT lab; load optional settings from lab/wppt/.env.
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$assetLab = Resolve-Path (Join-Path $here "..\..")
$envPath = Join-Path $here ".env"

function Import-WpptDotEnv {
  param([string]$Path)
  if (-not (Test-Path $Path)) { return }
  Get-Content $Path | ForEach-Object {
    $t = $_.Trim()
    if (-not $t -or $t.StartsWith("#")) { return }
    $i = $t.IndexOf("=")
    if ($i -lt 1) { return }
    $key = $t.Substring(0, $i).Trim()
    $val = $t.Substring($i + 1).Trim()
    if (
      ($val.StartsWith('"') -and $val.EndsWith('"')) -or
      ($val.StartsWith("'") -and $val.EndsWith("'"))
    ) {
      $val = $val.Substring(1, $val.Length - 2)
    }
    if ([string]::IsNullOrWhiteSpace($val)) { return }
    $existing = [Environment]::GetEnvironmentVariable($key, "Process")
    if ([string]::IsNullOrWhiteSpace($existing)) {
      Set-Item -Path "env:$key" -Value $val
    }
  }
}

Import-WpptDotEnv $envPath
Set-Location $assetLab
node (Join-Path $here "serve.mjs")
