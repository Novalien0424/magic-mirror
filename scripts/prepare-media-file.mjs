import { mkdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

if (process.platform === 'darwin') {
  const directory = resolve('out/native')
  mkdirSync(directory, { recursive: true })
  const result = spawnSync('xcrun', ['swiftc', '-O', '-swift-version', '5',
    'deploy/macos/media-file-prepare.swift', '-o', `${directory}/media-file-prepare`], { stdio: 'inherit' })
  if (result.error || result.status !== 0) throw Error('media_file_prepare_build_failed')
  const music = spawnSync('xcrun', ['swiftc', '-O', '-swift-version', '5',
    'deploy/macos/music-loop.swift', '-o', `${directory}/music-loop`], { stdio: 'inherit' })
  if (music.error || music.status !== 0) throw Error('music_loop_build_failed')
  const signed = spawnSync('/usr/bin/codesign', ['--force', '--sign', '-', `${directory}/music-loop`], { stdio: 'inherit' })
  if (signed.error || signed.status !== 0) throw Error('music_loop_sign_failed')
  console.log('media_file_prepare_built platform=darwin')
} else console.log('media_file_prepare_not_built reason=unsupported_platform')
