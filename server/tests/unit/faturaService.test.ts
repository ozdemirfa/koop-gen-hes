// Sprint qa-review-bugfix-faz3 Batch 3 — fatura.service unit testleri

import { describe, it, expect, vi, beforeEach } from 'vitest'

const rpcMock = vi.fn()
let nextData: any = null
let nextError: any = null

vi.mock('../../src/config/supabase', () => {
  const builder: any = {}
  builder.select = () => builder
  builder.eq = () => builder
  builder.gte = () => builder
  builder.lte = () => builder
  builder.insert = () => builder
  builder.update = () => builder
  builder.delete = () => Promise.resolve({ error: nextError })
  builder.range = () => Promise.resolve({ data: nextData, error: nextError, count: Array.isArray(nextData) ? nextData.length : 0 })
  builder.order = () => builder
  builder.maybeSingle = async () => ({ data: nextData, error: nextError })
  builder.single = async () => ({ data: nextData, error: nextError })
  return {
    supabaseAdmin: {
      from: () => builder,
      rpc: (...args: any[]) => rpcMock(...args),
    },
  }
})

import { faturaService } from '../../src/services/fatura.service'
import { ApiError } from '../../src/utils/ApiError'

beforeEach(() => {
  rpcMock.mockReset()
  nextData = null
  nextError = null
})

const PROJE = 'a1111111-1111-4111-a111-111111111111'

describe('faturaService', () => {
  it('list — proje_id zorunlu', async () => {
    await expect(faturaService.list({})).rejects.toBeInstanceOf(ApiError)
  })

  it('getById — id yoksa ApiError.badRequest', async () => {
    await expect(faturaService.getById('')).rejects.toBeInstanceOf(ApiError)
  })

  it('getById — kayıt yok → ApiError.notFound', async () => {
    nextData = null
    await expect(faturaService.getById('id-1')).rejects.toBeInstanceOf(ApiError)
  })

  it('create — fn_create_fatura_atomic RPC çağrılır + kalemler ayrılır', async () => {
    rpcMock.mockResolvedValueOnce({ data: { id: 'f1' }, error: null })
    await faturaService.create({
      fatura_no: 'F1',
      proje_id: PROJE,
      kalemler: [{ tutar: 100 }],
    }, 'actor-1')
    expect(rpcMock).toHaveBeenCalledWith('fn_create_fatura_atomic', expect.objectContaining({
      p_master: expect.objectContaining({ fatura_no: 'F1' }),
      p_kalemler: [{ tutar: 100 }],
      p_actor_id: 'actor-1',
    }))
  })

  it('update — P0002 → ApiError.notFound', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { code: 'P0002' } })
    await expect(faturaService.update('f1', { fatura_no: 'F2' })).rejects.toBeInstanceOf(ApiError)
  })
})
