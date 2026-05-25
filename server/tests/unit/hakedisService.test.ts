// Sprint qa-review-bugfix-faz3 Batch 3 — hakedis.service unit testleri (list path)

import { describe, it, expect, vi, beforeEach } from 'vitest'

let nextData: any = null
let nextError: any = null
let nextCount = 0
let firmaSozlesmeleri: any[] = []
let currentTable = ''

vi.mock('../../src/config/supabase', () => {
  const builder: any = {}
  builder.select = () => builder
  builder.eq = () => {
    if (currentTable === 'sozlesmeler') {
      return Promise.resolve({ data: firmaSozlesmeleri, error: null })
    }
    return builder
  }
  builder.in = () => builder
  builder.gte = () => builder
  builder.lte = () => builder
  builder.range = () => Promise.resolve({ data: nextData, error: nextError, count: nextCount })
  builder.order = () => builder
  builder.single = async () => ({ data: nextData, error: nextError })
  return {
    supabaseAdmin: {
      from: (t: string) => {
        currentTable = t
        return builder
      },
    },
  }
})

import { hakedisService } from '../../src/services/hakedis.service'
import { ApiError } from '../../src/utils/ApiError'

beforeEach(() => {
  nextData = null
  nextError = null
  nextCount = 0
  firmaSozlesmeleri = []
  currentTable = ''
})

const PROJE = 'a1111111-1111-4111-a111-111111111111'

describe('hakedisService.list', () => {
  it('proje_id zorunlu', async () => {
    await expect(hakedisService.list({})).rejects.toBeInstanceOf(ApiError)
  })

  it('proje_id ile veri döner', async () => {
    nextData = [{ id: '1', hakedis_no: 1 }]
    nextCount = 1
    const r = await hakedisService.list({ proje_id: PROJE })
    expect(r.data).toEqual(nextData)
    expect(r.pagination.totalCount).toBe(1)
  })

  it('firma_id filtresi: firmaSozlesmeleri yoksa boş liste', async () => {
    firmaSozlesmeleri = []
    nextData = [{ id: '1' }]
    const r = await hakedisService.list({ proje_id: PROJE, firma_id: 'f1' })
    expect(r.data).toEqual([])
    expect(r.pagination.totalCount).toBe(0)
  })

  it('getById — kayıt yok → ApiError.notFound', async () => {
    nextError = { code: 'PGRST116' }
    await expect(hakedisService.getById('h1')).rejects.toBeInstanceOf(ApiError)
  })
})
