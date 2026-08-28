import type { AvatarControlCommand } from '../../../shared/bridge'
import type { LifecycleState } from '../../../shared/types'
import type { RealtimeAudioOutput } from '../../realtime/realtime-audio-output'
import type { AvatarAudioActivity, AvatarAudioOutput } from './avatar-audio-coordinator'
import { createMusicDuckingController } from './music-ducking'

export interface AvatarMediaSnapshot {
  readonly voiceGain: number
  readonly musicGain: number
  readonly audioUnderruns: number
}

export interface AvatarMediaController {
  setRealtimeOutput(output: RealtimeAudioOutput | null): void
  handleActivity(activity: AvatarAudioActivity): void
  setLifecycle(state: LifecycleState): void
  handleCommand(command: AvatarControlCommand): void
  snapshot(): AvatarMediaSnapshot
  dispose(): void
}

export interface CreateAvatarMediaControllerInput {
  readonly onRecordedOutput: (output: AvatarAudioOutput | null) => void
  readonly onActivity: (activity: AvatarAudioActivity) => void
  readonly onChanged: (snapshot: AvatarMediaSnapshot) => void
  readonly eventSink: (reason: string) => void
}

const DUCKING = Object.freeze({
  normalGain: 1,
  duckedGain: 0.22,
  duckMs: 150,
  restoreMs: 400,
  fadeOutMs: 2_000,
})

function unit(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
}

