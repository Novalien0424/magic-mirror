import { useEffect, useRef, useState } from 'react'
import type { OperatorLoopSnapshot } from '../../shared/operator-loop'
import { getAudioDeviceRouter } from '../audio-devices'
import { startOperatorLoop } from './operator-loop-controller'
import './operator-loop.css'

export function OperatorLoopBlack({ reason = 'operator_loop_pending' }: { reason?: string }): React.JSX.Element {
  return <div className="operator-loop" data-state="black" aria-label={reason} />
}

export function OperatorLoopPlayer({ snapshot }: { snapshot: OperatorLoopSnapshot }): React.JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null), audioRef = useRef<HTMLAudioElement>(null)
  const [ready, setReady] = useState(false)
  const [failure, setFailure] = useState('')
  const { generation, settings } = snapshot
  useEffect(() => {
    const bridge = window.magicMirror, router = getAudioDeviceRouter()
    const refresh = () => { void router.refresh() }
    const unsubscribe = bridge && 'onAvatarControl' in bridge ? bridge.onAvatarControl(command => {
      if (command.type === 'audio_devices') void router.select(command.preferences)
      else if (command.type === 'refresh_audio_devices') refresh()
    }) : undefined
    navigator.mediaDevices?.addEventListener('devicechange', refresh)
    return () => { unsubscribe?.(); navigator.mediaDevices?.removeEventListener('devicechange', refresh) }
  }, [])
  useEffect(() => {
    const video = videoRef.current
    const bridge = window.magicMirror
    setReady(false); setFailure('')
    if (!video || !bridge || !('reportOperatorLoop' in bridge) || !bridge.reportOperatorLoop) {
      setFailure('operator_loop_bridge_unavailable'); return
    }
    return startOperatorLoop({ generation, settings, video, audio: audioRef.current ?? undefined,
      router: getAudioDeviceRouter(), report: report => bridge.reportOperatorLoop?.(report),
      onReady: () => setReady(true), onFailure: reason => { setReady(false); setFailure(reason) } })
  }, [generation, settings.videoId, settings.audioMode, settings.audioId, settings.fit, settings.volume])
  return <div className="operator-loop" data-state={failure ? 'failed' : ready ? 'playing' : 'preparing'}
    aria-label={failure || 'Loop video'}>
    <video ref={videoRef} className="operator-loop__video" style={{ objectFit: settings.fit }} playsInline
      aria-hidden="true" disablePictureInPicture />
    {settings.audioMode === 'separate' && <audio ref={audioRef} aria-hidden="true" />}
  </div>
}
