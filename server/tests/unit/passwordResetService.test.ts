// Sprint role-system-modernization (PR-D, 2026-05-20):
// passwordResetService — owner-only şifre yenileme akışı için birim testler.
//
// Kuralları:
//   - caller userId === target userId → 403 (self-yasak)
//   - hedef proje üyesi değilse → 400
//   - hedef üye rol='owner' → 403 (owner'ın şifresi başkası tarafından sıfırlanamaz)
//   - newPassword < 8 → 400
//   - newPassword > 72 → 400
//   - newPassword undefined → otomatik 16 char üretir (generated: true)
//   - newPassword belirtilmişse generated: false
//   - supabaseAdmin.auth.admin.updateUserById çağrılır
//   - logger.info audit kaydı yazılır

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Builder state — her test reset eder
let mockMembershipRole: string | null = null
let mockMembershipError: any = null
let mockUpdateError: any = null
const mockUpdateCalls: Array<{ userId: string; password: string }> = []

vi.mock('../../src/config/supabase', () => {
  const builder: Record<string, unknown> = {}
  const chain = () => builder
  builder.from = chain
  builder.select = chain
  builder.eq = chain
  builder.maybeSingle = async () => {
    if (mockMembershipError) return { data: null, error: mockMembershipError }
    if (mockMembershipRole === null) return { data: null, error: null }
    return { data: { rol: mockMembershipRole }, error: null }
  }

  return {
    supabaseAdmin: {
      from: () => builder,
      auth: {
        admin: {
          getUserById: async (userId: string) => ({
            data: { user: { id: userId, email: `${userId}@example.com` } },
            error: null,
          }),
          updateUserById: async (userId: string, payload: { password: string }) => {
            mockUpdateCalls.push({ userId, password: payload.password })
            if (mockUpdateError) return { data: null, error: mockUpdateError }
            return { data: { user: { id: userId } }, error: null }
          },
        },
      },
    },
  }
})

