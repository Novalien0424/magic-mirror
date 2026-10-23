import type { StudioPhase, StudioView } from '../../shared/portrait-studio'

export interface PortraitStudioLayerProps {
  readonly view: StudioView | null
}

const COVER_PHASES: readonly StudioPhase[] = ['painting', 'reveal', 'revising', 'keepsake']

/** Phases in which the portrait frame covers the avatar (voice continues). */
export function studioCoversAvatar(view: StudioView | null): boolean {
  return !!view && COVER_PHASES.includes(view.phase)
}

const glyphs = (value: string) => Array.from(value).length

/** Interactive Studio overlay above the avatar; its words come from Main. Absent whenever the studio is closed. */
export function PortraitStudioLayer({ view }: PortraitStudioLayerProps) {
  if (!view) return null
  const covered = studioCoversAvatar(view)
  return (
    <div className="portrait-studio" data-phase={view.phase} data-cover={covered} lang={view.language === 'en' ? 'en' : 'zh-Hant'}>
      {covered ? <div className="portrait-studio__veil" aria-hidden="true" /> : <div className="portrait-studio__scrim" aria-hidden="true" />}
      <div className="portrait-studio__panel">
        {covered ? <PortraitFrame view={view} /> : <Feathers view={view} />}
        <div className="portrait-studio__zone" aria-live="polite">
          {view.phase === 'confirm' && view.name && <p className="portrait-studio__nameplate" data-long={glyphs(view.name) > 6}>{view.name}</p>}
        </div>
      </div>
    </div>
  )
}

function Feathers({ view }: { view: StudioView }) {
  const named = view.askName ? 1 : 0
  const total = view.questionCount + named
  const done = Math.min(total, (view.phase === 'name' || view.phase === 'confirm' ? 0 : named) + view.answered)
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
    <div className="portrait-studio__frame" data-state={painting ? 'painting' : 'done'} data-picture={view.picture}>
      {showImage && <img className="portrait-studio__image" src={view.imageUrl} alt="" draggable={false} data-dim={painting} />}
      {painting && <div className="portrait-studio__ink" aria-hidden="true"><i /><i /><i /><i /></div>}
      {!painting && view.lettering === 'nameplate' && view.name
        && <p className="portrait-studio__banner" data-long={glyphs(view.name) > 8}>{view.name}</p>}
    </div>
  )
}
