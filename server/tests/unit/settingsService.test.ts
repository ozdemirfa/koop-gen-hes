// Sprint qa-review-bugfix-faz3 Batch 3 — settings.service unit testleri
// Birim + Poz CRUD davranışı (23505 conflict, 23503 FK violation mesajları)
//
// Sprint birim-poz-user-scope (2026-05-27): service artık SettingsContext alır,
// is_global → kullanici_id mapping yapar, DELETE/UPDATE'te admin-or-owner check'i
// vardır.

import { describe, it, expect, vi, beforeEach } from 'vitest'

let lastTable = ''
let insertArg: any = null
let updateArg: any = null
let deleteCalled = false
let nextError: any = null
let nextData: any = null
let maybeSingleData: any = null
let orFilter: string | null = null

vi.mock('../../src/middleware/roleCache', () => ({
  getUserRole: async () => null,
}))

vi.mock('../../src/config/supabase', () => {
  const builder: any = {}
  builder.select = () => builder
  builder.insert = (rows: any) => {
    insertArg = rows
    return builder
  }
  builder.update = (rows: any) => {
    updateArg = rows
    return builder
  }
  builder.delete = () => {
    deleteCalled = true
    return builder
  }
  builder.eq = () => builder
  builder.or = (filter: string) => {
    orFilter = filter
    return builder
  }
  // service .order().order() chain — ilk çağrı chain, ikinci çağrı Promise
  let orderCalls = 0
  builder.order = () => {
    orderCalls++
    if (orderCalls === 1) {
      return builder
    }
    orderCalls = 0
    return Promise.resolve({ data: nextData, error: nextError })
  }
  builder.single = async () => ({ data: nextData, error: nextError })
  builder.maybeSingle = async () => ({ data: maybeSingleData, error: null })
  builder.then = (resolve: any) => resolve({ data: nextData, error: nextError })
  return {
    supabaseAdmin: {
      from: (t: string) => {
        lastTable = t
        return builder
      },
    },
  }
})

import { settingsService } from '../../src/services/settings.service'
import { ApiError } from '../../src/utils/ApiError'

const userCtx = { userId: 'user-1', isAdmin: false }
const adminCtx = { userId: 'admin-1', isAdmin: true }

beforeEach(() => {
  lastTable = ''
  insertArg = null
  updateArg = null
  deleteCalled = false
  nextError = null
  nextData = null
  maybeSingleData = null
  orFilter = null
})

describe('settingsService', () => {
  it('getBirimler — userId tabanlı .or filter uygular', async () => {
    nextData = [{ id: '1', ad: 'm2', kullanici_id: null }]
    const r = await settingsService.getBirimler('user-1')
    expect(r).toEqual(nextData)
    expect(lastTable).toBe('birimler')
    expect(orFilter).toBe('kullanici_id.is.null,kullanici_id.eq.user-1')
  })

  it('createBirim — is_global=false (default) → kullanici_id = ctx.userId', async () => {
    nextData = [{ id: '1', ad: 'kg', kullanici_id: 'user-1' }]
    await settingsService.createBirim({ ad: 'kg' }, userCtx)
    expect(insertArg).toEqual([{ ad: 'kg', kullanici_id: 'user-1' }])
  })

  it('createBirim — is_global=true → kullanici_id = NULL', async () => {
    nextData = [{ id: '1', ad: 'kg', kullanici_id: null }]
    await settingsService.createBirim({ ad: 'kg', is_global: true }, adminCtx)
    expect(insertArg).toEqual([{ ad: 'kg', kullanici_id: null }])
  })

  it('createBirim — proje_id payload\'tan strip edilir', async () => {
    nextData = [{ id: '1', ad: 'kg' }]
    await settingsService.createBirim({ ad: 'kg', proje_id: 'sneaky' }, userCtx)
    expect((insertArg[0] as any).proje_id).toBeUndefined()
  })

  it('createBirim — 23505 → ApiError.conflict', async () => {
    nextError = { code: '23505', message: 'dup' }
    await expect(settingsService.createBirim({ ad: 'm' }, userCtx)).rejects.toBeInstanceOf(ApiError)
  })

  it('deleteBirim — non-admin başka sahibin kaydı → ApiError.forbidden', async () => {
    maybeSingleData = { kullanici_id: 'someone-else' }
    await expect(settingsService.deleteBirim('id-1', userCtx)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('deleteBirim — non-admin global (NULL) → ApiError.forbidden', async () => {
    maybeSingleData = { kullanici_id: null }
    await expect(settingsService.deleteBirim('id-1', userCtx)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('deleteBirim — non-admin kendi kaydı → silinir', async () => {
    maybeSingleData = { kullanici_id: 'user-1' }
    await settingsService.deleteBirim('id-1', userCtx)
    expect(deleteCalled).toBe(true)
  })

  it('deleteBirim — admin başkasının kaydı → silinir', async () => {
    maybeSingleData = { kullanici_id: 'random' }
    await settingsService.deleteBirim('id-1', adminCtx)
    expect(deleteCalled).toBe(true)
  })

  it('deleteBirim — 23503 (FK) → ApiError.badRequest Türkçe mesaj', async () => {
    maybeSingleData = { kullanici_id: 'user-1' }
    nextError = { code: '23503', message: 'fk' }
    await expect(settingsService.deleteBirim('id-1', userCtx)).rejects.toThrow(/bağlı pozlar/)
  })

  it('createPoz — başarı durumunda kayıt döner + kullanici_id user-1', async () => {
    nextData = [{ id: '1', poz_no: 'P1', tanim: 'T' }]
    const r = await settingsService.createPoz({ poz_no: 'P1', tanim: 'T' }, userCtx)
    expect(r).toEqual(nextData[0])
    expect((insertArg[0] as any).kullanici_id).toBe('user-1')
  })

  it('updatePoz — non-admin başka sahibin kaydı → ApiError.forbidden', async () => {
    maybeSingleData = { kullanici_id: 'someone-else' }
    await expect(settingsService.updatePoz('1', { tanim: 'T2' }, userCtx)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('updatePoz — kendi kaydı + kullanici_id readonly (body\'den drop edilir)', async () => {
    maybeSingleData = { kullanici_id: 'user-1' }
    nextData = { id: '1', poz_no: 'P1', tanim: 'T2' }
    await settingsService.updatePoz('1', { tanim: 'T2', kullanici_id: 'hacker' }, userCtx)
    expect(updateArg).toEqual({ tanim: 'T2' })
    expect((updateArg as any).kullanici_id).toBeUndefined()
  })

  it('deletePoz — sahibi silebilir', async () => {
    maybeSingleData = { kullanici_id: 'user-1' }
    await settingsService.deletePoz('1', userCtx)
    expect(deleteCalled).toBe(true)
  })
})
