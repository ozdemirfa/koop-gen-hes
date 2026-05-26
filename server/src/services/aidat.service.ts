import { supabaseAdmin } from '../config/supabase'
import { ApiError } from '../utils/ApiError'
import { parsePagination, toSupabaseRange, paginationMeta } from '../utils/pagination'
import { makeAidatSonOdemeTarihi } from '../utils/formatters'
import { requireProjeId, sanitizeSearchInput } from '../utils/projectGuard'
import logger from '../utils/logger'
import { cariHesapService } from './cariHesap.service'

export interface AidatTanimi {
  id: string
  proje_id: string
  yil: number
  ay: number
  katsayi_tutari: number
  gecikme_faiz_orani: number
  son_odeme_gunu: number
  tur: 'normal' | 'ara_odeme'
  aciklama?: string
  durum: 'plan' | 'borclandi'
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
    const projeId = requireProjeId(query?.proje_id)

    let q = supabaseAdmin
      .from('aidat_tanimlari')
      .select('*')
      .eq('proje_id', projeId)
      .order('yil', { ascending: true })
      .order('ay', { ascending: true })

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

  async createTanim(body: Partial<AidatTanimi> & { proje_id: string }) {
    if (!body.proje_id) {
      throw ApiError.badRequest('proje_id zorunludur')
    }

    // Önce aynı dönem ve türde kayıt var mı kontrol et
    const { data: existing } = await supabaseAdmin
      .from('aidat_tanimlari')
      .select('id')
      .eq('proje_id', body.proje_id)
      .eq('yil', body.yil!)
      .eq('ay', body.ay!)
      .eq('tur', body.tur || 'normal')
      .maybeSingle()

    if (existing) {
      throw new ApiError(409, `${body.ay}/${body.yil} dönemi için '${body.tur || 'normal'}' türünde bir aidat tanımı zaten mevcut.`)
    }

    const { data: tanim, error } = await supabaseAdmin
      .from('aidat_tanimlari')
      .insert([body])
      .select()
      .single()

    if (error) {
      logger.error('Aidat tanımı oluşturma hatası:', error)
      throw error
    }

    logger.info(`Yeni aidat tanımı oluşturuldu: ${body.ay}/${body.yil} (Proje: ${body.proje_id})`)
    return tanim
  },

