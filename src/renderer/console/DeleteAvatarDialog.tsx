import { useEffect, useRef } from 'react'
import * as React from 'react'

export function DeleteAvatarDialog({ name, lockCount, disabled, error, onCancel, onConfirm }: {
  name: string
  lockCount: number
  disabled: boolean
  error: string
  onCancel: () => void
  onConfirm: () => void
}): React.JSX.Element {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => { dialog.current?.showModal() }, [])
  return <dialog ref={dialog} className="console__delete-dialog" aria-labelledby="delete-avatar-title" aria-describedby="delete-avatar-description"
    onCancel={event => { event.preventDefault(); if (!disabled) onCancel() }}>
    <h2 id="delete-avatar-title">Delete {name}?</h2>
    <p id="delete-avatar-description">This removes the avatar’s persona, appearance settings, voice settings and spells from the workspace and Mirror’s avatar list immediately.</p>
    <p>Shared models and media files will be kept.</p>
    {lockCount > 0 && <p>{lockCount} resource access lock(s) owned by this avatar will be removed. Those resources will become shared.</p>}
    {error && <p role="alert">{error}</p>}
    <div className="console__action-row">
      <button type="button" autoFocus disabled={disabled} onClick={onCancel}>Cancel</button>
      <button type="button" className="console__danger" disabled={disabled} onClick={onConfirm}>Confirm deletion</button>
    </div>
  </dialog>
}
