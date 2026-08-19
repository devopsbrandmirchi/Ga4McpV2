param(
  [Parameter(Mandatory = $true)]
  [string]$ProjectId,

  [string]$Region = "us-central1",

  [string]$Repository = "ga4-mcp-v2"
)

$ErrorActionPreference = "Stop"

Write-Host "Setting project $ProjectId"
gcloud config set project $ProjectId
if ($LASTEXITCODE -ne 0) { throw "gcloud is not available or the project ID is wrong." }

$apis = @(
  "run.googleapis.com",
  "cloudbuild.googleapis.com",
  "artifactregistry.googleapis.com",
  "analyticsdata.googleapis.com",
  "analyticsadmin.googleapis.com",
  "firestore.googleapis.com",
  "secretmanager.googleapis.com"
)

foreach ($api in $apis) {
  Write-Host "Enabling $api"
  gcloud services enable $api --project $ProjectId
}

$existing = gcloud artifacts repositories describe $Repository `
  --location $Region `
  --project $ProjectId `
  --format "value(name)" 2>$null

if (-not $existing) {
  Write-Host "Creating Artifact Registry repository $Repository in $Region"
  gcloud artifacts repositories create $Repository `
    --repository-format=docker `
    --location $Region `
    --description "GA4 MCP V2 Cloud Run images" `
    --project $ProjectId
}

Write-Host "Google Cloud is ready for V2. Next: .\\scripts\\cloud-run-deploy.ps1 -ProjectId $ProjectId"
