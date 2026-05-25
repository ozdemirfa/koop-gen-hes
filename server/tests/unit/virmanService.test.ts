// Sprint qa-review-bugfix-faz3 Batch 3 — virman.service unit testleri
// list (proje_id zorunlu), create (RPC), remove (cross-project guard)

import { describe, it, expect, vi, beforeEach } from 'vitest'

const rpcMock = vi.fn()
let listRows: any[] = []
let findRow: any = null
let lastDelete = ''

vi.mock('../../src/config/supabase', () => {
  const builder: any = {}
  builder.select = () => builder
  builder.eq = () => builder
  builder.gte = () => builder
  builder.lte = () => builder
  builder.delete = () => builder
  builder.order = () => builder
  builder.single = async () => ({ data: findRow, error: findRow ? null : { code: 'PGRST116' } })
  builder.then = (resolve: any) => resolve({ data: listRows, error: null })
  return {
    supabaseAdmin: {
      from: (t: string) => {
        lastDelete = t
        return builder
      },
      rpc: (...args: any[]) => rpcMock(...args),
    },
  }
})

import { virmanService } from '../../src/services/virman.service'
import { ApiError } from '../../src/utils/ApiError'

beforeEach(() => {
  rpcMock.mockReset()
  listRows = []
  findRow = null
  lastDelete = ''
})

const PROJE = 'a1111111-1111-4111-a111-111111111111'

describe('virmanService', () => {
  it('list — proje_id yoksa ApiError.badRequest', async () => {
    await expect(virmanService.list({})).rejects.toBeInstanceOf(ApiError)
  })

  it('list — geçerli proje_id ile sonuç döner', async () => {
    listRows = [{ id: '1', tutar: 100 }]
    const r = await virmanService.list({ proje_id: PROJE })
    expect(r).toEqual(listRows)
  })

  it('create — fn_create_virman_atomic RPC çağrılır', async () => {
    rpcMock.mockResolvedValueOnce({
      data: { virman_id: 'v1', gider_hareket_id: 'g1', gelir_hareket_id: 'g2' },
      error: null,
    })
    const r = await virmanService.create({
      proje_id: PROJE,
      virman_tipi: 'banka_banka',
      kaynak_hesap_id: 'k1',
      hedef_hesap_id: 'h1',
      tutar: 500,
      tarih: '2026-05-25',
    }, 'actor-1')
    expect(rpcMock).toHaveBeenCalledWith('fn_create_virman_atomic', expect.objectContaining({
      p_data: expect.objectContaining({ proje_id: PROJE, tutar: 500 }),
      p_actor_id: 'actor-1',
    }))
    expect(r.virman_id).toBe('v1')
  })

  it('remove — kayıt yok → 404', async () => {
    findRow = null
    await expect(virmanService.remove('xxx', PROJE)).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('remove — başka projenin virmanı → 404 (defense in depth)', async () => {
    findRow = { id: '1', proje_id: 'b2222222-2222-4222-a222-222222222222' }
    await expect(virmanService.remove('1', PROJE)).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('remove — kendi projesi → silinir', async () => {
    findRow = { id: '1', proje_id: PROJE }
    const r = await virmanService.remove('1', PROJE)
    expect(r.deleted).toBe(true)
  })
})
