// Sprint qa-review-bugfix-faz3 Batch 3 — settings.service unit testleri
// Birim + Poz CRUD davranışı (23505 conflict, 23503 FK violation mesajları)

import { describe, it, expect, vi, beforeEach } from 'vitest'

let lastTable = ''
let insertArg: any = null
let updateArg: any = null
let deleteCalled = false
let nextError: any = null
let nextData: any = null

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
  builder.order = () => Promise.resolve({ data: nextData, error: nextError })
  builder.single = async () => ({ data: nextData, error: nextError })
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

beforeEach(() => {
  lastTable = ''
  insertArg = null
  updateArg = null
  deleteCalled = false
  nextError = null
  nextData = null
})

describe('settingsService', () => {
  it('getBirimler — orderBy ad ile listeler', async () => {
    nextData = [{ id: '1', ad: 'm2' }]
    const r = await settingsService.getBirimler()
    expect(r).toEqual(nextData)
    expect(lastTable).toBe('birimler')
  })

  it('createBirim — proje_id payload\'tan strip edilir (global tablo)', async () => {
    nextData = [{ id: '1', ad: 'kg' }]
    await settingsService.createBirim({ ad: 'kg', proje_id: 'sneaky' })
    expect(insertArg).toEqual([{ ad: 'kg' }])
    expect((insertArg[0] as any).proje_id).toBeUndefined()
  })

  it('createBirim — 23505 → ApiError.conflict', async () => {
    nextError = { code: '23505', message: 'dup' }
    await expect(settingsService.createBirim({ ad: 'm' })).rejects.toBeInstanceOf(ApiError)
  })

  it('deleteBirim — 23503 (FK) → ApiError.badRequest Türkçe mesaj', async () => {
    nextError = { code: '23503', message: 'fk' }
    await expect(settingsService.deleteBirim('id-1')).rejects.toThrow(/bağlı pozlar/)
  })

  it('createPoz — başarı durumunda kayıt döner', async () => {
    nextData = [{ id: '1', poz_no: 'P1', tanim: 'T' }]
    const r = await settingsService.createPoz({ poz_no: 'P1', tanim: 'T' })
    expect(r).toEqual(nextData[0])
  })

  it('updatePoz — değişiklik payload aktarılır', async () => {
    nextData = { id: '1', poz_no: 'P1', tanim: 'T2' }
    await settingsService.updatePoz('1', { tanim: 'T2' })
    expect(updateArg).toEqual({ tanim: 'T2' })
  })

  it('deletePoz — supabase delete çağrılır', async () => {
    await settingsService.deletePoz('1')
    expect(deleteCalled).toBe(true)
  })
})
