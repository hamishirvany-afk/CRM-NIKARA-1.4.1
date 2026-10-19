param([string]$Repo = "D:\AI-CRM-Suite-v2.0.0")
$ErrorActionPreference = "Stop"
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
if (!(Test-Path "$Repo\.git")) { throw "Git repo not found: $Repo" }

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backup = Join-Path (Split-Path $Repo -Parent) "CRM-NIKARA-before-1.1.2-FINAL-$stamp"
New-Item -ItemType Directory -Force $backup | Out-Null
foreach ($rel in @("frontend","mobile",".github","tests","VERSION","README.md","PRIVACY_FA.md")) {
  $src = Join-Path $Repo $rel
  if (Test-Path $src) { Copy-Item $src (Join-Path $backup $rel) -Recurse -Force }
}

foreach ($dir in @("frontend","mobile",".github","tests")) {
  $dst = Join-Path $Repo $dir
  if (Test-Path $dst) { Remove-Item $dst -Recurse -Force }
  Copy-Item (Join-Path $Here $dir) $dst -Recurse -Force
}
foreach ($file in @(
  "ARCHITECTURE.md","BUILD_APK_FA.md","CHANGELOG.md","FINAL_RELEASE_AUDIT.md",
  "FINAL_MARKET_AUDIT.txt","FINAL_TEST_REPORT.md","GITHUB_SETUP_FA.md","MARKET_RELEASE_FA.md",
  "MIGRATE_FA.md","PRIVACY_FA.md","PRODUCT_RELEASE_FA.md","QUICKSTART_FA.md","README.md","VERSION",
  "sample_contacts.csv","sample_organizations.csv"
)) {
  Copy-Item (Join-Path $Here $file) (Join-Path $Repo $file) -Force
}

Write-Host ""
Write-Host "CRM-NIKARA 1.1.2 FINAL applied successfully." -ForegroundColor Green
Write-Host "Developer: H.Shirvani"
Write-Host "Backup: $backup"
Write-Host ""
Write-Host "Next commands:" -ForegroundColor Cyan
Write-Host "  cd $Repo"
Write-Host "  git add ."
Write-Host "  git commit -m 'Release CRM-NIKARA v1.1.2 Professional Final'"
Write-Host "  git push"
