import { useEffect, useRef, useState } from 'react'
import * as React from 'react'
import type { ConsoleBridge } from '../../shared/bridge'
import type { ConsoleConfigPayload } from '../../shared/console-types'
import { avatarActivationReason } from './profile-workspace'
import { HelpButton } from './HelpButton'

export function ActiveAvatarPanel({ payload, bridge, lifecycle, editing, onChanged, onEdit }: {
  payload: ConsoleConfigPayload | null
  bridge: ConsoleBridge | null
  lifecycle?: string
  editing: boolean
  onChanged: () => void
  onEdit: () => void
}): React.JSX.Element {
  const catalog = payload?.active.avatarCatalog
  // Older Console versions saved deletions only in draft. Do not offer those
  // profiles as switch targets; always retain the actual active identity.
  const choices = catalog?.avatars.filter(avatar => avatar.id === catalog.activeAvatarId
    || !payload?.draft.avatarCatalog || payload.draft.avatarCatalog.avatars.some(draft => draft.id === avatar.id))
  const active = catalog?.avatars.find(avatar => avatar.id === catalog.activeAvatarId)
  const [selected, setSelected] = useState('')
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)
  const [message, setMessage] = useState('')
  useEffect(() => { setSelected(catalog?.activeAvatarId ?? '') }, [catalog?.activeAvatarId])
  const selectedId = choices?.some(avatar => avatar.id === selected) ? selected : catalog?.activeAvatarId ?? ''
  const reason = avatarActivationReason(payload, selectedId, editing, lifecycle)
  const activate = async () => {
    if (!bridge || reason || inFlight.current) return
    inFlight.current = true; setBusy(true); setMessage('Switching avatar…')
    try {
      const response = await bridge.loadAvatar(selectedId)
      if (response.ok) {
        const next = response.value.active.avatarCatalog?.avatars.find(avatar => avatar.id === selectedId)
        setMessage(`${next?.name ?? 'Avatar'} is now active. The next wake starts a fresh conversation.`)
        onChanged()
      } else setMessage(`Could not switch avatars: ${response.fields?.[0]?.message ?? response.reason}`)
    } catch { setMessage('Could not switch avatars. Try again.') }
    finally { inFlight.current = false; setBusy(false) }
  }
  return <section className="console__active-avatar" aria-labelledby="active-avatar-heading">
    <div className="console__active-avatar-row">
      <p className="console__active-avatar-name"><span className="console__status console__status--success">On Mirror</span>
        <strong id="active-avatar-heading">{active?.name ?? 'Loading avatars…'}</strong></p>
      <label className="console__inline-field">Choose active avatar<select aria-label="Choose active avatar" value={selectedId} disabled={!catalog || busy}
        onChange={event => { setSelected(event.currentTarget.value); setMessage('') }}>
        {!catalog && <option value="">Loading…</option>}
        {choices?.map(avatar => <option value={avatar.id} key={avatar.id}>{avatar.name}{avatar.id === active?.id ? ' · Active' : ''}</option>)}
      </select></label>
      <HelpButton disabled={!bridge || busy || !!reason} onClick={() => void activate()}
        help={reason || 'Puts the chosen published avatar on the Mirror. Only one avatar is active at a time; the next wake starts a fresh conversation.'}>{busy ? 'Switching…' : 'Activate avatar'}</HelpButton>
      <HelpButton className="console__link" onClick={onEdit} help="Edit each avatar’s persona, appearance, voice, Portrait Studio and scenes.">Manage avatars</HelpButton>
    </div>
    <p className="console__active-avatar-message" role="status" aria-live="polite">{message}</p>
  </section>
}
