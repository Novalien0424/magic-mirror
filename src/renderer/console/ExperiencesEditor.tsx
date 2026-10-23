import * as React from 'react'
import { useState } from 'react'
import type { AvatarProfile } from '../../shared/avatar-profiles'
import {
  defaultExperience, parseAvatarExperience, STUDIO_FAILURE_INFO, STUDIO_FAILURE_KEYS, STUDIO_IMAGE_LINE_MAX, STUDIO_IMAGE_PROMPT_INFO,
  STUDIO_IMAGE_PROMPT_KEYS, STUDIO_MAX_GUESTS, STUDIO_MAX_QUESTIONS, STUDIO_CHARACTER_MAX, STUDIO_FAREWELL_LINES, studioCharacterIssue,
  studioFarewellIssue, studioWakePhraseIssue, STUDIO_PLACEHOLDER_INFO, STUDIO_PROMPT_INFO, STUDIO_PROMPT_MAX,
  STUDIO_PROMPT_PLACEHOLDERS, STUDIO_PROMPT_STAGES, STUDIO_SCREEN_INFO, STUDIO_SCREEN_KEYS, STUDIO_SLOTS, studioFailureIssue,
  studioImageLineIssue, studioImagePromptIssue, studioNameFontIssue, studioPictureType, studioPromptIssue, studioScreenIssue, validGuestName,
  STUDIO_NAME_FONT_MAX, STUDIO_QUESTION_MAX, type StudioPictureType,
  type AvatarExperience, type GuestMatchMode, type StudioFailureKey, type StudioImagePromptKey, type StudioLanguage, type StudioPromptStage,
  type StudioQuality, type StudioQuestion, type StudioScreenKey, type StudioSettings, type StudioSlot,
} from '../../shared/portrait-studio'
import {
  STUDIO_DEFAULT_FAREWELL, STUDIO_DEFAULT_NAME_FONT, STUDIO_DEFAULT_WAKE_PHRASE, STUDIO_PROMPT_DEFAULTS, studioFailureLine, studioImagePrompt, studioImagePromptDefault,
  studioPrompt, studioQuestionLine, studioScreenText, studioWakePhrase,
} from '../../shared/portrait-studio-config'
import { buildPortraitPrompt, buildRevisionPrompt, STUDIO_SAMPLE_ANSWERS } from '../../shared/studio-image-prompt'
import { HelpField } from './HelpField'
import { HelpButton, InfoTip } from './HelpButton'
import { NumberInput } from './NumberInput'
import { FIELD_HELP } from './field-help-text'
import { speechScriptIssue } from '../../shared/speech-script'

export const SLOT_LABELS: Readonly<Record<StudioSlot, string>> = Object.freeze({
  subject: 'Main figure or creature', setting: 'Place', mood: 'Mood and light', palette: 'Main colour',
  companion: 'Companion', style: 'Extra style wish', detail: 'Detail to include',
})
export const QUALITY_LABELS: Readonly<Record<StudioQuality, string>> = Object.freeze({ low: 'Fast', medium: 'Standard', high: 'Best' })
export const GUEST_MATCH_LABELS: Readonly<Record<GuestMatchMode, string>> = Object.freeze({
  off: 'Off', prefer: 'Suggest names from the list', only: 'Only accept listed names',
})
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

/** Text equal to the default stores no override, so later default improvements still apply. */
export function setStagePrompt(experience: AvatarExperience, stage: StudioPromptStage, text: string): AvatarExperience {
  const prompts = { ...experience.studio.prompts }
  if (text === STUDIO_PROMPT_DEFAULTS[stage]) delete prompts[stage]
  else prompts[stage] = text
  return { ...experience, studio: { ...experience.studio, prompts } }
}

export function resetStagePrompts(experience: AvatarExperience, stage?: StudioPromptStage): AvatarExperience {
  const prompts = { ...experience.studio.prompts }
  if (stage) delete prompts[stage]
  return { ...experience, studio: { ...experience.studio, prompts: stage ? prompts : {} } }
}

const withStudio = (experience: AvatarExperience, patch: Partial<StudioSettings>): AvatarExperience =>
  ({ ...experience, studio: { ...experience.studio, ...patch } })

