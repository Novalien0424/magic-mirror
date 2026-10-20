import { mkdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

if (process.platform === 'darwin') {
  const directory = resolve('out/native')
  mkdirSync(directory, { recursive: true })
  const result = spawnSync('xcrun', ['swiftc', '-O', '-swift-version', '5',
    'deploy/macos/media-file-prepare.swift', '-o', `${directory}/media-file-prepare`], { stdio: 'inherit' })
  if (result.error || result.status !== 0) throw Error('media_file_prepare_build_failed')
  console.log('media_file_prepare_built platform=darwin')
} else console.log('media_file_prepare_not_built reason=unsupported_platform')
