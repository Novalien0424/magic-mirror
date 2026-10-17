import React, { useId, useState, type ButtonHTMLAttributes } from 'react'

/** Help is available to pointer and keyboard users, including disabled actions. */
export function HelpButton({ help, children, disabled, placement = 'above', helpId, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
  help: string
  /** Stable id for the help text when other code refers to it. */
  helpId?: string
  /** Controls near the top of the window open their help below. */
  placement?: 'above' | 'below'
}): React.JSX.Element {
  const generated = useId()
  const id = helpId ?? generated
  const [dismissed, setDismissed] = useState(false)
  return <span className="console-help" data-placement={placement === 'below' ? 'below' : undefined} data-dismissed={dismissed || undefined}
    tabIndex={disabled ? 0 : undefined} aria-describedby={disabled ? id : undefined}
    onKeyDown={e => { if (e.key === 'Escape') setDismissed(true) }}
    onFocus={() => setDismissed(false)} onMouseEnter={() => setDismissed(false)}>
    <button type="button" {...props} disabled={disabled} aria-describedby={id}>{children}</button>
    <span role="tooltip" id={id}>{help}</span>
  </span>
}

/** A small “?” beside a heading or status: help on hover or keyboard focus, never a click target of its own. */
export function InfoTip({ help, label, placement = 'above' }: { help: string; label: string; placement?: 'above' | 'below' }): React.JSX.Element {
  const id = useId()
  const [dismissed, setDismissed] = useState(false)
  return <span className="console-help info-tip" data-placement={placement === 'below' ? 'below' : undefined} data-dismissed={dismissed || undefined}
    tabIndex={0} role="button" aria-label={`Help: ${label}`} aria-describedby={id}
    onKeyDown={e => { if (e.key === 'Escape') setDismissed(true) }}
    onFocus={() => setDismissed(false)} onMouseEnter={() => setDismissed(false)}>
    <span aria-hidden="true" className="info-tip__glyph">?</span>
    <span role="tooltip" id={id}>{help}</span>
  </span>
}
