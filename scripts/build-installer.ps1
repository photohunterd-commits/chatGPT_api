param(
    [string]$Version = "0.0.0-local"
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$installerScript = Join-Path $repoRoot ".github/installer/Gpt54Workspace.iss"
$isccFromPath = Get-Command ISCC.exe -ErrorAction SilentlyContinue
$isccFromPathSource = if ($isccFromPath) { $isccFromPath.Source } else { $null }
$isccCandidates = @(@(
    "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
    "${env:LOCALAPPDATA}\Programs\Inno Setup 6\ISCC.exe",
    $isccFromPathSource
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique)

if ($isccCandidates.Length -eq 0) {
    throw "Inno Setup 6 is not installed. Expected compiler in Program Files or PATH."
}

$iscc = $isccCandidates | Select-Object -First 1

& $iscc "/DAppVersion=$Version" $installerScript

Write-Host "Installer built for version $Version"
