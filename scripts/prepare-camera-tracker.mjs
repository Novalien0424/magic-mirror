import { mkdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

if (process.platform === 'darwin') {
  const directory = resolve('out/native')
  mkdirSync(directory, { recursive: true })
  const result = spawnSync('xcrun', ['swiftc', '-O', '-swift-version', '5',
    'deploy/macos/camera-tracker.swift', '-o', `${directory}/camera-tracker`], { stdio: 'inherit' })
  if (result.error || result.status !== 0) {
    console.error('camera_tracker_build_failed')
    process.exit(result.status || 1)
  }
  console.log('camera_tracker_built platform=darwin')
} else console.log('camera_tracker_not_built reason=unsupported_platform')
