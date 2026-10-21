import { useEffect, useState } from 'react'
import { IMAGE_SKILL, type ImageSkillView } from '../../shared/image-skill'

export function ImageSkillLayer({ view, onDismiss }: { view: ImageSkillView | null; onDismiss(): void }): React.JSX.Element | null {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!view?.countdownEndsAt) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 100)
    return () => window.clearInterval(timer)
  }, [view?.countdownEndsAt])
  if (!view) return null
  const words = IMAGE_SKILL.screen[view.language]
  return <section className="image-skill" data-phase={view.phase} data-picture={!!view.imageUrl} data-target={view.target} lang={view.language === 'en' ? 'en' : 'zh-Hant'} aria-label="Image creation">
    {view.imageUrl && <div className="image-skill__art"><img src={view.imageUrl} alt={view.language === 'en' ? 'Your generated picture' : '為你創作的圖片'} draggable={false} /></div>}
    <div className="image-skill__status">
      <p role="status">{view.phase === 'consent' && view.target === 'camera' ? IMAGE_SKILL.cameraScreen[view.language] : words[view.phase]}{view.countdownEndsAt ? ` ${Math.max(0, Math.ceil((view.countdownEndsAt - now) / 1000))}` : ''}</p>
      {view.phase === 'consent' && <p className="image-skill__permission">{view.target === 'camera' ? IMAGE_SKILL.cameraConsent[view.language] : IMAGE_SKILL.speech[view.language].consent}</p>}
      <button type="button" onClick={onDismiss}>{view.imageUrl || view.phase === 'failed' ? words.dismiss : words.cancel}</button>
    </div>
  </section>
}
