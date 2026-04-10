import { supabaseAdmin } from '../config/supabase'
import { ApiError } from '../utils/ApiError'
import { parsePagination, toSupabaseRange, paginationMeta } from '../utils/pagination'
import { makeAidatSonOdemeTarihi } from '../utils/formatters'

export const aidatTanimiService = {
  async list() {
    const { data, error } = await supabaseAdmin
      .from('aidat_tanimlari')
      .select('*')
      .order('yil', { ascending: false })
      .order('ay', { ascending: false })

    if (error) throw error
    return data
  },

  async create(body: Record<string, any>) {
    const sonOdemeGunu = body.son_odeme_gunu || 15

    const { data: tanim, error } = await supabaseAdmin
      .from('aidat_tanimlari')
      .insert([body])
      .select()
      .single()

    if (error) throw error

    // Tüm aktif üyeleri çek
    const { data: uyeler, error: uyeError } = await supabaseAdmin
      .from('uyeler')
      .select('id, hisse_orani')
      .eq('durum', 'aktif')

    if (uyeError) throw uyeError

    if (uyeler && uyeler.length > 0) {
      const sonOdemeTarihi = makeAidatSonOdemeTarihi(body.yil, body.ay, sonOdemeGunu)

      const aidatlar = uyeler.map(uye => ({
        uye_id: uye.id,
        aidat_tanimi_id: tanim.id,
        tutar: Number(body.katsayi_tutari) * (Number(uye.hisse_orani) || 1.00),
        son_odeme_tarihi: sonOdemeTarihi
      }))

      const { error: aidatError } = await supabaseAdmin
        .from('aidatlar')
        .insert(aidatlar)

      if (aidatError) throw aidatError
    }

    return { ...tanim, olusturulan_aidat_sayisi: uyeler?.length || 0 }
  },

  async createYillikPlan(body: { yil: number, kalemler: any[] }) {
    const { yil, kalemler } = body
    
    // Aktif üyeleri çek
    const { data: uyeler, error: uyeError } = await supabaseAdmin
      .from('uyeler')
      .select('id, hisse_orani')
      .eq('durum', 'aktif')
      
    if (uyeError) throw uyeError

    // Mevcut yılın tanımlarını temizle (Cascade sayesinde aidatlar da silinir)
    // NOT: Ödeme yapılmış aidatlar varsa silme işlemi DB seviyesinde hata verebilir (FK kısıtları)
    // Bu yüzden önce kontrol edip ödeme olanları silmemek veya uyarmak gerekebilir.
    // Şimdilik temiz bir başlangıç için siliyoruz, eğer ödeme varsa hata dönecektir.
    const { error: deleteError } = await supabaseAdmin
      .from('aidat_tanimlari')
      .delete()
      .eq('yil', yil)
      .eq('tur', 'normal') // Sadece normal tanımları temizle, özel ara ödemeler kalabilir mi? 
      // Plan genellikle tüm yılı kapsadığı için normal olanları temizlemek mantıklı.

    if (deleteError) {
      if (deleteError.code === '23503') {
        throw ApiError.badRequest('Bu yıla ait ödeme yapılmış aidatlar bulunduğu için plan güncellenemez. Lütfen manuel düzenleme yapın.')
      }
      throw deleteError
    }

    let olusturulanTanim = 0
    let olusturulanAidat = 0

    for (const kalem of kalemler) {
       kalem.yil = yil
       // Aidat tanımı oluştur
       const { data: tanim, error } = await supabaseAdmin
         .from('aidat_tanimlari')
         .insert([kalem])
         .select()
         .single()

       if (error) throw error
       olusturulanTanim++

       if (uyeler && uyeler.length > 0) {
          const sonOdemeTarihi = makeAidatSonOdemeTarihi(yil, kalem.ay, kalem.son_odeme_gunu || 15)
          const aidatlar = uyeler.map(uye => ({
            uye_id: uye.id,
            aidat_tanimi_id: tanim.id,
            tutar: Number(kalem.katsayi_tutari) * (Number(uye.hisse_orani) || 1.00),
            son_odeme_tarihi: sonOdemeTarihi
          }))

          const { error: aidatError } = await supabaseAdmin
            .from('aidatlar')
            .insert(aidatlar)

          if (aidatError) throw aidatError
          olusturulanAidat += uyeler.length
       }
    }

    return { yillik_tanim: olusturulanTanim, olusturulan_aidat_sayisi: olusturulanAidat }
  },

  async update(id: string, body: Record<string, any>) {
    const { data, error } = await supabaseAdmin
      .from('aidat_tanimlari')
      .update(body)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    if (!data) throw ApiError.notFound('Aidat tanımı bulunamadı')
    return data
  }
}

