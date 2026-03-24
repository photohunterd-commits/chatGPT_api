param(
    [string]$Configuration = "Release",
    [string]$Runtime = "win-x64"
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$dotnet = Join-Path $env:USERPROFILE ".dotnet\dotnet.exe"
$project = Join-Path $repoRoot "apps/windows-client/ChatGptApi.Desktop/ChatGptApi.Desktop.csproj"
$output = Join-Path $repoRoot "publish/windows-client"

& $dotnet publish $project `
    -c $Configuration `
    -r $Runtime `
    --self-contained false `
    -p:PublishSingleFile=true `
    -o $output

Write-Host "Desktop client published to $output"
