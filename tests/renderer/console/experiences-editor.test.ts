import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  BilingualTexts, ExperiencesEditor, GuestListField, ImagePromptEditor, StagePrompts, addQuestion, experienceIssues, experienceOf, moveQuestion,
  parseGuestList, removeQuestion, resetImagePrompts, resetStagePrompts, resetTextMap, setFailureLine, setImagePrompt, setQuestionLine,
  setNameFont, setScreenText, setStagePrompt,
} from '../../../src/renderer/console/ExperiencesEditor'
import {
  STUDIO_DEFAULT_FAREWELL, STUDIO_DEFAULT_NAME_FONT, STUDIO_DEFAULT_WAKE_PHRASE, STUDIO_IMAGE_PROMPT_DEFAULTS, STUDIO_PROMPT_DEFAULTS, studioFarewellSpeech,
  studioImagePromptDefault, studioScreenView,
} from '../../../src/shared/portrait-studio-config'
import { buildPortraitPrompt } from '../../../src/shared/studio-image-prompt'
import {
  STUDIO_LOGIN_COMMAND, STUDIO_USAGE_URL, StudioLiveControls, StudioStatusPanel, safePreviewUrl, studioActionText, studioAuthText,
  studioFailureText, studioPhaseText,
} from '../../../src/renderer/console/StudioStatusPanel'
import { FIELD_HELP } from '../../../src/renderer/console/field-help-text'
import { NumberInput } from '../../../src/renderer/console/NumberInput'
import { newAvatar } from '../../../src/renderer/console/profile-workspace'
import type { AvatarProfile } from '../../../src/shared/avatar-profiles'
import {
  DEFAULT_EXPERIENCE, STUDIO_MAX_QUESTIONS, STUDIO_PROMPT_STAGES, defaultExperience, parseAvatarExperience, sessionExperience, studioPictureType,
  type StudioAuthStatus, type StudioConsoleStatus,
} from '../../../src/shared/portrait-studio'

type Props = React.ComponentProps<typeof ExperiencesEditor>
type Element = React.ReactElement<Record<string, unknown>>
function elements(node: React.ReactNode): Element[] {
  return React.Children.toArray(node).flatMap(child => React.isValidElement<Record<string, unknown>>(child)
    ? [child, ...elements(child.props.children as React.ReactNode)] : [])
}
const isControl = (element: Element): boolean => ['input', 'select', 'textarea'].includes(element.type as string) || element.type === NumberInput

function editor(options: { avatar?: AvatarProfile; disabled?: boolean } = {}) {
  let avatar = options.avatar ?? (({ experience: _omit, ...rest }) => rest as AvatarProfile)(newAvatar('guide'))
  const changes: AvatarProfile[] = []
  const props = (): Props => ({ avatar, disabled: options.disabled ?? false, onChange(next) { avatar = next; changes.push(next) } })
  const tree = (): Element[] => elements(ExperiencesEditor(props()))
  const byLabel = (label: string): Element => {
    const element = tree().find(item => item.props['aria-label'] === label)
    expect(element, `Missing element: ${label}`).toBeDefined()
    return element!
  }
  /** The first control inside the HelpField that carries this help text. */
  const field = (help: string): Element => {
    const wrapper = tree().find(item => item.props.help === help)
    expect(wrapper, `Missing field: ${help.slice(0, 40)}`).toBeDefined()
    const control = elements(wrapper!.props.children as React.ReactNode).find(isControl)
    expect(control).toBeDefined()
    return control!
  }
  const fire = (element: Element, value: string, checked = false): void =>
    (element.props.onChange as (event: unknown) => void)({ currentTarget: { value, checked } })
  return {
    get avatar() { return avatar }, changes, tree, byLabel, field, fire,
    click: (label: string) => (byLabel(label).props.onClick as () => void)(),
    disabledButton: (label: string) => byLabel(label).props.disabled === true,
    guestNames: (names: string[]) => {
      const guests = tree().find(item => item.type === GuestListField)!
      ;(guests.props.onNames as (names: string[]) => void)(names)
    },
    render: () => renderToStaticMarkup(React.createElement(ExperiencesEditor, props())),
  }
}