export const aidatService = {
  async list(query: Record<string, any>) {
    const pagination = parsePagination(query)
    const { from, to } = toSupabaseRange(pagination)

    let q = supabaseAdmin
      .from('aidatlar')
      .select('*, uyeler(uye_no, ad, soyad), aidat_tanimlari(yil, ay)', { count: 'exact' })

    if (query.uye_id) q = q.eq('uye_id', query.uye_id)
    if (query.durum) q = q.eq('durum', query.durum)

    // Yıl/ay filtresi aidat_tanimlari üzerinden
    if (query.yil || query.ay) {
      // İlk aidat_tanimlari'ndan filtreli ID'leri çek
      let tanimQuery = supabaseAdmin.from('aidat_tanimlari').select('id')
      if (query.yil) tanimQuery = tanimQuery.eq('yil', parseInt(query.yil))
      if (query.ay) tanimQuery = tanimQuery.eq('ay', parseInt(query.ay))
      const { data: tanimlar } = await tanimQuery
      if (tanimlar && tanimlar.length > 0) {
        q = q.in('aidat_tanimi_id', tanimlar.map(t => t.id))
      } else {
        return { data: [], pagination: paginationMeta(pagination, 0) }
      }
    }

    const { data, error, count } = await q
      .order('created_at', { ascending: false })
      .range(from, to)

    if (error) throw error
    return { data, pagination: paginationMeta(pagination, count || 0) }
  },

  async getById(id: string) {
    const { data, error } = await supabaseAdmin
      .from('aidatlar')
      .select('*, uyeler(uye_no, ad, soyad), aidat_tanimlari(yil, ay, katsayi_tutari), aidat_odemeleri(*)')
      .eq('id', id)
      .single()

    if (error) throw ApiError.notFound('Aidat bulunamadı')
    return data
  },

  async recordPayment(aidatId: string, body: Record<string, any>) {
    // Mevcut aidatı kontrol et
    const { data: aidat, error: getError } = await supabaseAdmin
      .from('aidatlar')
      .select('*, aidat_tanimlari(katsayi_tutari)')
      .eq('id', aidatId)
      .single()

    if (getError || !aidat) throw ApiError.notFound('Aidat bulunamadı')
    if (aidat.durum === 'odendi') throw ApiError.badRequest('Bu aidat zaten ödenmiş')
    if (aidat.durum === 'iptal') throw ApiError.badRequest('İptal edilmiş aidat için ödeme yapılamaz')

    // Ödeme kaydı oluştur
    const { error: odemeError } = await supabaseAdmin
      .from('aidat_odemeleri')
      .insert([{ aidat_id: aidatId, ...body }])

    if (odemeError) throw odemeError

    // Ödenen tutarı güncelle
    const yeniOdenenTutar = (aidat.odenen_tutar || 0) + body.tutar
    const toplamBorce = aidat.tutar + (aidat.gecikme_faizi || 0)
    const yeniDurum = yeniOdenenTutar >= toplamBorce ? 'odendi' : aidat.durum

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('aidatlar')
      .update({ odenen_tutar: yeniOdenenTutar, durum: yeniDurum })
      .eq('id', aidatId)
      .select()
      .single()

    if (updateError) throw updateError
    return updated
  },

  async getSummary() {
    const { data, error } = await supabaseAdmin.rpc('hesapla_gecikme_faizi')
    if (error) console.error('Gecikme faizi hesaplama hatası:', error)

    const { data: summary, error: sumError } = await supabaseAdmin
      .from('aidatlar')
      .select('durum, tutar, gecikme_faizi, odenen_tutar')

    if (sumError) throw sumError

    const result = {
      toplam_aidat: 0,
      toplam_tahsilat: 0,
      bekleyen: 0,
      geciken: 0,
      toplam_gecikme_faizi: 0
    }

    summary?.forEach(a => {
      result.toplam_aidat += Number(a.tutar) + Number(a.gecikme_faizi || 0)
      result.toplam_tahsilat += Number(a.odenen_tutar || 0)
      result.toplam_gecikme_faizi += Number(a.gecikme_faizi || 0)
      if (a.durum === 'bekliyor') result.bekleyen += Number(a.tutar)
      if (a.durum === 'gecikti') result.geciken += Number(a.tutar) + Number(a.gecikme_faizi || 0)
    })

    return result
  },

  async calculateLateFees() {
    const { error } = await supabaseAdmin.rpc('hesapla_gecikme_faizi')
    if (error) throw error
    return { message: 'Gecikme faizleri hesaplandı' }
  }
}
