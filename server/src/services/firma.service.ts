import { supabaseAdmin } from '../config/supabase'
import { ApiError } from '../utils/ApiError'
import { parsePagination, toSupabaseRange, paginationMeta } from '../utils/pagination'
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

    // Bakiyeleri ve teminatları (seçili proje varsa o projeye göre) ekle
    const pId = (query.proje_id && query.proje_id !== 'null' && query.proje_id !== 'undefined') ? query.proje_id : null;

    const updatedData = await Promise.all((data || []).map(async (firma) => {
      let bakiye = 0
      let birikmisTeminat = 0
      let toplamOdeme = 0
      let toplamKdvli = 0

      try {
        // 1. Ödemeler (Project Perspective: ALACAK is payment/outflow for project)
        let hareketQuery = supabaseAdmin
          .from('cari_hareketler')
          .select('alacak, borc, islem_turu, kaynak_tipi, cari_hesaplar!inner(firma_id)')
          .eq('cari_hesaplar.firma_id', firma.id)

        if (pId) {
          hareketQuery = hareketQuery.eq('proje_id', pId)
        }

        const { data: hareketler } = await hareketQuery

        hareketler?.forEach((h: any) => {
          if (h.islem_turu === 'giden_odeme' || h.islem_turu === 'odeme') {
            toplamOdeme += Number(h.alacak || 0)
          }
        })

        // 2. Hakedişler (KDVli tutarlar)
        // Firma ID'sine göre hakedişleri çekmek için sozlesmeler tablosunu inner join ile kullanıyoruz
        let hakedisQuery = supabaseAdmin
          .from('hakedisler')
          .select('hakedis_toplam, ara_toplam, kdv_tutar, sozlesmeler!inner(firma_id)')
          .eq('sozlesmeler.firma_id', firma.id)
          .in('durum', ['onaylandi', 'odendi'])

        if (pId) {
          hakedisQuery = hakedisQuery.eq('proje_id', pId)
        }

        const { data: hakedisler } = await hakedisQuery
        toplamKdvli = hakedisler?.reduce((sum, h) => sum + Number(h.hakedis_toplam || (Number(h.ara_toplam || 0) + Number(h.kdv_tutar || 0))), 0) || 0
        
        // 3. Birikmiş Teminat (Yeni Tablodan)
        // Hakedişlerden yapılan toplam kesintiler bu tabloda trigger ile güncelleniyor.
        // Buradan iadeler düşülmüş HALİNİ alıyoruz: Kesinti (birikmis_teminatlar tablosu) - İade (cari_hareketler alacak)
        let odenenTeminatlar = 0
        hareketler?.forEach((h: any) => {
          if (h.kaynak_tipi === 'teminat' && (h.islem_turu === 'giden_odeme' || h.islem_turu === 'odeme')) {
            odenenTeminatlar += Number(h.alacak || 0)
          }
        })

        const { data: teminatRecord } = await supabaseAdmin
          .from('birikmis_teminatlar')
          .select('birikmis_teminat')
          .eq('firma_id', firma.id)
          .eq('proje_id', pId || '') // Proje seçili değilse boş döner, bu beklenen bir durumdur
          .maybeSingle()

        birikmisTeminat = Number(teminatRecord?.birikmis_teminat || 0) - odenenTeminatlar
        
        // Cari Bakiye = Toplam Ödeme - Hakediş (KDVli)
        // Project Perspective: (+) Fazla ödedik, (-) Borçluyuz
        bakiye = toplamOdeme - toplamKdvli

      } catch (err) {
        logger.error(`Bakiye hesaplama hatası (Firma: ${firma.id}):`, err)
      }

      return { ...firma, guncel_bakiye: bakiye, toplam_teminat: birikmisTeminat }
    }))


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
    let q = supabaseAdmin
      .from('cari_hareketler')
      .select('*, cari_hesaplar!inner(*)')
      .eq('cari_hesaplar.firma_id', firmaId)
    
    if (query?.proje_id) q = q.eq('proje_id', query.proje_id)

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
    let odenenTeminatlar = 0

    hareketler?.forEach(h => {
      const netAlacak = Number(h.alacak || 0) - Number(h.borc || 0)
      if (h.islem_turu === 'giden_odeme' || h.islem_turu === 'odeme') {
        toplamOdemeler += netAlacak
        // REV-FIRMA-01 (2026-05-12): kaynak_tipi='teminat' giden_odeme kayıtları
        // teminat iadesidir; birikmis_teminatlar tablosu RPC dışı iadelerde
        // azaltılmadığı için stats'ta cari_hareketler'den iade toplamını ayrıca
        // düşmek zorundayız (list metodu zaten bu mantığı uyguluyor; getStats
        // tutarlı olmalı).
        if (h.kaynak_tipi === 'teminat') {
          odenenTeminatlar += Number(h.alacak || 0)
        }
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

    // 2. Birikmiş Teminat (Yeni Tablodan) — iade düşülmüş net değer
    let teminatQuery = supabaseAdmin
      .from('birikmis_teminatlar')
      .select('birikmis_teminat')
      .eq('proje_id', projeId)

    const { data: teminatlar } = await teminatQuery
    const teminatToplam = teminatlar?.reduce((sum, t) => sum + Number(t.birikmis_teminat || 0), 0) || 0
    const birikmisTeminat = teminatToplam - odenenTeminatlar

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
    let odenenTeminatlar = 0

    hareketler?.forEach(h => {
      const netAlacak = Number(h.alacak || 0) - Number(h.borc || 0)
      if (h.islem_turu === 'giden_odeme' || h.islem_turu === 'odeme') {
        toplamOdemeler += netAlacak
        // REV-FIRMA-01: teminat iadelerini ayrıca topla (birikmis_teminatlar tablosu
        // RPC dışı iadelerde decrement edilmediği için ek düşüm gerekli).
        if (h.kaynak_tipi === 'teminat') {
          odenenTeminatlar += Number(h.alacak || 0)
        }
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

    // 3. Birikmiş Teminat — iade düşülmüş net değer
    const { data: teminatlar } = await supabaseAdmin
      .from('birikmis_teminatlar')
      .select('birikmis_teminat')
      .eq('proje_id', projeId)
      .eq('firma_id', firmaId)

    const teminatToplam = teminatlar?.reduce((sum, t) => sum + Number(t.birikmis_teminat || 0), 0) || 0
    const birikmisTeminat = teminatToplam - odenenTeminatlar

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
