import React, { Children, cloneElement, isValidElement, useEffect, useId, useLayoutEffect, useRef, useState,
  type LabelHTMLAttributes, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export function placeFieldHelp(anchor: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>,
  popup: Pick<DOMRect, 'width' | 'height'>, viewport: { width: number; height: number }): { left: number; top: number } {
  const left = Math.max(12, Math.min(anchor.right - popup.width, viewport.width - popup.width - 12))
  const below = anchor.bottom + 8
  const top = Math.max(12, Math.min(below + popup.height <= viewport.height - 12 ? below : anchor.top - popup.height - 8,
    viewport.height - popup.height - 12))
  return { left, top }
}

const isControl = (type: unknown): boolean => type === 'input' || type === 'select' || type === 'textarea'
function labelText(children: ReactNode): string {
  return Children.toArray(children).map(child => {
    if (typeof child === 'string' || typeof child === 'number') return String(child)
    if (!isValidElement<{ children?: ReactNode }>(child) || isControl(child.type)) return ''
    return labelText(child.props.children)
  }).join('').trim()
}

/** The help trigger is outside the label and stays available in disabled fieldsets. */
export function HelpField({ help, children, className = '', helpLabel, descriptionId, ...labelProps }:
  LabelHTMLAttributes<HTMLLabelElement> & { help: string; helpLabel?: string; descriptionId?: string }): React.JSX.Element {
  const generatedId = useId()
  const id = descriptionId ?? generatedId
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ left: 12, top: 12 })
  const trigger = useRef<HTMLSpanElement>(null), popup = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const interaction = useRef({ hovered: false, focused: false, pinned: false, dismissed: false })
  const name = helpLabel ?? labelText(children)
  let checkbox = false
  const describe = (nodes: ReactNode): ReactNode => Children.map(nodes, child => {
    if (!isValidElement<Record<string, unknown>>(child)) return child
    if (isControl(child.type)) {
      checkbox ||= child.props.type === 'checkbox'
      return cloneElement(child, { 'aria-describedby': [child.props['aria-describedby'], id].filter(Boolean).join(' ') })
    }
    return child.props.children ? cloneElement(child, {}, describe(child.props.children as ReactNode)) : child
  })
  const fields = describe(children)
  const dismiss = (): void => {
    clearTimeout(timer.current)
    interaction.current.pinned = false; interaction.current.dismissed = true; setOpen(false)
  }
  const leave = (): void => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const state = interaction.current
      if (!state.hovered && !state.focused && !state.pinned) { setOpen(false); state.dismissed = false }
    }, 180)
  }
  useEffect(() => () => { clearTimeout(timer.current) }, [])
  useEffect(() => {
    if (!open) return
    const key = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dismiss() }
    }
    const outside = (event: PointerEvent): void => {
      if (!trigger.current?.contains(event.target as Node) && !popup.current?.contains(event.target as Node)) dismiss()
    }
    document.addEventListener('keydown', key, true); document.addEventListener('pointerdown', outside, true)
    return () => { document.removeEventListener('keydown', key, true); document.removeEventListener('pointerdown', outside, true) }
  }, [open])
  useLayoutEffect(() => {
    if (!open) return
    const place = (): void => {
      if (!trigger.current || !popup.current) return
      setPosition(placeFieldHelp(trigger.current.getBoundingClientRect(), popup.current.getBoundingClientRect(),
        { width: window.innerWidth, height: window.innerHeight }))
    }
    place(); window.addEventListener('resize', place); document.addEventListener('scroll', place, true)
    return () => { window.removeEventListener('resize', place); document.removeEventListener('scroll', place, true) }
  }, [open, help])
  const toggle = (): void => {
    clearTimeout(timer.current)
    if (interaction.current.pinned) dismiss()
    else { interaction.current.pinned = true; interaction.current.dismissed = false; setOpen(true) }
  }
  const tooltip = <div id={id} role="tooltip" ref={popup} className="field-help__tooltip" hidden={!open} style={position}
    onPointerEnter={() => { clearTimeout(timer.current); interaction.current.hovered = true }}
    onPointerLeave={() => { interaction.current.hovered = false; leave() }}>{help}</div>
  return <div className={`field-help ${className}`} data-checkbox={checkbox || undefined}>
    <label {...labelProps}>{fields}</label>
    {/* A native button inherits fieldset[disabled]; this keyboard button does not. */}
    <span ref={trigger} className="field-help__trigger" role="button" tabIndex={0} aria-label={`Help: ${name}`}
      aria-describedby={id}
      onPointerEnter={() => {
        clearTimeout(timer.current); interaction.current.hovered = true
        if (!interaction.current.dismissed) timer.current = setTimeout(() => setOpen(true), 400)
      }}
      onPointerLeave={() => { interaction.current.hovered = false; leave() }}
      onFocus={() => {
        clearTimeout(timer.current); interaction.current.focused = true
        if (!interaction.current.dismissed) setOpen(true)
      }}
      onBlur={() => { interaction.current.focused = false; leave() }}
      onClick={toggle}
      onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggle() } }}>
      <span aria-hidden="true">?</span>
    </span>
    {typeof document === 'undefined' ? tooltip : createPortal(tooltip, document.body)}
  </div>
}
