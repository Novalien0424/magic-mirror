import React, { useId, useState, type ButtonHTMLAttributes } from 'react'

/** Help is available to pointer and keyboard users, including disabled actions. */
export function HelpButton({ help, children, disabled, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { help: string }): React.JSX.Element {
  const id = useId()
  const [dismissed, setDismissed] = useState(false)
  return <span className="console-help" data-dismissed={dismissed || undefined}
    tabIndex={disabled ? 0 : undefined} aria-describedby={disabled ? id : undefined}
    onKeyDown={e => { if (e.key === 'Escape') setDismissed(true) }}
    onFocus={() => setDismissed(false)} onMouseEnter={() => setDismissed(false)}>
    <button type="button" {...props} disabled={disabled} aria-describedby={id}>{children}</button>
    <span role="tooltip" id={id}>{help}</span>
  </span>
}
