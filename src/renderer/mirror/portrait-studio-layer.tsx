import { useEffect, useState } from 'react'
import type { StudioPhase, StudioView } from '../../shared/portrait-studio'

export interface PortraitStudioLayerProps {
  readonly view: StudioView | null
}

const COVER_PHASES: readonly StudioPhase[] = ['painting', 'reveal', 'revising', 'keepsake']

/** Phases in which the portrait frame covers the avatar (voice continues). */
export function studioCoversAvatar(view: StudioView | null): boolean {
  return !!view && COVER_PHASES.includes(view.phase)
}

const TEXT = {
  zh: {
    name: '名字', write: '我會寫上', right: '對嗎？', question: (n: number, total: number) => `問題 ${n} / ${total}`,
    change: '修改：', changeHint: '想改：說出要改的地方', doneHint: '完成：說「很好」', yours: '這幅畫是你的了',
    photo: '可以用手機拍下這幅畫', captions: ['羽毛筆沾墨中……', '正在調配夜色……', '一筆一筆畫上去……', '再等我一下……'],
  },
  en: {
    name: 'Name', write: "I'll write", right: 'Is that right?', question: (n: number, total: number) => `Question ${n} of ${total}`,
    change: 'Change: ', changeHint: 'Change it: say what to change', doneHint: "Done: say 'perfect'", yours: 'This portrait is yours',
    photo: 'Take a photo of your portrait', captions: ['Dipping the quill in ink…', 'Mixing the colours of night…', 'Laying down each stroke…', 'Just a moment more…'],
  },
} as const
type StudioText = (typeof TEXT)[keyof typeof TEXT]

const CAPTION_MS = 6000
const glyphs = (value: string) => Array.from(value).length

/** Portrait Studio overlay above the avatar. Absent whenever the studio is closed. */
export function PortraitStudioLayer({ view }: PortraitStudioLayerProps) {
  if (!view) return null
  const text = TEXT[view.language === 'en' ? 'en' : 'zh']
  const covered = studioCoversAvatar(view)
  return (
    <div className="portrait-studio" data-phase={view.phase} data-cover={covered} lang={view.language === 'en' ? 'en' : 'zh-Hant'}>
      {covered ? <div className="portrait-studio__veil" aria-hidden="true" /> : <div className="portrait-studio__scrim" aria-hidden="true" />}
      <div className="portrait-studio__panel">
        {covered ? <PortraitFrame view={view} /> : <Feathers view={view} />}
        <div className="portrait-studio__zone" aria-live="polite">
          <PhaseText view={view} text={text} />
        </div>
        {view.phase === 'keepsake' && view.holdEndsAt !== undefined && <Countdown endsAt={view.holdEndsAt} />}
      </div>
    </div>
  )
}

function Feathers({ view }: { view: StudioView }) {
  const total = view.questionCount + 1
  const done = Math.min(total, (view.phase === 'name' || view.phase === 'confirm' ? 0 : 1) + view.answered)
  return (
    <div className="portrait-studio__feathers" aria-hidden="true">
      {Array.from({ length: total }, (_, index) => (
        <svg key={index} className="portrait-studio__feather" viewBox="0 0 10 18"
          data-state={index < done ? 'lit' : index === done ? 'current' : 'unlit'}>
          <path className="portrait-studio__vane" d="M5 .6C8.6 4 8.8 10 5 17.4 1.2 10 1.4 4 5 .6Z" />
          <path className="portrait-studio__shaft" d="M5 3v14" />
        </svg>
      ))}
    </div>
  )
}

function PortraitFrame({ view }: { view: StudioView }) {
  const painting = view.phase === 'painting' || view.phase === 'revising'
  const showImage = !!view.imageUrl && (!painting || view.phase === 'revising')
  return (
    <div className="portrait-studio__frame" data-state={painting ? 'painting' : 'done'}>
      {showImage && <img className="portrait-studio__image" src={view.imageUrl} alt="" draggable={false} data-dim={painting} />}
      {painting && <div className="portrait-studio__ink" aria-hidden="true"><i /><i /><i /><i /></div>}
      {!painting && view.lettering === 'nameplate' && view.name
        && <p className="portrait-studio__banner" data-long={glyphs(view.name) > 8}>{view.name}</p>}
    </div>
  )
}

function PhaseText({ view, text }: { view: StudioView; text: StudioText }) {
  switch (view.phase) {
    case 'name': return <>
      <p className="portrait-studio__label">{text.name}</p>
      {view.prompt && <p className="portrait-studio__question">{view.prompt}</p>}
    </>
    case 'confirm': return <>
      <p className="portrait-studio__label">{text.write}</p>
      {view.name && <p className="portrait-studio__nameplate" data-long={glyphs(view.name) > 6}>{view.name}</p>}
      <p className="portrait-studio__question portrait-studio__question--small">{text.right}</p>
    </>
    case 'question': return <>
      <Chips items={view.chips} />
      <p className="portrait-studio__label">{text.question(Math.min(view.answered + 1, view.questionCount), view.questionCount)}</p>
      {view.prompt && <p className="portrait-studio__question">{view.prompt}</p>}
    </>
    case 'painting': return <Caption key={view.phase} lines={text.captions} />
    case 'revising': return <>
      {view.change && <Chips items={[`${text.change}${view.change}`]} />}
      <Caption key={view.phase} lines={text.captions} />
    </>
    case 'reveal': return <Chips hint items={view.revisionsLeft > 0 ? [text.changeHint, text.doneHint] : [text.yours]} />
    case 'keepsake': return <Chips hint items={[text.photo]} />
  }
}

function Chips({ items, hint = false }: { items: readonly string[]; hint?: boolean }) {
  if (!items.length) return null
  return (
    <ul className={hint ? 'portrait-studio__chips portrait-studio__chips--hint' : 'portrait-studio__chips'}>
      {items.map((item, index) => <li key={index} className="portrait-studio__chip">{item}</li>)}
    </ul>
  )
}

function Caption({ lines }: { lines: readonly string[] }) {
  const [index, setIndex] = useState(0)
  useEffect(() => {
    const timer = window.setInterval(() => setIndex(current => (current + 1) % lines.length), CAPTION_MS)
    return () => window.clearInterval(timer)
  }, [lines])
  const line = index % lines.length
  return <p key={line} className="portrait-studio__question portrait-studio__question--small portrait-studio__caption">{lines[line]}</p>
}

export function formatHold(remainingMs: number): string {
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000))
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

function Countdown({ endsAt }: { endsAt: number }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    setNow(Date.now())
    const timer = window.setInterval(() => {
      const current = Date.now()
      setNow(current)
      if (current >= endsAt) window.clearInterval(timer)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [endsAt])
  return <p className="portrait-studio__countdown" role="timer">{formatHold(endsAt - now)}</p>
}