describe('ExperiencesEditor', () => {
  it('renders defaults when the avatar has no experience yet', () => {
    const ui = editor()
    expect(ui.avatar.experience).toBeUndefined()
    const html = ui.render()
    expect(html).not.toContain('Default mode after wake')
    expect(html).toContain('In Interactive Studio mode (control bar › Mirror mode')
    expect(html).not.toContain('After the experience')
    for (const legend of ['1 · Start', '2 · Character', '3 · Name and questions', '4 · Picture', '5 · Ending']) expect(html).toContain(legend)
    expect(html).toContain(`value="${STUDIO_DEFAULT_WAKE_PHRASE}"`)
    expect(html).toContain(`>${STUDIO_DEFAULT_FAREWELL}</textarea>`)
    expect(html).toContain('Studio character (system prompt) · from Persona')
    expect(html).toMatch(/<input type="checkbox"[^>]*checked=""\/> Ask for a name first/)
    expect(html.match(/aria-label="Question \d"/g)).toHaveLength(4)
    expect(html).toContain(DEFAULT_EXPERIENCE.studio.nameQuestion.zh)
    expect(html).toContain(DEFAULT_EXPERIENCE.studio.nameQuestion.en)
    expect(html).toContain('Name question · asked first')
    expect(html).toContain('Image prompt line')
    expect(html).toContain('All instructions use the default.')
    expect(html).toContain('<span class="experiences-editor__count">4 of 8</span>')
    expect(html).toMatch(/aria-label="Guest names, one per line"[^>]*><\/textarea>/)
    expect(html).toContain('Guest names · 0 of 1,000')
    expect(html).toContain('stays on this Mac')
    expect(html).not.toContain('attention before saving')
    expect(html).not.toMatch(/daily|per day|limit per/i)
    expect(experienceIssues(experienceOf(ui.avatar))).toEqual({})
  })

  it('edits the studio wake phrase, character and farewell, storing only real edits', () => {
    const avatar = newAvatar('guide')
    avatar.personality = '沉穩的渡鴉。'
    let current = avatar
    const tree = () => elements(ExperiencesEditor({ avatar: current, disabled: false, onChange(next) { current = next } }))
    const field = (help: string) => (tree().find(item => item.props.help === help)!.props.children as React.ReactElement<Record<string, unknown>>[])
      .flat().find(child => React.isValidElement(child) && ['input', 'textarea'].includes(child.type as string)) as React.ReactElement<Record<string, unknown>>
    const type = (help: string, value: string) => (field(help).props.onChange as (e: unknown) => void)({ currentTarget: { value } })
    expect(field(FIELD_HELP.studioCharacter).props.value).toBe('沉穩的渡鴉。')
    type(FIELD_HELP.studioCharacter, '神秘的渡鴉使者，說話簡短。')
    type(FIELD_HELP.studioWakePhrase, '召喚渡鴉使者')
    type(FIELD_HELP.studioFarewell, '去吧\n人類')
    const studio = current.experience!.studio
    expect(studio).toMatchObject({ character: '神秘的渡鴉使者，說話簡短。', wakePhrase: '召喚渡鴉使者', farewell: '去吧\n人類' })
    expect(parseAvatarExperience(current.experience)).toEqual(current.experience)
    expect(studioFarewellSpeech(studio)).toBe('去吧。……人類。')
    // Typing a default back (or the Persona text) removes the edit.
    type(FIELD_HELP.studioCharacter, '沉穩的渡鴉。')
    type(FIELD_HELP.studioWakePhrase, STUDIO_DEFAULT_WAKE_PHRASE)
    type(FIELD_HELP.studioFarewell, STUDIO_DEFAULT_FAREWELL)
    expect(current.experience!.studio).not.toHaveProperty('character')
    expect(current.experience!.studio).not.toHaveProperty('wakePhrase')
    expect(current.experience!.studio).not.toHaveProperty('farewell')
    expect(experienceIssues({ ...current.experience!, studio: { ...current.experience!.studio, farewell: 'a\nb\nc\nd\ne' } }).farewell).toMatch(/1 to 4 lines/)
    expect(experienceIssues({ ...current.experience!, studio: { ...current.experience!.studio, wakePhrase: ' ' } }).wakePhrase).toMatch(/wake phrase/)
  })

  it('edits the Interactive Studio start script', () => {
    const ui = editor()
    ui.fire(ui.field(FIELD_HELP.experienceStudioScript), '來畫一幅畫吧。')
    expect(ui.avatar.experience?.studio.startScript).toBe('來畫一幅畫吧。')
    expect(Object.keys(ui.avatar.experience!)).not.toContain('startScripts')
  })

  it('keeps 1 to 8 questions with stable ids and keyboard-operable arrange buttons', () => {
    const ui = editor()
    expect(ui.disabledButton('Move question 1 up')).toBe(true)
    expect(ui.disabledButton('Move question 4 down')).toBe(true)
    ui.click('Move question 1 down')
    expect(ui.avatar.experience!.studio.questions.map(q => q.id)).toEqual(['q2', 'q1', 'q3', 'q4'])
    const add = () => (ui.tree().find(item => item.type === 'button' && item.props.children === 'Add question')!.props.onClick as () => void)()
    for (let i = 0; i < 6; i++) add()
    const questions = ui.avatar.experience!.studio.questions
    expect(questions).toHaveLength(STUDIO_MAX_QUESTIONS)
    expect(new Set(questions.map(q => q.id)).size).toBe(STUDIO_MAX_QUESTIONS)
    expect(questions.slice(4).map(q => q.id)).toEqual(['q5', 'q6', 'q7', 'q8'])
    expect(ui.tree().find(item => item.type === 'button' && item.props.children === 'Add question')!.props.disabled).toBe(true)
    expect(addQuestion(ui.avatar.experience!)).toBe(ui.avatar.experience)
    expect(ui.render()).toContain('8 questions is the maximum')
    // New questions start empty and are flagged inline until filled.
    expect(experienceIssues(ui.avatar.experience!)['questions.4.zh']).toMatch(/Traditional Chinese/)
    expect(ui.render()).toContain('aria-invalid="true"')
    for (let n = STUDIO_MAX_QUESTIONS; n > 1; n--) ui.click(`Remove question ${n}`)
    expect(ui.avatar.experience!.studio.questions.map(q => q.id)).toEqual(['q2'])
    expect(ui.disabledButton('Remove question 1')).toBe(true)
    expect(removeQuestion(ui.avatar.experience!, 0)).toBe(ui.avatar.experience)
    expect(moveQuestion(ui.avatar.experience!, 0, -1)).toBe(ui.avatar.experience)
    expect(parseAvatarExperience(ui.avatar.experience)).not.toBeNull()
  })

  it('parses the guest list one name per line and flags invalid names', () => {
    const long = '名'.repeat(41)
    const parsed = parseGuestList('  王小明  \r\n\n\nAmy Chen\n\t\n' + long + '\nA\tB\n')
    expect(parsed.names).toEqual(['王小明', 'Amy Chen', long, 'A\tB'])
    expect(parsed.issues).toEqual(['Line 6 is longer than 40 characters (41).', 'Line 7 contains a tab or another control character.'])
    expect(parseGuestList('\n \n').names).toEqual([])
    const many = parseGuestList(Array.from({ length: 1001 }, (_, i) => `Guest ${i}`).join('\n'))
    expect(many.issues[0]).toBe('The list has 1,001 names; the limit is 1,000.')

    const ui = editor()
    ui.guestNames(parsed.names)
    expect(ui.avatar.experience!.guests.names).toEqual(parsed.names)
    expect(experienceIssues(ui.avatar.experience!)['guests.names']).toMatch(/Name 3 is longer than 40/)
    expect(parseAvatarExperience(ui.avatar.experience)).toBeNull()
    const html = ui.render()
    expect(html).toContain('field needs attention before saving')
    expect(html).toContain('Line 3 is longer than 40 characters (41).')
    ui.guestNames(['王小明', 'Amy Chen'])
    expect(experienceIssues(ui.avatar.experience!)).toEqual({})
    expect(ui.render()).toContain('王小明\nAmy Chen</textarea>')
  })

  it('produces an experience that passes parseAvatarExperience', () => {
    const ui = editor()
    ui.fire(ui.field(FIELD_HELP.experienceVisitorMayRequest), '', false)
    ui.fire(ui.byLabel('Name question in English'), 'What name goes on your portrait?')
    ;(ui.tree().find(item => item.type === 'button' && item.props.children === 'Add question')!.props.onClick as () => void)()
    ui.fire(ui.byLabel('Question 5 in Traditional Chinese'), '誰陪在你身邊？')
    ui.fire(ui.byLabel('Question 5 in English'), 'Who is beside you?')
    ui.fire(ui.byLabel('Question 5 image part'), 'companion')
    ui.fire(ui.byLabel('Question 1 image prompt line'), 'Spirit animal: {{answer}}.')
    ui.fire(ui.field(FIELD_HELP.studioArtStyle), 'Moonlit gouache.')
    ui.fire(ui.field(FIELD_HELP.studioNameLettering), 'painted')
    ui.fire(ui.field(FIELD_HELP.studioQuality), 'high')
    ui.fire(ui.field(FIELD_HELP.studioRevisions), '3')
    ui.fire(ui.field(FIELD_HELP.studioHoldSeconds), '120')
    ui.fire(ui.field(FIELD_HELP.guestMatch), 'only')
    ui.guestNames(['王小明'])
    const experience = ui.avatar.experience!
    expect(parseAvatarExperience(experience)).toEqual(experience)
    expect(experience).toMatchObject({ defaultMode: 'conversation', visitorMayRequest: false,
      guests: { names: ['王小明'], match: 'only' } })
    expect(experience.studio).toMatchObject({ nameLettering: 'painted', quality: 'high', revisionsAllowed: 3, holdSeconds: 120 })
    expect(experience.studio.questions[4]).toEqual({ id: 'q5', zh: '誰陪在你身邊？', en: 'Who is beside you?', slot: 'companion' })
    expect(experience.studio.questions[0]!.imageLine).toBe('Spirit animal: {{answer}}.')
    expect(ui.render()).toContain('<option value="high" selected="">Best</option>')

    ui.fire(ui.field(FIELD_HELP.studioHoldSeconds), '5')
    // Line breaks are allowed in the start script; tabs and other control characters are not.
    ui.fire(ui.field(FIELD_HELP.experienceStudioScript), 'line one\tline two')
    const issues = experienceIssues(ui.avatar.experience!)
    expect(Object.keys(issues).sort()).toEqual(['holdSeconds', 'startScript'])
    expect(ui.render()).toContain('2 fields need attention before saving.')
    // An empty list cannot restrict names in "only" mode.
    expect(experienceIssues({ ...experience, guests: { names: [], match: 'only' } })['guests.names']).toMatch(/at least one name/)
  })

  it('does not edit while disabled and describes every control', () => {
    const ui = editor({ disabled: true })
    ui.fire(ui.field(FIELD_HELP.studioArtStyle), 'Changed.')
    ui.click('Move question 1 down')
    expect(ui.changes).toHaveLength(0)
    const html = ui.render()
    expect(html).toContain('<fieldset disabled=""')
    for (const [control] of html.matchAll(/<(?:input|select|textarea)\b[^>]*>/g)) {
      const ids = control.match(/aria-describedby="([^"]+)"/)?.[1].split(' ')
      expect(ids, control).toBeDefined()
      for (const id of ids ?? []) {
        const description = html.slice(html.indexOf(`id="${id}"`)).match(/^[^>]*>([^<]+)/)?.[1]
        expect(description?.length ?? 0, control).toBeGreaterThan(40)
      }
    }
  })

  it('keeps a valid default for new avatars', () => {
    expect(parseAvatarExperience(defaultExperience())).not.toBeNull()
    expect(experienceIssues(newAvatar('x').experience!)).toEqual({})
  })
})

