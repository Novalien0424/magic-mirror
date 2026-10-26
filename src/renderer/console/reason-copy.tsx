const COPY: Readonly<Record<string, [string, string]>> = {
  runtime_command_delivered: ['The requested control was applied.', ''],
  operator_loop_music_folder_missing: ['The MusicLoop folder is missing.', 'Create MusicLoop inside the linked shared avatar folder and add music, then press MUSIC LOOP.'],
  operator_loop_music_shared_missing: ['No shared avatar folder is linked.', 'Link the shared folder in Avatars → Media, add its MusicLoop subfolder, then press MUSIC LOOP.'],
  operator_loop_music_empty: ['MusicLoop is empty.', 'Add audio files to the shared folder’s MusicLoop subfolder, then press MUSIC LOOP again.'],
  operator_loop_music_no_playable_tracks: ['None of the MusicLoop tracks could play.', 'Check that the audio files are playable and downloaded from Drive, then press MUSIC LOOP again.'],
  operator_loop_music_start_timeout: ['MusicLoop could not finish preparing in time.', 'Make the music available offline in Drive, then press MUSIC LOOP again.'],
  operator_loop_music_no_outputs: ['No connected audio output is available.', 'Connect a speaker, then press MUSIC LOOP again.'],
  operator_loop_music_route_failed: ['MusicLoop could not connect all audio outputs.', 'Check the connected speakers, then press MUSIC LOOP again.'],
  operator_loop_music_route_incomplete: ['Some connected audio outputs could not join MusicLoop.', 'Check their connection, then press MUSIC LOOP again.'],
  operator_loop_media_unavailable: ['The selected loop media is unavailable.', 'Check the Common folder and select an available video and music track.'],
  operator_loop_operation_timeout: ['Preparing the loop media took too long.', 'A large Google Drive file keeps downloading in the background. Keep this selection and press Save settings again in a moment.'],
  operator_loop_playback_stalled: ['Loop playback stopped advancing after its recovery attempt.', 'The Mirror stays black. Try Play on Mirror again or Return to Avatar.'],
  operator_loop_output_unavailable: ['The loop audio output is unavailable.', 'Check the selected speaker in System audio settings, then retry.'],
  operator_loop_release_failed: ['Playback could not finish stopping.', 'Voice stays off. Use STOP MIRROR, then START MIRROR to restore the app.'],
  operator_loop_start_failed: ['Loop playback could not start.', 'Check the playback detail and Common media, then retry.'],
  console_config_invalid: ['Some settings are incomplete or invalid.', 'Review the highlighted fields, then save again.'],
  invalid_avatar_catalog: ['An avatar setting is incomplete.', 'Check the avatar name, rig and presentation settings.'],
  console_data_plane_unavailable: ['The Console cannot reach the app.', 'Reopen the Console; restart the app if this continues.'],
  console_runtime_timeout: ['Live status is unavailable.', 'The app did not respond within two seconds. Status checks will retry automatically.'],
  config_service_unavailable: ['Saved settings are unavailable.', 'Retry loading settings before editing or publishing.'],
  wake_worker_unavailable: ['The wake listener is unavailable.', 'Check the microphone connection and restart the listener.'],
  wake_worker_stalled: ['The microphone stopped delivering audio.', 'Check its cable, mute button and selected input.'],
  media_discovery_no_match: ['No matching local media was found.', 'Check the filename or add an alias in the media library.'],
  youtube_search_not_configured: ['YouTube search is not configured.', 'Configure the YouTube API key or provide a video link.'],
  youtube_search_quota_exceeded: ['The YouTube search quota is exhausted.', 'Use a known video link or try after the quota resets.'],
  memory_identity_required: ['Private memory is locked.', 'Confirm the person in a conversation before recalling private memory.'],
  memory_unavailable: ['Private memory is temporarily unavailable.', 'Conversation can continue; retry the memory request later.'],
  avatar_viewport_landscape: ['The Mirror display is landscape.', 'Restore the portrait TV layout; the avatar remains usable.'],
  avatar_audio_suspend_failed: ['Idle audio could not be suspended.', 'Playback can continue; restart the app if it persists.'],
  avatar_thinking_without_output: ['No spoken output arrived after the turn.', 'The avatar is listening again; check connection events if this repeats.'],
  voice_preview_cancelled: ['Voice preview stopped.', ''],
  audio_output_default_fallback: ['Playback is using the system default speaker.', 'Check the selected output device if this was unexpected.'],
}

export function reasonCopy(code: string): { message: string; recovery: string } {
  const key = code.replace(/^cause=/, '').split(/[;:]/)[0]!
  const exact = COPY[key]
  if (exact) return { message: exact[0], recovery: exact[1] }
  if (/(?:^|_)(ready|complete|completed|accepted|passed|saved|published|stopped|cancelled)$/.test(key)) {
    return { message: `${key.replaceAll('_', ' ')}.`.replace(/^./, letter => letter.toUpperCase()), recovery: '' }
  }
  const area = key.startsWith('wake_') ? 'Wake listening' : key.startsWith('audio_') || key.startsWith('voice_') ? 'Audio'
    : key.startsWith('avatar_') || key.startsWith('cubism_') ? 'Avatar rendering' : key.startsWith('media_') || key.startsWith('visual_') ? 'Media playback'
      : key.startsWith('realtime_') ? 'Conversation connection' : key.startsWith('memory_') ? 'Private memory' : 'This operation'
  return { message: `${area} needs attention.`, recovery: 'Check the relevant settings and connection, then retry. Technical details are below.' }
}

/** Codes are application metadata, not dialogue. Keep them available to support. */
export function ReasonDetail({ code }: { code: string }) {
  const copy = reasonCopy(code)
  return <div className="console-reason"><span>{copy.message} {copy.recovery}</span>
    <details><summary>Technical detail</summary><code>{code}</code></details></div>
}

export function OperatorMessage({ text }: { text: string }) {
  const code = text.match(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/)?.[0]
  if (!code) return <>{text}</>
  return <><span>{operatorMessageText(text)}</span><details><summary>Technical detail</summary><span>{text}</span></details></>
}

export function operatorMessageText(text: string): string {
  const code = text.match(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/)?.[0]
  if (!code) return text
  const copy = reasonCopy(code)
  const message = text === code ? copy.message : text.replace(code, copy.message.replace(/\.$/, ''))
  return `${message} ${copy.recovery}`
}
