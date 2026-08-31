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
  setSceneVideoAudio(element: HTMLVideoElement | null, gain?: number): void
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
  const music = new Audio()
  music.crossOrigin = 'anonymous'
  music.src = '/audio/test-music.wav'
  music.preload = 'auto'
  music.loop = true

  const recordedAnalyser = context.createAnalyser()
  const recordedGain = context.createGain()
  recordedAnalyser.connect(recordedGain)
  recordedGain.connect(context.destination)

  const musicSource = context.createMediaElementSource(music)
  const musicAnalyser = context.createAnalyser()
  musicAnalyser.fftSize = 256
  const musicGainNode = context.createGain()
  const backgroundAnalyser = context.createAnalyser()
  backgroundAnalyser.fftSize = 256
  const backgroundDuckGain = context.createGain()
  musicSource.connect(musicAnalyser)
  musicAnalyser.connect(musicGainNode)
  musicGainNode.connect(backgroundAnalyser)
  backgroundAnalyser.connect(backgroundDuckGain)
  backgroundDuckGain.connect(context.destination)

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
  let musicAnalysisGeneration = 0
  let sceneMusicLoadGeneration = 0
  let managedMusicObjectUrl: string | null = null
  let sceneVideoSource: MediaElementAudioSourceNode | null = null
  let sceneVideoGain: GainNode | null = null

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
  const musicPlayFailureReason = (): string =>
    `avatar_music_play_failed:code_${music.error?.code ?? 0}:network_${music.networkState}:ready_${music.readyState}`
  music.addEventListener('waiting', noteMusicUnderrun)
  music.addEventListener('stalled', noteMusicUnderrun)
  music.addEventListener('ended', () => {
    musicPlaying = false
    input.eventSink('avatar_music_completed')
  })

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
        ramp(backgroundDuckGain, target, durationMs)
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
    musicAnalysisGeneration += 1
    ducking.fadeOut()
    if (fadePauseTimer !== null) window.clearTimeout(fadePauseTimer)
    fadePauseTimer = window.setTimeout(() => {
      fadePauseTimer = null
      music.pause()
    }, DUCKING.fadeOutMs)
  }

  const loadManagedMusic = async (assetId: string): Promise<boolean> => {
    const generation = ++sceneMusicLoadGeneration
    const response = await fetch(`magic-mirror-media://music/${encodeURIComponent(assetId)}`)
    if (!response.ok) throw new Error('managed_music_fetch_failed')
    const blob = await response.blob()
    if (disposed || generation !== sceneMusicLoadGeneration) return false
    if (managedMusicObjectUrl !== null) URL.revokeObjectURL(managedMusicObjectUrl)
    managedMusicObjectUrl = URL.createObjectURL(blob)
    music.src = managedMusicObjectUrl
    return true
  }

  const setSceneVideoAudio = (element: HTMLVideoElement | null, gain = 0): void => {
    sceneVideoSource?.disconnect()
    sceneVideoGain?.disconnect()
    sceneVideoSource = null
    sceneVideoGain = null
    if (element === null || disposed) return
    try {
      sceneVideoSource = context.createMediaElementSource(element)
      sceneVideoGain = context.createGain()
      sceneVideoGain.gain.value = unit(gain)
      sceneVideoSource.connect(sceneVideoGain)
      sceneVideoGain.connect(backgroundAnalyser)
      void context.resume().catch(() => input.eventSink('avatar_video_audio_resume_failed'))
    } catch {
      sceneVideoSource = null
      sceneVideoGain = null
      input.eventSink('avatar_video_audio_graph_failed')
    }
  }

  const observeMusicSignal = (generation: number, attempt = 0): void => {
    if (disposed || !musicPlaying || generation !== musicAnalysisGeneration) return
    const samples = new Uint8Array(musicAnalyser.frequencyBinCount)
    musicAnalyser.getByteTimeDomainData(samples)
    if (samples.some((sample) => Math.abs(sample - 128) > 1)) {
      input.eventSink('avatar_music_analyser_active')
      return
    }
    if (attempt >= 39) {
      input.eventSink('avatar_music_analyser_inactive')
      return
    }
    window.setTimeout(() => observeMusicSignal(generation, attempt + 1), 50)
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
    setSceneVideoAudio,
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
        }).then(() => { musicPlaying = true }).catch(() => input.eventSink(musicPlayFailureReason()))
        return
      }
      if (command.type === 'scene_music') {
        if (command.action === 'stop') {
          musicPlaying = false
          musicAnalysisGeneration += 1
          sceneMusicLoadGeneration += 1
          if (fadePauseTimer !== null) window.clearTimeout(fadePauseTimer)
          if (command.fadeDurationMs === 0) {
            music.pause()
            music.currentTime = 0
            input.eventSink('avatar_music_stopped')
            return
          }
          ramp(musicGainNode, 0, command.fadeDurationMs)
          fadePauseTimer = window.setTimeout(() => {
            fadePauseTimer = null
            music.pause()
            music.currentTime = 0
            input.eventSink('avatar_music_stopped')
          }, command.fadeDurationMs)
          return
        }
        if (command.action === 'fade') {
          musicGainSetting = unit(command.targetGain)
          effectiveMusicGain = musicGainSetting
          ramp(musicGainNode, effectiveMusicGain, command.durationMs)
          changed()
          window.setTimeout(() => input.eventSink('avatar_music_fade_completed'), command.durationMs)
          return
        }
        if (fadePauseTimer !== null) {
          window.clearTimeout(fadePauseTimer)
          fadePauseTimer = null
        }
        music.loop = command.loop
        musicGainSetting = unit(command.gain)
        effectiveMusicGain = musicGainSetting
        musicGainNode.gain.value = effectiveMusicGain
        void loadManagedMusic(command.assetId).then(async (loaded) => {
          if (!loaded) return false
          await context.resume()
          await music.play()
          return true
        }).then((played) => {
          if (!played) return
          musicPlaying = true
          musicAnalysisGeneration += 1
          const generation = musicAnalysisGeneration
          changed()
          input.eventSink('avatar_music_started')
          observeMusicSignal(generation)
        }).catch(() => input.eventSink(musicPlayFailureReason()))
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
      setSceneVideoAudio(null)
      musicPlaying = false
      musicAnalysisGeneration += 1
      sceneMusicLoadGeneration += 1
      if (managedMusicObjectUrl !== null) URL.revokeObjectURL(managedMusicObjectUrl)
      managedMusicObjectUrl = null
      if (fadePauseTimer !== null) window.clearTimeout(fadePauseTimer)
      realtimeOutput?.audioElement.removeEventListener('waiting', noteRealtimeUnderrun)
      realtimeOutput?.audioElement.removeEventListener('stalled', noteRealtimeUnderrun)
      realtimeOutput = null
      input.onRecordedOutput(null)
      void context.close().catch(() => undefined)
    },
  })
}
