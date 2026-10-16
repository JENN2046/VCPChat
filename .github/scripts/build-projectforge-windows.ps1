param(
    [Parameter(Mandatory = $true)][string]$SourceDirectory,
    [Parameter(Mandatory = $true)][string]$CargoHome,
    [Parameter(Mandatory = $true)][string]$TargetDirectory
)
$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'This build recipe requires Windows.' }
$source = (Resolve-Path -LiteralPath $SourceDirectory).Path.TrimEnd('\', '/')
$cargoRoot = (Resolve-Path -LiteralPath $CargoHome).Path.TrimEnd('\', '/')
$target = [IO.Path]::GetFullPath($TargetDirectory)
if (Test-Path -LiteralPath $target) { throw 'TargetDirectory must be fresh; existing output is never reused or deleted.' }
$compiler = (& rustc --version --verbose) -join "`n"
if ($LASTEXITCODE -ne 0 -or $compiler -notmatch '(?m)^release: 1\.89\.0$' -or
    $compiler -notmatch '(?m)^host: x86_64-pc-windows-msvc$') {
    throw 'Expected Rust 1.89.0 x86_64-pc-windows-msvc.'
}
Write-Output $compiler
# Absolute registry paths become file!()/panic strings in the executable.
# Apply the same canonical paths on developer machines and hosted CI. This
# changes compiler inputs, not the strict post-build PE comparison policy.
$flags = @()
foreach ($mapping in @(@($cargoRoot, '/vcp-build/cargo'), @($source, '/vcp-build/projectforge'))) {
    foreach ($prefix in @($mapping[0], $mapping[0].Replace('\', '/')) | Select-Object -Unique) {
        $flags += '--remap-path-prefix=' + $prefix + '=' + $mapping[1]
    }
}
$names = @('CARGO_HOME', 'CARGO_TARGET_DIR', 'CARGO_ENCODED_RUSTFLAGS', 'RUSTFLAGS')
$saved = @{}
foreach ($name in $names) { $saved[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
try {
    $env:CARGO_HOME = $cargoRoot
    $env:CARGO_TARGET_DIR = $target
    $env:CARGO_ENCODED_RUSTFLAGS = $flags -join [char]31
    $env:RUSTFLAGS = $null
    Push-Location -LiteralPath $source
    try {
        foreach ($verb in @('test', 'build')) {
            & cargo $verb --release --locked --jobs 2 --manifest-path Cargo.toml
            if ($LASTEXITCODE -ne 0) { throw "ProjectForge cargo $verb failed ($LASTEXITCODE)." }
        }
    } finally { Pop-Location }
    $artifact = Join-Path $target 'release/projectforge_indexer.exe'
    Write-Output ('ProjectForge SHA256: ' + (Get-FileHash -Algorithm SHA256 -LiteralPath $artifact).Hash.ToLowerInvariant())
} finally {
    foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name, $saved[$name], 'Process') }
}
