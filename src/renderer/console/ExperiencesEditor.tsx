import * as React from 'react'
import { useState } from 'react'
import type { AvatarProfile } from '../../shared/avatar-profiles'
import { DEFAULT_PRESENTATION } from '../../shared/presentation'
import {
  defaultExperience, parseAvatarExperience, STUDIO_MAX_GUESTS, STUDIO_MAX_QUESTIONS, STUDIO_SLOTS, validGuestName,
  type AvatarExperience, type GuestMatchMode, type StudioQuality, type StudioQuestion, type StudioSettings, type StudioSlot,
} from '../../shared/portrait-studio'
import { HelpField } from './HelpField'
import { NumberInput } from './NumberInput'
import { FIELD_HELP } from './field-help-text'

export const SLOT_LABELS: Readonly<Record<StudioSlot, string>> = Object.freeze({
  subject: 'Main figure or creature', setting: 'Place', mood: 'Mood and light', palette: 'Main colour',
  companion: 'Companion', style: 'Extra style wish', detail: 'Detail to include',
})
export const QUALITY_LABELS: Readonly<Record<StudioQuality, string>> = Object.freeze({ low: 'Fast', medium: 'Standard', high: 'Best' })
export const GUEST_MATCH_LABELS: Readonly<Record<GuestMatchMode, string>> = Object.freeze({
  off: 'Off', prefer: 'Prefer guest list', only: 'Only guests on the list',
})
const GREETING_MAX = 500
const CONTROL = /[\u0000-\u001f\u007f]/u

export function experienceOf(avatar: Pick<AvatarProfile, 'experience'>): AvatarExperience {
  return avatar.experience ?? defaultExperience()
}

/** Smallest unused `qN` id; existing ids never change on reorder or removal. */
export function nextQuestionId(questions: readonly Pick<StudioQuestion, 'id'>[]): string {
  const used = new Set(questions.map(question => question.id))
  let n = 1
  while (used.has(`q${n}`)) n += 1
  return `q${n}`
}

const withQuestions = (experience: AvatarExperience, questions: StudioQuestion[]): AvatarExperience =>
  ({ ...experience, studio: { ...experience.studio, questions } })

export function addQuestion(experience: AvatarExperience): AvatarExperience {
  const questions = experience.studio.questions
  if (questions.length >= STUDIO_MAX_QUESTIONS) return experience
  const slot = STUDIO_SLOTS.find(candidate => !questions.some(question => question.slot === candidate)) ?? 'detail'
  return withQuestions(experience, [...questions, { id: nextQuestionId(questions), zh: '', en: '', slot }])
}

export function removeQuestion(experience: AvatarExperience, index: number): AvatarExperience {
  const questions = experience.studio.questions
  if (questions.length <= 1 || index < 0 || index >= questions.length) return experience
  return withQuestions(experience, questions.filter((_, i) => i !== index))
}

export function moveQuestion(experience: AvatarExperience, index: number, delta: -1 | 1): AvatarExperience {
  const questions = [...experience.studio.questions]
  const target = index + delta
  if (index < 0 || index >= questions.length || target < 0 || target >= questions.length) return experience
  ;[questions[index], questions[target]] = [questions[target]!, questions[index]!]
  return withQuestions(experience, questions)
}

export function updateQuestion(experience: AvatarExperience, index: number, patch: Partial<Omit<StudioQuestion, 'id'>>): AvatarExperience {
  return withQuestions(experience, experience.studio.questions.map((question, i) => i === index ? { ...question, ...patch } : question))
}

export interface GuestListParse { readonly names: string[]; readonly issues: string[] }

/** One name per line: trimmed, blank lines dropped. Invalid names are kept so validation can flag them. */
export function parseGuestList(text: string): GuestListParse {
  const names: string[] = []
  const issues: string[] = []
  text.split(/\r\n|\r|\n/).forEach((line, index) => {
    const name = line.trim()
    if (!name) return
    names.push(name)
    if (!validGuestName(name)) issues.push(`Line ${index + 1} ${guestNameProblem(name)}`)
  })
  if (names.length > STUDIO_MAX_GUESTS) issues.unshift(`The list has ${names.length.toLocaleString('en-US')} names; the limit is ${STUDIO_MAX_GUESTS.toLocaleString('en-US')}.`)
  return { names, issues }
}