describe('Portrait Studio status panel', () => {
  const statuses: StudioAuthStatus[] = ['signed_in', 'missing', 'invalid', 'expired', 'refresh_failed']
  it('turns each sign-in status into operator text', () => {
    expect(studioAuthText('signed_in')).toMatchObject({ label: 'Signed in', tone: 'success', needsLogin: false })
    expect(studioAuthText('signed_in').action).toContain('refreshed in the background')
    expect(studioAuthText('missing')).toMatchObject({ label: 'Not signed in', needsLogin: true })
    expect(studioAuthText('missing').action).toContain(STUDIO_LOGIN_COMMAND)
    for (const auth of ['invalid', 'expired', 'refresh_failed'] as const) {
      const copy = studioAuthText(auth)
      expect(copy.label).not.toBe('Signed in')
      expect(copy.action).toContain(STUDIO_LOGIN_COMMAND)
    }
    expect(studioAuthText('expired').needsLogin).toBe(false)
    expect(studioAuthText('invalid').label).toMatch(/^Not signed in/)
    expect(new Set(statuses.map(auth => studioAuthText(auth).label)).size).toBe(statuses.length)
  })

  it('renders status without any credential value and shows the sign-in command when needed', () => {
    const base: StudioConsoleStatus = { auth: 'signed_in', lastRefresh: '2026-10-17T01:02:03.000Z', modelId: 'gpt-image-test', active: false, mirrorMode: 'conversation' }
    const signedIn = renderToStaticMarkup(React.createElement(StudioStatusPanel, { bridge: null, initialStatus: base }))
    expect(signedIn).toContain('Signed in')
    expect(signedIn).toContain('gpt-image-test')
    expect(signedIn).toContain(STUDIO_USAGE_URL)
    expect(signedIn).toContain('Generate test picture')
    expect(signedIn).not.toContain(STUDIO_LOGIN_COMMAND)
    expect(signedIn).not.toMatch(/token|bearer/i)
    const missing = renderToStaticMarkup(React.createElement(StudioStatusPanel, { bridge: null, initialStatus: { ...base, auth: 'missing', lastRefresh: undefined } }))
    expect(missing).toContain('Not signed in')
    expect(missing).toContain(`<code class="studio-status__selectable">${STUDIO_LOGIN_COMMAND}</code>`)
    expect(missing).toContain('Not recorded')
  })

  it('translates every image failure code and live action', () => {
    const codes = ['studio_auth_required', 'studio_quota_exhausted', 'studio_image_refused', 'studio_model_rejected',
      'studio_provider_contract', 'studio_image_timeout', 'studio_image_unavailable']
    const texts = codes.map(studioFailureText)
    expect(new Set(texts).size).toBe(codes.length)
    for (const text of texts) expect(text).not.toMatch(/studio_/)
    expect(studioFailureText('studio_unknown_thing')).toContain('studio_unknown_thing')
    expect(studioActionText('studio_requires_active_session')).toMatch(/Start a conversation first/)
    expect(studioActionText('studio_operator_exit')).toMatch(/Back to conversation/)
    expect(studioPhaseText({ active: true, phase: 'painting' })).toBe('Painting')
    expect(studioPhaseText({ active: false })).toBe('Not running')
    expect(studioPhaseText(null)).toBe('Status unknown')
  })

  it('accepts only inline raster previews', () => {
    expect(safePreviewUrl('data:image/png;base64,iVBORw0KGgo=')).toBe('data:image/png;base64,iVBORw0KGgo=')
    expect(safePreviewUrl('https://example.com/a.png')).toBeNull()
    expect(safePreviewUrl('data:image/svg+xml;base64,PHN2Zz4=')).toBeNull()
    expect(safePreviewUrl(undefined)).toBeNull()
  })

  it('offers the Mirror mode switch, disabled until Main reports the mode', () => {
    const studio = async () => ({ ok: true as const, value: { status: { auth: 'signed_in' as const, modelId: 'm', active: false, mirrorMode: 'conversation' as const } } })
    const html = renderToStaticMarkup(React.createElement(StudioLiveControls, { bridge: { studio }, bridgeAvailable: true, lifecycle: 'dormant', visible: true }))
    expect(html).toContain('>Mirror mode</h2>')
    expect(html).toMatch(/<button type="button"[^>]*aria-pressed="false" disabled=""[^>]*>Conversation<\/button>/)
    expect(html).toMatch(/<button type="button"[^>]*disabled=""[^>]*>Interactive Studio<\/button>/)
    expect(html).toContain('wakes to 「the studio wake phrase」')
    expect(html).not.toContain('Back to conversation')
    expect(studioActionText('mirror_mode_studio')).toMatch(/Interactive Studio/)
    expect(studioActionText('mirror_mode_save_failed')).toMatch(/not changed/)
  })

  it('edits each stage prompt in visit order, stores only real overrides and resets them', () => {
    let experience = defaultExperience()
    const tree = () => elements(StagePrompts({ experience, issues: experienceIssues(experience), disabled: false, onChange(next) { experience = next } }))
    const textarea = (label: string) => tree().find(item => item.props['aria-label'] === label)!
    const html = () => renderToStaticMarkup(React.createElement(StagePrompts, { experience, issues: experienceIssues(experience), disabled: false, onChange() {} }))
    // Studio rules (instructions) are edited under Character, not in this list.
    expect(html().match(/experiences-editor__prompt-step/g)).toHaveLength(STUDIO_PROMPT_STAGES.length - 1)
    expect(html()).toContain('All steps use the default.')
    expect(textarea('Read the name back prompt').props.value).toBe(STUDIO_PROMPT_DEFAULTS.confirmName)
    ;(textarea('Read the name back prompt').props.onChange as (e: unknown) => void)({ currentTarget: { value: '請慢慢念出「{{name}}」，再問對不對。' } })
    expect(experience.studio.prompts).toEqual({ confirmName: '請慢慢念出「{{name}}」，再問對不對。' })
    expect(parseAvatarExperience(experience)).toEqual(experience)
    expect(html()).toContain(`1 of ${STUDIO_PROMPT_STAGES.length - 1} steps edited.`)
    expect(html()).toContain('Edited')
    // Removing a required placeholder is flagged and blocks saving.
    ;(textarea('Read the name back prompt').props.onChange as (e: unknown) => void)({ currentTarget: { value: '請確認名字。' } })
    expect(experienceIssues(experience)['prompts.confirmName']).toMatch(/Keep \{\{name\}\}/)
    expect(parseAvatarExperience(experience)).toBeNull()
    expect(html()).toContain('Needs attention')
    // Typing the default text back stores no override.
    ;(textarea('Read the name back prompt').props.onChange as (e: unknown) => void)({ currentTarget: { value: STUDIO_PROMPT_DEFAULTS.confirmName } })
    expect(experience.studio.prompts).toEqual({})
    experience = setStagePrompt(setStagePrompt(experience, 'painting', '開始畫吧。'), 'finished', '這是你的畫。')
    expect(resetStagePrompts(experience, 'painting').studio.prompts).toEqual({ finished: '這是你的畫。' })
    expect(resetStagePrompts(experience).studio.prompts).toEqual({})
    // Unknown placeholders are rejected with the supported list.
    expect(experienceIssues(setStagePrompt(experience, 'askQuestion', '{{question}} {{name}}'))['prompts.askQuestion'])
      .toMatch(/Remove \{\{name\}\}.*\{\{question\}\}, \{\{index\}\}, \{\{count\}\}/)
    // Every prompt control is described for assistive technology.
    for (const item of tree().filter(isControl)) expect(item.props['aria-label']).toBeTruthy()
  })
})