/** Same rule as stage prompts: text equal to the default (for this picture type) stores no edit. */
export function setImagePrompt(experience: AvatarExperience, key: StudioImagePromptKey, text: string): AvatarExperience {
  const imagePrompt = { ...experience.studio.imagePrompt }
  if (text === studioImagePromptDefault(key, studioPictureType(experience.studio))) delete imagePrompt[key]
  else imagePrompt[key] = text
  return withStudio(experience, { imagePrompt })
}
/** The default lettering stores no edit. */
export function setNameFont(experience: AvatarExperience, text: string): AvatarExperience {
  const { nameFont: _font, ...studio } = experience.studio
  return { ...experience, studio: text === STUDIO_DEFAULT_NAME_FONT ? studio : { ...studio, nameFont: text } }
}
export function resetImagePrompts(experience: AvatarExperience, key?: StudioImagePromptKey): AvatarExperience {
  const imagePrompt = { ...experience.studio.imagePrompt }
  if (key) delete imagePrompt[key]
  return withStudio(experience, { imagePrompt: key ? imagePrompt : {} })
}
/** A line equal to its image part's default stores no edit, so the preset keeps applying. */
export function setQuestionLine(experience: AvatarExperience, index: number, text: string | undefined): AvatarExperience {
  return withQuestions(experience, experience.studio.questions.map((question, i) => {
    if (i !== index) return question
    const { imageLine: _line, ...rest } = question
    return text === undefined || text === studioQuestionLine(rest) ? rest : { ...rest, imageLine: text }
  }))
}
type Bilingual = Record<StudioLanguage, string>
function setPair<K extends string>(map: Partial<Record<K, Bilingual>> | undefined, key: K, language: StudioLanguage, text: string,
  current: (language: StudioLanguage) => string, fallback: (language: StudioLanguage) => string): Partial<Record<K, Bilingual>> {
  const pair = { zh: current('zh'), en: current('en'), [language]: text }
  const next: Partial<Record<K, Bilingual>> = { ...map }
  if (pair.zh === fallback('zh') && pair.en === fallback('en')) delete next[key]
  else next[key] = pair
  return next
}
export function setScreenText(experience: AvatarExperience, key: StudioScreenKey, language: StudioLanguage, text: string): AvatarExperience {
  const studio = experience.studio
  return withStudio(experience, { screenText: setPair(studio.screenText, key, language, text,
    lang => studioScreenText(studio, key, lang), lang => studioScreenText(undefined, key, lang)) })
}
export function setFailureLine(experience: AvatarExperience, key: StudioFailureKey, language: StudioLanguage, text: string): AvatarExperience {
  const studio = experience.studio
  return withStudio(experience, { failureLines: setPair(studio.failureLines, key, language, text,
    lang => studioFailureLine(key, lang, studio), lang => studioFailureLine(key, lang)) })
}
export function resetTextMap(experience: AvatarExperience, map: 'screenText' | 'failureLines', key?: string): AvatarExperience {
  const next = { ...experience.studio[map] } as Record<string, Bilingual>
  if (key) delete next[key]
  return withStudio(experience, { [map]: key ? next : {} })
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
  add('startScript', textIssue(studio.startScript, 500, 'Enter what the avatar says when the Interactive Studio starts.', false, true))
  if (studio.startScript.trim()) add('startScript', speechScriptIssue(studio.startScript))
  if (studio.wakePhrase !== undefined) add('wakePhrase', studioWakePhraseIssue(studio.wakePhrase))
  if (studio.farewell !== undefined) add('farewell', studioFarewellIssue(studio.farewell))
  if (studio.character !== undefined) add('character', studioCharacterIssue(studio.character))
  add('nameQuestion.zh', textIssue(studio.nameQuestion.zh, 200, 'Enter the name question in Traditional Chinese.') || speechScriptIssue(studio.nameQuestion.zh))
  add('nameQuestion.en', textIssue(studio.nameQuestion.en, 200, 'Enter the name question in English.') || speechScriptIssue(studio.nameQuestion.en))
  if (studio.questions.length < 1 || studio.questions.length > STUDIO_MAX_QUESTIONS) add('questions', `Keep 1 to ${STUDIO_MAX_QUESTIONS} questions.`)
  const ids = new Set<string>()
  studio.questions.forEach((question, index) => {
    add(`questions.${index}.zh`, textIssue(question.zh, STUDIO_QUESTION_MAX, 'Enter this question in Traditional Chinese.', false, true) || (question.zh.trim() ? speechScriptIssue(question.zh) : ''))
    add(`questions.${index}.en`, textIssue(question.en, STUDIO_QUESTION_MAX, 'Enter this question in English.', false, true) || (question.en.trim() ? speechScriptIssue(question.en) : ''))
    if (!STUDIO_SLOTS.includes(question.slot)) add(`questions.${index}.slot`, 'Choose what this answer shapes.')
    if (question.imageLine !== undefined) add(`questions.${index}.imageLine`, studioImageLineIssue(question.imageLine))
    if (!/^[a-z0-9][a-z0-9_-]{0,31}$/.test(question.id) || ids.has(question.id)) add(`questions.${index}.id`, 'This question has an invalid or repeated id. Remove it and add it again.')
    ids.add(question.id)
  })
  add('artStyle', textIssue(studio.artStyle, 600, 'Describe the painting style.', false, true))
  if (studio.nameFont !== undefined) add('nameFont', studioNameFontIssue(studio.nameFont))
  add('revisionsAllowed', wholeIssue(studio.revisionsAllowed, 0, 3, 'changes'))
  add('holdSeconds', wholeIssue(studio.holdSeconds, 10, 300, 'seconds'))
  const guests = experience.guests.names
  // An empty list cannot restrict names, so Only guests on the list would accept anyone.
  if (studio.askName !== false && experience.guests.match === 'only' && guests.length === 0) add('guests.names', 'Only accept listed names needs at least one name. Add names or choose Suggest names from the list.')
  if (guests.length > STUDIO_MAX_GUESTS || !guests.every(validGuestName)) {
    add('guests.names', guestIssueText([
      ...(guests.length > STUDIO_MAX_GUESTS ? [`The list has ${guests.length.toLocaleString('en-US')} names; the limit is ${STUDIO_MAX_GUESTS.toLocaleString('en-US')}.`] : []),
      ...guests.flatMap((name, index) => validGuestName(name) ? [] : [`Name ${index + 1} ${guestNameProblem(name)}`]),
    ]))
  }
  for (const stage of STUDIO_PROMPT_STAGES) {
    const text = studio.prompts?.[stage]
    if (text !== undefined) add(`prompts.${stage}`, studioPromptIssue(stage, text))
  }
  for (const key of STUDIO_IMAGE_PROMPT_KEYS) {
    const text = studio.imagePrompt?.[key]
    if (text !== undefined) add(`imagePrompt.${key}`, studioImagePromptIssue(key, text))
  }
  for (const key of STUDIO_SCREEN_KEYS) for (const language of ['zh', 'en'] as const) {
    const text = studio.screenText?.[key]?.[language]
    if (text !== undefined) add(`screenText.${key}.${language}`, studioScreenIssue(key, text))
  }
  for (const key of STUDIO_FAILURE_KEYS) for (const language of ['zh', 'en'] as const) {
    const text = studio.failureLines?.[key]?.[language]
    if (text !== undefined) add(`failureLines.${key}.${language}`, studioFailureIssue(text))
  }
  if (!Object.keys(issues).length && !parseAvatarExperience(experience)) issues.experience = 'These settings do not pass validation. Check every field in this section.'
  return issues
}

