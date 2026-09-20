param(
  [string]$RegistryName = $env:AZURE_CONTAINER_REGISTRY,
  [string]$Repository = $env:AZURE_CONTAINER_IMAGE
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

Invoke-NativeCommand "az" @("acr", "login", "--name", $RegistryName)
Invoke-NativeCommand "docker" @("build", "--tag", $Image, ".")
Invoke-NativeCommand "docker" @("push", $Image)

Write-Host "`n✓ $Image wurde gebaut und gepusht."
