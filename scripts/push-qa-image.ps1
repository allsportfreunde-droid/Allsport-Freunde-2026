param(
  [string]$RegistryName = $env:AZURE_CONTAINER_REGISTRY,
  [string]$Repository = $env:AZURE_CONTAINER_IMAGE,
  [string]$EnvFile = ".env"
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($RegistryName)) {
  $RegistryName = "allsportfreundeprod"
}
if ([string]::IsNullOrWhiteSpace($Repository)) {
  $Repository = "allsport-freunde"
}

if ($RegistryName -notmatch "^[a-zA-Z0-9]+$") {
  throw "Ungültiger Azure Container Registry-Name: $RegistryName"
}
if ($Repository -notmatch "^[a-zA-Z0-9]+(?:[._-][a-zA-Z0-9]+)*$") {
  throw "Ungültiger Docker-Repository-Name: $Repository"
}

$Image = "$RegistryName.azurecr.io/${Repository}:qa"

function Invoke-NativeCommand {
  param(
    [Parameter(Mandatory = $true)][string]$Command,
    [Parameter(Mandatory = $true)][string[]]$Arguments
  )

  Write-Host "`n> $Command $($Arguments -join ' ')"
  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Command ist mit Exit-Code $LASTEXITCODE fehlgeschlagen."
  }
}

# Next.js inlines NEXT_PUBLIC_* at build time (also in the middleware), so they
# must be passed as build args. Process env wins over the env file.
function Get-BuildValue {
  param([Parameter(Mandatory = $true)][string]$Name)

  $Value = [Environment]::GetEnvironmentVariable($Name)
  if ([string]::IsNullOrWhiteSpace($Value) -and (Test-Path $EnvFile)) {
    $Line = Get-Content $EnvFile | Where-Object { $_ -match "^\s*$Name\s*=" } | Select-Object -Last 1
    if ($Line) {
      $Value = ($Line -replace "^\s*$Name\s*=\s*", "").Trim().Trim('"').Trim("'")
    }
  }
  if ([string]::IsNullOrWhiteSpace($Value)) {
    throw "$Name fehlt (weder als Umgebungsvariable noch in $EnvFile gesetzt)."
  }
  return $Value
}

$SupabaseUrl = Get-BuildValue "NEXT_PUBLIC_SUPABASE_URL"
$SupabaseAnonKey = Get-BuildValue "NEXT_PUBLIC_SUPABASE_ANON_KEY"
Write-Host "Supabase-URL fuer den Build: $SupabaseUrl"

Invoke-NativeCommand "az" @("acr", "login", "--name", $RegistryName)
Invoke-NativeCommand "docker" @(
  "build",
  "--build-arg", "NEXT_PUBLIC_SUPABASE_URL=$SupabaseUrl",
  "--build-arg", "NEXT_PUBLIC_SUPABASE_ANON_KEY=$SupabaseAnonKey",
  "--tag", $Image,
  "."
)
Invoke-NativeCommand "docker" @("push", $Image)

Write-Host "`nOK: $Image wurde gebaut und gepusht."
