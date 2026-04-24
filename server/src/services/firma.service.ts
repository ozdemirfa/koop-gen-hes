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
    const updatedData = await Promise.all((data || []).map(async (firma) => {
      let bakiye = 0
      let toplamTeminat = 0

      try {
        // Cari hesabı bul (borc/alacak/bakiye bu tabloda tutuluyor)
        let bakiyeQuery = supabaseAdmin
          .from('cari_hesaplar')
          .select('bakiye')
          .eq('firma_id', firma.id)

        if (query.proje_id && query.proje_id !== 'null' && query.proje_id !== 'undefined') {
          bakiyeQuery = bakiyeQuery.eq('proje_id', query.proje_id)
        }

        const { data: cariler } = await bakiyeQuery
        bakiye = cariler?.reduce((sum, c) => sum + Number(c.bakiye || 0), 0) || 0

        // Teminat (Proje bazlı)
        let hakedisQuery = supabaseAdmin
          .from('hakedisler')
          .select('teminat_kesintisi')
          .eq('sozlesmeler!inner(firma_id)', firma.id) // Fallback join if firma_id missing on hakedis
          .in('durum', ['onaylandi', 'odendi'])

        if (query.proje_id && query.proje_id !== 'null' && query.proje_id !== 'undefined') {
          hakedisQuery = hakedisQuery.eq('proje_id', query.proje_id)
        }

        const { data: hakedisler } = await hakedisQuery
        toplamTeminat = hakedisler?.reduce((sum, h) => sum + Number(h.teminat_kesintisi || 0), 0) || 0
      } catch (err) {
        logger.error(`Bakiye hesaplama hatası (Firma: ${firma.id}):`, err)
      }

      return { ...firma, guncel_bakiye: bakiye, toplam_teminat: toplamTeminat }
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
      .select('borc, alacak, islem_turu, kaynak_tipi')
      .eq('proje_id', projeId)

    if (hErr) throw hErr

    let toplamOdemeler = 0
    let odenenTeminatlar = 0

    hareketler?.forEach(h => {
      const alacak = Number(h.alacak || 0)
      if (h.islem_turu === 'giden_odeme') {
        toplamOdemeler += alacak
        if (h.kaynak_tipi === 'teminat') {
          odenenTeminatlar += alacak
        }
      }
    })

    // Hakedişler üzerinden Matrah, KDV, Teminat Kesintisi
    const { data: hakedisler, error: hakErr } = await supabaseAdmin
      .from('hakedisler')
      .select('ara_toplam, hakedis_toplam, teminat_kesintisi')
      .eq('proje_id', projeId)
      .in('durum', ['onaylandi', 'odendi'])

    if (hakErr) throw hakErr
    
    const toplamMatrah = hakedisler?.reduce((s, h) => s + Number(h.ara_toplam || 0), 0) || 0
    const toplamKdvli = hakedisler?.reduce((s, h) => s + Number(h.hakedis_toplam || 0), 0) || 0
    const toplamTeminatKesintisi = hakedisler?.reduce((s, h) => s + Number(h.teminat_kesintisi || 0), 0) || 0

    const birikmisTeminat = toplamTeminatKesintisi - odenenTeminatlar

    // Faturalar
    const { data: faturalar, error: fErr } = await supabaseAdmin
      .from('faturalar')
      .select('toplam_tutar')
      .eq('proje_id', projeId)
      .eq('fatura_tipi', 'gelen')

    if (fErr) throw fErr
    const toplamFatura = faturalar?.reduce((s, f) => s + Number(f.toplam_tutar), 0) || 0

    // Kullanıcının talep ettiği Cari Bakiye formülü: 
    // Cari Bakiye = Toplam Ödeme - KDVli tutar - Birikmiş teminat
    const cariBakiye = toplamOdemeler - toplamKdvli - birikmisTeminat

    return {
      toplam_hakedis: toplamMatrah,
      toplam_kdvli: toplamKdvli,
      toplam_odeme: toplamOdemeler,
      bakiye: cariBakiye,
      toplam_fatura: toplamFatura,
      fatura_acigi: toplamKdvli - toplamFatura,
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
      const alacak = Number(h.alacak || 0)
      if (h.islem_turu === 'giden_odeme' || h.islem_turu === 'odeme') {
        toplamOdemeler += alacak
        if (h.kaynak_tipi === 'teminat') {
          odenenTeminatlar += alacak
        }
      }
    })

    // 2. Firma özelinde hakedişler
    const { data: hakedisler, error: hakErr } = await supabaseAdmin
      .from('hakedisler')
      .select('ara_toplam, hakedis_toplam, teminat_kesintisi')
      .eq('proje_id', projeId)
      .eq('firma_id', firmaId)
      .in('durum', ['onaylandi', 'odendi'])

    if (hakErr) throw hakErr

    const toplamMatrah = hakedisler?.reduce((s, h) => s + Number(h.ara_toplam || 0), 0) || 0
    const toplamKdvli = hakedisler?.reduce((s, h) => s + Number(h.hakedis_toplam || 0), 0) || 0
    const toplamTeminatKesintisi = hakedisler?.reduce((s, h) => s + Number(h.teminat_kesintisi || 0), 0) || 0

    const birikmisTeminat = toplamTeminatKesintisi - odenenTeminatlar

    // 3. Firma özelinde faturalar
    const { data: faturalar, error: fErr } = await supabaseAdmin
      .from('faturalar')
      .select('toplam_tutar')
      .eq('proje_id', projeId)
      .eq('firma_id', firmaId)
      .eq('fatura_tipi', 'gelen')

    if (fErr) throw fErr
    const toplamFatura = faturalar?.reduce((s, f) => s + Number(f.toplam_tutar), 0) || 0

    // Cari Bakiye Formülü
    const cariBakiye = toplamOdemeler - toplamKdvli - birikmisTeminat

    return {
      toplam_hakedis: toplamMatrah,
      toplam_kdvli: toplamKdvli,
      toplam_odeme: toplamOdemeler,
      bakiye: cariBakiye,
      toplam_fatura: toplamFatura,
      fatura_acigi: toplamKdvli - toplamFatura,
      birikmis_teminat: birikmisTeminat
    }
  }
}
