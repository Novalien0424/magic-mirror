import { useEffect, useId, useState, type InputHTMLAttributes } from 'react'

export function clampNumber(value: string, previous: number, min?: number, max?: number): number {
  const parsed = value.trim() === '' ? previous : Number(value)
  return Math.min(max ?? Infinity, Math.max(min ?? -Infinity, Number.isFinite(parsed) ? parsed : previous))
}

/** Keep partial typing local; commit a finite, bounded value on blur. */
export function NumberInput({ value, onChange, onBlur, min, max, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  const [text, setText] = useState(String(value ?? '')), id = useId()
  useEffect(() => setText(String(value ?? '')), [value])
  const low = min === undefined ? undefined : Number(min), high = max === undefined ? undefined : Number(max)
  const parsed = Number(text), invalid = text.trim() === '' || !Number.isFinite(parsed) || low !== undefined && parsed < low || high !== undefined && parsed > high
  return <><input {...props} type="number" value={text} min={min} max={max} aria-invalid={invalid || props['aria-invalid'] || undefined}
    aria-describedby={[props['aria-describedby'], invalid ? id : ''].filter(Boolean).join(' ') || undefined}
    onChange={event => { setText(event.currentTarget.value); if (event.currentTarget.value.trim() && Number.isFinite(event.currentTarget.valueAsNumber)) onChange?.(event) }}
    onBlur={event => {
      const next = clampNumber(text, Number(value) || 0, low, high)
      event.currentTarget.value = String(next); setText(String(next))
      onChange?.(event); onBlur?.(event)
    }} />{invalid && <span id={id} className="field-error">Enter a number{low === undefined ? '' : ` ≥ ${low}`}{high === undefined ? '' : ` ≤ ${high}`}.</span>}</>
}
