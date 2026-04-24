import { supabaseAdmin } from '../config/supabase'
import { ApiError } from '../utils/ApiError'
import { parsePagination, toSupabaseRange, paginationMeta } from '../utils/pagination'

export const kategoriService = {
  async list(query: Record<string, any> = {}) {
    let q = supabaseAdmin
      .from('gelir_gider_kategorileri')
      .select('*')

    if (query.proje_id) q = q.eq('proje_id', query.proje_id)

    const { data, error } = await q
      .order('tip')
      .order('ad')

    if (error) throw error
    return data
  },

  async create(body: Record<string, any>) {
    const { data, error } = await supabaseAdmin
      .from('gelir_gider_kategorileri')
      .insert([body])
      .select()
      .single()

    if (error) throw error
    return data
  },

  async update(id: string, body: Record<string, any>) {
    const { data, error } = await supabaseAdmin
      .from('gelir_gider_kategorileri')
      .update(body)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    if (!data) throw ApiError.notFound('Kategori bulunamadı')
    return data
  },

  async delete(id: string) {
    const { error } = await supabaseAdmin
      .from('gelir_gider_kategorileri')
      .delete()
      .eq('id', id)

    if (error) {
      if (error.code === '23503') throw ApiError.badRequest('Bu kategori kullanımda olduğu için silinemez')
      throw error
    }
  }
}

export const gelirGiderService = {
  async list(query: Record<string, any>) {
    const pagination = parsePagination(query)
    const { from, to } = toSupabaseRange(pagination)

    let q = supabaseAdmin
      .from('gelir_giderler')
      .select('*, gelir_gider_kategorileri(ad, tip), uyeler(ad, soyad, uye_no), firmalar(unvan)', { count: 'exact' })

    if (query.proje_id) q = q.eq('proje_id', query.proje_id)
    if (query.tip) q = q.eq('tip', query.tip)
    if (query.kategori_id) q = q.eq('kategori_id', query.kategori_id)
    if (query.baslangic_tarihi) q = q.gte('tarih', query.baslangic_tarihi)
    if (query.bitis_tarihi) q = q.lte('tarih', query.bitis_tarihi)

    const { data, error, count } = await q
      .order('tarih', { ascending: false })
      .range(from, to)

    if (error) throw error

    return { data, pagination: paginationMeta(pagination, count || 0) }
  },

  async getById(id: string) {
    const { data, error } = await supabaseAdmin
      .from('gelir_giderler')
      .select('*, gelir_gider_kategorileri(ad, tip), uyeler(ad, soyad, uye_no), firmalar(unvan), cari_hareketler:kaynak_id(*)')
      .eq('id', id)
      .single()

    if (error) throw ApiError.notFound('Kayıt bulunamadı')
    return data
  },

  async create(body: Record<string, any>) {
    const { 
      proje_id, 
      tip, 
      tutar, 
      tarih, 
      uye_id, 
      firma_id, 
      aciklama, 
      belge_no, 
      kategori_id,
      kaynak_tipi,
      kaynak_id,
      odeme_turu // New field from UI potentially
    } = body

    let finalKaynakId = kaynak_id
    let finalKaynakTipi = kaynak_tipi || 'manuel'

    // 1. Eğer kaynak_id yoksa ve bu bir finansal hareketse, cari_hareket oluştur
    if (!finalKaynakId && (tip === 'gelir' || tip === 'gider')) {
      try {
        // Cari hesabı bul veya sistemin bulmasını bekle (islem_turu ve odeme_turu'na göre)
        // Burada cariHesapService.createPayment'ı kullanacağız ama önce cari_hesap_id'yi bulmalıyız
        let cari_hesap_id = null
        
        if (uye_id) {
          const { data: cari } = await supabaseAdmin
            .from('cari_hesaplar')
            .select('id')
            .eq('proje_id', proje_id)
            .eq('uye_id', uye_id)
            .single()
          cari_hesap_id = cari?.id
        } else if (firma_id) {
          const { data: cari } = await supabaseAdmin
            .from('cari_hesaplar')
            .select('id')
            .eq('proje_id', proje_id)
            .eq('firma_id', firma_id)
            .single()
          cari_hesap_id = cari?.id
        }

        // Cari hareket oluştur
        const islem_turu = tip === 'gelir' ? 'gelen_odeme' : 'giden_odeme'
        
        const { data: hareket, error: hError } = await supabaseAdmin
          .from('cari_hareketler')
          .insert([{
            proje_id,
            cari_hesap_id,
            islem_turu,
            odeme_turu: odeme_turu || 'banka', // Default
            tarih,
            aciklama,
            belge_no,
            borc: tip === 'gelir' ? tutar : 0, // Proje bakış açısıyla: Gelir = Borç
            alacak: tip === 'gider' ? tutar : 0, // Gider = Alacak
            kaynak_tipi: 'gelir_gider'
          }])
          .select()
          .single()

        if (!hError && hareket) {
          finalKaynakId = hareket.id
          finalKaynakTipi = 'manuel'
        }
      } catch (err) {
        console.error('Cari hareket oluşturulamadı, devam ediliyor...', err)
      }
    }

    const { data, error } = await supabaseAdmin
      .from('gelir_giderler')
      .insert([{
        proje_id,
        tip,
        tutar,
        tarih,
        uye_id,
        firma_id,
        aciklama,
        belge_no,
        kategori_id,
        kaynak_tipi: finalKaynakTipi,
        kaynak_id: finalKaynakId
      }])
      .select('*, gelir_gider_kategorileri(ad, tip)')
      .single()

    if (error) throw error
    return data
  },

  async update(id: string, body: Record<string, any>) {
    // 1. Mevcut kaydı çek (kaynak_id'yi bulmak için)
    const current = await this.getById(id)
    
    // 2. Eğer kaynak_id bir cari_hareket ise onu da güncelle
    if (current.kaynak_id && (current.kaynak_tipi === 'manuel' || current.kaynak_tipi === 'gelir_gider')) {
      await supabaseAdmin
        .from('cari_hareketler')
        .update({
          tarih: body.tarih || current.tarih,
          aciklama: body.aciklama || current.aciklama,
          belge_no: body.belge_no || current.belge_no,
          borc: body.tip === 'gelir' ? (body.tutar || current.tutar) : 0,
          alacak: body.tip === 'gider' ? (body.tutar || current.tutar) : 0,
        })
        .eq('id', current.kaynak_id)
    }

    const { data, error } = await supabaseAdmin
      .from('gelir_giderler')
      .update(body)
      .eq('id', id)
      .select('*, gelir_gider_kategorileri(ad, tip)')
      .single()

    if (error) throw error
    if (!data) throw ApiError.notFound('Kayıt bulunamadı')
    return data
  },

  async delete(id: string) {
    const current = await this.getById(id)

    // Önce cari hareketi sil (opsiyonel, veya cascade varsa gerek olmayabilir ama güvenli olsun)
    if (current.kaynak_id && (current.kaynak_tipi === 'manuel' || current.kaynak_tipi === 'gelir_gider')) {
      await supabaseAdmin.from('cari_hareketler').delete().eq('id', current.kaynak_id)
    }

    const { error } = await supabaseAdmin
      .from('gelir_giderler')
      .delete()
      .eq('id', id)

    if (error) throw error
  }
}