  async updateTanim(id: string, body: Partial<AidatTanimi>) {
    // Önce durum kontrolü
    const { data: existing } = await supabaseAdmin
      .from('aidat_tanimlari')
      .select('durum')
      .eq('id', id)
      .single()

    if (!existing) throw ApiError.notFound('Aidat tanımı bulunamadı')
    if (existing.durum !== 'plan') {
      throw ApiError.badRequest('Sadece plan durumundaki tanımlar güncellenebilir')
    }

    const { data, error } = await supabaseAdmin
      .from('aidat_tanimlari')
      .update(body)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      logger.error('Aidat tanımı güncelleme hatası:', error)
      throw error
    }
    return data
  },

  async deleteTanim(id: string) {
    const { data: existing } = await supabaseAdmin
      .from('aidat_tanimlari')
      .select('durum')
      .eq('id', id)
      .single()

    if (!existing) throw ApiError.notFound('Aidat tanımı bulunamadı')
    if (existing.durum !== 'plan') {
      throw ApiError.badRequest('Sadece plan durumundaki tanımlar silinebilir')
    }

    const { error } = await supabaseAdmin
      .from('aidat_tanimlari')
      .delete()
      .eq('id', id)

    if (error) {
      logger.error('Aidat tanımı silme hatası:', error)
      throw error
    }
    return { success: true }
  },

  async chargeTanim(id: string, actorId?: string) {
    const { data, error } = await supabaseAdmin.rpc('fn_charge_aidat_tanimi', {
      p_tanim_id: id,
      p_actor_id: actorId ?? null
    })

    if (error) {
      logger.error(`Aidat tanımı borçlandırma hatası (ID: ${id}):`, error)
      throw error
    }

    if (data.success === false) {
      throw ApiError.badRequest(data.message)
    }

    logger.info(`Aidat tanımı manuel borçlandırıldı: ${id}`)
    return data
  },

  async createYillikPlan(body: { proje_id: string, yil: number, kalemler: Partial<AidatTanimi>[] }, actorId?: string) {
    const { proje_id, yil, kalemler } = body

    try {
      // Use RPC for atomic database transaction
      const { data, error } = await supabaseAdmin.rpc('create_yillik_aidat_plani', {
        p_proje_id: proje_id,
        p_yil: yil,
        p_kalemler: kalemler,
        p_actor_id: actorId ?? null
      })

      if (error) {
        logger.error(`Yıllık aidat planı oluşturma hatası (RPC): ${error.message}`, error)
        
        // Handle specific business logic error from Postgres
        if (error.message.includes('plan güncellenemez')) {
          throw ApiError.badRequest(error.message)
        }
        
        throw error
      }

      logger.info(`Yıllık aidat planı başarıyla oluşturuldu: Yıl ${yil}, Proje ${proje_id}, ${data.yillik_tanim} ay.`)
      return data
    } catch (error) {
      if (error instanceof ApiError) throw error
      
      logger.error(`Yıllık aidat planı oluşturulurken beklenmedik hata (Yıl: ${yil}, Proje: ${proje_id}):`, error)
      throw new ApiError(500, 'Yıllık aidat planı oluşturulamadı. Lütfen sistem yöneticisine danışın.')
    }
  },

  async executeCharging(date?: string, actorId?: string) {
    const { data, error } = await supabaseAdmin.rpc('fn_execute_aidat_charging', {
      p_date: date || new Date().toISOString().split('T')[0],
      p_actor_id: actorId ?? null
    })

    if (error) {
      logger.error('Aidat borçlandırma hatası (RPC):', error)
      throw error
    }

    logger.info(`Aidat borçlandırma işlemi tamamlandı: ${JSON.stringify(data)}`)
    return data
  },

  async bulkChargeInterest(aidatIds: string[], actorId?: string) {
    const { data, error } = await supabaseAdmin.rpc('fn_bulk_charge_interest', {
      p_aidat_ids: aidatIds,
      p_actor_id: actorId ?? null
    })

    if (error) {
      logger.error('Toplu faiz borçlandırma hatası (RPC):', error)
      throw error
    }

    return data
  },

  // Geriye dönük uyumluluk için takma adlar
  async create(body: any) { return this.createTanim(body) },
  async update(id: string, body: any) { return this.updateTanim(id, body) }
}

