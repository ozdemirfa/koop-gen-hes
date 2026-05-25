// Sprint qa-review-bugfix-faz3 Batch 3 — malzemeTeslim.service unit testleri

import { describe, it, expect, vi, beforeEach } from 'vitest'

const rpcMock = vi.fn()
let nextData: any = null
let nextError: any = null
let nextCount = 0

vi.mock('../../src/config/supabase', () => {
  const builder: any = {}
  builder.select = () => builder
  builder.eq = () => builder
  builder.gte = () => builder
  builder.lte = () => builder
  builder.is = () => builder
  builder.not = () => builder
  builder.delete = () => Promise.resolve({ error: nextError })
  builder.range = () => Promise.resolve({ data: nextData, error: nextError, count: nextCount })
  builder.order = () => builder
  builder.single = async () => ({ data: nextData, error: nextError })
  return {
    supabaseAdmin: {
      from: () => builder,
      rpc: (...args: any[]) => rpcMock(...args),
    },
  }
})

import { malzemeTeslimService } from '../../src/services/malzemeTeslim.service'
import { ApiError } from '../../src/utils/ApiError'

beforeEach(() => {
  rpcMock.mockReset()
  nextData = null
  nextError = null
  nextCount = 0
})

const PROJE = 'a1111111-1111-4111-a111-111111111111'

describe('malzemeTeslimService', () => {
  it('list — proje_id zorunlu', async () => {
    await expect(malzemeTeslimService.list({})).rejects.toBeInstanceOf(ApiError)
  })

  it('list — pagination + data döner', async () => {
    nextData = [{ id: '1', irsaliye_no: 'I1' }]
    nextCount = 1
    const r = await malzemeTeslimService.list({ proje_id: PROJE })
    expect(r.data).toEqual(nextData)
  })

  it('getById — kayıt yok → ApiError.notFound', async () => {
    nextError = { code: 'PGRST116' }
    await expect(malzemeTeslimService.getById('x')).rejects.toBeInstanceOf(ApiError)
  })

  it('create — fn_create_irsaliye_atomic RPC çağrılır', async () => {
    // Önce rpc create için id döner, sonra getById için data
    rpcMock.mockResolvedValueOnce({ data: { id: 'i1' }, error: null })
    nextData = { id: 'i1', irsaliye_no: 'I1' }
    await malzemeTeslimService.create({
      irsaliye_no: 'I1',
      proje_id: PROJE,
      kalemler: [{ malzeme_adi: 'Çimento', miktar: 10 }],
    })
    expect(rpcMock).toHaveBeenCalledWith('fn_create_irsaliye_atomic', expect.objectContaining({
      p_master_data: expect.objectContaining({ irsaliye_no: 'I1' }),
      p_kalemler: expect.arrayContaining([expect.objectContaining({ malzeme_adi: 'Çimento' })]),
    }))
  })
})
