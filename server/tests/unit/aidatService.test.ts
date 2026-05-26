// Sprint qa-review-bugfix-faz3 Batch 3 — aidat.service (aidatTanimiService) unit testleri

import { describe, it, expect, vi, beforeEach } from 'vitest'

let nextData: any = null
let nextError: any = null
let existingRow: any = null

vi.mock('../../src/config/supabase', () => {
  const builder: any = {}
  builder.select = () => builder
  builder.eq = () => builder
  builder.insert = () => builder
  builder.update = () => builder
  builder.order = () => builder // chainable for chained .order().eq() after
  builder.single = async () => ({ data: nextData, error: nextError })
  builder.maybeSingle = async () => ({ data: existingRow, error: null })
  builder.then = (resolve: any) => resolve({ data: nextData, error: nextError })
  return {
    supabaseAdmin: {
      from: () => builder,
    },
  }
})

import { aidatTanimiService } from '../../src/services/aidat.service'
import { ApiError } from '../../src/utils/ApiError'

beforeEach(() => {
  nextData = null
  nextError = null
  existingRow = null
})

const PROJE = 'a1111111-1111-4111-a111-111111111111'

describe('aidatTanimiService', () => {
  it('list — proje_id zorunlu', async () => {
    await expect(aidatTanimiService.list({})).rejects.toBeInstanceOf(ApiError)
  })

  it('list — proje_id ile veri döner', async () => {
    nextData = [{ id: '1', yil: 2026, ay: 1 }]
    const r = await aidatTanimiService.list({ proje_id: PROJE })
    expect(r).toEqual(nextData)
  })

  it('createTanim — proje_id yoksa badRequest', async () => {
    await expect(aidatTanimiService.createTanim({ yil: 2026, ay: 1 } as any)).rejects.toBeInstanceOf(ApiError)
  })

  it('createTanim — mevcut dönem + tür kayıtlıysa 409', async () => {
    existingRow = { id: 'existing' }
    await expect(
      aidatTanimiService.createTanim({
        proje_id: PROJE,
        yil: 2026,
        ay: 1,
        katsayi_tutari: 100,
        tur: 'normal',
      }),
    ).rejects.toMatchObject({ statusCode: 409 })
  })

  it('createTanim — başarılı insert döner', async () => {
    existingRow = null
    nextData = { id: 't1', yil: 2026, ay: 1, katsayi_tutari: 100 }
    const r = await aidatTanimiService.createTanim({
      proje_id: PROJE,
      yil: 2026,
      ay: 1,
      katsayi_tutari: 100,
    })
    expect(r).toEqual(nextData)
  })

  // IDOR fix testleri (security-quality-sprint 2026-05-26)
  it('updateTanim — IDOR: projeId boşsa 400', async () => {
    await expect(aidatTanimiService.updateTanim('t1', {}, '')).rejects.toBeInstanceOf(ApiError)
  })

  it('updateTanim — IDOR: kayıt başka projede → 404', async () => {
    existingRow = null  // pre-check kayıt yok
    await expect(aidatTanimiService.updateTanim('t1', {}, PROJE)).rejects.toBeInstanceOf(ApiError)
  })

  it('updateTanim — durum plan değilse badRequest', async () => {
    existingRow = { durum: 'borclandi' }
    await expect(aidatTanimiService.updateTanim('t1', {}, PROJE)).rejects.toMatchObject({
      statusCode: 400,
    })
  })

  it('deleteTanim — IDOR: projeId boşsa 400', async () => {
    await expect(aidatTanimiService.deleteTanim('t1', '')).rejects.toBeInstanceOf(ApiError)
  })

  it('deleteTanim — IDOR: kayıt başka projede → 404', async () => {
    existingRow = null
    await expect(aidatTanimiService.deleteTanim('t1', PROJE)).rejects.toBeInstanceOf(ApiError)
  })
})
