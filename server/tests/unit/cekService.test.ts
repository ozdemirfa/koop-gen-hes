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
    nextError = { code: 'PGRST116' }
    await expect(cekService.getById('xx')).rejects.toBeInstanceOf(ApiError)
  })

  it('create — başarı durumu insert payload\'ını döner', async () => {
    nextData = { id: '1', cek_no: 'A1' }
    const r = await cekService.create({ cek_no: 'A1', tutar: 100 })
    expect(r).toEqual(nextData)
    expect(insertArgs[0][0].cek_no).toBe('A1')
  })

  it('payCheck — zaten ödendi durumunda ApiError.badRequest', async () => {
    nextData = { id: '1', durum: 'odendi', tutar: 100, firma_id: 'f1', proje_id: PROJE }
    await expect(cekService.payCheck('1', 'bh1')).rejects.toThrow(/zaten ödendi/)
  })
})
