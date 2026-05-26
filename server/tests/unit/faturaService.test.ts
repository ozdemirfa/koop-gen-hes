// Sprint qa-review-bugfix-faz3 Batch 3 — fatura.service unit testleri
// security-quality-sprint 2026-05-26 — IDOR koruma testleri eklendi

import { describe, it, expect, vi, beforeEach } from 'vitest'

const rpcMock = vi.fn()
const eqCalls: Array<{ col: string; val: unknown }> = []
const deleteEqCalls: Array<{ col: string; val: unknown }> = []
let nextData: any = null
let nextError: any = null

vi.mock('../../src/config/supabase', () => {
  const builder: any = {}
  builder.select = () => builder
  builder.eq = (col: string, val: unknown) => {
    eqCalls.push({ col, val })
    return builder
  }
  builder.gte = () => builder
  builder.lte = () => builder
  builder.insert = () => builder
  builder.update = () => builder
  // delete chain'i destekle: delete().eq().eq() → Promise resolve
  builder.delete = () => {
    const deleteChain: any = {}
    deleteChain.eq = (col: string, val: unknown) => {
      deleteEqCalls.push({ col, val })
      return deleteChain
    }
    deleteChain.then = (resolve: any) => resolve({ error: nextError })
    return deleteChain
  }
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
  eqCalls.length = 0
  deleteEqCalls.length = 0
  nextData = null
  nextError = null
})

const PROJE = 'a1111111-1111-4111-a111-111111111111'
const OTHER = 'b2222222-2222-4222-b222-222222222222'

describe('faturaService', () => {
  it('list — proje_id zorunlu', async () => {
    await expect(faturaService.list({})).rejects.toBeInstanceOf(ApiError)
  })

  it('getById — id yoksa ApiError.badRequest', async () => {
    await expect(faturaService.getById('', PROJE)).rejects.toBeInstanceOf(ApiError)
  })

  it('getById — kayıt yok → ApiError.notFound', async () => {
    nextData = null
    await expect(faturaService.getById('id-1', PROJE)).rejects.toBeInstanceOf(ApiError)
  })

  it('getById — IDOR koruması: proje_id query filtresine eklenir', async () => {
    nextData = { id: 'f1', proje_id: PROJE }
    await faturaService.getById('f1', PROJE)
    // .eq('id', ...) ve .eq('proje_id', PROJE) ikisi de çağrılmalı
    expect(eqCalls).toContainEqual({ col: 'id', val: 'f1' })
    expect(eqCalls).toContainEqual({ col: 'proje_id', val: PROJE })
  })

  it('getById — projeId boşsa requireProjeId 400 fırlatır (IDOR fix)', async () => {
    await expect(faturaService.getById('f1', '')).rejects.toBeInstanceOf(ApiError)
    await expect(faturaService.getById('f1', 'null')).rejects.toBeInstanceOf(ApiError)
    await expect(faturaService.getById('f1', 'undefined')).rejects.toBeInstanceOf(ApiError)
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
    await expect(faturaService.update('f1', { fatura_no: 'F2' }, PROJE)).rejects.toBeInstanceOf(ApiError)
  })

  it('update — IDOR koruması: RPC p_proje_id parametresi yollar', async () => {
    rpcMock.mockResolvedValueOnce({ data: { id: 'f1' }, error: null })
    await faturaService.update('f1', { fatura_no: 'F2', proje_id: OTHER }, PROJE, 'actor-1')
    // master'dan proje_id silinmeli (cross-project taşımayı engelle)
    expect(rpcMock).toHaveBeenCalledWith('fn_update_fatura_atomic', expect.objectContaining({
      p_id: 'f1',
      p_proje_id: PROJE,
      p_master: expect.not.objectContaining({ proje_id: expect.anything() }),
    }))
  })

  it('update — projeId yoksa 400', async () => {
    await expect(faturaService.update('f1', { fatura_no: 'F2' }, '')).rejects.toBeInstanceOf(ApiError)
  })

  it('delete — IDOR koruması: pre-check sonra proje_id ile silme', async () => {
    nextData = { id: 'f1' }  // pre-check: fatura bulundu
    await faturaService.delete('f1', PROJE)
    // SELECT pre-check: id + proje_id eq edilmeli
    expect(eqCalls).toContainEqual({ col: 'id', val: 'f1' })
    expect(eqCalls).toContainEqual({ col: 'proje_id', val: PROJE })
    // DELETE chain'inde de proje_id eq edilmeli (defense in depth)
    expect(deleteEqCalls).toContainEqual({ col: 'proje_id', val: PROJE })
  })

  it('delete — fatura başka projedeyse 404', async () => {
    nextData = null  // pre-check: kayıt yok
    await expect(faturaService.delete('f1', OTHER)).rejects.toBeInstanceOf(ApiError)
  })

  it('delete — projeId yoksa 400', async () => {
    await expect(faturaService.delete('f1', '')).rejects.toBeInstanceOf(ApiError)
  })
})