const guestNameProblem = (name: string): string => name.length > 40 ? `is longer than 40 characters (${name.length}).` : 'contains a tab or another control character.'

export function guestIssueText(issues: readonly string[]): string {
  if (!issues.length) return ''
  const shown = issues.slice(0, 3).join(' ')
  return issues.length > 3 ? `${shown} ${issues.length - 3} more problems.` : shown
}

export function textIssue(value: unknown, max: number, missing: string, allowEmpty = false, multiline = false): string {
  if (typeof value !== 'string') return missing
  if (multiline ? /[\u0000-\u0009\u000b-\u001f\u007f]/u.test(value) : CONTROL.test(value)) {
    return multiline ? 'Remove tabs and other control characters.' : 'Remove line breaks, tabs and other control characters.'
  }
  if (value.length > max) return `Use ${max} characters or fewer (now ${value.length}).`
  if (!allowEmpty && !value.trim()) return missing
  return ''
}

const wholeIssue = (value: number, min: number, max: number, unit: string): string =>
  Number.isInteger(value) && value >= min && value <= max ? '' : `Enter a whole number of ${unit} from ${min} to ${max}.`

/** Field-level issues keyed by field: `startScript`, `nameQuestion.zh`, `questions.<i>.en`, `guests.names`, … */
export function experienceIssues(experience: AvatarExperience): Record<string, string> {
  const issues: Record<string, string> = {}
  const add = (key: string, message: string): void => { if (message) issues[key] = message }
  const studio = experience.studio
  add('startScript', textIssue(studio.startScript, 500, 'Enter what the avatar says when Portrait Studio starts.', false, true))
  add('nameQuestion.zh', textIssue(studio.nameQuestion.zh, 200, 'Enter the name question in Traditional Chinese.'))
  add('nameQuestion.en', textIssue(studio.nameQuestion.en, 200, 'Enter the name question in English.'))
  if (studio.questions.length < 1 || studio.questions.length > STUDIO_MAX_QUESTIONS) add('questions', `Keep 1 to ${STUDIO_MAX_QUESTIONS} questions.`)
  const ids = new Set<string>()
  studio.questions.forEach((question, index) => {
    add(`questions.${index}.zh`, textIssue(question.zh, 200, 'Enter this question in Traditional Chinese.'))
    add(`questions.${index}.en`, textIssue(question.en, 200, 'Enter this question in English.'))
    if (!STUDIO_SLOTS.includes(question.slot)) add(`questions.${index}.slot`, 'Choose what this answer shapes.')
    if (!/^[a-z0-9][a-z0-9_-]{0,31}$/.test(question.id) || ids.has(question.id)) add(`questions.${index}.id`, 'This question has an invalid or repeated id. Remove it and add it again.')
    ids.add(question.id)
  })
  add('artStyle', textIssue(studio.artStyle, 600, 'Describe the painting style.', false, true))
  add('revisionsAllowed', wholeIssue(studio.revisionsAllowed, 0, 3, 'changes'))
  add('holdSeconds', wholeIssue(studio.holdSeconds, 10, 300, 'seconds'))
  const guests = experience.guests.names
  // An empty list cannot restrict names, so Only guests on the list would accept anyone.
  if (experience.guests.match === 'only' && guests.length === 0) add('guests.names', 'Only guests on the list needs at least one name. Add guest names or choose Prefer guest list.')
  if (guests.length > STUDIO_MAX_GUESTS || !guests.every(validGuestName)) {
    add('guests.names', guestIssueText([
      ...(guests.length > STUDIO_MAX_GUESTS ? [`The list has ${guests.length.toLocaleString('en-US')} names; the limit is ${STUDIO_MAX_GUESTS.toLocaleString('en-US')}.`] : []),
      ...guests.flatMap((name, index) => validGuestName(name) ? [] : [`Name ${index + 1} ${guestNameProblem(name)}`]),
    ]))
  }
  if (!Object.keys(issues).length && !parseAvatarExperience(experience)) issues.experience = 'These settings do not pass validation. Check every field in this section.'
  return issues
}

