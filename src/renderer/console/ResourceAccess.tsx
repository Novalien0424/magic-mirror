import type { AvatarCatalog, AvatarResourceLock } from '../../shared/avatar-profiles'

export function ResourceAccess({ catalog, avatarId, kind, resourceId, disabled, onChange }: {
  catalog?: AvatarCatalog; avatarId: string; kind: AvatarResourceLock['kind']; resourceId: string;
  disabled: boolean; onChange(catalog: AvatarCatalog): void
}) {
  if (!catalog) return null
  const lock = catalog.locks.find(l => l.kind === kind && l.resourceId === resourceId)
  const owner = lock && catalog.avatars.find(a => a.id === lock.avatarId)
  return <label className="console__check"><input type="checkbox" checked={!!lock}
    disabled={disabled || !!lock && lock.avatarId !== avatarId} onChange={e => onChange({ ...catalog,
      locks: [...catalog.locks.filter(l => l !== lock), ...(e.currentTarget.checked ? [{ kind, resourceId, avatarId }] : [])] })} />
    {lock ? `Only ${owner?.name ?? 'owner'}` : 'Shared · lock to this avatar'}
  </label>
}
