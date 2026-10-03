import { useEffect, useRef, useState } from 'react'
import * as React from 'react'
import type { ConsoleBridge } from '../../shared/bridge'
import type { ConsoleConfigPayload } from '../../shared/console-types'
import { avatarActivationReason } from './profile-workspace'

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
    <div className="console__active-avatar-heading">
      <div><p className="console__eyebrow">Active avatar · one at a time</p><h3 id="active-avatar-heading">{active?.name ?? 'Loading avatars…'}</h3></div>
      <span className="console__status console__status--success">On Mirror</span>
    </div>
    <p>Choose the published character visitors will see and hear.</p>
    <div className="console__action-row">
      <label>Choose active avatar<select aria-label="Choose active avatar" value={selectedId} disabled={!catalog || busy}
        onChange={event => { setSelected(event.currentTarget.value); setMessage('') }}>
        {!catalog && <option value="">Loading…</option>}
        {choices?.map(avatar => <option value={avatar.id} key={avatar.id}>{avatar.name}{avatar.id === active?.id ? ' · Active' : ''}</option>)}
      </select></label>
      <button type="button" disabled={!bridge || busy || !!reason} aria-describedby="mirror-avatar-switch-reason" onClick={() => void activate()}>{busy ? 'Switching…' : 'Activate avatar'}</button>
      <button type="button" onClick={onEdit}>Manage avatars</button>
    </div>
    <p id="mirror-avatar-switch-reason" className="console__muted">{reason || 'Activating replaces the current avatar. Only one avatar can be active.'}</p>
    <p role="status" aria-live="polite">{message}</p>
  </section>
}
