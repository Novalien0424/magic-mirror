import { mkdirSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

if (process.platform === 'darwin') {
  const directory = resolve('out/native')
  mkdirSync(directory, { recursive: true })
  const sdk = spawnSync('xcrun', ['--sdk', 'macosx', '--show-sdk-path'], { encoding: 'utf8' })
  if (sdk.error || sdk.status !== 0) throw Error('camera_tracker_sdk_unavailable')
  const object = `${directory}/camera-usb-reset.o`
  const compiled = spawnSync('xcrun', ['--sdk', 'macosx', 'clang', '-O2', '-Wall', '-Wextra', '-Werror',
    '-isysroot', sdk.stdout.trim(), '-mmacosx-version-min=14.0', '-c',
    'deploy/macos/camera-usb-reset.c', '-o', object], { stdio: 'inherit' })
  if (compiled.error || compiled.status !== 0) throw Error('camera_usb_reset_build_failed')
  const rateObject = `${directory}/camera-rate-probe.o`
  const rateCompiled = spawnSync('xcrun', ['clang', '-O2', '-Wall', '-Wextra', '-Werror', '-fobjc-arc',
    '-isysroot', sdk.stdout.trim(), '-mmacosx-version-min=14.0', '-c',
    'deploy/macos/camera-rate-probe.m', '-o', rateObject], { stdio: 'inherit' })
  if (rateCompiled.error || rateCompiled.status !== 0) throw Error('camera_rate_probe_build_failed')
  const result = spawnSync('xcrun', ['swiftc', '-O', '-swift-version', '5',
    '-sdk', sdk.stdout.trim(), '-import-objc-header', 'deploy/macos/camera-usb-reset.h',
    'deploy/macos/camera-tracker.swift', object, rateObject, '-framework', 'IOKit',
    '-o', `${directory}/camera-tracker`], { stdio: 'inherit' })
  rmSync(object, { force: true })
  rmSync(rateObject, { force: true })
  if (result.error || result.status !== 0) {
    console.error('camera_tracker_build_failed')
    process.exit(result.status || 1)
  }
  console.log('camera_tracker_built platform=darwin')
} else console.log('camera_tracker_not_built reason=unsupported_platform')
