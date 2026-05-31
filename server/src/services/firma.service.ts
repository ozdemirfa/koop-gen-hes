import { supabaseAdmin } from '../config/supabase'
import { ApiError } from '../utils/ApiError'
import { parsePagination, toSupabaseRange, paginationMeta } from '../utils/pagination'
import { requireProjeId, sanitizeSearchInput } from '../utils/projectGuard'
import logger from '../utils/logger'

// Sprint firma-owner-scope (2026-05-31): Firmalar artık owner-bazlı. Bir projenin
// owner'ını (proje_uyelikleri rol='owner') döndürür; firma listesi/oluşturma bu
// owner'a göre filtrelenir/atanır.
async function getProjectOwnerId(projeId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('proje_uyelikleri')
    .select('user_id')
    .eq('proje_id', projeId)
    .eq('rol', 'owner')
    .limit(1)
    .maybeSingle()
  if (error) {
    logger.error('getProjectOwnerId hatası', { projeId, error: error.message })
    return null
  }
  return data?.user_id ?? null
}

export const firmaService = {
  async list(query: Record<string, any>) {
    const pagination = parsePagination(query)

    // Owner-bazlı: proje_id zorunlu; firmalar aktif projenin owner'ına göre filtrelenir.
    const projeId = requireProjeId(query.proje_id)
    const ownerId = await getProjectOwnerId(projeId)
    if (!ownerId) {
      // Proje sahibi bulunamadı → gösterilecek firma yok.
      return { data: [], pagination: paginationMeta(pagination, 0) }
    }

    logger.info(`Firma listeleme isteği - owner=${ownerId}, ProjectID: ${projeId}`)

    // Sprint firma-fatura-acigi-sort (2026-05-31): Hesaplanan alanlara (cari
    // bakiye / birikmiş teminat / fatura açığı) göre doğru sıralama, full set'in
    // RPC ile zenginleştirilip sonra sıralanıp sayfalanmasını gerektirir
    // (bu alanlar firmalar tablosunda yok, RPC sonrası hesaplanır). Firma sayısı
    // düzinelerce mertebesinde olduğundan full fetch kabul edilebilir.
    const SORTABLE = ['unvan', 'guncel_bakiye', 'toplam_teminat', 'fatura_acigi'] as const
    type SortKey = (typeof SORTABLE)[number]
    const sortBy: SortKey = SORTABLE.includes(query.sort_by) ? query.sort_by : 'unvan'
    const sortDir: 'asc' | 'desc' = query.sort_dir === 'desc' ? 'desc' : 'asc'

    let q = supabaseAdmin
      .from('firmalar')
      .select('*', { count: 'exact' })
      .eq('owner_id', ownerId)

    if (query.firma_tipi) q = q.eq('firma_tipi', query.firma_tipi)
    if (query.aktif !== undefined) q = q.eq('aktif', query.aktif === 'true')
    // Sprint security-quality-audit 2026-05-26: search input sanitize
    if (query.search) {
      const safe = sanitizeSearchInput(query.search)
      if (safe) q = q.ilike('unvan', `%${safe}%`)
    }

    // Full set (range YOK) — sıralama hesaplanan alanlar üzerinde olabildiği için.
    const { data, error, count } = await q.order('unvan')

    if (error) throw error

    // Sprint qa-review-bugfix-faz3 (2026-05-25, P1 + perf):
    // Eski Promise.all N+1 (her firma icin 3 query → 50 firma=150+) silinir;
    // fn_firma_bakiye_batch RPC tek pass'te tum bakiyeleri hesaplar.
    // Silent catch de kaldirildi — RPC fail → hata UI'da gorunur (eski:
    // 0 dondurup yanlis mali tablo gosterirdi).
    const pId = projeId

    const firmaIds = (data || []).map((f) => f.id)
    let balanceMap = new Map<
      string,
      { toplam_odeme: number; toplam_kdvli: number; birikmis_teminat: number; toplam_fatura: number }
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
            toplam_fatura: Number(r.toplam_fatura || 0),
          },
        ]),
      )
    }

    const enriched = (data || []).map((firma) => {
      const b = balanceMap.get(firma.id) ?? {
        toplam_odeme: 0,
        toplam_kdvli: 0,
        birikmis_teminat: 0,
        toplam_fatura: 0,
      }
      // Project perspective: (+) fazla odedik, (-) borcluyuz
      const bakiye = b.toplam_odeme - b.toplam_kdvli
      // Fatura açığı: kesilen (gelen) fatura − onaylanan/ödenen hakediş.
      // getIndividualStats / fn_dashboard_ozet (fatura_farki) ile birebir.
      const faturaAcigi = b.toplam_fatura - b.toplam_kdvli
      return {
        ...firma,
        guncel_bakiye: bakiye,
        toplam_teminat: b.birikmis_teminat,
        fatura_acigi: faturaAcigi,
      }
    })

    // Server-side sıralama (hesaplanan alanlar dahil) → sonra sayfala.
    const dir = sortDir === 'desc' ? -1 : 1
    enriched.sort((a, b) => {
      if (sortBy === 'unvan') {
        return dir * String(a.unvan ?? '').localeCompare(String(b.unvan ?? ''), 'tr')
      }
      return dir * (((a as any)[sortBy] ?? 0) - ((b as any)[sortBy] ?? 0))
    })

    const { from, to } = toSupabaseRange(pagination)
    const pageData = enriched.slice(from, to + 1)

    return { data: pageData, pagination: paginationMeta(pagination, count || 0) }
  },

  async getById(id: string, projeId?: string) {
    const { data, error } = await supabaseAdmin
      .from('firmalar')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !data) throw ApiError.notFound('Firma bulunamadı')

    // Owner-bazlı sahiplik kontrolü: aktif proje verildiyse, firma o projenin
    // owner'ına ait olmalı (başka owner'ların firmaları görüntülenemez).
    if (projeId) {
      const ownerId = await getProjectOwnerId(projeId)
      if (!ownerId || data.owner_id !== ownerId) {
        throw ApiError.notFound('Firma bulunamadı')
      }
    }
    return data
  },

  async create(body: Record<string, any>, projeId: string) {
    // owner_id server-side: aktif projenin owner'ı. Frontend owner_id göndermez.
    const ownerId = await getProjectOwnerId(projeId)
    if (!ownerId) throw ApiError.badRequest('Proje sahibi bulunamadı; firma oluşturulamaz')

    const { owner_id: _ignore, ...safe } = body
    const { data, error } = await supabaseAdmin
      .from('firmalar')
      .insert([{ ...safe, owner_id: ownerId }])
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
