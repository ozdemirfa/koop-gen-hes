/**
 * Sprint yetkili-role-system (PR-A, 2026-05-22):
 * invitationService.createYetkiliInvitation + acceptInvitationByToken(yetkili)
 * için birim testler.
 *
 * Kapsam:
 *   - createYetkiliInvitation happy path → insert + mail + audit
 *   - Mevcut kullanıcı için yetkili daveti → 409
 *   - Aynı email pending yetkili daveti → 409
 *   - acceptInvitationByToken (yetkili branch) → user_roles row + clearRoleCache
 *     (NO proje_uyelikleri row)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Module-level state ------------------------------------------------------
let mockInsertCalls: Array<{ table: string; payload: any }> = []
let mockUpsertCalls: Array<{ table: string; payload: any }> = []
let mockUpdateCalls: Array<{ table: string; payload: any; filters: Record<string, any> }> = []
let mockDeleteCalls: Array<{ table: string; filters: Record<string, any> }> = []
let mockExistingUsers: Array<{ id: string; email: string }> = []
let mockExistingInvitation: any = null // for the maybeSingle duplicate-check
let mockSelectByToken: any = null
let mockCreatedUserId = 'new-user-yetkili-id'
let mockMailerCalls: Array<{ method: string; data: any }> = []
let mockMailerShouldThrow = false

vi.mock('../../src/config/supabase', () => {
  function makeBuilder(table: string) {
    const filters: Record<string, any> = {}
    let pendingPayload: any = null
    let op: 'insert' | 'update' | 'delete' | null = null

    function terminalThen(resolve: any) {
      if (op === 'delete') {
        mockDeleteCalls.push({ table, filters: { ...filters } })
        resolve({ data: null, error: null })
      } else if (op === 'update') {
        mockUpdateCalls.push({ table, payload: pendingPayload, filters: { ...filters } })
        resolve({ data: null, error: null })
      } else {
        resolve({ data: null, error: null })
      }
    }

    const builder: any = {
      _select: false,
      insert(payload: any) {
        op = 'insert'
        pendingPayload = payload
        mockInsertCalls.push({ table, payload })
        // Allow .select().single() chain
        return {
          select() {
            return {
              single: async () => ({
                data: {
                  id: 'inv-new-id',
                  proje_id: payload.proje_id ?? null,
                  email: payload.email,
                  user_id: payload.user_id ?? null,
                  invited_role: payload.invited_role,
                  invited_by: payload.invited_by ?? null,
                  token: payload.token ?? null,
                  otp_hash: payload.otp_hash ?? null,
                  attempt_count: 0,
                  status: 'pending',
                  expires_at: payload.expires_at,
                  accepted_at: null,
                  rejected_at: null,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                },
                error: null,
              }),
            }
          },
        }
      },
      upsert(payload: any, _opts?: { onConflict?: string }) {
        mockUpsertCalls.push({ table, payload })
        return Promise.resolve({ data: null, error: null })
      },
      update(payload: any) {
        op = 'update'
        pendingPayload = payload
        return builder
      },
      delete() {
        op = 'delete'
        return builder
      },
      select() {
        builder._select = true
        return builder
      },
      eq(col: string, val: any) {
        filters[col] = val
        return builder
      },
      is(col: string, val: any) {
        filters[`${col}__is`] = val
        return builder
      },
      gt() {
        return builder
      },
      order() {
        return builder
      },
      maybeSingle: async () => {
        // duplicate-check için: yetkili invitations
        if (table === 'invitations' && filters.email && filters.invited_role === 'yetkili') {
          return { data: mockExistingInvitation, error: null }
        }
        // accept-by-token select
        if (table === 'invitations' && filters.token) {
          return { data: mockSelectByToken, error: null }
        }
        return { data: null, error: null }
      },
      single: async () => ({ data: null, error: null }),
      then(resolve: any) {
        terminalThen(resolve)
      },
    }
    return builder
  }

  return {
    supabaseAdmin: {
      from: (table: string) => makeBuilder(table),
      auth: {
        admin: {
          listUsers: async () => ({
            data: { users: mockExistingUsers.map((u) => ({ id: u.id, email: u.email })) },
            error: null,
          }),
          createUser: async (payload: { email: string }) => ({
            data: { user: { id: mockCreatedUserId, email: payload.email } },
            error: null,
          }),
          deleteUser: async () => ({ data: null, error: null }),
        },
      },
    },
  }
})

vi.mock('../../src/services/mailer.service', () => ({
  mailer: {
    sendNewUserInvite: async (data: any) => {
      mockMailerCalls.push({ method: 'sendNewUserInvite', data })
      if (mockMailerShouldThrow) throw new Error('mail fail')
    },
    sendExistingUserInvite: async (data: any) => {
      mockMailerCalls.push({ method: 'sendExistingUserInvite', data })
      if (mockMailerShouldThrow) throw new Error('mail fail')
    },
  },
}))

vi.mock('../../src/middleware/roleCache', () => ({
  clearRoleCache: vi.fn(),
}))

vi.mock('../../src/middleware/projectAccessCache', () => ({
  clearProjectAccessCache: vi.fn(),
}))

vi.mock('../../src/services/invitation.helpers', () => ({
  generateInviteToken: () => 'tok-deterministic-12345678901234567890',
  generateOtpCode: () => '123456',
  hashOtp: async (s: string) => `hashed:${s}`,
  verifyOtp: async (hash: string, otp: string) => hash === `hashed:${otp}`,
}))

vi.mock('../../src/utils/logger', () => ({
  default: { error: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}))

import logger from '../../src/utils/logger'
import { clearRoleCache } from '../../src/middleware/roleCache'
import { clearProjectAccessCache } from '../../src/middleware/projectAccessCache'
import { invitationService } from '../../src/services/invitation.service'

const mockedClearRoleCache = vi.mocked(clearRoleCache)
const mockedClearProjectAccessCache = vi.mocked(clearProjectAccessCache)
const mockLoggerInfo = logger.info as ReturnType<typeof vi.fn>

beforeEach(() => {
  mockInsertCalls = []
  mockUpsertCalls = []
  mockUpdateCalls = []
  mockDeleteCalls = []
  mockExistingUsers = []
  mockExistingInvitation = null
  mockSelectByToken = null
  mockCreatedUserId = 'new-user-yetkili-id'
  mockMailerCalls = []
  mockMailerShouldThrow = false
  mockedClearRoleCache.mockClear()
  mockedClearProjectAccessCache.mockClear()
  mockLoggerInfo.mockClear()
})

describe('invitationService.createYetkiliInvitation', () => {
  it('happy path — invitations insert (proje_id=null, invited_role=yetkili, token+otp_hash dolu)', async () => {
    const res = await invitationService.createYetkiliInvitation({
      email: 'newyetkili@example.com',
      invitedBy: 'admin-1',
      invitedByName: 'Admin Adı',
    })

    expect(res.id).toBe('inv-new-id')
    expect(res.email).toBe('newyetkili@example.com')
    expect(res.mailSent).toBe(true)

    const ins = mockInsertCalls.find((c) => c.table === 'invitations')
    expect(ins).toBeDefined()
    expect(ins?.payload.proje_id).toBeNull()
    expect(ins?.payload.invited_role).toBe('yetkili')
    expect(ins?.payload.token).toBeTruthy()
    expect(ins?.payload.otp_hash).toBeTruthy()
  })

  it('mailer çağrılır — sendNewUserInvite acceptUrl + otpCode ile', async () => {
    await invitationService.createYetkiliInvitation({
      email: 'newyetkili@example.com',
      invitedBy: 'admin-1',
    })
    const mailCall = mockMailerCalls.find((c) => c.method === 'sendNewUserInvite')
    expect(mailCall).toBeDefined()
    expect(mailCall?.data.to).toBe('newyetkili@example.com')
    expect(mailCall?.data.otpCode).toBe('123456')
    expect(String(mailCall?.data.acceptUrl)).toContain('tok-deterministic')
  })

  it('audit log: admin.yetkili.invited yazılır', async () => {
    await invitationService.createYetkiliInvitation({
      email: 'newyetkili@example.com',
      invitedBy: 'admin-1',
    })
    const calls = mockLoggerInfo.mock.calls.map((c) => String(c[0]))
    expect(calls.some((m) => m.includes('admin.yetkili.invited'))).toBe(true)
  })

  it('kayıtlı kullanıcı için yetkili daveti → 409', async () => {
    mockExistingUsers = [{ id: 'existing-1', email: 'existing@example.com' }]
    await expect(
      invitationService.createYetkiliInvitation({
        email: 'existing@example.com',
        invitedBy: 'admin-1',
      }),
    ).rejects.toMatchObject({ statusCode: 409 })
  })

  it('aynı email pending yetkili daveti varsa → 409', async () => {
    mockExistingInvitation = { id: 'pending-1' }
    await expect(
      invitationService.createYetkiliInvitation({
        email: 'dup@example.com',
        invitedBy: 'admin-1',
      }),
    ).rejects.toMatchObject({ statusCode: 409 })
  })

  it('mail hatası invitations row korunur, mailSent=false döner', async () => {
    mockMailerShouldThrow = true
    const res = await invitationService.createYetkiliInvitation({
      email: 'fail@example.com',
      invitedBy: 'admin-1',
    })
    expect(res.mailSent).toBe(false)
    expect(res.mailError).toBeDefined()
    // insert yapıldığından emin ol
    expect(mockInsertCalls.find((c) => c.table === 'invitations')).toBeDefined()
  })
})

describe('invitationService.acceptInvitationByToken — yetkili branch', () => {
  it('invited_role=yetkili + doğru OTP → user_roles upsert, proje_uyelikleri row YOK', async () => {
    const tokenStr = 'tok-deterministic-12345678901234567890'
    mockSelectByToken = {
      id: 'inv-yetkili-1',
      proje_id: null,
      email: 'newyetkili@example.com',
      user_id: null,
      invited_role: 'yetkili',
      invited_by: 'admin-1',
      token: tokenStr,
      otp_hash: 'hashed:123456',
      attempt_count: 0,
      status: 'pending',
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }

    const res = await invitationService.acceptInvitationByToken(tokenStr, '123456', 'StrongPw!23')

    // user_roles upsert ile yetkili row eklendi
    const rolesUpsert = mockUpsertCalls.find((c) => c.table === 'user_roles')
    expect(rolesUpsert).toBeDefined()
    expect(rolesUpsert?.payload).toEqual({ user_id: mockCreatedUserId, role: 'yetkili' })

    // proje_uyelikleri'ne hiçbir şey YOK
    const projeUyelikUpsert = mockUpsertCalls.find((c) => c.table === 'proje_uyelikleri')
    expect(projeUyelikUpsert).toBeUndefined()

    // clearRoleCache çağrıldı
    expect(mockedClearRoleCache).toHaveBeenCalledWith(mockCreatedUserId)

    // clearProjectAccessCache çağrılmadı (proje_id null)
    expect(mockedClearProjectAccessCache).not.toHaveBeenCalled()

    // invitations status accepted update edildi
    const acceptUpdate = mockUpdateCalls.find(
      (c) => c.table === 'invitations' && c.payload?.status === 'accepted',
    )
    expect(acceptUpdate).toBeDefined()
    expect(acceptUpdate?.payload.user_id).toBe(mockCreatedUserId)

    // Return shape
    expect(res.email).toBe('newyetkili@example.com')
    expect(res.invitedRole).toBe('yetkili')
    expect(res.projeId).toBeNull()
  })

  it('yetkili davet + yanlış OTP → user_roles row YOK', async () => {
    const tokenStr = 'tok-deterministic-12345678901234567890'
    mockSelectByToken = {
      id: 'inv-yetkili-2',
      proje_id: null,
      email: 'newyetkili2@example.com',
      user_id: null,
      invited_role: 'yetkili',
      invited_by: 'admin-1',
      token: tokenStr,
      otp_hash: 'hashed:999999', // beklenen kod
      attempt_count: 0,
      status: 'pending',
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }

    await expect(
      invitationService.acceptInvitationByToken(tokenStr, '000000', 'StrongPw!23'),
    ).rejects.toThrow(/[Kk]od yanlış/)

    expect(mockUpsertCalls.find((c) => c.table === 'user_roles')).toBeUndefined()
    expect(mockedClearRoleCache).not.toHaveBeenCalled()
  })
})
