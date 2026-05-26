// Sprint qa-review-bugfix-faz3 Batch 3 — cek.service unit testleri
// list (proje_id zorunlu + filter), create, payCheck (state guards)

import { describe, it, expect, vi, beforeEach } from 'vitest'

let nextData: any = null
let nextError: any = null
let insertArgs: any[] = []
let updateArgs: any[] = []
const filterCalls: string[] = []

vi.mock('../../src/config/supabase', () => {
  const builder: any = {}
  builder.select = () => builder
  builder.eq = (col: string, val: any) => {
    filterCalls.push(`${col}=${val}`)
    return builder
  }
  builder.lte = () => builder
  builder.gte = () => builder
  builder.insert = (rows: any) => {
    insertArgs.push(rows)
    return builder
  }
  builder.update = (rows: any) => {
    updateArgs.push(rows)
    return builder
  }
  builder.order = () => Promise.resolve({ data: nextData, error: nextError })
  builder.single = async () => ({ data: nextData, error: nextError })
  builder.maybeSingle = async () => ({ data: nextData, error: nextError })
  builder.then = (resolve: any) => resolve({ data: nextData, error: nextError })
  return {
    supabaseAdmin: {
      from: () => builder,
    },
  }
})

import { cekService } from '../../src/services/cek.service'
import { ApiError } from '../../src/utils/ApiError'

beforeEach(() => {
  nextData = null
  nextError = null
  insertArgs = []
  updateArgs = []
  filterCalls.length = 0
})

const PROJE = 'a1111111-1111-4111-a111-111111111111'

describe('cekService', () => {
  it('list — proje_id yoksa ApiError', async () => {
    await expect(cekService.list({})).rejects.toBeInstanceOf(ApiError)
  })

  it('list — filter=odendi → durum filter uygulanır', async () => {
    nextData = []
    await cekService.list({ proje_id: PROJE, filter: 'odendi' })
    expect(filterCalls.some((c) => c === 'durum=odendi')).toBe(true)
  })

  it('list — filter=vadesi_gelenler → durum=beklemede + vade lte today', async () => {
    nextData = []
    await cekService.list({ proje_id: PROJE, filter: 'vadesi_gelenler' })
    expect(filterCalls.some((c) => c === 'durum=beklemede')).toBe(true)
  })

  it('getById — kayıt yok → ApiError.notFound', async () => {
    nextData = null
    await expect(cekService.getById('xx', PROJE)).rejects.toBeInstanceOf(ApiError)
  })

  it('getById — IDOR: projeId boşsa 400', async () => {
    await expect(cekService.getById('xx', '')).rejects.toBeInstanceOf(ApiError)
  })

  it('getById — IDOR: proje_id query filtresine eklenir', async () => {
    nextData = { id: 'c1', proje_id: PROJE }
    await cekService.getById('c1', PROJE)
    expect(filterCalls).toContain(`id=c1`)
    expect(filterCalls).toContain(`proje_id=${PROJE}`)
  })

  it('update — IDOR: body içindeki proje_id silinir', async () => {
    nextData = { id: 'c1', durum: 'beklemede' }
    await cekService.update('c1', { durum: 'iade', proje_id: 'other', id: 'attacker' }, PROJE)
    // sanitize: update() çağrısında proje_id ve id olmamalı
    expect(updateArgs[0]).not.toHaveProperty('proje_id')
    expect(updateArgs[0]).not.toHaveProperty('id')
    expect(updateArgs[0].durum).toBe('iade')
  })

  it('updateDurum — IDOR: proje_id WHERE filtresine eklenir', async () => {
    nextData = { id: 'c1', durum: 'iade' }
    await cekService.updateDurum('c1', 'iade', PROJE)
    expect(filterCalls).toContain(`proje_id=${PROJE}`)
  })

  it('create — başarı durumu insert payload\'ını döner', async () => {
    nextData = { id: '1', cek_no: 'A1' }
    const r = await cekService.create({ cek_no: 'A1', tutar: 100 })
    expect(r).toEqual(nextData)
    expect(insertArgs[0][0].cek_no).toBe('A1')
  })

  it('payCheck — zaten ödendi durumunda ApiError.badRequest', async () => {
    nextData = { id: '1', durum: 'odendi', tutar: 100, firma_id: 'f1', proje_id: PROJE }
    await expect(cekService.payCheck('1', 'bh1', PROJE)).rejects.toThrow(/zaten ödendi/)
  })

  // Sprint revizyon-bugfix-paketi B4 (2026-05-25, madde 7 — production 400 fix)
  it('payCheck — banka_hesap_id eksikse 400 dondurur', async () => {
    await expect(cekService.payCheck('1', '', PROJE)).rejects.toThrow(/banka_hesap_id zorunlu/)
    await expect(cekService.payCheck('1', undefined as any, PROJE)).rejects.toThrow(/banka_hesap_id zorunlu/)
  })

  it('payCheck — IDOR: projeId boşsa 400', async () => {
    await expect(cekService.payCheck('1', 'bh1', '')).rejects.toBeInstanceOf(ApiError)
  })
})
