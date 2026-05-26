// Sprint qa-review-bugfix-faz3 Batch 3 — sozlesme.service unit testleri
// security-quality-sprint 2026-05-26 — IDOR koruma testleri eklendi

import { describe, it, expect, vi, beforeEach } from 'vitest'

let nextData: any = null
let nextError: any = null
let nextCount = 0
let nextHakedisCount = 0
let nextKalemCount = 0
let countTable = ''
// IDOR pre-check: sözleşme bulunsun varsayılan
let existsSozlesme = true
let existsKalemWithProje: { id: string; sozlesmeler: { proje_id: string } } | null = null
const eqCalls: Array<{ col: string; val: unknown }> = []

let headCountQuery = false

vi.mock('../../src/config/supabase', () => {
  const builder: any = {}
  builder.select = (_cols: any, opts?: { head?: boolean; count?: string }) => {
    headCountQuery = !!opts?.head
    return builder
  }
  // headCountQuery için: tablo bazlı eşik (hakedisler=2eq, sozlesme_is_kalemleri=1eq).
  let eqCountInHead = 0
  builder.eq = (col: string, val: unknown) => {
    eqCalls.push({ col, val })
    if (headCountQuery) {
      eqCountInHead += 1
      const t = countTable
      const threshold = t === 'hakedisler' ? 2 : 1
      if (eqCountInHead >= threshold) {
        const count = t === 'hakedisler' ? nextHakedisCount : t === 'sozlesme_is_kalemleri' ? nextKalemCount : 0
        headCountQuery = false
        eqCountInHead = 0
        return Promise.resolve({ error: null, count })
      }
      return builder
    }
    return builder
  }
  builder.insert = () => builder
  builder.update = () => builder
  builder.delete = () => builder
  builder.range = () => Promise.resolve({ data: nextData, error: nextError, count: nextCount })
  builder.order = () => builder
  builder.single = async () => ({ data: nextData, error: nextError })
  builder.maybeSingle = async () => {
    // assertSozlesmeInProje pre-check ya da update pre-check chain'i
    // existsKalemWithProje pattern: kalem update/delete için
    if (existsKalemWithProje !== null) {
      const v = existsKalemWithProje
      existsKalemWithProje = null
      return { data: v, error: null }
    }
    if (countTable === 'sozlesmeler' && !existsSozlesme) {
      return { data: null, error: null }
    }
    return { data: nextData ?? { id: 'x' }, error: nextError }
  }
  builder.then = (resolve: any) => resolve({ data: nextData, error: nextError })
  return {
    supabaseAdmin: {
      from: (t: string) => {
        countTable = t
        return builder
      },
    },
  }
})

import { sozlesmeService } from '../../src/services/sozlesme.service'
import { ApiError } from '../../src/utils/ApiError'

beforeEach(() => {
  nextData = null
  nextError = null
  nextCount = 0
  nextHakedisCount = 0
  nextKalemCount = 0
  countTable = ''
  existsSozlesme = true
  existsKalemWithProje = null
  eqCalls.length = 0
})

const PROJE = 'a1111111-1111-4111-a111-111111111111'
const OTHER = 'b2222222-2222-4222-b222-222222222222'

describe('sozlesmeService', () => {
  it('list — proje_id zorunlu', async () => {
    await expect(sozlesmeService.list({})).rejects.toBeInstanceOf(ApiError)
  })

  it('list — pagination meta + data döner', async () => {
    nextData = [{ id: '1', sozlesme_no: 'S001' }]
    nextCount = 1
    const r = await sozlesmeService.list({ proje_id: PROJE })
    expect(r.data).toEqual(nextData)
    expect(r.pagination.totalCount).toBe(1)
  })

  it('getById — kayıt yok → ApiError.notFound', async () => {
    existsSozlesme = false
    await expect(sozlesmeService.getById('xx', PROJE)).rejects.toBeInstanceOf(ApiError)
  })

  it('getById — IDOR: projeId boşsa 400', async () => {
    await expect(sozlesmeService.getById('s1', '')).rejects.toBeInstanceOf(ApiError)
  })

  it('getById — IDOR: proje_id query filtresine eklenir', async () => {
    nextData = { id: 's1', proje_id: PROJE }
    await sozlesmeService.getById('s1', PROJE)
    expect(eqCalls).toContainEqual({ col: 'id', val: 's1' })
    expect(eqCalls).toContainEqual({ col: 'proje_id', val: PROJE })
  })

  it('create — 23505 dup → ApiError.conflict', async () => {
    nextError = { code: '23505' }
    await expect(sozlesmeService.create({ sozlesme_no: 'S1' })).rejects.toThrow(/zaten kayıtlı/)
  })

  it('update — IDOR: body içindeki proje_id silinir (mass-assignment koruması)', async () => {
    nextData = { id: 's1', sozlesme_no: 'S2', proje_id: PROJE }
    await sozlesmeService.update('s1', { sozlesme_no: 'S2', proje_id: OTHER }, PROJE)
    expect(eqCalls).toContainEqual({ col: 'proje_id', val: PROJE })
  })

  it('update — IDOR: projeId yoksa 400', async () => {
    await expect(sozlesmeService.update('s1', {}, '')).rejects.toBeInstanceOf(ApiError)
  })

  it('updateIsKalemi — IDOR: kalem parent proje eşleşmiyorsa 404', async () => {
    existsKalemWithProje = { id: 'k1', sozlesmeler: { proje_id: OTHER } }
    await expect(
      sozlesmeService.updateIsKalemi('k1', { miktar: 5 }, PROJE)
    ).rejects.toBeInstanceOf(ApiError)
  })

  it('updateIsKalemi — IDOR: kalem parent eşleşiyorsa geçer', async () => {
    existsKalemWithProje = { id: 'k1', sozlesmeler: { proje_id: PROJE } }
    nextData = { id: 'k1', miktar: 5 }
    const r = await sozlesmeService.updateIsKalemi('k1', { miktar: 5 }, PROJE)
    expect(r).toEqual(nextData)
  })

  it('deleteIsKalemi — IDOR: kalem parent eşleşmiyorsa 404', async () => {
    existsKalemWithProje = { id: 'k1', sozlesmeler: { proje_id: OTHER } }
    await expect(sozlesmeService.deleteIsKalemi('k1', PROJE)).rejects.toBeInstanceOf(ApiError)
  })

  it('delete — hakediş bağlı → ApiError.badRequest', async () => {
    nextHakedisCount = 3
    await expect(sozlesmeService.delete('s1', PROJE)).rejects.toThrow(/hakediş/)
  })

  it('delete — iş kalemleri bağlı → ApiError.badRequest', async () => {
    nextHakedisCount = 0
    nextKalemCount = 5
    await expect(sozlesmeService.delete('s1', PROJE)).rejects.toThrow(/iş kalemleri/)
  })

  it('delete — IDOR pre-check: sözleşme yoksa 404', async () => {
    existsSozlesme = false
    await expect(sozlesmeService.delete('s1', PROJE)).rejects.toBeInstanceOf(ApiError)
  })

  it('delete — bağımlılık yok → silinir', async () => {
    nextHakedisCount = 0
    nextKalemCount = 0
    await expect(sozlesmeService.delete('s1', PROJE)).resolves.toBeUndefined()
  })
})
