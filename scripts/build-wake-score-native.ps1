param([int]$Parallel = 6)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$nativeRoot = Join-Path $repo '.artifacts\sherpa-score-native'
$archive = Join-Path $nativeRoot 'sherpa-onnx-1.13.6.tar.gz'
$source = Join-Path $nativeRoot 'sherpa-onnx-1.13.6'
$build = Join-Path $nativeRoot 'build'
$sourceSha = '78f5d10f957d2de1867a1e08395e9ec2ec388911c853dd141887396667f3ff34'
New-Item -ItemType Directory -Path $nativeRoot -Force | Out-Null
if (!(Test-Path -LiteralPath $archive)) {
  Invoke-WebRequest -Uri 'https://github.com/k2-fsa/sherpa-onnx/archive/refs/tags/v1.13.6.tar.gz' -OutFile $archive
}
if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $sourceSha) {
  throw 'wake_native_source_hash_mismatch'
}
if (!(Test-Path -LiteralPath (Join-Path $source 'CMakeLists.txt'))) {
  & tar -xzf $archive -C $nativeRoot
  if ($LASTEXITCODE -ne 0) { throw 'wake_native_extract_failed' }
}
Push-Location $repo
try {
  $patch = 'scripts/native/sherpa-onnx-1.13.6-wake-score.patch'
  $directory = '--directory=.artifacts/sherpa-score-native/sherpa-onnx-1.13.6'
  $patched = Select-String -LiteralPath (Join-Path $source 'sherpa-onnx\csrc\keyword-spotter.cc') -SimpleMatch 'wake_score_version' -Quiet
  if ($patched) {
    & git apply --reverse --check $directory $patch
    if ($LASTEXITCODE -ne 0) { throw 'wake_native_patch_conflict' }
  } else {
    & git apply --check $directory $patch
    if ($LASTEXITCODE -ne 0) { throw 'wake_native_patch_conflict' }
    & git apply $directory $patch
    if ($LASTEXITCODE -ne 0) { throw 'wake_native_patch_failed' }
  }
  & cmake -S $source -B $build -G 'Visual Studio 17 2022' -A x64 `
    -DBUILD_SHARED_LIBS=ON -DSHERPA_ONNX_ENABLE_BINARY=OFF `
    -DSHERPA_ONNX_ENABLE_PORTAUDIO=OFF -DSHERPA_ONNX_ENABLE_WEBSOCKET=OFF `
    -DSHERPA_ONNX_ENABLE_TTS=OFF -DSHERPA_ONNX_ENABLE_SPEAKER_DIARIZATION=OFF `
    -DSHERPA_ONNX_BUILD_C_API_EXAMPLES=OFF
  if ($LASTEXITCODE -ne 0) { throw 'wake_native_configure_failed' }
  & cmake --build $build --config Release --target sherpa-onnx-c-api --parallel $Parallel
  if ($LASTEXITCODE -ne 0) { throw 'wake_native_build_failed' }
  & node scripts/prepare-wake-score-native.mjs --install
  if ($LASTEXITCODE -ne 0) { throw 'wake_native_install_failed' }
} finally { Pop-Location }
