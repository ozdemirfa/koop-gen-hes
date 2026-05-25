import { supabaseAdmin } from '../config/supabase'
import { ApiError } from '../utils/ApiError'
import { parsePagination, toSupabaseRange, paginationMeta } from '../utils/pagination'
import { requireProjeId } from '../utils/projectGuard'
import logger from '../utils/logger'

export const firmaService = {
  async list(query: Record<string, any>) {
    const pagination = parsePagination(query)
    const { from, to } = toSupabaseRange(pagination)

    logger.info(`Firma listeleme isteği - Global list, Balance ProjectID: ${query.proje_id}`)

    let q = supabaseAdmin
      .from('firmalar')
      .select('*', { count: 'exact' })

    // Firmalar artık global, listelemede proje_id filtresi kaldırıldı
    if (query.firma_tipi) q = q.eq('firma_tipi', query.firma_tipi)
    if (query.aktif !== undefined) q = q.eq('aktif', query.aktif === 'true')
    if (query.search) q = q.ilike('unvan', `%${query.search}%`)

    const { data, error, count } = await q
      .order('unvan')
      .range(from, to)

    if (error) throw error

    // Sprint qa-review-bugfix-faz3 (2026-05-25, P1 + perf):
    // Eski Promise.all N+1 (her firma icin 3 query → 50 firma=150+) silinir;
    // fn_firma_bakiye_batch RPC tek pass'te tum bakiyeleri hesaplar.
    // Silent catch de kaldirildi — RPC fail → hata UI'da gorunur (eski:
    // 0 dondurup yanlis mali tablo gosterirdi).
    const pId =
      query.proje_id && query.proje_id !== 'null' && query.proje_id !== 'undefined'
        ? query.proje_id
        : null

    const firmaIds = (data || []).map((f) => f.id)
    let balanceMap = new Map<
      string,
      { toplam_odeme: number; toplam_kdvli: number; birikmis_teminat: number }
    >()

    if (firmaIds.length > 0) {
      const { data: rpcRows, error: rpcErr } = await supabaseAdmin.rpc(
        'fn_firma_bakiye_batch',
        { p_firma_ids: firmaIds, p_proje_id: pId },
      )
      if (rpcErr) {
        logger.error('Firma bakiye batch RPC hatasi', {
          code: (rpcErr as any).code,
          message: (rpcErr as any).message,
          firmaCount: firmaIds.length,
          projeId: pId,
        })
        throw rpcErr
      }
      balanceMap = new Map(
        ((rpcRows as any[]) ?? []).map((r: any) => [
          r.firma_id as string,
          {
            toplam_odeme: Number(r.toplam_odeme || 0),
            toplam_kdvli: Number(r.toplam_kdvli || 0),
            birikmis_teminat: Number(r.birikmis_teminat || 0),
          },
        ]),
      )
    }

    const updatedData = (data || []).map((firma) => {
      const b = balanceMap.get(firma.id) ?? {
        toplam_odeme: 0,
        toplam_kdvli: 0,
        birikmis_teminat: 0,
      }
      // Project perspective: (+) fazla odedik, (-) borcluyuz
      const bakiye = b.toplam_odeme - b.toplam_kdvli
      return { ...firma, guncel_bakiye: bakiye, toplam_teminat: b.birikmis_teminat }
    })

    return { data: updatedData, pagination: paginationMeta(pagination, count || 0) }
  },

  async getById(id: string) {
    const { data, error } = await supabaseAdmin
      .from('firmalar')
      .select('*')
      .eq('id', id)
      .single()

    if (error) throw ApiError.notFound('Firma bulunamadı')
    return data
  },

  async create(body: Record<string, any>) {
    const { data, error } = await supabaseAdmin
      .from('firmalar')
      .insert([body])
      .select()
      .single()

    if (error) throw error
    return data
  },

  async update(id: string, body: Record<string, any>) {
    const { data, error } = await supabaseAdmin
      .from('firmalar')
      .update(body)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    if (!data) throw ApiError.notFound('Firma bulunamadı')
    return data
  },

  async getCariEkstre(firmaId: string, query?: Record<string, any>) {
    // Sprint revizyon-bugfix-paketi B2 (2026-05-25, P0 multi-tenant fix):
    // service-role RLS bypass ettiginden proje_id filtresi zorunlu kilinir.
    // Aksi halde firma ID'sine bagli TUM projelerin cari hareketleri sizar.
    // Frontend zaten activeProject.id yolluyor; eksikse 400 dondur.
    const projeId = requireProjeId(query?.proje_id)

    const q = supabaseAdmin
      .from('cari_hareketler')
      .select('*, cari_hesaplar!inner(*)')
      .eq('cari_hesaplar.firma_id', firmaId)
      .eq('proje_id', projeId)

    const { data, error } = await q.order('tarih', { ascending: true })

    if (error) throw error

    // Çalışan bakiye hesapla (alacak - borc)
    let bakiye = 0
    const ekstre = data?.map(hareket => {
      bakiye += (Number(hareket.alacak || 0) - Number(hareket.borc || 0))
      return { ...hareket, bakiye }
    })

    return { hareketler: ekstre, guncel_bakiye: bakiye }
  },

  async getStats(projeId: string) {
    // Cari Hareketler üzerinden ödemeleri ve teminat iadelerini hesapla
    const { data: hareketler, error: hErr } = await supabaseAdmin
      .from('cari_hareketler')
      .select('borc, alacak, islem_turu, kaynak_tipi, cari_hesaplar!inner(cari_turu)')
      .eq('proje_id', projeId)
      .eq('cari_hesaplar.cari_turu', 'firma')

    if (hErr) throw hErr

    let toplamOdemeler = 0

    hareketler?.forEach(h => {
      const netAlacak = Number(h.alacak || 0) - Number(h.borc || 0)
      if (h.islem_turu === 'giden_odeme' || h.islem_turu === 'odeme') {
        toplamOdemeler += netAlacak
      }
    })

    // Hakedişler üzerinden Matrah, KDV
    const { data: hakedisler, error: hakErr } = await supabaseAdmin
      .from('hakedisler')
      .select('ara_toplam, kdv_tutar, hakedis_toplam')
      .eq('proje_id', projeId)
      .in('durum', ['onaylandi', 'odendi'])

    if (hakErr) throw hakErr

    const toplamMatrah = hakedisler?.reduce((s, h) => s + Number(h.ara_toplam || 0), 0) || 0
    const toplamKdvli = hakedisler?.reduce((s, h) => s + Number(h.hakedis_toplam || (Number(h.ara_toplam || 0) + Number(h.kdv_tutar || 0))), 0) || 0

    // 2. Birikmiş Teminat — 20260514000003 migration'ı sonrası tablo değeri net (iadeler
    // trigger ile düşülmüş). Ek runtime düşümü yok.
    const { data: teminatlar } = await supabaseAdmin
      .from('birikmis_teminatlar')
      .select('birikmis_teminat')
      .eq('proje_id', projeId)
    const birikmisTeminat = teminatlar?.reduce((sum, t) => sum + Number(t.birikmis_teminat || 0), 0) || 0

    // Faturalar
    const { data: faturalar, error: fErr } = await supabaseAdmin
      .from('faturalar')
      .select('toplam_tutar')
      .eq('proje_id', projeId)
      .eq('fatura_tipi', 'gelen')

    if (fErr) throw fErr
    const toplamFatura = faturalar?.reduce((s, f) => s + Number(f.toplam_tutar), 0) || 0

    return {
      toplam_hakedis: toplamMatrah,
      toplam_kdvli: toplamKdvli,
      toplam_odeme: toplamOdemeler,
      bakiye: toplamOdemeler - toplamKdvli,
      toplam_fatura: toplamFatura,
      fatura_acigi: toplamFatura - toplamKdvli,
      birikmis_teminat: birikmisTeminat
    }
  },

  async getIndividualStats(firmaId: string, projeId: string) {
    // 1. Firma özelinde cari hareketler
    const { data: hareketler, error: hErr } = await supabaseAdmin
      .from('cari_hareketler')
      .select('borc, alacak, islem_turu, kaynak_tipi, cari_hesaplar!inner(firma_id)')
      .eq('proje_id', projeId)
      .eq('cari_hesaplar.firma_id', firmaId)

    if (hErr) throw hErr

    let toplamOdemeler = 0

    hareketler?.forEach(h => {
      const netAlacak = Number(h.alacak || 0) - Number(h.borc || 0)
      if (h.islem_turu === 'giden_odeme' || h.islem_turu === 'odeme') {
        toplamOdemeler += netAlacak
      }
    })

    // 2. Firma özelinde hakedişler
    const { data: hakedisler, error: hakErr } = await supabaseAdmin
      .from('hakedisler')
      .select('ara_toplam, kdv_tutar, hakedis_toplam, sozlesmeler!inner(firma_id)')
      .eq('proje_id', projeId)
      .eq('sozlesmeler.firma_id', firmaId)
      .in('durum', ['onaylandi', 'odendi'])

    if (hakErr) throw hakErr

    const toplamMatrah = hakedisler?.reduce((s, h) => s + Number(h.ara_toplam || 0), 0) || 0
    const toplamKdvli = hakedisler?.reduce((s, h) => s + Number(h.hakedis_toplam || (Number(h.ara_toplam || 0) + Number(h.kdv_tutar || 0))), 0) || 0

    // 3. Birikmiş Teminat — 20260514000003 migration'ı sonrası tablo değeri net.
    const { data: teminatlar } = await supabaseAdmin
      .from('birikmis_teminatlar')
      .select('birikmis_teminat')
      .eq('proje_id', projeId)
      .eq('firma_id', firmaId)
    const birikmisTeminat = teminatlar?.reduce((sum, t) => sum + Number(t.birikmis_teminat || 0), 0) || 0

    // 3. Firma özelinde faturalar
    const { data: faturalar, error: fErr } = await supabaseAdmin
      .from('faturalar')
      .select('toplam_tutar')
      .eq('proje_id', projeId)
      .eq('firma_id', firmaId)
      .eq('fatura_tipi', 'gelen')

    if (fErr) throw fErr
    const toplamFatura = faturalar?.reduce((s, f) => s + Number(f.toplam_tutar), 0) || 0

    return {
      toplam_hakedis: toplamMatrah,
      toplam_kdvli: toplamKdvli,
      toplam_odeme: toplamOdemeler,
      bakiye: toplamOdemeler - toplamKdvli,
      toplam_fatura: toplamFatura,
      fatura_acigi: toplamFatura - toplamKdvli,
      birikmis_teminat: birikmisTeminat
    }
  }
}
