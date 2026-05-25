// Sprint qa-review-bugfix-faz3 Batch 3 — sozlesme.service unit testleri

import { describe, it, expect, vi, beforeEach } from 'vitest'

let nextData: any = null
let nextError: any = null
let nextCount = 0
let nextHakedisCount = 0
let nextKalemCount = 0
let countTable = ''

let headCountQuery = false

vi.mock('../../src/config/supabase', () => {
  const builder: any = {}
  builder.select = (_cols: any, opts?: { head?: boolean; count?: string }) => {
    headCountQuery = !!opts?.head
    return builder
  }
  builder.eq = () => {
    if (headCountQuery) {
      const t = countTable
      const count =
        t === 'hakedisler'
          ? nextHakedisCount
          : t === 'sozlesme_is_kalemleri'
          ? nextKalemCount
          : 0
      headCountQuery = false
      return Promise.resolve({ error: null, count })
    }
    return builder
  }
  builder.insert = () => builder
  builder.update = () => builder
  builder.delete = () => builder // chainable: delete().eq() pattern
  builder.range = () => Promise.resolve({ data: nextData, error: nextError, count: nextCount })
  builder.order = () => builder
  builder.single = async () => ({ data: nextData, error: nextError })
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
})

const PROJE = 'a1111111-1111-4111-a111-111111111111'

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
    nextError = { code: 'PGRST116' }
    await expect(sozlesmeService.getById('xx')).rejects.toBeInstanceOf(ApiError)
  })

  it('create — 23505 dup → ApiError.conflict', async () => {
    nextError = { code: '23505' }
    await expect(sozlesmeService.create({ sozlesme_no: 'S1' })).rejects.toThrow(/zaten kayıtlı/)
  })

  it('delete — hakediş bağlı → ApiError.badRequest', async () => {
    nextHakedisCount = 3
    await expect(sozlesmeService.delete('s1')).rejects.toThrow(/hakediş/)
  })

  it('delete — iş kalemleri bağlı → ApiError.badRequest', async () => {
    nextHakedisCount = 0
    nextKalemCount = 5
    await expect(sozlesmeService.delete('s1')).rejects.toThrow(/iş kalemleri/)
  })

  it('delete — bağımlılık yok → silinir', async () => {
    nextHakedisCount = 0
    nextKalemCount = 0
    await expect(sozlesmeService.delete('s1')).resolves.toBeUndefined()
  })
})
