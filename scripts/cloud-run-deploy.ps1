param(
  [Parameter(Mandatory = $true)]
  [string]$ProjectId,

  [string]$Region = "us-central1",
  [string]$Service = "ga4-mcp-v2",
  [string]$Repository = "ga4-mcp-v2"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

gcloud config set project $ProjectId

Write-Host "Submitting Cloud Build for V2 (this builds the container and deploys Cloud Run)"
gcloud builds submit $root `
  --project $ProjectId `
  --config "$root\cloudbuild.yaml" `
  --substitutions "_REGION=$Region,_SERVICE=$Service,_REPOSITORY=$Repository"

$serviceUrl = gcloud run services describe $Service `
  --region $Region `
  --project $ProjectId `
  --format "value(status.url)"

Write-Host ""
Write-Host "Cloud Run URL: $serviceUrl"
Write-Host "MCP endpoint:  $serviceUrl/mcp"
Write-Host "Health:        $serviceUrl/health"
Write-Host "Google callback: $serviceUrl/oauth/google/callback"
Write-Host ""
Write-Host "Set APP_BASE_URL to $serviceUrl, add the callback URI on the V2 Google OAuth client, then run cloud-run-set-env.ps1"
