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
      .select('id, serefiye_orani')
      .eq('durum', 'aktif')

    if (uyeError) throw uyeError

    if (uyeler && uyeler.length > 0) {
      const sonOdemeTarihi = makeAidatSonOdemeTarihi(body.yil, body.ay, sonOdemeGunu)

      const aidatlar = uyeler.map(uye => ({
        uye_id: uye.id,
        aidat_tanimi_id: tanim.id,
        tutar: Number(body.katsayi_tutari) * (Number(uye.serefiye_orani) || 1.00),
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
      .select('id, serefiye_orani')
      .eq('durum', 'aktif')

    if (uyeError) throw uyeError

    // Silmeden önce ödenmiş aidat var mı kontrol et — cascade delete veri kaybına yol açmasın
    const { data: mevcutTanimlar, error: tanimError } = await supabaseAdmin
      .from('aidat_tanimlari')
      .select('id')
      .eq('yil', yil)
      .eq('tur', 'normal')

    if (tanimError) throw tanimError

    if (mevcutTanimlar && mevcutTanimlar.length > 0) {
      const tanimIds = mevcutTanimlar.map(t => t.id)
      const { count: odenmisCount, error: odenmisError } = await supabaseAdmin
        .from('aidatlar')
        .select('id', { count: 'exact', head: true })
        .in('aidat_tanimi_id', tanimIds)
        .or('durum.eq.odendi,odenen_tutar.gt.0')

      if (odenmisError) throw odenmisError
      if ((odenmisCount || 0) > 0) {
        throw ApiError.badRequest('Bu yıla ait ödeme yapılmış aidatlar bulunduğu için plan güncellenemez. Lütfen manuel düzenleme yapın.')
      }
    }

    const { error: deleteError } = await supabaseAdmin
      .from('aidat_tanimlari')
      .delete()
      .eq('yil', yil)
      .eq('tur', 'normal')

    if (deleteError) throw deleteError

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
            tutar: Number(kalem.katsayi_tutari) * (Number(uye.serefiye_orani) || 1.00),
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
    const { data: odeme, error: odemeError } = await supabaseAdmin
      .from('aidat_odemeleri')
      .insert([{ aidat_id: aidatId, ...body }])
      .select()
      .single()

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

    // Otomatik gelir kaydı oluştur
    await createGelirKaydi({
      tutar: body.tutar,
      tarih: body.odeme_tarihi,
      uye_id: aidat.uye_id,
      kaynak_tipi: 'aidat',
      kaynak_id: odeme.id,
      aciklama: `${aidat.aidat_tanimlari.ay}/${aidat.aidat_tanimlari.yil} Aidat Tahsilatı`
    })

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
  },

  async recordBulkPayment(uyeId: string, body: { tutar: number, odeme_tarihi: string, odeme_yontemi: string, makbuz_no?: string, aciklama?: string }) {
    const { tutar, ...odemeMeta } = body
    let kalanTutar = tutar

    // Üyenin açık aidatlarını vade tarihine göre getir
    const { data: acikAidatlar, error: getError } = await supabaseAdmin
      .from('aidatlar')
      .select('*, aidat_tanimlari(yil, ay)')
      .eq('uye_id', uyeId)
      .in('durum', ['bekliyor', 'gecikti'])
      .order('son_odeme_tarihi', { ascending: true })

    if (getError) throw getError
    if (!acikAidatlar || acikAidatlar.length === 0) throw ApiError.badRequest('Üyenin açık aidat borcu bulunmamaktadır')

    const sonuclar = []

    for (const aidat of acikAidatlar) {
      if (kalanTutar <= 0) break

      const aidatToplamBorc = Number(aidat.tutar) + Number(aidat.gecikme_faizi || 0)
      const aidatKalanBorc = aidatToplamBorc - Number(aidat.odenen_tutar || 0)
      
      const odenecekTutar = Math.min(kalanTutar, aidatKalanBorc)
      
      // Ödeme kaydı oluştur
      const { data: odeme, error: odemeError } = await supabaseAdmin
        .from('aidat_odemeleri')
        .insert([{ 
          aidat_id: aidat.id, 
          tutar: odenecekTutar,
          ...odemeMeta
        }])
        .select()
        .single()

      if (odemeError) throw odemeError

      // Otomatik gelir kaydı oluştur
      await createGelirKaydi({
        tutar: odenecekTutar,
        tarih: odemeMeta.odeme_tarihi,
        uye_id: uyeId,
        kaynak_tipi: 'aidat',
        kaynak_id: odeme.id,
        aciklama: `${aidat.aidat_tanimlari.ay}/${aidat.aidat_tanimlari.yil} Aidat Tahsilatı`
      })

      // Aidat durumunu güncelle
      const yeniOdenenTutar = Number(aidat.odenen_tutar || 0) + odenecekTutar
      const yeniDurum = yeniOdenenTutar >= aidatToplamBorc ? 'odendi' : aidat.durum

      await supabaseAdmin
        .from('aidatlar')
        .update({ odenen_tutar: yeniOdenenTutar, durum: yeniDurum })
        .eq('id', aidat.id)

      kalanTutar = Math.round((kalanTutar - odenecekTutar) * 100) / 100
      sonuclar.push({ aidat_id: aidat.id, donem: `${aidat.aidat_tanimlari.ay}/${aidat.aidat_tanimlari.yil}`, odenen: odenecekTutar })
    }

    return { 
      toplam_odenen: tutar - kalanTutar, 
      kalan_avans: kalanTutar, // Eğer tüm aidatlar kapandıysa ve para arttıysa
      kapatilan_kalemler: sonuclar 
    }
  }
}

/**
 * Aidat ödemesi yapıldığında otomatik gelir kaydı oluşturur
 */
async function createGelirKaydi(params: { tutar: number, tarih: string, uye_id: string, kaynak_tipi: string, kaynak_id: string, aciklama: string }) {
  try {
    // Önce "Aidat Gelirleri" kategorisini bul
    const { data: kategori } = await supabaseAdmin
      .from('gelir_gider_kategorileri')
      .select('id')
      .eq('ad', 'Aidat Gelirleri')
      .eq('tip', 'gelir')
      .single()

    const kategori_id = kategori?.id

    await supabaseAdmin
      .from('gelir_giderler')
      .insert([{
        tip: 'gelir',
        kategori_id,
        tutar: params.tutar,
        tarih: params.tarih,
        uye_id: params.uye_id,
        kaynak_tipi: params.kaynak_tipi,
        kaynak_id: params.kaynak_id,
        aciklama: params.aciklama
      }])
  } catch (err) {
    console.error('Otomatik gelir kaydı oluşturulamadı:', err)
    // Kritik bir hata değil, ana işlemi bozmasın
  }
}