export function createAvatarMediaController(
  input: CreateAvatarMediaControllerInput,
): AvatarMediaController {
  const context = new AudioContext()
  const music = new Audio('/audio/test-music.wav')
  music.preload = 'auto'
  music.loop = true

  const recordedAnalyser = context.createAnalyser()
  const recordedGain = context.createGain()
  recordedAnalyser.connect(recordedGain)
  recordedGain.connect(context.destination)

  const musicSource = context.createMediaElementSource(music)
  const musicGainNode = context.createGain()
  musicSource.connect(musicGainNode)
  musicGainNode.connect(context.destination)

  let realtimeOutput: RealtimeAudioOutput | null = null
  let voiceGain = 1
  let musicGainSetting = 1
  let effectiveMusicGain = 1
  let audioUnderruns = 0
  let disposed = false
  let musicPlaying = false
  let recordedSource: AudioBufferSourceNode | null = null
  let recordedGeneration = 0
  let fadePauseTimer: number | null = null

  const snapshot = (): AvatarMediaSnapshot => Object.freeze({
    voiceGain,
    musicGain: effectiveMusicGain,
    audioUnderruns,
  })

  const changed = (): void => {
    try { input.onChanged(snapshot()) } catch { /* metrics cannot gate audio */ }
  }

  const noteUnderrun = (): void => {
    audioUnderruns += 1
    changed()
    try { input.eventSink('avatar_audio_underrun') } catch { /* non-gating */ }
  }
  const noteMusicUnderrun = (): void => {
    const atLoopBoundary = Number.isFinite(music.duration)
      && (music.currentTime < 0.25 || music.duration - music.currentTime < 0.25)
    if (musicPlaying && !atLoopBoundary) noteUnderrun()
  }
  const noteRealtimeUnderrun = (): void => noteUnderrun()
  music.addEventListener('waiting', noteMusicUnderrun)
  music.addEventListener('stalled', noteMusicUnderrun)

  const ramp = (gain: GainNode, target: number, durationMs: number): void => {
    const now = context.currentTime
    gain.gain.cancelScheduledValues(now)
    gain.gain.setValueAtTime(gain.gain.value, now)
    gain.gain.linearRampToValueAtTime(unit(target), now + durationMs / 1000)
  }

  const ducking = createMusicDuckingController({
    tuning: DUCKING,
    gain: {
      rampTo: (target, durationMs) => {
        effectiveMusicGain = target * musicGainSetting
        ramp(musicGainNode, effectiveMusicGain, durationMs)
        changed()
      },
    },
    eventSink: (event) => input.eventSink(event.reason),
  })

  const recordedOutput: AvatarAudioOutput = Object.freeze({
    analyser: recordedAnalyser,
    attachAnalyserTap: () => undefined,
  })

  const stopRecorded = (): void => {
    const wasPlaying = recordedSource !== null
    recordedGeneration += 1
    try { recordedSource?.stop() } catch { /* already stopped */ }
    recordedSource?.disconnect()
    recordedSource = null
    if (wasPlaying) {
      ducking.setSpeechActive(false)
      input.onActivity('output_stopped')
      input.onRecordedOutput(null)
    }
  }

  const fadeAndPauseMusic = (): void => {
    musicPlaying = false
    ducking.fadeOut()
    if (fadePauseTimer !== null) window.clearTimeout(fadePauseTimer)
    fadePauseTimer = window.setTimeout(() => {
      fadePauseTimer = null
      music.pause()
    }, DUCKING.fadeOutMs)
  }

  const playRecorded = async (): Promise<void> => {
    stopRecorded()
    const generation = recordedGeneration
    const response = await fetch('/audio/recorded-ai-test.wav')
    if (!response.ok) throw new Error('avatar_recorded_audio_fetch_failed')
    const buffer = await context.decodeAudioData(await response.arrayBuffer())
    if (disposed || generation !== recordedGeneration) return
    const source = context.createBufferSource()
    source.buffer = buffer
    source.connect(recordedAnalyser)
    source.onended = () => {
      if (recordedSource !== source) return
      source.disconnect()
      recordedSource = null
      ducking.setSpeechActive(false)
      input.onActivity('output_stopped')
      input.onRecordedOutput(null)
    }
    recordedSource = source
    ducking.setSpeechActive(true)
    input.onRecordedOutput(recordedOutput)
    input.onActivity('output_started')
    source.start()
    await context.resume()
  }

  return Object.freeze({
    setRealtimeOutput: (output: RealtimeAudioOutput | null): void => {
      realtimeOutput?.audioElement.removeEventListener('waiting', noteRealtimeUnderrun)
      realtimeOutput?.audioElement.removeEventListener('stalled', noteRealtimeUnderrun)
      realtimeOutput = output
      if (output !== null) {
        output.setVolume(voiceGain)
        output.audioElement.addEventListener('waiting', noteRealtimeUnderrun)
        output.audioElement.addEventListener('stalled', noteRealtimeUnderrun)
      }
    },
    handleActivity: (activity: AvatarAudioActivity): void => {
      if (activity === 'output_started') ducking.setSpeechActive(true)
      if (activity === 'output_stopped' || activity === 'interrupted') {
        ducking.setSpeechActive(false)
        if (activity === 'interrupted') stopRecorded()
      }
    },
    setLifecycle: (state: LifecycleState): void => {
      if (state === 'dormant' || state === 'suspending' || state === 'offlineLoop') fadeAndPauseMusic()
      else {
        if (fadePauseTimer !== null) {
          window.clearTimeout(fadePauseTimer)
          fadePauseTimer = null
        }
        ducking.restore()
      }
    },
    handleCommand: (command: AvatarControlCommand): void => {
      if (disposed) return
      if (command.type === 'recorded_audio') {
        if (command.action === 'stop') {
          stopRecorded()
          return
        }
        void playRecorded().catch(() => input.eventSink('avatar_recorded_audio_play_failed'))
        return
      }
      if (command.type === 'music') {
        if (command.action === 'stop') {
          fadeAndPauseMusic()
          return
        }
        if (fadePauseTimer !== null) {
          window.clearTimeout(fadePauseTimer)
          fadePauseTimer = null
        }
        void context.resume().then(() => {
          ducking.restore()
          return music.play()
        }).then(() => { musicPlaying = true }).catch(() => input.eventSink('avatar_music_play_failed'))
        return
      }
      if (command.type === 'voice_gain') {
        voiceGain = unit(command.value)
        recordedGain.gain.value = voiceGain
        realtimeOutput?.setVolume(voiceGain)
        changed()
        return
      }
      if (command.type === 'music_gain') {
        musicGainSetting = unit(command.value)
        effectiveMusicGain = musicGainSetting
        musicGainNode.gain.value = effectiveMusicGain
        changed()
      }
    },
    snapshot,
    dispose: (): void => {
      if (disposed) return
      disposed = true
      stopRecorded()
      music.pause()
      musicPlaying = false
      if (fadePauseTimer !== null) window.clearTimeout(fadePauseTimer)
      realtimeOutput?.audioElement.removeEventListener('waiting', noteRealtimeUnderrun)
      realtimeOutput?.audioElement.removeEventListener('stalled', noteRealtimeUnderrun)
      realtimeOutput = null
      input.onRecordedOutput(null)
      void context.close().catch(() => undefined)
    },
  })
}