export function ExperiencesEditor({ avatar, disabled, onChange }: {
  avatar: AvatarProfile
  disabled: boolean
  onChange(avatar: AvatarProfile): void
  /** Kept for callers; the conversation greeting lives in Persona. */
  onEditGreeting?(): void
}): React.JSX.Element {
  const experience = experienceOf(avatar)
  const studio = experience.studio
  const issues = experienceIssues(experience)
  const issueCount = Object.keys(issues).length
  const set = (next: AvatarExperience): void => { if (!disabled) onChange({ ...avatar, experience: next }) }
  // An undefined value removes the edit, so the versioned default (or Persona) applies again.
  const setStudio = (patch: Partial<StudioSettings>): void => {
    const next: Record<string, unknown> = { ...studio, ...patch }
    for (const [key, value] of Object.entries(patch)) if (value === undefined) delete next[key]
    set({ ...experience, studio: next as unknown as StudioSettings })
  }
  const count = studio.questions.length
  const askName = studio.askName !== false
  const character = studio.character ?? avatar.personality
  return <div className="experiences-editor">
    <p className={`experiences-editor__status${issueCount ? ' experiences-editor__status--attention' : ''}`} role="status" aria-live="polite">
      {issueCount > 0 && <><span aria-hidden="true">⚠</span> {`${issueCount} ${issueCount === 1 ? 'field needs' : 'fields need'} attention before saving.`}
        {issues.experience ? ` ${issues.experience}` : ''}</>}
    </p>
    <p className="console__muted experiences-editor__intro">In Interactive Studio mode (control bar › Mirror mode, or INTERACTIVE STUDIO on the Stream Deck) the mirror wakes to the studio
      wake phrase, runs these steps in order, shows the soul, speaks the transfer and farewell, and returns to Dormant.</p>
    <button type="button" disabled={disabled} onClick={() => {
      const defaults = defaultExperience().studio
      setStudio({ startScript: defaults.startScript, askName: true, nameQuestion: defaults.nameQuestion,
        questions: defaults.questions, revisionsAllowed: defaults.revisionsAllowed, farewell: undefined })
    }}>Restore default script and questions</button>
    <p className="console__muted">Restores the opening, name question, four story questions, one allowed change and farewell. Character, voice, name list and picture settings keep their current values.</p>

    <fieldset disabled={disabled} aria-label="Start">
      <legend>1 · Start</legend>
      <div className="experiences-editor__grid experiences-editor__grid--2">
        <div>
          <HelpField help={FIELD_HELP.studioWakePhrase} error={issues.wakePhrase}>Studio wake phrase{studio.wakePhrase !== undefined ? ' · edited' : ''}<input type="text" lang="zh-Hant"
            maxLength={96} value={studioWakePhrase(studio)} onChange={e => setStudio({ wakePhrase: e.currentTarget.value === STUDIO_DEFAULT_WAKE_PHRASE ? undefined : e.currentTarget.value })} /></HelpField>
          <div className="experiences-editor__reset-row">
            <button type="button" disabled={disabled || studio.wakePhrase === undefined} onClick={() => setStudio({ wakePhrase: undefined })}>Reset wake phrase to default</button>
          </div>
        </div>
        <HelpField help={FIELD_HELP.experienceStudioScript} error={issues.startScript}>Studio start script<textarea
          lang="zh-Hant" rows={2} maxLength={500} value={studio.startScript} onChange={e => setStudio({ startScript: e.currentTarget.value })} /></HelpField>
        <p className="console__muted">Insert <code>[pause=1s]</code> for a timed pause in spoken scripts or questions (0.1–10 seconds). The marker is never spoken.</p>
      </div>
    </fieldset>

    <fieldset disabled={disabled} aria-label="Character">
      <legend>2 · Character</legend>
      <HelpField help={FIELD_HELP.studioCharacter} error={issues.character}>Studio character (system prompt){studio.character !== undefined ? ' · edited' : ' · from Persona'}<textarea
        rows={4} maxLength={STUDIO_CHARACTER_MAX} value={character}
        onChange={e => setStudio({ character: e.currentTarget.value === avatar.personality ? undefined : e.currentTarget.value })} /></HelpField>
      <div className="experiences-editor__reset-row">
        <button type="button" disabled={disabled || studio.character === undefined} onClick={() => setStudio({ character: undefined })}>Use the Persona personality</button>
      </div>
      <HelpField help={`${STUDIO_PROMPT_INFO.instructions.when} ${FIELD_HELP.studioStagePrompt}`} error={issues['prompts.instructions']}>
        Studio rules (system prompt){studio.prompts?.instructions !== undefined ? ' · edited' : ''}<textarea rows={6} maxLength={STUDIO_PROMPT_MAX.instructions}
          value={studioPrompt(studio, 'instructions')} onChange={e => set(setStagePrompt(experience, 'instructions', e.currentTarget.value))} /></HelpField>
      <div className="experiences-editor__reset-row">
        <button type="button" disabled={disabled || studio.prompts?.instructions === undefined} onClick={() => set(resetStagePrompts(experience, 'instructions'))}>Reset rules to default</button>
      </div>
    </fieldset>

    <fieldset disabled={disabled} aria-label="Studio questions">
      <legend>3 · Name and questions <span className="experiences-editor__count">{count} of {STUDIO_MAX_QUESTIONS}</span> <InfoTip label="Questions"
        help="The avatar asks these questions in order (after the name, when it is asked). Each answer enters the image prompt through its own image prompt line." /></legend>
      <HelpField help={FIELD_HELP.studioAskName}><input type="checkbox" checked={askName}
        onChange={e => setStudio({ askName: e.currentTarget.checked })} /> Ask for a name first</HelpField>
      <p className="console__muted">Each question waits for up to 30 seconds of silence after speech finishes. No name: 無名之人. No answer: 未回答, followed by “不回答 也是一種回答”.</p>
      <p className="console__muted">Only the first question addresses the visitor by name. Questions and guidance are spoken; the Mirror shows only the visitor’s name as text. Replies stay in Traditional Chinese unless the visitor explicitly requests English.</p>
      <div className="experiences-editor__question experiences-editor__question--name" role="group" aria-label="Name question, asked first" data-off={!askName || undefined}>
        <div className="experiences-editor__question-head"><strong>{askName ? 'Name question · asked first' : 'Name question · off'}</strong></div>
        <div className="experiences-editor__grid experiences-editor__grid--2">
          <HelpField help={FIELD_HELP.studioNameQuestionZh} helpLabel="Name question in Traditional Chinese" error={issues['nameQuestion.zh']}>Traditional Chinese<input type="text" lang="zh-Hant" maxLength={200}
            aria-label="Name question in Traditional Chinese" value={studio.nameQuestion.zh} disabled={!askName}
            onChange={e => setStudio({ nameQuestion: { ...studio.nameQuestion, zh: e.currentTarget.value } })} /></HelpField>
          <HelpField help={FIELD_HELP.studioNameQuestionEn} helpLabel="Name question in English" error={issues['nameQuestion.en']}>English<input type="text" lang="en" maxLength={200}
            aria-label="Name question in English" value={studio.nameQuestion.en} disabled={!askName}
            onChange={e => setStudio({ nameQuestion: { ...studio.nameQuestion, en: e.currentTarget.value } })} /></HelpField>
        </div>
      </div>
      <fieldset disabled={disabled || !askName} aria-label="Name list">
        <legend>Name list for confirmation</legend>
        <p className="console__muted">Enter names with their correct spelling, one per line. The avatar searches its local list by spelling and pronunciation, reads back a suggested name, and waits for the visitor to confirm. A correction is read back again.</p>
        <div className="experiences-editor__grid experiences-editor__grid--guests">
          <HelpField help={FIELD_HELP.guestMatch}>Name matching<select aria-label="Name matching" value={experience.guests.match}
            onChange={e => { const match = (['off', 'prefer', 'only'] as const).find(m => m === e.currentTarget.value); if (match) set({ ...experience, guests: { ...experience.guests, match } }) }}>
            {(['off', 'prefer', 'only'] as const).map(match => <option key={match} value={match}>{GUEST_MATCH_LABELS[match]}</option>)}
          </select></HelpField>
          <GuestListField names={experience.guests.names} fallbackIssue={issues['guests.names']}
            onNames={names => set({ ...experience, guests: { ...experience.guests, names } })} />
        </div>
        <p className="console__muted">{!askName ? 'Turn on “Ask for a name first” to use this list.' : experience.guests.match === 'off' ? 'Matching is off; saved names are kept for later.' : !experience.guests.names.length ? 'The list is empty. Add names to enable suggestions.' : experience.guests.match === 'only' ? 'Unlisted names are asked again. After 30 seconds of silence, the visit continues as 無名之人.' : 'If no name matches, the avatar confirms the name the visitor gives.'} Save and publish to apply the list to the next visit. Names are used for this visit’s caption, not private memory access.</p>
      </fieldset>
      <ol className="experiences-editor__questions">
        {studio.questions.map((question, index) => {
          const n = index + 1
          return <li key={question.id} className="experiences-editor__question" aria-label={`Question ${n}`}>
            <div className="experiences-editor__question-head">
              <strong>Question {n}</strong>
              <HelpField className="experiences-editor__slot" help={FIELD_HELP.studioQuestionSlot} helpLabel={`Question ${n} image part`} error={issues[`questions.${index}.slot`]}>Image part<select aria-label={`Question ${n} image part`} value={question.slot}
                onChange={e => { const slot = STUDIO_SLOTS.find(s => s === e.currentTarget.value); if (slot) set(updateQuestion(experience, index, { slot })) }}>
                {STUDIO_SLOTS.map(slot => <option key={slot} value={slot}>{SLOT_LABELS[slot]}</option>)}
              </select></HelpField>
              <div className="experiences-editor__arrange" role="group" aria-label={`Arrange question ${n}`}>
                <HelpButton className="console__icon-button" aria-label={`Move question ${n} up`} help="Ask this question earlier." disabled={disabled || index === 0}
                  onClick={() => set(moveQuestion(experience, index, -1))}><span aria-hidden="true">↑</span></HelpButton>
                <HelpButton className="console__icon-button" aria-label={`Move question ${n} down`} help="Ask this question later." disabled={disabled || index === count - 1}
                  onClick={() => set(moveQuestion(experience, index, 1))}><span aria-hidden="true">↓</span></HelpButton>
                <HelpButton className="console__icon-button console__danger" aria-label={`Remove question ${n}`}
                  help={count <= 1 ? 'At least one question is required.' : 'Remove this question. Its id is never reused for another question.'} disabled={disabled || count <= 1}
                  onClick={() => set(removeQuestion(experience, index))}><span aria-hidden="true">✕</span></HelpButton>
              </div>
            </div>
            {issues[`questions.${index}.id`] && <p className="field-error">{issues[`questions.${index}.id`]}</p>}
            <div className="experiences-editor__grid experiences-editor__grid--2">
              <HelpField help={FIELD_HELP.studioQuestionZh} helpLabel={`Question ${n} in Traditional Chinese`} error={issues[`questions.${index}.zh`]}>Traditional Chinese<textarea rows={3} lang="zh-Hant" maxLength={STUDIO_QUESTION_MAX}
                aria-label={`Question ${n} in Traditional Chinese`} value={question.zh}
                onChange={e => set(updateQuestion(experience, index, { zh: e.currentTarget.value }))} /></HelpField>
              <HelpField help={FIELD_HELP.studioQuestionEn} helpLabel={`Question ${n} in English`} error={issues[`questions.${index}.en`]}>English<textarea rows={3} lang="en" maxLength={STUDIO_QUESTION_MAX}
                aria-label={`Question ${n} in English`} value={question.en}
                onChange={e => set(updateQuestion(experience, index, { en: e.currentTarget.value }))} /></HelpField>
            </div>
            <div className="experiences-editor__line">
              <HelpField help={FIELD_HELP.studioImageLine} helpLabel={`Question ${n} image prompt line`} error={issues[`questions.${index}.imageLine`]}>
                Image prompt line{question.imageLine !== undefined ? ' · edited' : ''}<input type="text" lang="en" maxLength={STUDIO_IMAGE_LINE_MAX}
                  aria-label={`Question ${n} image prompt line`} value={studioQuestionLine(question)}
                  onChange={e => set(setQuestionLine(experience, index, e.currentTarget.value))} /></HelpField>
              <button type="button" aria-label={`Reset question ${n} image prompt line`} disabled={disabled || question.imageLine === undefined}
                onClick={() => set(setQuestionLine(experience, index, undefined))}>Reset</button>
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

    <fieldset disabled={disabled} aria-label="Picture">
      <legend>4 · Picture</legend>
      <HelpField help={FIELD_HELP.studioArtStyle} error={issues.artStyle}>Art style<textarea lang="en" rows={2} maxLength={600} value={studio.artStyle}
        onChange={e => setStudio({ artStyle: e.currentTarget.value })} /></HelpField>
      <div className="experiences-editor__grid experiences-editor__grid--2">
        <HelpField help={FIELD_HELP.studioPictureType}>Picture type<select value={studioPictureType(studio)}
          onChange={e => setStudio({ pictureType: e.currentTarget.value as StudioPictureType })}>
          <option value="sticker">Sticker (square, see-through, die-cut)</option>
          <option value="portrait">Full picture (tall)</option>
        </select></HelpField>
        <HelpField help={FIELD_HELP.studioNameFont} error={issues.nameFont}>Name font<input type="text" lang="en" maxLength={STUDIO_NAME_FONT_MAX}
          value={studio.nameFont ?? STUDIO_DEFAULT_NAME_FONT} disabled={!askName || studio.nameLettering !== 'painted'}
          onChange={e => set(setNameFont(experience, e.currentTarget.value))} /></HelpField>
      </div>
      <div className="experiences-editor__grid experiences-editor__grid--4">
        <HelpField help={FIELD_HELP.studioNameLettering}>Name lettering<select value={studio.nameLettering} disabled={!askName}
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
      </div>
      <ImagePromptEditor experience={experience} issues={issues} disabled={disabled} onChange={set} />
    </fieldset>

    <fieldset disabled={disabled} aria-label="Ending">
      <legend>5 · Ending</legend>
      <p className="console__muted">The avatar says “現在讓我們把你的靈魂傳遞出去”, calls the future printer skill, then says the farewell below and sleeps. Printing is not connected yet.</p>
      <HelpField help={FIELD_HELP.studioFarewell} error={issues.farewell}>Studio farewell{studio.farewell !== undefined ? ' · edited' : ''}<textarea lang="zh-Hant"
        rows={STUDIO_FAREWELL_LINES} value={studio.farewell ?? STUDIO_DEFAULT_FAREWELL}
        onChange={e => setStudio({ farewell: e.currentTarget.value === STUDIO_DEFAULT_FAREWELL ? undefined : e.currentTarget.value })} /></HelpField>
      <div className="experiences-editor__reset-row">
        <button type="button" disabled={disabled || studio.farewell === undefined} onClick={() => setStudio({ farewell: undefined })}>Reset farewell to default</button>
      </div>
      <p className="console__muted">One phrase per line; the avatar pauses about a second between lines, then the mirror returns to Dormant. A printer for the final picture can be added later.</p>
    </fieldset>

    <details className="experiences-editor__more" open={Object.keys(issues).some(key => /^(prompts\.(?!instructions)|screenText|failureLines)/.test(key)) || undefined}>
      <summary>More settings <span className="experiences-editor__count">What the avatar says at each step, failure lines, Conversation mode</span></summary>
      <StagePrompts experience={experience} issues={issues} disabled={disabled} onChange={set} />
      <BilingualTexts experience={experience} issues={issues} disabled={disabled} onChange={set} map="failureLines" />
      <fieldset disabled={disabled} aria-label="Conversation mode">
        <legend>In Conversation mode</legend>
        <HelpField help={FIELD_HELP.experienceVisitorMayRequest}><input type="checkbox" checked={experience.visitorMayRequest}
          onChange={e => set({ ...experience, visitorMayRequest: e.currentTarget.checked })} /> Visitors may ask for the studio during conversation</HelpField>
        <p className="console__muted">“Conversation mode: what the studio offers” tells the avatar which requests open it. A completed visit ends with the Studio farewell and sleep. Visitors can exit early to keep talking.</p>
      </fieldset>
    </details>
  </div>
}

/** Every editable sentence of the image prompt, with a live preview of what Main sends. */
export function ImagePromptEditor({ experience, issues, disabled, onChange }: {
  experience: AvatarExperience
  issues: Readonly<Record<string, string>>
  disabled: boolean
  onChange(experience: AvatarExperience): void
}): React.JSX.Element {
  const studio = experience.studio
  const edits = studio.imagePrompt ?? {}
  const edited = STUDIO_IMAGE_PROMPT_KEYS.filter(key => edits[key] !== undefined).length
  const attention = STUDIO_IMAGE_PROMPT_KEYS.some(key => issues[`imagePrompt.${key}`])
  const name = studio.askName === false ? '' : 'Raven'
  const answers = studio.questions.map((question, index) => ({ slot: question.slot, imageLine: question.imageLine,
    answer: STUDIO_SAMPLE_ANSWERS[index % STUDIO_SAMPLE_ANSWERS.length]! }))
  return <details className="experiences-editor__stages" open={attention || undefined}>
    <summary>Image prompt <span className="experiences-editor__count" role="status">{edited
      ? `${edited} of ${STUDIO_IMAGE_PROMPT_KEYS.length} instructions edited.` : 'All instructions use the default.'}</span></summary>
    <fieldset disabled={disabled} aria-label="Image prompt">
      <div className="experiences-editor__stages-head">
        <p className="console__muted">{FIELD_HELP.studioImagePrompt}</p>
        <button type="button" disabled={disabled || !edited} onClick={() => onChange(resetImagePrompts(experience))}>Reset all to default</button>
      </div>
      <ol className="experiences-editor__prompts">
        {STUDIO_IMAGE_PROMPT_KEYS.map(key => {
          const info = STUDIO_IMAGE_PROMPT_INFO[key]
          const issue = issues[`imagePrompt.${key}`]
          return <li key={key} className="experiences-editor__prompt">
            <HelpField help={`${info.when} ${FIELD_HELP.studioImagePrompt}`} helpLabel={info.label} error={issue} className="experiences-editor__prompt-field">
              <strong>{info.label}{edits[key] !== undefined ? ' · edited' : ''}</strong>
              <span className="experiences-editor__hint">{info.when}</span>
              <textarea aria-label={info.label} lang="en" rows={key === 'frame' ? 4 : 2} maxLength={info.max} value={studioImagePrompt(studio, key)}
                onChange={e => onChange(setImagePrompt(experience, key, e.currentTarget.value))} /></HelpField>
            <div className="experiences-editor__prompt-foot">
              <span className="console__muted">{info.required.length + info.optional.length
                ? <>Placeholders: {[...info.required.map(p => [p, 'required'] as const), ...info.optional.map(p => [p, 'optional'] as const)]
                  .map(([p, need], i) => <React.Fragment key={p}>{i ? '; ' : ''}<code>{placeholder(p)}</code> ({need})</React.Fragment>)}</>
                : 'No placeholders.'}</span>
              <button type="button" aria-label={`Reset ${info.label} to default`} disabled={disabled || edits[key] === undefined}
                onClick={() => onChange(resetImagePrompts(experience, key))}>Reset to default</button>
            </div>
          </li>
        })}
      </ol>
      <details className="experiences-editor__preview">
        <summary>Preview with sample answers</summary>
        <p className="console__muted">First picture{name ? ' (name “Raven”)' : ''}:</p>
        <pre className="experiences-editor__preview-text">{buildPortraitPrompt({ studio, answers, name })}</pre>
        <p className="console__muted">A change (“make the sky snowy”):</p>
        <pre className="experiences-editor__preview-text">{buildRevisionPrompt({ studio, change: 'make the sky snowy', name })}</pre>
      </details>
    </fieldset>
  </details>
}

/** On-glass text or spoken failure lines: both languages, only edits stored. */
export function BilingualTexts({ experience, issues, disabled, onChange, map }: {
  experience: AvatarExperience
  issues: Readonly<Record<string, string>>
  disabled: boolean
  onChange(experience: AvatarExperience): void
  map: 'screenText' | 'failureLines'
}): React.JSX.Element {
  const studio = experience.studio
  const screen = map === 'screenText'
  const keys: readonly string[] = screen ? STUDIO_SCREEN_KEYS : STUDIO_FAILURE_KEYS
  const edits = (studio[map] ?? {}) as Record<string, unknown>
  const edited = keys.filter(key => edits[key] !== undefined).length
  const attention = keys.some(key => issues[`${map}.${key}.zh`] || issues[`${map}.${key}.en`])
  const title = screen ? 'Text on the mirror' : 'Spoken failure lines'
  const value = (key: string, language: StudioLanguage) => screen ? studioScreenText(studio, key as StudioScreenKey, language)
    : studioFailureLine(key, language, studio)
  const update = (key: string, language: StudioLanguage, text: string) => onChange(screen
    ? setScreenText(experience, key as StudioScreenKey, language, text) : setFailureLine(experience, key as StudioFailureKey, language, text))
  return <details className="experiences-editor__stages" open={attention || undefined}>
    <summary>{title} <span className="experiences-editor__count" role="status">{edited ? `${edited} of ${keys.length} edited.` : 'All use the default.'}</span></summary>
    <fieldset disabled={disabled} aria-label={title}>
      <div className="experiences-editor__stages-head">
        <p className="console__muted">{screen ? FIELD_HELP.studioScreenText : FIELD_HELP.studioFailureLine}</p>
        <button type="button" disabled={disabled || !edited} onClick={() => onChange(resetTextMap(experience, map))}>Reset all to default</button>
      </div>
      <ol className="experiences-editor__prompts">
        {keys.map(key => {
          const label = screen ? STUDIO_SCREEN_INFO[key as StudioScreenKey].label : STUDIO_FAILURE_INFO[key as StudioFailureKey]
          const when = screen ? STUDIO_SCREEN_INFO[key as StudioScreenKey].when : ''
          const multiline = key === 'captions'
          return <li key={key} className="experiences-editor__prompt">
            <strong>{label}{edits[key] !== undefined ? ' · edited' : ''}</strong>{when && <span className="experiences-editor__hint">{when}</span>}
            <div className="experiences-editor__grid experiences-editor__grid--2">
              {(['zh', 'en'] as const).map(language => {
                const fieldLabel = `${label} in ${language === 'zh' ? 'Traditional Chinese' : 'English'}`
                return <HelpField key={language} help={screen ? FIELD_HELP.studioScreenText : FIELD_HELP.studioFailureLine} helpLabel={fieldLabel}
                  error={issues[`${map}.${key}.${language}`]}>{language === 'zh' ? 'Traditional Chinese' : 'English'}{multiline
                    ? <textarea aria-label={fieldLabel} lang={language === 'zh' ? 'zh-Hant' : 'en'} rows={4} value={value(key, language)}
                      onChange={e => update(key, language, e.currentTarget.value)} />
                    : <input type="text" aria-label={fieldLabel} lang={language === 'zh' ? 'zh-Hant' : 'en'} maxLength={screen ? 60 : 200} value={value(key, language)}
                      onChange={e => update(key, language, e.currentTarget.value)} />}</HelpField>
              })}
            </div>
            <div className="experiences-editor__prompt-foot">
              <span className="console__muted">{key === 'questionLabel' ? <>Placeholders: <code>{placeholder('index')}</code>, <code>{placeholder('count')}</code> (optional)</> : ''}</span>
              <button type="button" aria-label={`Reset ${label} to default`} disabled={disabled || edits[key] === undefined}
                onClick={() => onChange(resetTextMap(experience, map, key))}>Reset to default</button>
            </div>
          </li>
        })}
      </ol>
    </fieldset>
  </details>
}

const placeholder = (name: string): string => `{{${name}}}`

/** What the avatar is told at each studio stage, in visit order; defaults stay until the operator edits one. */
export function StagePrompts({ experience, issues, disabled, onChange }: {
  experience: AvatarExperience
  issues: Readonly<Record<string, string>>
  disabled: boolean
  onChange(experience: AvatarExperience): void
}): React.JSX.Element {
  const prompts = experience.studio.prompts ?? {}
  // Studio rules (the `instructions` stage) are edited under Character.
  const stages: readonly StudioPromptStage[] = ['unavailable', 'comment', 'exited', 'offer']
  const edited = stages.filter(stage => prompts[stage] !== undefined).length
  const attention = stages.some(stage => issues[`prompts.${stage}`])
  return <details className="experiences-editor__stages" open={attention || undefined}>
    <summary>What the avatar says at each step <span className="experiences-editor__count" role="status">{edited
      ? `${edited} of ${stages.length} steps edited.` : 'All steps use the default.'}</span></summary>
    <fieldset disabled={disabled} aria-label="What the avatar says at each step">
      <div className="experiences-editor__stages-head">
        <p className="console__muted">These instructions control comments and exceptional replies. Questions are in 3 · Name and questions; confirmation, painting, reveal and transfer use the fixed journey script. Edits apply to this avatar only; keep each required placeholder.</p>
        <button type="button" disabled={disabled || !edited} onClick={() => onChange(stages.reduce((value, stage) => resetStagePrompts(value, stage), experience))}>Reset these prompts to default</button>
      </div>
      <ol className="experiences-editor__prompts">
        {stages.map((stage, index) => {
          const info = STUDIO_PROMPT_INFO[stage]
          const override = prompts[stage]
          const issue = issues[`prompts.${stage}`]
          const { required, optional } = STUDIO_PROMPT_PLACEHOLDERS[stage]
          const label = `${info.label} prompt`
          return <li key={stage} className="experiences-editor__prompt">
            <details open={override !== undefined || !!issue}>
              <summary>
                <span className="experiences-editor__prompt-step" aria-hidden="true">{index + 1}</span>
                <strong>{info.label}</strong>
                {(issue || override !== undefined) && <span className={`experiences-editor__badge experiences-editor__badge--${issue ? 'issue' : 'edited'}`}>
                  {issue ? 'Needs attention' : 'Edited'}</span>}
                <span className="experiences-editor__prompt-when">{info.when}</span>
              </summary>
              <HelpField help={`${info.when} ${FIELD_HELP.studioStagePrompt}`} helpLabel={label} error={issue}
                className="experiences-editor__prompt-field"><span className="console__sr-only">{info.label}</span><textarea aria-label={label} rows={3}
                  maxLength={STUDIO_PROMPT_MAX.other}
                  value={override ?? STUDIO_PROMPT_DEFAULTS[stage]}
                  onChange={e => onChange(setStagePrompt(experience, stage, e.currentTarget.value))} /></HelpField>
              <div className="experiences-editor__prompt-foot">
                <span className="console__muted">{required.length + optional.length
                  ? <>Placeholders: {[...required.map(name => [name, 'required'] as const), ...optional.map(name => [name, 'optional'] as const)]
                    .map(([name, need], i) => <React.Fragment key={name}>{i ? '; ' : ''}<code>{placeholder(name)}</code> {STUDIO_PLACEHOLDER_INFO[name]} ({need})</React.Fragment>)}</>
                  : 'No placeholders.'}</span>
                <button type="button" aria-label={`Reset ${info.label} to default`} disabled={disabled || override === undefined}
                  onClick={() => onChange(resetStagePrompts(experience, stage))}>Reset to default</button>
              </div>
            </details>
          </li>
        })}
      </ol>
    </fieldset>
  </details>
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
    Guest names · {parsed.names.length.toLocaleString('en-US')} of {STUDIO_MAX_GUESTS.toLocaleString('en-US')}<textarea rows={5} spellCheck={false}
      aria-label="Guest names, one per line" value={shown}
      onChange={e => { const value = e.currentTarget.value; setText(value); onNames(parseGuestList(value).names) }} />
  </HelpField>
}