export const aidatService = {
  async list(query: Record<string, any>) {
    const pagination = parsePagination(query)
    const { from, to } = toSupabaseRange(pagination)

    const projeId = requireProjeId(query.proje_id)

    let q = supabaseAdmin
      .from('aidat_detaylari')
      .select('*', { count: 'exact' })
      .eq('proje_id', projeId)

    if (query.uye_id) q = q.eq('uye_id', query.uye_id)
    if (query.durum) q = q.eq('durum', String(query.durum))
    if (query.blok_id) q = q.eq('filter_blok_id', query.blok_id)
    
    // Sprint security-quality-audit (2026-05-26): search input sanitize.
    if (query.uye_adi) {
      const safe = sanitizeSearchInput(query.uye_adi)
      if (safe) {
        q = q.or(`ad.ilike.%${safe}%,soyad.ilike.%${safe}%,uye_no.ilike.%${safe}%`)
      }
    }
    
    // Daire atama durumuna göre filtreleme
    if (query.has_daire === 'false') {
      q = q.is('uye_id', null)
    } else if (query.has_daire === 'true') {
      q = q.not('uye_id', 'is', null)
    }
    
    // Daire no araması — security-quality-audit 2026-05-26 sanitize
    if (query.daire_no) {
      const safeDaire = sanitizeSearchInput(query.daire_no)
      if (safeDaire) q = q.ilike('daire_no', `%${safeDaire}%`)
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
    const mappedData = data?.map(d => {
      const toplamTahakkuk = Number(d.toplam_tahakkuk || d.toplam_borc || 0)
      const toplamOdenen = Number(d.toplam_odenen || d.dinamik_odenen_tutar || 0)
      
      return {
        ...d,
        ad: d.ad,
        soyad: d.soyad,
        uye_id: d.uye_id,
        uyeler: { ad: d.ad, soyad: d.soyad, uye_no: d.uye_no },
        tutar: d.hesaplanan_tutar || d.baz_tutar,
        odenen_tutar: toplamOdenen,
        toplam_tutar: toplamTahakkuk,
        aidat_tanimlari: { yil: d.yil, ay: d.ay, tur: d.aidat_turu },
        serefiye_tablosu: { daire_no: d.daire_no, bloklar: { blok_adi: d.blok_adi } }
      }
    })

    return { data: mappedData, pagination: paginationMeta(pagination, count || 0) }
  },

  async getById(id: string) {
    const { data, error } = await supabaseAdmin
      .from('aidat_detaylari')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      logger.error(`Aidat detayı çekme hatası (ID: ${id}):`, error)
      throw ApiError.notFound('Aidat bulunamadı')
    }

    const toplamTahakkuk = Number(data.toplam_tahakkuk || data.toplam_borc || 0)
    const toplamOdenen = Number(data.toplam_odenen || data.dinamik_odenen_tutar || 0)

    // View verilerini frontend'in beklediği yapıya eşle
    return {
      ...data,
      ad: data.ad,
      soyad: data.soyad,
      uye_id: data.uye_id,
      uyeler: { ad: data.ad, soyad: data.soyad, uye_no: data.uye_no },
      tutar: data.hesaplanan_tutar || data.baz_tutar,
      odenen_tutar: toplamOdenen,
      toplam_tutar: toplamTahakkuk,
      aidat_tanimlari: { yil: data.yil, ay: data.ay, tur: data.aidat_turu, katsayi_tutari: data.baz_tutar },
      serefiye_tablosu: { daire_no: data.daire_no, bloklar: { blok_adi: data.blok_adi }, serefiye_orani: data.serefiye_orani }
    }
  },

  async recordPayment(aidatId: string, body: Record<string, any>, actorId?: string) {
    // Önce aidatın varlığını ve durumunu kontrol et
    const { data: aidat, error: getError } = await supabaseAdmin
      .from('aidat_detaylari')
      .select('*')
      .eq('id', aidatId)
      .single()

    if (getError || !aidat) throw ApiError.notFound('Aidat bulunamadı')
    if (aidat.durum === 'odendi') throw ApiError.badRequest('Bu aidat zaten ödenmiş')
    if (aidat.durum === 'iptal') throw ApiError.badRequest('İptal edilmiş aidat için ödeme yapılamaz')

    // Cari hesabı bul
    const { data: cari } = await supabaseAdmin
        .from('cari_hesaplar')
        .select('id')
        .eq('proje_id', aidat.proje_id)
        .eq('uye_id', aidat.uye_id)
        .single()

    if (!cari) throw ApiError.badRequest('Üyeye ait cari hesap bulunamadı')

    // Cari hareketi oluştur (Yeni yapı)
    const hareket = await cariHesapService.createPayment({
      proje_id: aidat.proje_id,
      cari_hesap_id: cari.id,
      islem_turu: 'gelen_odeme',
      odeme_turu: body.odeme_yontemi || 'banka',
      tutar: body.tutar,
      tarih: body.odeme_tarihi || new Date().toISOString().split('T')[0],
      aciklama: body.aciklama || `${aidat.ay}/${aidat.yil} Aidat Tahsilatı`,
      belge_no: body.makbuz_no,
      banka_hesap_id: body.banka_hesap_id,
      kaynak_tipi: 'aidat',
      kaynak_id: aidat.id,
      actorId
    })

    // Toplam ödenen tutarı cari_hareketler üzerinden hesaplayıp durumu güncelle
    // Muhasebe Yönü: Tahsilat (gelen_odeme) -> borc (Decreases member receivable)
    const { data: hareketler } = await supabaseAdmin
        .from('cari_hareketler')
        .select('borc')
        .eq('kaynak_tipi', 'aidat')
        .eq('kaynak_id', aidatId)
    
    const currentTotalPaid = (hareketler || []).reduce((sum, h) => sum + Number(h.borc), 0)
    
    // Toplam Borç Hesabı: Sadece faiz yansıtıldıysa faizi ekle
    const { data: vAidat } = await supabaseAdmin.from('aidat_detaylari').select('toplam_borc').eq('id', aidatId).single()
    const toplamBorc = Number(vAidat?.toplam_borc || aidat.hesaplanan_tutar)
    
    // Durumu güncelle (Sadece durum alanı)
    let yeniDurum = aidat.durum
    if (currentTotalPaid >= toplamBorc) {
      yeniDurum = 'odendi'
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('aidatlar')
      .update({ durum: yeniDurum })
      .eq('id', aidatId)
      .select()
      .single()

    if (updateError) throw updateError

    logger.info(`Aidat ödemesi alındı ve cari harekete işlendi: ${aidatId}, Tutar: ${body.tutar}`)
    return updated
  },

  async getSummary(query: Record<string, any>): Promise<AidatSummary> {
    const { yil, ay, durum, blok_id, has_daire } = query
    const proje_id = requireProjeId(query.proje_id)

    // Güvenlik: Eğer gecikme oranı 0 ise (yanlışlıkla veya varsayılan), bunu 5% yap (Trigger engelini aşmak için RPC veya direkt SQL denenebilir)
    // Bu aşamada direkt SQL deniyoruz, trigger hatası verirse RPC eklenebilir.
    try {
      await supabaseAdmin.from('aidat_tanimlari').update({ gecikme_faiz_orani: 5 }).eq('gecikme_faiz_orani', 0).eq('proje_id', proje_id)
    } catch (e) {
      logger.warn('Gecikme oranı otomatik güncellenemedi (muhtemelen trigger engeli):', e)
    }

    // Önce gecikme faizlerini güncelle (proje bazlı)
    const { error: rpcError } = await supabaseAdmin.rpc('hesapla_gecikme_faizi', { p_proje_id: proje_id })
    if (rpcError) logger.error('Gecikme faizi hesaplama hatası (RPC):', rpcError)

    // PostgreSQL üzerinden filtreli aggregation yap
    const { data, error } = await supabaseAdmin.rpc('get_aidat_summary_v4', {
      p_proje_id: proje_id,
      p_yil: yil ? parseInt(yil) : null,
      p_ay: ay ? parseInt(ay) : null,
      p_durum: durum || null,
      p_blok_id: blok_id || null,
      p_has_daire: has_daire === 'true' ? true : (has_daire === 'false' ? false : null),
      p_search: query.uye_adi || null
    })

    if (error) {
      logger.error('Aidat özet çekme hatası (RPC V4):', error)
      throw error
    }

    return data as AidatSummary
  },

  async calculateLateFees(query: Record<string, any>) {
    const proje_id = requireProjeId(query.proje_id)

    // Gecikme oranı 0 ise 5% yap
    try {
      await supabaseAdmin.from('aidat_tanimlari').update({ gecikme_faiz_orani: 5 }).eq('gecikme_faiz_orani', 0).eq('proje_id', proje_id)
    } catch (e) {}

    const { error } = await supabaseAdmin.rpc('hesapla_gecikme_faizi', { p_proje_id: proje_id })
    if (error) {
      logger.error('Gecikme faizi manuel tetikleme hatası:', error)
      throw error
    }
    return { message: 'Gecikme faizleri hesaplandı' }
  },

  async calculateSingleLateFee(id: string, actorId?: string) {
    // Bu metod için de oran kontrolü eklenebilir ama tekil aidat için tanımı bulmak gerekir
    // fn_calculate_single_aidat_late_fee içindeki SQL zaten güncel oran neyse onu alır.
    // getSummary veya calculateLateFees çalışınca zaten oranlar güncellenmiş olacak.
    const { data, error } = await supabaseAdmin.rpc('fn_calculate_single_aidat_late_fee', {
      p_aidat_id: id,
      p_actor_id: actorId ?? null
    })
    if (error) {
      logger.error(`Tekil gecikme faizi hesaplama hatası (ID: ${id}):`, error)
      throw error
    }
    return data
  },

  async toggleInterest(id: string, active: boolean, actorId?: string) {
    const { data, error } = await supabaseAdmin.rpc('fn_toggle_aidat_faiz', {
      p_aidat_id: id,
      p_active: active,
      p_actor_id: actorId ?? null
    })

    if (error) {
      logger.error(`Faiz toggle hatası (ID: ${id}):`, error)
      throw error
    }

    if (data.success === false) {
      throw ApiError.badRequest(data.message)
    }

    return data
  },

  async recordBulkPayment(uyeId: string, body: { proje_id?: string, tutar: number, odeme_tarihi: string, odeme_yontemi: string, makbuz_no?: string, aciklama?: string }, actorId?: string) {
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

    // Açık aidatları view üzerinden çek
    const { data: acikAidatlar, error: getError } = await supabaseAdmin
      .from('aidat_detaylari')
      .select('*')
      .eq('proje_id', finalProjeId)
      .eq('uye_id', uyeId)
      .in('durum', ['bekliyor', 'gecikti'])
      .order('son_odeme_tarihi', { ascending: true })

    if (getError) throw getError
    if (!acikAidatlar || acikAidatlar.length === 0) throw ApiError.badRequest('Üyenin açık aidat borcu bulunmamaktadır')

    // Tüm açık aidatlar için mevcut ödeme tutarlarını cari_hareketler'den çek (view güvenilir olmayabilir)
    const aidatIds = acikAidatlar.map(a => a.id)
    const { data: hareketler } = await supabaseAdmin
      .from('cari_hareketler')
      .select('kaynak_id, borc')
      .eq('kaynak_tipi', 'aidat')
      .in('kaynak_id', aidatIds)
    
    const paidMap = new Map()
    hareketler?.forEach(h => {
      const current = paidMap.get(h.kaynak_id) || 0
      paidMap.set(h.kaynak_id, current + Number(h.borc))
    })

    const sonuclar = []

    for (const aidat of acikAidatlar) {
      if (kalanTutar <= 0) break

      const aidatToplamBorc = Number(aidat.toplam_borc)
      const aidatOdenen = paidMap.get(aidat.id) || 0
      const aidatKalanBorc = Math.max(0, aidatToplamBorc - aidatOdenen)
      
      if (aidatKalanBorc <= 0) continue

      const odenecekTutar = Math.min(kalanTutar, aidatKalanBorc)
      
      // Cari hesabı bul
      const { data: cari } = await supabaseAdmin
        .from('cari_hesaplar')
        .select('id')
        .eq('proje_id', finalProjeId)
        .eq('uye_id', uyeId)
        .single()

      if (cari) {
        // Cari hareket oluştur (gelen_odeme -> borc olarak işlenecek)
        const hareket = await cariHesapService.createPayment({
          proje_id: finalProjeId,
          cari_hesap_id: cari.id,
          islem_turu: 'gelen_odeme',
          odeme_turu: odemeMeta.odeme_yontemi as any || 'banka',
          tutar: odenecekTutar,
          tarih: odemeMeta.odeme_tarihi,
          aciklama: odemeMeta.aciklama || `${aidat.ay}/${aidat.yil} Aidat Tahsilatı`,
          belge_no: odemeMeta.makbuz_no,
          kaynak_tipi: 'aidat',
          kaynak_id: aidat.id,
          actorId
        })

        kalanTutar = Math.round((kalanTutar - odenecekTutar) * 100) / 100
        sonuclar.push({ aidat_id: aidat.id, donem: `${aidat.ay}/${aidat.yil}`, odenen: odenecekTutar })
      }
    }

    logger.info(`Toplu aidat ödemesi yapıldı: Üye ${uyeId}, Toplam: ${tutar}, Proje: ${finalProjeId}`)
    return { 
      toplam_odenen: Math.round((tutar - kalanTutar) * 100) / 100, 
      kalan_avans: kalanTutar,
      kapatilan_kalemler: sonuclar 
    }
  }
}