export function ExperiencesEditor({ avatar, disabled, onChange }: {
  avatar: AvatarProfile
  disabled: boolean
  onChange(avatar: AvatarProfile): void
}): React.JSX.Element {
  const experience = experienceOf(avatar)
  const studio = experience.studio
  const issues = experienceIssues(experience)
  const greeting = avatar.presentation?.wakeGreeting ?? DEFAULT_PRESENTATION.wakeGreeting ?? ''
  const greetingIssue = greeting.length > GREETING_MAX ? `Use ${GREETING_MAX} characters or fewer (now ${greeting.length}).` : ''
  const issueCount = Object.keys(issues).length + (greetingIssue ? 1 : 0)
  const set = (next: AvatarExperience): void => { if (!disabled) onChange({ ...avatar, experience: next }) }
  const setStudio = (patch: Partial<StudioSettings>): void => set({ ...experience, studio: { ...studio, ...patch } })
  const count = studio.questions.length
  return <div className="experiences-editor">
    <p className={`experiences-editor__status experiences-editor__status--${issueCount ? 'attention' : 'ready'}`} role="status" aria-live="polite">
      <span aria-hidden="true">{issueCount ? '⚠' : '✓'}</span> {issueCount
        ? `${issueCount} ${issueCount === 1 ? 'field needs' : 'fields need'} attention before saving.`
        : 'Experience settings are ready to save.'}{issues.experience ? ` ${issues.experience}` : ''}
    </p>
    <fieldset disabled={disabled} aria-label="After wake">
      <legend>After wake</legend>
      <div className="console__form-grid">
        <HelpField help={FIELD_HELP.experienceDefaultMode}>Default mode after wake<select value={experience.defaultMode}
          onChange={e => set({ ...experience, defaultMode: e.currentTarget.value === 'portrait_studio' ? 'portrait_studio' : 'conversation' })}>
          <option value="conversation">Conversation</option>
          <option value="portrait_studio">Portrait Studio</option>
        </select></HelpField>
        <HelpField help={FIELD_HELP.experienceAfterPortrait}>After the portrait<select value={experience.afterPortrait}
          onChange={e => set({ ...experience, afterPortrait: e.currentTarget.value === 'farewell' ? 'farewell' : 'continue' })}>
          <option value="continue">Keep chatting</option>
          <option value="farewell">Say farewell and sleep</option>
        </select></HelpField>
        <HelpField help={FIELD_HELP.experienceConversationScript} error={greetingIssue || undefined}>Conversation start script (Wake greeting)<textarea
          lang="zh-Hant" maxLength={GREETING_MAX} value={greeting}
          onChange={e => { if (!disabled) onChange({ ...avatar, presentation: { ...DEFAULT_PRESENTATION, ...avatar.presentation, wakeGreeting: e.currentTarget.value } }) }} /></HelpField>
        <HelpField help={FIELD_HELP.experienceStudioScript} error={issues.startScript}>Portrait Studio start script<textarea
          lang="zh-Hant" maxLength={500} value={studio.startScript} onChange={e => setStudio({ startScript: e.currentTarget.value })} /></HelpField>
        <HelpField help={FIELD_HELP.experienceVisitorMayRequest}><input type="checkbox" checked={experience.visitorMayRequest}
          onChange={e => set({ ...experience, visitorMayRequest: e.currentTarget.checked })} /> Visitors may ask for a portrait during conversation</HelpField>
      </div>
      <p className="console__muted">{experience.defaultMode === 'portrait_studio'
        ? 'After wake the avatar speaks the Portrait Studio start script and begins with the name question.'
        : 'After wake the avatar speaks the Conversation start script and chats.'}</p>
    </fieldset>

    <fieldset disabled={disabled} aria-label="Portrait questions">
      <legend>Questions</legend>
      <p className="console__muted">The name question is always asked first. Then the avatar asks these questions in order. {count} of {STUDIO_MAX_QUESTIONS} questions.</p>
      <div className="experiences-editor__question experiences-editor__question--name" role="group" aria-label="Name question, always asked first">
        <div className="experiences-editor__question-head"><strong>Name question · always first</strong></div>
        <div className="console__form-grid">
          <HelpField help={FIELD_HELP.studioNameQuestionZh} helpLabel="Name question in Traditional Chinese" error={issues['nameQuestion.zh']}>Traditional Chinese<input type="text" lang="zh-Hant" maxLength={200}
            aria-label="Name question in Traditional Chinese" value={studio.nameQuestion.zh}
            onChange={e => setStudio({ nameQuestion: { ...studio.nameQuestion, zh: e.currentTarget.value } })} /></HelpField>
          <HelpField help={FIELD_HELP.studioNameQuestionEn} helpLabel="Name question in English" error={issues['nameQuestion.en']}>English<input type="text" lang="en" maxLength={200}
            aria-label="Name question in English" value={studio.nameQuestion.en}
            onChange={e => setStudio({ nameQuestion: { ...studio.nameQuestion, en: e.currentTarget.value } })} /></HelpField>
        </div>
      </div>
      <ol className="experiences-editor__questions">
        {studio.questions.map((question, index) => {
          const n = index + 1
          return <li key={question.id} className="experiences-editor__question" aria-label={`Question ${n}`}>
            <div className="experiences-editor__question-head">
              <strong>Question {n}</strong><span className="console__muted">{SLOT_LABELS[question.slot] ?? question.slot}</span>
              <div className="experiences-editor__arrange" role="group" aria-label={`Arrange question ${n}`}>
                <button type="button" aria-label={`Move question ${n} up`} disabled={disabled || index === 0}
                  onClick={() => set(moveQuestion(experience, index, -1))}>Move up</button>
                <button type="button" aria-label={`Move question ${n} down`} disabled={disabled || index === count - 1}
                  onClick={() => set(moveQuestion(experience, index, 1))}>Move down</button>
                <button type="button" aria-label={`Remove question ${n}`} disabled={disabled || count <= 1}
                  onClick={() => set(removeQuestion(experience, index))}>Remove</button>
              </div>
            </div>
            {issues[`questions.${index}.id`] && <p className="field-error">{issues[`questions.${index}.id`]}</p>}
            <div className="console__form-grid">
              <HelpField help={FIELD_HELP.studioQuestionZh} helpLabel={`Question ${n} in Traditional Chinese`} error={issues[`questions.${index}.zh`]}>Traditional Chinese<input type="text" lang="zh-Hant" maxLength={200}
                aria-label={`Question ${n} in Traditional Chinese`} value={question.zh}
                onChange={e => set(updateQuestion(experience, index, { zh: e.currentTarget.value }))} /></HelpField>
              <HelpField help={FIELD_HELP.studioQuestionEn} helpLabel={`Question ${n} in English`} error={issues[`questions.${index}.en`]}>English<input type="text" lang="en" maxLength={200}
                aria-label={`Question ${n} in English`} value={question.en}
                onChange={e => set(updateQuestion(experience, index, { en: e.currentTarget.value }))} /></HelpField>
              <HelpField help={FIELD_HELP.studioQuestionSlot} helpLabel={`Question ${n} answer shapes`} error={issues[`questions.${index}.slot`]}>Answer shapes<select aria-label={`Question ${n} answer shapes`} value={question.slot}
                onChange={e => { const slot = STUDIO_SLOTS.find(s => s === e.currentTarget.value); if (slot) set(updateQuestion(experience, index, { slot })) }}>
                {STUDIO_SLOTS.map(slot => <option key={slot} value={slot}>{SLOT_LABELS[slot]}</option>)}
              </select></HelpField>
            </div>
          </li>
        })}
      </ol>
      <div className="console__action-row">
        <button type="button" disabled={disabled || count >= STUDIO_MAX_QUESTIONS} aria-describedby="experiences-question-limit"
          onClick={() => set(addQuestion(experience))}>Add question</button>
        <span id="experiences-question-limit" className="console__muted">{count >= STUDIO_MAX_QUESTIONS
          ? `${STUDIO_MAX_QUESTIONS} questions is the maximum. Remove one to add another.`
          : count <= 1 ? 'At least one question is required.' : `You can add ${STUDIO_MAX_QUESTIONS - count} more.`}</span>
      </div>
      {issues.questions && <p className="field-error">{issues.questions}</p>}
    </fieldset>

    <fieldset disabled={disabled} aria-label="Portrait">
      <legend>Portrait</legend>
      <div className="console__form-grid">
        <HelpField help={FIELD_HELP.studioArtStyle} error={issues.artStyle}>Art style<textarea lang="en" maxLength={600} value={studio.artStyle}
          onChange={e => setStudio({ artStyle: e.currentTarget.value })} /></HelpField>
        <HelpField help={FIELD_HELP.studioNameLettering}>Name lettering<select value={studio.nameLettering}
          onChange={e => setStudio({ nameLettering: e.currentTarget.value === 'painted' ? 'painted' : 'nameplate' })}>
          <option value="nameplate">Nameplate (exact characters)</option>
          <option value="painted">Painted into the picture</option>
        </select></HelpField>
        <HelpField help={FIELD_HELP.studioQuality}>Quality<select value={studio.quality}
          onChange={e => { const quality = (['low', 'medium', 'high'] as const).find(q => q === e.currentTarget.value); if (quality) setStudio({ quality }) }}>
          {(['low', 'medium', 'high'] as const).map(quality => <option key={quality} value={quality}>{QUALITY_LABELS[quality]}</option>)}
        </select></HelpField>
        <HelpField help={FIELD_HELP.studioRevisions} error={issues.revisionsAllowed}>Changes allowed<NumberInput min={0} max={3} step={1}
          value={studio.revisionsAllowed} onChange={e => setStudio({ revisionsAllowed: Number(e.currentTarget.value) })} /></HelpField>
        <HelpField help={FIELD_HELP.studioHoldSeconds} error={issues.holdSeconds}>Show final for (seconds)<NumberInput min={10} max={300} step={1}
          value={studio.holdSeconds} onChange={e => setStudio({ holdSeconds: Number(e.currentTarget.value) })} /></HelpField>
      </div>
    </fieldset>

    <fieldset disabled={disabled} aria-label="Guest list">
      <legend>Guest list</legend>
      <p className="console__muted">The guest list stays on this Mac. The model only ever sees up to three names that match what the visitor said.</p>
      <div className="console__form-grid">
        <HelpField help={FIELD_HELP.guestMatch}>Match mode<select value={experience.guests.match}
          onChange={e => { const match = (['off', 'prefer', 'only'] as const).find(m => m === e.currentTarget.value); if (match) set({ ...experience, guests: { ...experience.guests, match } }) }}>
          {(['off', 'prefer', 'only'] as const).map(match => <option key={match} value={match}>{GUEST_MATCH_LABELS[match]}</option>)}
        </select></HelpField>
        <GuestListField names={experience.guests.names} fallbackIssue={issues['guests.names']}
          onNames={names => set({ ...experience, guests: { ...experience.guests, names } })} />
      </div>
    </fieldset>
  </div>
}

const sameNames = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((name, i) => name === b[i])

/** Keeps the operator's raw lines (including a trailing newline) while the draft holds the parsed names. */
export function GuestListField({ names, onNames, fallbackIssue }: {
  names: readonly string[]
  onNames(names: string[]): void
  fallbackIssue?: string
}): React.JSX.Element {
  const [text, setText] = useState(() => names.join('\n'))
  const shown = sameNames(parseGuestList(text).names, names) ? text : names.join('\n')
  const parsed = parseGuestList(shown)
  const issue = guestIssueText(parsed.issues) || fallbackIssue
  return <HelpField help={FIELD_HELP.guestNames} error={issue || undefined} className="experiences-editor__guests">
    Guest names · {parsed.names.length.toLocaleString('en-US')} of {STUDIO_MAX_GUESTS.toLocaleString('en-US')}<textarea rows={8} spellCheck={false}
      aria-label="Guest names, one per line" value={shown}
      onChange={e => { const value = e.currentTarget.value; setText(value); onNames(parseGuestList(value).names) }} />
  </HelpField>
}