vi.mock('../../src/utils/logger', () => ({
  default: { error: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}))

import logger from '../../src/utils/logger'
import { passwordResetService } from '../../src/services/passwordReset.service'
import { ApiError } from '../../src/utils/ApiError'

const mockLoggerInfo = logger.info as ReturnType<typeof vi.fn>

const PROJE_ID = '11111111-1111-4111-8111-111111111111'
const TARGET_USER = 'u-target'
const CALLER_USER = 'u-caller'

describe('passwordResetService.resetUserPassword — PR-D guard rules', () => {
  beforeEach(() => {
    mockMembershipRole = null
    mockMembershipError = null
    mockUpdateError = null
    mockUpdateCalls.length = 0
    mockLoggerInfo.mockClear()
  })

  it('caller === target → 403 self-yasak', async () => {
    mockMembershipRole = 'user'
    await expect(
      passwordResetService.resetUserPassword({
        userId: CALLER_USER,
        callerId: CALLER_USER,
        projeId: PROJE_ID,
      }),
    ).rejects.toMatchObject({ statusCode: 403 })
    expect(mockUpdateCalls.length).toBe(0)
  })

  it('hedef proje üyesi değilse → 400', async () => {
    mockMembershipRole = null
    await expect(
      passwordResetService.resetUserPassword({
        userId: TARGET_USER,
        callerId: CALLER_USER,
        projeId: PROJE_ID,
      }),
    ).rejects.toMatchObject({ statusCode: 400 })
    expect(mockUpdateCalls.length).toBe(0)
  })

  it('hedef rol=owner ise → 403', async () => {
    mockMembershipRole = 'owner'
    await expect(
      passwordResetService.resetUserPassword({
        userId: TARGET_USER,
        callerId: CALLER_USER,
        projeId: PROJE_ID,
      }),
    ).rejects.toMatchObject({ statusCode: 403 })
    expect(mockUpdateCalls.length).toBe(0)
  })

  it('newPassword < 8 karakter → 400', async () => {
    mockMembershipRole = 'user'
    await expect(
      passwordResetService.resetUserPassword({
        userId: TARGET_USER,
        callerId: CALLER_USER,
        projeId: PROJE_ID,
        newPassword: 'abc',
      }),
    ).rejects.toMatchObject({ statusCode: 400 })
    expect(mockUpdateCalls.length).toBe(0)
  })

  it('newPassword > 72 karakter → 400', async () => {
    mockMembershipRole = 'user'
    const tooLong = 'a'.repeat(73)
    await expect(
      passwordResetService.resetUserPassword({
        userId: TARGET_USER,
        callerId: CALLER_USER,
        projeId: PROJE_ID,
        newPassword: tooLong,
      }),
    ).rejects.toMatchObject({ statusCode: 400 })
    expect(mockUpdateCalls.length).toBe(0)
  })

  it('newPassword verilmezse → 16 char generated, generated=true', async () => {
    mockMembershipRole = 'manager'
    const result = await passwordResetService.resetUserPassword({
      userId: TARGET_USER,
      callerId: CALLER_USER,
      projeId: PROJE_ID,
    })
    expect(result.generated).toBe(true)
    expect(result.password).toHaveLength(16)
    expect(result.userId).toBe(TARGET_USER)
    expect(result.email).toBe(`${TARGET_USER}@example.com`)
    expect(mockUpdateCalls.length).toBe(1)
    expect(mockUpdateCalls[0].password).toBe(result.password)
  })

  it('newPassword verilmişse → generated=false, aynı şifre kullanılır', async () => {
    mockMembershipRole = 'user'
    const result = await passwordResetService.resetUserPassword({
      userId: TARGET_USER,
      callerId: CALLER_USER,
      projeId: PROJE_ID,
      newPassword: 'SecurePass123!',
    })
    expect(result.generated).toBe(false)
    expect(result.password).toBe('SecurePass123!')
    expect(mockUpdateCalls.length).toBe(1)
    expect(mockUpdateCalls[0].password).toBe('SecurePass123!')
  })

  it('audit log: logger.info çağrılır', async () => {
    mockMembershipRole = 'user'
    await passwordResetService.resetUserPassword({
      userId: TARGET_USER,
      callerId: CALLER_USER,
      projeId: PROJE_ID,
    })
    expect(mockLoggerInfo).toHaveBeenCalled()
    const callArg = mockLoggerInfo.mock.calls[0][0] as string
    expect(callArg).toContain('PASSWORD_RESET')
    expect(callArg).toContain(CALLER_USER)
    expect(callArg).toContain(TARGET_USER)
    expect(callArg).toContain(PROJE_ID)
  })

  it('supabase update hatası → 500', async () => {
    mockMembershipRole = 'user'
    mockUpdateError = { message: 'auth service down' }
    await expect(
      passwordResetService.resetUserPassword({
        userId: TARGET_USER,
        callerId: CALLER_USER,
        projeId: PROJE_ID,
      }),
    ).rejects.toMatchObject({ statusCode: 500 })
  })

  it('membership DB hatası → 500', async () => {
    mockMembershipError = { message: 'connection lost' }
    await expect(
      passwordResetService.resetUserPassword({
        userId: TARGET_USER,
        callerId: CALLER_USER,
        projeId: PROJE_ID,
      }),
    ).rejects.toMatchObject({ statusCode: 500 })
  })
})

describe('passwordResetService — şifre üretici güvenlik', () => {
  beforeEach(() => {
    mockMembershipRole = 'user'
    mockMembershipError = null
    mockUpdateError = null
    mockUpdateCalls.length = 0
  })

  it('üretilen şifreler arasında çakışma yok (100 örnek)', async () => {
    const seen = new Set<string>()
    for (let i = 0; i < 100; i++) {
      const res = await passwordResetService.resetUserPassword({
        userId: `target-${i}`,
        callerId: CALLER_USER,
        projeId: PROJE_ID,
      })
      expect(seen.has(res.password)).toBe(false)
      seen.add(res.password)
    }
  })
})

// Genel error class kontrolü
describe('passwordResetService — ApiError tip kontrolü', () => {
  beforeEach(() => {
    mockMembershipRole = 'user'
    mockMembershipError = null
    mockUpdateError = null
  })

  it('hata fırlatıldığında ApiError instance', async () => {
    mockMembershipRole = 'owner'
    try {
      await passwordResetService.resetUserPassword({
        userId: TARGET_USER,
        callerId: CALLER_USER,
        projeId: PROJE_ID,
      })
      expect.fail('hata fırlatılmalıydı')
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError)
    }
  })
})