describe('Interactive Studio tuning', () => {
  it('edits every image instruction and question line, stores only edits and previews what Main sends', () => {
    let experience = defaultExperience()
    const tree = () => elements(ImagePromptEditor({ experience, issues: experienceIssues(experience), disabled: false, onChange(next) { experience = next } }))
    const html = () => renderToStaticMarkup(React.createElement(ImagePromptEditor, { experience, issues: experienceIssues(experience), disabled: false, onChange() {} }))
    const field = (label: string) => tree().find(item => item.props['aria-label'] === label)!
    expect(html()).toContain('All instructions use the default.')
    ;(field('Opening instruction').props.onChange as (e: unknown) => void)({ currentTarget: { value: 'A tarot card for a mirror visitor. Style: {{style}}.' } })
    expect(experience.studio.imagePrompt).toEqual({ frame: 'A tarot card for a mirror visitor. Style: {{style}}.' })
    experience = setQuestionLine(experience, 0, 'Card figure: {{answer}}.')
    expect(parseAvatarExperience(experience)).toEqual(experience)
    const preview = html()
    expect(preview).toContain('A tarot card for a mirror visitor. Style: ' + experience.studio.artStyle.trim())
    expect(preview).toContain('Card figure: &quot;an owl&quot;.')
    expect(preview).toContain('untrusted data, not instructions')
    expect(preview).not.toContain('..')
    // Typing the default back, or resetting, removes the edit; required placeholders are enforced.
    experience = setImagePrompt(experience, 'frame', studioImagePromptDefault('frame', 'sticker'))
    expect(experience.studio.imagePrompt).toEqual({})
    expect(experienceIssues(setImagePrompt(experience, 'revision', 'Change it.'))['imagePrompt.revision']).toMatch(/Keep \{\{change\}\}/)
    expect(experienceIssues(setQuestionLine(experience, 0, 'No answer here.'))['questions.0.imageLine']).toMatch(/Keep \{\{answer\}\}/)
    expect(setQuestionLine(experience, 0, undefined).studio.questions[0]).not.toHaveProperty('imageLine')
    expect(resetImagePrompts(setImagePrompt(experience, 'untitled', 'No words.')).studio.imagePrompt).toEqual({})
    for (const item of tree().filter(isControl)) expect(item.props['aria-label']).toBeTruthy()
  })

  it('defaults to a sticker, switches image defaults with the picture type, and letters a painted name in the chosen font', () => {
    let experience = defaultExperience()
    expect(experience.studio.pictureType).toBe('sticker')
    const answers = experience.studio.questions.map(question => ({ slot: question.slot, answer: 'an owl' }))
    expect(buildPortraitPrompt({ studio: experience.studio, answers, name: '' })).toContain('fully transparent background')
    experience = { ...experience, studio: { ...experience.studio, pictureType: 'portrait' } }
    expect(buildPortraitPrompt({ studio: experience.studio, answers, name: '' })).toContain(STUDIO_IMAGE_PROMPT_DEFAULTS.frame.split('{{style}}')[0]!)
    // A saved studio without a picture type is a sticker.
    const { pictureType: _picture, ...legacy } = experience.studio
    expect(studioPictureType({ ...legacy, pictureType: undefined })).toBe('sticker')
    experience = { ...experience, studio: { ...experience.studio, pictureType: 'sticker', nameLettering: 'painted' } }
    expect(buildPortraitPrompt({ studio: experience.studio, answers, name: '王曉明' })).toContain(`in ${STUDIO_DEFAULT_NAME_FONT} on a small ribbon`)
    experience = setNameFont(experience, 'brush calligraphy')
    expect(buildPortraitPrompt({ studio: experience.studio, answers, name: '王曉明' })).toContain('"王曉明" exactly once in brush calligraphy')
    expect(parseAvatarExperience(experience)).toEqual(experience)
    expect(setNameFont(experience, STUDIO_DEFAULT_NAME_FONT).studio).not.toHaveProperty('nameFont')
    expect(experienceIssues(setNameFont(experience, 'a\nb')).nameFont).toBeTruthy()
    expect(sessionExperience(experience).studio).not.toHaveProperty('nameFont')
    expect(sessionExperience(experience).studio).not.toHaveProperty('pictureType')
  })

  it('edits on-glass text and spoken failure lines in both languages and keeps them out of the renderer', () => {
    let experience = setScreenText(defaultExperience(), 'questionLabel', 'zh', '第 {{index}} 關')
    experience = setScreenText(experience, 'captions', 'en', 'Shuffling the cards…\nDrawing your fate…')
    experience = setFailureLine(experience, 'default', 'zh', '牌卡出了點狀況，我們聊聊吧。')
    expect(parseAvatarExperience(experience)).toEqual(experience)
    expect(studioScreenView(experience.studio, 'zh', 2, 4).questionLabel).toBe('第 2 關')
    expect(studioScreenView(experience.studio, 'en', 1, 4).captions).toEqual(['Shuffling the cards…', 'Drawing your fate…'])
    expect(experience.studio.failureLines?.default?.en).toBe("Something went wrong with the canvas. Let's talk instead.")
    expect(sessionExperience(experience).studio).not.toHaveProperty('screenText')
    expect(sessionExperience(experience).studio).not.toHaveProperty('failureLines')
    expect(experienceIssues(setScreenText(experience, 'questionLabel', 'en', 'Step {{name}}'))['screenText.questionLabel.en']).toMatch(/Remove \{\{name\}\}/)
    expect(resetTextMap(experience, 'screenText', 'questionLabel').studio.screenText).not.toHaveProperty('questionLabel')
    const html = renderToStaticMarkup(React.createElement(BilingualTexts, { experience, issues: {}, disabled: false, onChange() {}, map: 'screenText' }))
    expect(html).toContain('2 of 10 edited.')
    expect(html).toContain('第 {{index}} 關')
  })

  it('turns the name step off: no name question, guest list or lettering, and the no-name image instruction', () => {
    const ui = editor()
    ui.fire(ui.field(FIELD_HELP.studioAskName), '', false)
    const experience = ui.avatar.experience!
    expect(experience.studio.askName).toBe(false)
    expect(parseAvatarExperience(experience)).toEqual(experience)
    const html = ui.render()
    expect(html).toContain('Name question · off')
    expect(html).toMatch(/<fieldset disabled="" aria-label="Guest list">/)
    const prompt = buildPortraitPrompt({ studio: experience.studio, answers: [{ slot: 'subject', answer: 'owl' }], name: '' })
    expect(prompt).toContain(STUDIO_IMAGE_PROMPT_DEFAULTS.untitled)
    expect(prompt).not.toContain('name banner')
  })
})

