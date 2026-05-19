// Sprint 20260519-para-hareketleri-improvements / US-1 + US-4:
//
// Backend filter — `GET /cari-hareketler` çağrısında opsiyonel `exclude_tahakkuk`
// query parametresi. `true` ise listeden `islem_turu='uyelik_baslangic' AND alacak > 0`
// satırları (üyelik başlangıç tahakkukları) Supabase tarafında dışlanır.
//
// Kapsam:
//   1. Param yok → eski davranış (filter uygulanmaz)         — backward compat (US-4)
//   2. exclude_tahakkuk=true → .or() filtresi uygulanır       — happy path (US-1)
//   3. eslesmemis=true + exclude_tahakkuk=true → NO-OP        — RPC path (Açık Sorular)
//
// supabaseAdmin'i kayıt yapan bir builder proxy ile mock'luyoruz; böylece servisin
// hangi PostgREST yöntemlerini çağırdığını ve hangi argümanlarla çağırdığını
// gözlemleyebiliyoruz. Gerçek HTTP/DB hit etmiyoruz.

import { describe, it, expect, beforeEach, vi } from 'vitest'

type Call = { method: string; args: unknown[] }
let builderCalls: Call[] = []
let rpcCalls: Call[] = []

vi.mock('../../src/config/supabase', () => {
  function createBuilder() {
    const passthrough = ['select', 'eq', 'neq', 'in', 'gte', 'lte', 'gt', 'lt', 'or', 'not']
    const handler: ProxyHandler<Record<string, unknown>> = {
      get(_target, prop: string) {
        if (prop === 'then') {
          // Builder thenable: .order(...) sonunda await edilir, [] döndür
          return undefined
        }
        if (prop === 'order') {
          return (...args: unknown[]) => {
            builderCalls.push({ method: 'order', args })
            return Promise.resolve({ data: [], error: null })
          }
        }
        if (passthrough.includes(prop)) {
          return (...args: unknown[]) => {
            builderCalls.push({ method: prop, args })
            return proxy
          }
        }
        return undefined
      },
    }
    const proxy = new Proxy({}, handler)
    return proxy as any
  }

  return {
    supabaseAdmin: {
      from: (_table: string) => createBuilder(),
      rpc: async (fnName: string, params: unknown) => {
        rpcCalls.push({ method: fnName, args: [params] })
        return { data: [], error: null }
      },
    },
  }
})

// vi.mock module-scope; import after mock kurulduktan sonra
import { cariHesapService } from '../../src/services/cariHesap.service'

const PROJE_ID = 'a1111111-1111-4111-a111-111111111111'

beforeEach(() => {
  builderCalls = []
  rpcCalls = []
})

describe('cariHesapService.list — exclude_tahakkuk filter', () => {
  it('default davranış (exclude_tahakkuk yok) → .or() filtresi UYGULANMAZ (backward compat / US-4)', async () => {
    await cariHesapService.list({ proje_id: PROJE_ID })

    const orCall = builderCalls.find((c) => c.method === 'or')
    expect(orCall).toBeUndefined()
  })

  it('exclude_tahakkuk=false (string) → .or() filtresi UYGULANMAZ', async () => {
    await cariHesapService.list({ proje_id: PROJE_ID, exclude_tahakkuk: 'false' })

    const orCall = builderCalls.find((c) => c.method === 'or')
    expect(orCall).toBeUndefined()
  })

  it('exclude_tahakkuk=true (string) → tahakkuk filtresi .or() ile UYGULANIR (US-1)', async () => {
    await cariHesapService.list({ proje_id: PROJE_ID, exclude_tahakkuk: 'true' })

    const orCall = builderCalls.find((c) => c.method === 'or')
    expect(orCall).toBeDefined()
    // Negation pattern: keep rows where at least one is true
    //   - islem_turu != 'uyelik_baslangic'  OR
    //   - alacak IS NULL                    OR
    //   - alacak <= 0
    const orExpr = String(orCall!.args[0])
    expect(orExpr).toContain('islem_turu.neq.uyelik_baslangic')
    expect(orExpr).toContain('alacak')
  })

  it('exclude_tahakkuk=true (boolean) → controller coerce sonrası servis aynı şekilde davranır', async () => {
    await cariHesapService.list({ proje_id: PROJE_ID, exclude_tahakkuk: true })

    const orCall = builderCalls.find((c) => c.method === 'or')
    expect(orCall).toBeDefined()
  })

  it('eslesmemis=true + exclude_tahakkuk=true → RPC path, .or() ÇAĞRILMAZ (NO-OP)', async () => {
    await cariHesapService.list({
      proje_id: PROJE_ID,
      eslesmemis: 'true',
      exclude_tahakkuk: 'true',
    })

    expect(rpcCalls.length).toBe(1)
    expect(rpcCalls[0].method).toBe('fn_list_unmatched_cari_hareketler')
    const orCall = builderCalls.find((c) => c.method === 'or')
    expect(orCall).toBeUndefined()
  })

  it('exclude_tahakkuk=true ile mevcut filtreler (islem_turu, baslangic_tarihi) korunur', async () => {
    await cariHesapService.list({
      proje_id: PROJE_ID,
      exclude_tahakkuk: 'true',
      baslangic_tarihi: '2026-01-01',
      bitis_tarihi: '2026-12-31',
    })

    const orCall = builderCalls.find((c) => c.method === 'or')
    expect(orCall).toBeDefined()
    const gteCall = builderCalls.find((c) => c.method === 'gte')
    expect(gteCall).toBeDefined()
    expect(gteCall!.args).toEqual(['tarih', '2026-01-01'])
    const lteCall = builderCalls.find((c) => c.method === 'lte')
    expect(lteCall).toBeDefined()
  })
})
