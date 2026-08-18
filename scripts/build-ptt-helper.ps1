$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $root 'native'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
if (-not (Test-Path $vswhere)) { throw 'Visual Studio Build Tools (vswhere.exe) não encontrado.' }
$vs = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (-not $vs) { throw 'MSVC C++ Build Tools não encontrado.' }
$devCmd = Join-Path $vs 'Common7\Tools\VsDevCmd.bat'
$source = Join-Path $root 'build\ptt-helper.cpp'
$output = Join-Path $outDir 'CriaCordPttHelper.exe'
$cmd = 'call "{0}" -arch=x64 -host_arch=x64 >nul && cl.exe /nologo /O2 /MT /EHsc /DUNICODE /D_UNICODE "{1}" /Fe:"{2}" user32.lib' -f $devCmd, $source, $output
cmd.exe /d /s /c $cmd
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $output)) { throw "Falha ao compilar o helper PTT (exit $LASTEXITCODE)." }
Write-Host "PTT helper: $output"
