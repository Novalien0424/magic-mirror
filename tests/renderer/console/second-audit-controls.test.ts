import React, { isValidElement, type ReactElement, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AvatarProfile } from '../../../src/shared/avatar-profiles'
import { DEFAULT_PRESENTATION } from '../../../src/shared/presentation'
import { DEFAULT_VOICE_EFFECTS } from '../../../src/shared/voice-effects'

// No test DOM dependency: retain hook state and invoke the rendered controls.
const hooks = vi.hoisted(() => ({ cursor: 0, values: [] as unknown[] }))
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react')
  return {
    ...actual,
    useState: (initial: unknown) => {
      const index = hooks.cursor++
      if (!(index in hooks.values)) hooks.values[index] = typeof initial === 'function' ? initial() : initial
      return [hooks.values[index], (next: unknown) => {
        hooks.values[index] = typeof next === 'function' ? next(hooks.values[index]) : next
      }]
    },
    useRef: (initial: unknown) => {
      const index = hooks.cursor++
      if (!(index in hooks.values)) hooks.values[index] = { current: initial }
      return hooks.values[index]
    },
    useMemo: (create: () => unknown) => create(),
    useCallback: (callback: unknown) => callback,
    useId: () => 'control-help',
    useEffect: () => undefined,
  }
})
import { NumberInput } from '../../../src/renderer/console/NumberInput'
import { VoiceStudio } from '../../../src/renderer/console/VoiceStudio'

type Control = ReactElement<Record<string, any>>
function elements(node: ReactNode): Control[] {
  if (Array.isArray(node)) return node.flatMap(elements)
  if (!isValidElement<Record<string, any>>(node)) return []
  return [node, ...elements(node.props.children)]
}
function control(tree: ReactNode, matches: (element: Control) => boolean): Control {
  const result = elements(tree).find(matches)
  expect(result).toBeDefined()
  return result!
}
function event(value: string, checked = false) {
  return { currentTarget: { value, checked, get valueAsNumber() { return this.value.trim() ? Number(this.value) : NaN } } } as any
}
beforeEach(() => { hooks.cursor = 0; hooks.values = []; vi.stubGlobal('React', React) })
afterEach(() => vi.unstubAllGlobals())

describe('number blur commits', () => {
  it('leaves an untouched value and removal Undo alone while still calling onBlur', () => {
    const onChange = vi.fn(), onBlur = vi.fn()
    const tree = NumberInput({ value: 5, min: 0, max: 10, onChange, onBlur })
    control(tree, element => element.type === 'input').props.onBlur(event('5'))
    expect(onChange).not.toHaveBeenCalled()
    expect(onBlur).toHaveBeenCalledOnce()
  })
  it('does not commit a numerically unchanged spelling or blank on blur', () => {
    const onChange = vi.fn()
    const render = () => { hooks.cursor = 0; return NumberInput({ value: 5, min: 0, max: 10, onChange }) }
    control(render(), element => element.type === 'input').props.onChange(event('5.0'))
    control(render(), element => element.type === 'input').props.onBlur(event('5.0'))
    expect(onChange).toHaveBeenCalledOnce()
    control(render(), element => element.type === 'input').props.onChange(event(''))
    const blurred = event('')
    control(render(), element => element.type === 'input').props.onBlur(blurred)
    expect(blurred.currentTarget.value).toBe('5')
    expect(onChange).toHaveBeenCalledOnce()
  })
  it('commits the clamped value exactly once when blur changes the value', () => {
    let value = 5
    const onChange = vi.fn(change => { value = Number(change.currentTarget.value) })
    const render = () => { hooks.cursor = 0; return NumberInput({ value, min: 0, max: 10, onChange }) }
    control(render(), element => element.type === 'input').props.onChange(event('20'))
    expect(value).toBe(20)
    control(render(), element => element.type === 'input').props.onBlur(event('20'))
    expect(value).toBe(10)
    expect(onChange).toHaveBeenCalledTimes(2)
    control(render(), element => element.type === 'input').props.onBlur(event('10'))
    expect(onChange).toHaveBeenCalledTimes(2)
  })
})

describe('voice preset Undo ownership', () => {
  const manualEdits = [
    ['base voice', (element: Control) => element.type === 'select' && element.props.value === 'cedar', 'coral'],
    ['speech speed', (element: Control) => element.type === 'input' && element.props.min === '0.5', '1.2'],
    ['delivery style', (element: Control) => element.type === 'textarea', 'Measured'],
    ['pitch', (element: Control) => element.props['aria-label'] === 'Pitch · semitones', '2'],
    ['effects enabled', (element: Control) => element.type === 'input' && element.props.type === 'checkbox' && element.props.checked === true, ''],
    ['room size', (element: Control) => element.type === 'select' && element.props.value === 'medium', 'short'],
  ] as const

  function setup() {
    let avatar: AvatarProfile = { id: 'synthetic-avatar', name: 'Host', personality: '', speakingStyle: 'Calm', voice: 'cedar',
      idleSeconds: 300, modelId: 'builtin-ren', presentation: DEFAULT_PRESENTATION, scenes: [], spells: [],
      voiceSpeed: 1, voiceEffects: { ...DEFAULT_VOICE_EFFECTS } }
    const onChange = vi.fn(next => { avatar = next })
    const render = () => { hooks.cursor = 0; return VoiceStudio({ avatar, disabled: false, bridge: null, onChange }) }
    control(render(), element => element.type === 'button' && element.props.children === 'Default · Ethereal').props.onClick()
    return { render, onChange, avatar: () => avatar }
  }
  it.each(manualEdits)('clears preset Undo after a manual %s edit', (_label, matches, value) => {
    const studio = setup()
    expect(elements(studio.render()).some(element => element.props.children === 'Undo voice preset')).toBe(true)
    control(studio.render(), matches).props.onChange(event(value))
    expect(elements(studio.render()).some(element => element.props.children === 'Undo voice preset')).toBe(false)
    expect(studio.onChange).toHaveBeenCalledTimes(2)
  })
  it('still restores the prior settings before any manual edits', () => {
    const studio = setup()
    control(studio.render(), element => element.type === 'button' && element.props.children === 'Undo voice preset').props.onClick()
    expect(studio.avatar()).toMatchObject({ voice: 'cedar', voiceSpeed: 1, speakingStyle: 'Calm', voiceEffects: DEFAULT_VOICE_EFFECTS })
    expect(elements(studio.render()).some(element => element.props.children === 'Undo voice preset')).toBe(false)
  })
})
