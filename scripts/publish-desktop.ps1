param(
    [string]$Configuration = "Release",
    [string]$Runtime = "win-x64"
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$project = Join-Path $repoRoot "apps/windows-client/ChatGptApi.Desktop/ChatGptApi.Desktop.csproj"
$output = Join-Path $repoRoot "publish/windows-client"
$dotnetFromPath = Get-Command dotnet -ErrorAction SilentlyContinue
$dotnetFromPathSource = if ($dotnetFromPath) { $dotnetFromPath.Source } else { $null }
$dotnetCandidates = @(@(
    (Join-Path $env:USERPROFILE ".dotnet\dotnet.exe"),
    $dotnetFromPathSource
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique)

if ($dotnetCandidates.Length -eq 0) {
    throw "dotnet SDK was not found. Install .NET 8 SDK or add dotnet to PATH."
}

$dotnet = $dotnetCandidates | Select-Object -First 1

New-Item -ItemType Directory -Force -Path $output | Out-Null

& $dotnet publish $project `
    -c $Configuration `
    -r $Runtime `
    --self-contained true `
    -p:PublishSingleFile=true `
    -p:DebugType=None `
    -p:DebugSymbols=false `
    -o $output

Write-Host "Desktop client published to $output"
