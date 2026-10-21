import type { AvatarProfile } from '../../shared/avatar-profiles'
import { AVATAR_SKILLS, DEFAULT_AVATAR_SKILLS } from '../../shared/avatar-skills'

export function SkillsEditor({ avatar, disabled, onChange }: {
  avatar: AvatarProfile; disabled: boolean; onChange(avatar: AvatarProfile): void
}) {
  const skills = avatar.skills ?? DEFAULT_AVATAR_SKILLS
  return <section className="console__panel" aria-label="Avatar skills">
    <h3>Skills for {avatar.name}</h3>
    <p>Choose what this Avatar can do. Save and publish; changes apply on the next conversation.</p>
    {AVATAR_SKILLS.map(skill => <div key={skill.id}>
      <label><input type="checkbox" checked={skills[skill.id]} disabled={disabled} aria-describedby={`skill-${skill.id}-help`}
        onChange={event => onChange({ ...avatar, skills: { ...skills, [skill.id]: event.target.checked } })} /> {skill.name}</label>
      <p id={`skill-${skill.id}-help`}>{skill.description}</p>
    </div>)}
    <p>Interactive Studio requires Image generation. Its saved story and picture settings are kept when the skill is off.</p>
  </section>
}
