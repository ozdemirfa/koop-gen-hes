// Sprint kalite-guvenlik-2026-06 (TEST-5):
//   usePermissions rol matrisi — saf computePermissions fonksiyonu üzerinden
//   (hook context'e bağlı; mantık ayrıştırıldı). owner/manager/user/üye-değil,
//   legacy admin, offline kısıtı, yetkili, legacy rol normalize.

import { describe, it, expect, vi } from 'vitest'

// Context modülleri yalnız tip için import ediliyor (computePermissions hook'a
// bağlı değil); yine de runtime import side-effect'i olmasın diye hafif mock.
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({}) }))
vi.mock('../contexts/ProjectContext', () => ({ useProject: () => ({}) }))

import { computePermissions, normalizeProjectRole, type PermissionsInput } from './usePermissions'

function input(over: Partial<PermissionsInput> = {}): PermissionsInput {
  return {
    userRole: 'user' as any,
    isYetkili: false,
    isAdmin: false,
    session: { user: { id: 'u1' } },
    activeProject: { offline_mode: false },
    activeProjectRole: 'user' as any,
    ...over,
  }
}

describe('normalizeProjectRole', () => {
  it('yeni roller aynen, legacy map edilir, geçersiz null', () => {
    expect(normalizeProjectRole('owner' as any)).toBe('owner')
    expect(normalizeProjectRole('manager' as any)).toBe('manager')
    expect(normalizeProjectRole('user' as any)).toBe('user')
    expect(normalizeProjectRole('admin' as any)).toBe('owner')
    expect(normalizeProjectRole('staff' as any)).toBe('manager')
    expect(normalizeProjectRole('viewer' as any)).toBe('user')
    expect(normalizeProjectRole(null as any)).toBeNull()
  })
})

describe('computePermissions — rol matrisi', () => {
  it('owner: tüm yetkiler', () => {
    const p = computePermissions(input({ activeProjectRole: 'owner' as any }))
    expect(p.isOwner).toBe(true)
    expect(p.isManager).toBe(true)
    expect(p.canView).toBe(true)
    expect(p.canEdit).toBe(true)
    expect(p.canDelete).toBe(true)
    expect(p.canManageUsers).toBe(true)
  })

  it('manager: owner hariç yetkiler', () => {
    const p = computePermissions(input({ activeProjectRole: 'manager' as any }))
    expect(p.isOwner).toBe(false)
    expect(p.isManager).toBe(true)
    expect(p.canEdit).toBe(true)
    expect(p.canDelete).toBe(true)
  })

  it('user: SALT-OKUNUR (canView var, canEdit/canDelete yok)', () => {
    const p = computePermissions(input({ activeProjectRole: 'user' as any }))
    expect(p.canView).toBe(true)
    expect(p.isManager).toBe(false)
    expect(p.canEdit).toBe(false)
    expect(p.canDelete).toBe(false)
    expect(p.canManageUsers).toBe(false)
  })

  it('üye değil (null): tüm flag false', () => {
    const p = computePermissions(input({ activeProjectRole: null as any }))
    expect(p.projectRole).toBeNull()
    expect(p.canView).toBe(false)
    expect(p.canEdit).toBe(false)
    expect(p.isManager).toBe(false)
  })

  it('legacy global admin: her projede owner + global defs', () => {
    const p = computePermissions(input({ userRole: 'admin' as any, activeProjectRole: null as any }))
    expect(p.isLegacyGlobalAdmin).toBe(true)
    expect(p.projectRole).toBe('owner')
    expect(p.isOwner).toBe(true)
    expect(p.canEdit).toBe(true)
    expect(p.canManageGlobalDefs).toBe(true)
  })

  it('offline modda manager → kısıtlı (write kapalı)', () => {
    const p = computePermissions(
      input({ activeProjectRole: 'manager' as any, activeProject: { offline_mode: true } })
    )
    expect(p.isOfflineMode).toBe(true)
    expect(p.isOfflineRestricted).toBe(true)
    expect(p.canEdit).toBe(false)
    expect(p.canDelete).toBe(false)
    expect(p.canManageUsers).toBe(false)
  })

  it('offline modda owner → kısıtlanmaz', () => {
    const p = computePermissions(
      input({ activeProjectRole: 'owner' as any, activeProject: { offline_mode: true } })
    )
    expect(p.isOfflineRestricted).toBe(false)
    expect(p.canEdit).toBe(true)
  })

  it('yetkili → canCreateProjects + canCreateGlobalDefs', () => {
    const p = computePermissions(input({ isYetkili: true, activeProjectRole: 'user' as any }))
    expect(p.canCreateProjects).toBe(true)
    expect(p.canCreateGlobalDefs).toBe(true)
    // ama global defs SİLME yalnız legacy admin
    expect(p.canManageGlobalDefs).toBe(false)
  })

  it('legacy rol map: staff→manager, viewer→user', () => {
    expect(computePermissions(input({ activeProjectRole: 'staff' as any })).isManager).toBe(true)
    expect(computePermissions(input({ activeProjectRole: 'viewer' as any })).canEdit).toBe(false)
  })

  it('isAuthenticated session\'a bağlı', () => {
    expect(computePermissions(input({ session: null })).isAuthenticated).toBe(false)
    expect(computePermissions(input({ session: { user: {} } })).isAuthenticated).toBe(true)
  })

  it('hasActiveProject activeProject\'e bağlı', () => {
    expect(computePermissions(input({ activeProject: null })).hasActiveProject).toBe(false)
    expect(computePermissions(input({ activeProject: { offline_mode: false } })).hasActiveProject).toBe(true)
  })
})
