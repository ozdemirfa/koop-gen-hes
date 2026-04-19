import { supabaseAdmin } from '../config/supabase'
import { ApiError } from '../utils/ApiError'
import { parsePagination, toSupabaseRange, paginationMeta } from '../utils/pagination'
import { makeAidatSonOdemeTarihi } from '../utils/formatters'
import logger from '../utils/logger'

export interface AidatTanimi {
  id: string
  proje_id: string
  yil: number
  ay: number
  katsayi_tutari: number
  gecikme_faiz_orani: number
  son_odeme_gunu: number
  tur: 'normal' | 'ek'
  aciklama?: string
}

export interface AidatSummary {
  toplam_aidat: number
  toplam_tahsilat: number
  bekleyen: number
  geciken: number
  toplam_gecikme_faizi: number
}

export const aidatTanimiService = {
  async list(query?: Record<string, any>) {
    let q = supabaseAdmin
      .from('aidat_tanimlari')
      .select('*')
      .order('yil', { ascending: true })
      .order('ay', { ascending: true })

    if (query?.proje_id) {
      q = q.eq('proje_id', query.proje_id)
    }
    
    if (query?.yil) {
      q = q.eq('yil', parseInt(query.yil))
    }
    
    if (query?.ay) {
      q = q.eq('ay', parseInt(query.ay))
    }
    
    if (query?.tur) {
      q = q.eq('tur', query.tur)
    }

    const { data, error } = await q

    if (error) {
      logger.error('Aidat tanımları listeleme hatası:', error)
      throw error
    }
    return data
  },

  async create(body: Partial<AidatTanimi> & { proje_id: string }) {
    if (!body.proje_id) {
      throw ApiError.badRequest('proje_id zorunludur')
    }

    const sonOdemeGunu = body.son_odeme_gunu || 15

    const { data: tanim, error } = await supabaseAdmin
      .from('aidat_tanimlari')
      .insert([body])
      .select()
      .single()

    if (error) {
      logger.error('Aidat tanımı oluşturma hatası:', error)
      throw error
    }

    // Projeye ait tüm daireleri (serefiye) çek
    const { data: daireler, error: sError } = await supabaseAdmin
      .from('serefiye_tablosu')
      .select('id, serefiye_orani')
      .eq('proje_id', body.proje_id)

    if (sError) {
      logger.error('Daireleri çekme hatası:', sError)
      throw sError
    }

    if (daireler && daireler.length > 0) {
      const sonOdemeTarihi = makeAidatSonOdemeTarihi(body.yil!, body.ay!, sonOdemeGunu)

      // Tüm daireler için aidat oluştur (üye olsun olmasın)
      const aidatlar = await Promise.all(daireler.map(async (daire) => {
        // Dairede oturan aktif üyeyi bul (varsa)
        const { data: uye } = await supabaseAdmin
          .from('uyeler')
          .select('id')
          .eq('serefiye_id', daire.id)
          .eq('durum', 'aktif')
          .maybeSingle()

        return {
          proje_id: body.proje_id,
          serefiye_id: daire.id,
          uye_id: uye?.id || null,
          aidat_tanimi_id: tanim.id,
          son_odeme_tarihi: sonOdemeTarihi
        }
      }))

      const { error: aidatError } = await supabaseAdmin
        .from('aidatlar')
        .insert(aidatlar)

      if (aidatError) {
        logger.error('Toplu aidat oluşturma hatası:', aidatError)
        throw aidatError
      }
    }

    logger.info(`Yeni aidat tanımı ve ${daireler?.length || 0} daire için aidat oluşturuldu: ${body.ay}/${body.yil} (Proje: ${body.proje_id})`)
    return { ...tanim, olusturulan_aidat_sayisi: daireler?.length || 0 }
  },

  async createYillikPlan(body: { proje_id: string, yil: number, kalemler: Partial<AidatTanimi>[] }) {
    const { proje_id, yil, kalemler } = body
    
    try {
      // Use RPC for atomic database transaction
      const { data, error } = await supabaseAdmin.rpc('create_yillik_aidat_plani', {
        p_proje_id: proje_id,
        p_yil: yil,
        p_kalemler: kalemler
      })

      if (error) {
        logger.error(`Yıllık aidat planı oluşturma hatası (RPC): ${error.message}`, error)
        
        // Handle specific business logic error from Postgres
        if (error.message.includes('plan güncellenemez')) {
          throw ApiError.badRequest(error.message)
        }
        
        throw error
      }

      logger.info(`Yıllık aidat planı başarıyla oluşturuldu: Yıl ${yil}, Proje ${proje_id}, ${data.yillik_tanim} ay, ${data.olusturulan_aidat_sayisi} aidat kaydı.`)
      return data
    } catch (error) {
      if (error instanceof ApiError) throw error
      
      logger.error(`Yıllık aidat planı oluşturulurken beklenmedik hata (Yıl: ${yil}, Proje: ${proje_id}):`, error)
      throw new ApiError(500, 'Yıllık aidat planı oluşturulamadı. Lütfen sistem yöneticisine danışın.')
    }
  },

  async update(id: string, body: Partial<AidatTanimi>) {
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
      .from('aidat_detaylari')
      .select('*, uyeler(uye_no, ad, soyad)', { count: 'exact' })

    if (query.proje_id) q = q.eq('proje_id', query.proje_id)
    if (query.uye_id) q = q.eq('uye_id', query.uye_id)
    if (query.durum) q = q.eq('durum', query.durum)
    if (query.blok_id) q = q.eq('blok_id', query.blok_id)
    
    // Daire no araması
    if (query.daire_no) {
      q = q.ilike('daire_no', `%${query.daire_no}%`)
    }

    if (query.yil) q = q.eq('yil', parseInt(query.yil))
    if (query.ay) q = q.eq('ay', parseInt(query.ay))

    const { data, error, count } = await q
      .order('created_at', { ascending: true })
      .range(from, to)

    if (error) {
      logger.error('Aidat listeleme hatası:', error)
      throw error
    }

    // View verilerini frontend'in beklediği yapıya eşle
    const mappedData = data?.map(d => ({
      ...d,
      tutar: d.hesaplanan_tutar,
      odenen_tutar: d.dinamik_odenen_tutar,
      toplam_tutar: d.toplam_borc,
      aidat_tanimlari: { yil: d.yil, ay: d.ay, tur: d.aidat_turu },
      serefiye_tablosu: { daire_no: d.daire_no, bloklar: { blok_adi: d.blok_adi } }
    }))

    return { data: mappedData, pagination: paginationMeta(pagination, count || 0) }
  },

  async getById(id: string) {
    const { data, error } = await supabaseAdmin
      .from('aidat_detaylari')
      .select('*, uyeler(uye_no, ad, soyad), aidat_odemeleri(*)')
      .eq('id', id)
      .single()

    if (error) {
      logger.error(`Aidat detayı çekme hatası (ID: ${id}):`, error)
      throw ApiError.notFound('Aidat bulunamadı')
    }

    // Eşleme
    return {
      ...data,
      tutar: data.hesaplanan_tutar,
      odenen_tutar: data.dinamik_odenen_tutar,
      toplam_tutar: data.toplam_borc,
      aidat_tanimlari: { yil: data.yil, ay: data.ay, tur: data.aidat_turu, katsayi_tutari: data.baz_tutar },
      serefiye_tablosu: { daire_no: data.daire_no, bloklar: { blok_adi: data.blok_adi }, serefiye_orani: data.serefiye_orani }
    }
  },

  async recordPayment(aidatId: string, body: Record<string, any>) {
    // Önce aidatın varlığını ve durumunu kontrol et
    const { data: aidat, error: getError } = await supabaseAdmin
      .from('aidat_detaylari')
      .select('*')
      .eq('id', aidatId)
      .single()

    if (getError || !aidat) throw ApiError.notFound('Aidat bulunamadı')
    if (aidat.durum === 'odendi') throw ApiError.badRequest('Bu aidat zaten ödenmiş')
    if (aidat.durum === 'iptal') throw ApiError.badRequest('İptal edilmiş aidat için ödeme yapılamaz')

    // Cari hareketi oluştur (Ödeme kaydı artık burada)
    const { data: hareket, error: moveError } = await supabaseAdmin
      .from('cari_hareketler')
      .insert([{
        proje_id: aidat.proje_id,
        firma_id: null, // Şahıs ödemesi
        uye_id: aidat.uye_id,
        hareket_tipi: 'alacak', // Kooperatif alacak tahsil ediyor
        tutar: body.tutar,
        tarih: body.odeme_tarihi,
        kaynak_tipi: 'aidat',
        kaynak_id: aidat.id,
        aciklama: body.aciklama || `${aidat.ay}/${aidat.yil} Aidat Tahsilatı`,
        belge_no: body.makbuz_no
      }])
      .select()
      .single()

    if (moveError) {
      logger.error('Cari hareket kaydı hatası:', moveError)
      throw moveError
    }

    // Toplam ödenen tutarı view üzerinden veya cari_hareketlerden tekrar hesaplayıp durumu güncelle
    const { data: totalPaid } = await supabaseAdmin
        .from('cari_hareketler')
        .select('tutar')
        .eq('kaynak_tipi', 'aidat')
        .eq('kaynak_id', aidatId)
    
    const currentTotalPaid = (totalPaid || []).reduce((sum, h) => sum + Number(h.tutar), 0)
    const toplamBorc = Number(aidat.hesaplanan_tutar) + Number(aidat.gecikme_faizi || 0)
    const yeniDurum = currentTotalPaid >= toplamBorc ? 'odendi' : aidat.durum

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('aidatlar')
      .update({ durum: yeniDurum })
      .eq('id', aidatId)
      .select()
      .single()

    if (updateError) throw updateError

    await createGelirKaydi({
      tutar: body.tutar,
      tarih: body.odeme_tarihi,
      proje_id: aidat.proje_id,
      uye_id: aidat.uye_id,
      kaynak_tipi: 'aidat',
      kaynak_id: hareket.id,
      aciklama: body.aciklama || `${aidat.ay}/${aidat.yil} Aidat Tahsilatı`
    })

    logger.info(`Aidat ödemesi alındı ve cari harekete işlendi: ${aidatId}, Tutar: ${body.tutar}`)
    return updated
  },

  async getSummary(query: Record<string, any>): Promise<AidatSummary> {
    const { proje_id, yil, ay, durum, blok_id } = query
    
    // Önce gecikme faizlerini güncelle (proje bazlı)
    const { error: rpcError } = await supabaseAdmin.rpc('hesapla_gecikme_faizi', { p_proje_id: proje_id })
    if (rpcError) logger.error('Gecikme faizi hesaplama hatası (RPC):', rpcError)

    // PostgreSQL üzerinden filtreli aggregation yap
    const { data, error } = await supabaseAdmin.rpc('get_aidat_summary_v2', { 
      p_proje_id: proje_id,
      p_yil: yil ? parseInt(yil) : null,
      p_ay: ay ? parseInt(ay) : null,
      p_durum: durum || null,
      p_blok_id: blok_id || null
    })

    if (error) {
      logger.error('Aidat özet çekme hatası (RPC V2):', error)
      throw error
    }

    return data as AidatSummary
  },

  async calculateLateFees(query: Record<string, any>) {
    const { proje_id } = query
    const { error } = await supabaseAdmin.rpc('hesapla_gecikme_faizi', { p_proje_id: proje_id })
    if (error) {
      logger.error('Gecikme faizi manuel tetikleme hatası:', error)
      throw error
    }
    return { message: 'Gecikme faizleri hesaplandı' }
  },

  async recordBulkPayment(uyeId: string, body: { proje_id?: string, tutar: number, odeme_tarihi: string, odeme_yontemi: string, makbuz_no?: string, aciklama?: string }) {
    const { tutar, proje_id, ...odemeMeta } = body
    let kalanTutar = tutar

    let finalProjeId = proje_id
    if (!finalProjeId) {
      const { data: uye } = await supabaseAdmin.from('uyeler').select('proje_id').eq('id', uyeId).single()
      finalProjeId = uye?.proje_id
    }

    if (!finalProjeId) {
      throw ApiError.badRequest('proje_id belirlenemedi')
    }

    const { data: acikAidatlar, error: getError } = await supabaseAdmin
      .from('aidatlar')
      .select('*, aidat_tanimlari(yil, ay)')
      .eq('proje_id', finalProjeId)
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

      await createGelirKaydi({
        tutar: odenecekTutar,
        tarih: odemeMeta.odeme_tarihi,
        proje_id: finalProjeId,
        uye_id: uyeId,
        kaynak_tipi: 'aidat',
        kaynak_id: odeme.id,
        aciklama: `${aidat.aidat_tanimlari.ay}/${aidat.aidat_tanimlari.yil} Aidat Tahsilatı`
      })

      const yeniOdenenTutar = Number(aidat.odenen_tutar || 0) + odenecekTutar
      const yeniDurum = yeniOdenenTutar >= aidatToplamBorc ? 'odendi' : aidat.durum

      await supabaseAdmin
        .from('aidatlar')
        .update({ odenen_tutar: yeniOdenenTutar, durum: yeniDurum })
        .eq('id', aidat.id)

      kalanTutar = Math.round((kalanTutar - odenecekTutar) * 100) / 100
      sonuclar.push({ aidat_id: aidat.id, donem: `${aidat.aidat_tanimlari.ay}/${aidat.aidat_tanimlari.yil}`, odenen: odenecekTutar })
    }

    logger.info(`Toplu aidat ödemesi yapıldı: Üye ${uyeId}, Toplam: ${tutar}, Proje: ${finalProjeId}`)
    return { 
      toplam_odenen: tutar - kalanTutar, 
      kalan_avans: kalanTutar,
      kapatilan_kalemler: sonuclar 
    }
  }
}

async function createGelirKaydi(params: { tutar: number, tarih: string, proje_id: string, uye_id: string, kaynak_tipi: string, kaynak_id: string, aciklama: string }) {
  try {
    const { data: kategori } = await supabaseAdmin
      .from('gelir_gider_kategorileri')
      .select('id')
      .eq('proje_id', params.proje_id)
      .eq('ad', 'Aidat Gelirleri')
      .eq('tip', 'gelir')
      .single()

    const kategori_id = kategori?.id

    await supabaseAdmin
      .from('gelir_giderler')
      .insert([{
        tip: 'gelir',
        proje_id: params.proje_id,
        kategori_id,
        tutar: params.tutar,
        tarih: params.tarih,
        uye_id: params.uye_id,
        kaynak_tipi: params.kaynak_tipi,
        kaynak_id: params.kaynak_id,
        aciklama: params.aciklama
      }])
  } catch (err) {
    logger.error('Otomatik gelir kaydı oluşturulamadı:', err)
  }
}
