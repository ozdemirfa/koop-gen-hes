import { supabaseAdmin } from '../config/supabase'
import { ApiError } from '../utils/ApiError'
import { parsePagination, toSupabaseRange, paginationMeta } from '../utils/pagination'
import logger from '../utils/logger'

export const hakedisService = {
  async list(query: Record<string, any>) {
    const pagination = parsePagination(query)
    const { from, to } = toSupabaseRange(pagination)

    logger.debug('Hakediş listesi sorgulanıyor:', query)

    let q = supabaseAdmin
      .from('hakedisler')
      .select('*, sozlesmeler(sozlesme_no, konu, firma_id, firmalar(unvan))', { count: 'exact' })

    // 1. Proje Filtresi
    if (query.proje_id) {
      q = q.eq('proje_id', query.proje_id)
    }
    
    // 2. Sözleşme Filtresi
    if (query.sozlesme_id) {
      q = q.eq('sozlesme_id', query.sozlesme_id)
    }
    
    // 3. Firma Filtresi (Cerrahi Müdahale: In-Clause Yöntemi)
    if (query.firma_id) {
      // Önce bu firmaya ait tüm sözleşmeleri bul
      const { data: firmaSozlesmeleri } = await supabaseAdmin
        .from('sozlesmeler')
        .select('id')
        .eq('firma_id', query.firma_id);
      
      const sozlesmeIds = firmaSozlesmeleri?.map(s => s.id) || [];
      
      if (sozlesmeIds.length === 0) {
        // Eğer firmanın hiç sözleşmesi yoksa, boş liste dön
        return { data: [], pagination: paginationMeta(pagination, 0) };
      }
      
      // Sadece bu sözleşmelere ait hakedişleri getir
      q = q.in('sozlesme_id', sozlesmeIds);
    }
    
    // 4. Durum Filtresi
    if (query.durum) {
      q = q.eq('durum', query.durum)
    }

    const { data, error, count } = await q
      .order('hakedis_no', { ascending: false })
      .range(from, to)

    if (error) {
      logger.error('Hakediş listesi çekilirken hata:', error)
      throw error
    }
    
    return { data, pagination: paginationMeta(pagination, count || 0) }
  },

  async getById(id: string) {
    const { data, error } = await supabaseAdmin
      .from('hakedisler')
      .select('*, sozlesmeler(sozlesme_no, konu, teminat_orani, stopaj_orani, firma_id, firmalar(unvan)), hakedis_kalemleri(*, sozlesme_is_kalemleri(poz_no, tanim, birim, miktar, kdv_orani)), irsaliyeler!irsaliyeler_hakedis_id_fkey(id, irsaliye_no, teslim_tarihi, teslim_alan, notlar, irsaliye_kalemleri(id, malzeme_adi, birim, miktar))')
      .eq('id', id)
      .single()

    if (error) throw ApiError.notFound('Hakediş bulunamadı')
    return data
  },

  // ===== İRSALİYE BAĞLAMA (Alternatif A: Manuel Toplu Seçim) =====
  // Bir hakediş taslağına açık irsaliye'leri toplu ata. Sadece taslakta çalışır;
  // hedef irsaliye'lerin tamamı boşta (hakedis_id IS NULL) ve aynı firmaya ait olmalı.
  async attachIrsaliyeler(hakedisId: string, irsaliyeIds: string[]) {
    if (!Array.isArray(irsaliyeIds) || irsaliyeIds.length === 0) {
      throw ApiError.badRequest('İrsaliye seçimi yapılmadı')
    }

    // Hakediş + bağlı sözleşmenin firma_id'sini çek
    const { data: hakedis, error: hErr } = await supabaseAdmin
      .from('hakedisler')
      .select('id, durum, sozlesmeler(firma_id)')
      .eq('id', hakedisId)
      .single()

    if (hErr || !hakedis) throw ApiError.notFound('Hakediş bulunamadı')
    if (hakedis.durum !== 'taslak') {
      throw ApiError.badRequest('İrsaliye sadece taslak durumdaki hakedişe eklenebilir')
    }

    const sozlesme = Array.isArray(hakedis.sozlesmeler) ? hakedis.sozlesmeler[0] : hakedis.sozlesmeler
    const hakedisFirmaId = (sozlesme as any)?.firma_id
    if (!hakedisFirmaId) throw ApiError.badRequest('Hakediş sözleşmesinin firma bilgisi bulunamadı')

    // Hedef irsaliye'leri çek; aynı firmaya ait ve boşta olduklarını doğrula
    const { data: irsaliyeler, error: iErr } = await supabaseAdmin
      .from('irsaliyeler')
      .select('id, firma_id, hakedis_id')
      .in('id', irsaliyeIds)

    if (iErr) throw iErr
    if (!irsaliyeler || irsaliyeler.length !== irsaliyeIds.length) {
      throw ApiError.badRequest('Seçilen irsaliyelerden bazıları bulunamadı')
    }

    const wrongFirma = irsaliyeler.find(i => i.firma_id !== hakedisFirmaId)
    if (wrongFirma) {
      throw ApiError.badRequest('Seçilen irsaliyelerin tamamı hakediş ile aynı firmaya ait olmalı')
    }
    const alreadyAttached = irsaliyeler.find(i => i.hakedis_id !== null)
    if (alreadyAttached) {
      throw ApiError.conflict('Seçilen irsaliyelerden biri zaten başka bir hakedişe bağlı')
    }

    const { error: uErr } = await supabaseAdmin
      .from('irsaliyeler')
      .update({ hakedis_id: hakedisId })
      .in('id', irsaliyeIds)

    if (uErr) throw uErr

    return this.getById(hakedisId)
  },

  async detachIrsaliye(hakedisId: string, irsaliyeId: string) {
    // Sadece bağlı olduğu hakediş taslaktaysa serbest bırakılabilir.
    const { data: hakedis, error: hErr } = await supabaseAdmin
      .from('hakedisler')
      .select('id, durum')
      .eq('id', hakedisId)
      .single()

    if (hErr || !hakedis) throw ApiError.notFound('Hakediş bulunamadı')
    if (hakedis.durum !== 'taslak') {
      throw ApiError.badRequest('İrsaliye bağı sadece taslak hakedişten kaldırılabilir')
    }

    const { data: irsaliye, error: iErr } = await supabaseAdmin
      .from('irsaliyeler')
      .select('id, hakedis_id')
      .eq('id', irsaliyeId)
      .single()

    if (iErr || !irsaliye) throw ApiError.notFound('İrsaliye bulunamadı')
    if (irsaliye.hakedis_id !== hakedisId) {
      throw ApiError.badRequest('İrsaliye bu hakedişe bağlı değil')
    }

    const { error: uErr } = await supabaseAdmin
      .from('irsaliyeler')
      .update({ hakedis_id: null })
      .eq('id', irsaliyeId)

    if (uErr) throw uErr

    return this.getById(hakedisId)
  },

  async create(body: Record<string, any>) {
    const sozlesmeId = body.sozlesme_id

    // Son hakediş no'yu bul
    const { data: sonHakedis } = await supabaseAdmin
      .from('hakedisler')
      .select('hakedis_no')
      .eq('sozlesme_id', sozlesmeId)
      .order('hakedis_no', { ascending: false })
      .limit(1)
      .single()

    const hakedisNo = (sonHakedis?.hakedis_no || 0) + 1

    const { data, error } = await supabaseAdmin
      .from('hakedisler')
      .insert([{ ...body, hakedis_no: hakedisNo }])
      .select('*, sozlesmeler(sozlesme_no, konu, firmalar(unvan))')
      .single()

    if (error) throw error

    // Sözleşme iş kalemlerinden otomatik hakediş kalemleri oluştur
    const { data: isKalemleri } = await supabaseAdmin
      .from('sozlesme_is_kalemleri')
      .select('*')
      .eq('sozlesme_id', sozlesmeId)
      .order('sira_no')

    if (isKalemleri && isKalemleri.length > 0) {
      // Önceki hakediş'ten kümülatif miktarları al
      let oncekiMiktarlar: Record<string, number> = {}
      if (hakedisNo > 1) {
        const { data: oncekiHakedis } = await supabaseAdmin
          .from('hakedisler')
          .select('id')
          .eq('sozlesme_id', sozlesmeId)
          .eq('hakedis_no', hakedisNo - 1)
          .single()

        if (oncekiHakedis) {
          const { data: oncekiKalemler } = await supabaseAdmin
            .from('hakedis_kalemleri')
            .select('is_kalemi_id, toplam_miktar')
            .eq('hakedis_id', oncekiHakedis.id)

          oncekiKalemler?.forEach(k => {
            oncekiMiktarlar[k.is_kalemi_id] = Number(k.toplam_miktar || 0)
          })
        }
      }

      const kalemler = isKalemleri.map(ik => ({
        hakedis_id: data.id,
        is_kalemi_id: ik.id,
        onceki_miktar: oncekiMiktarlar[ik.id] || 0,
        bu_ay_miktar: 0,
        birim_fiyat: Number(ik.birim_fiyat),
        kdv_orani: Number(ik.kdv_orani || 20)
      }))

      await supabaseAdmin.from('hakedis_kalemleri').insert(kalemler)
    }

    return data
  },

  async update(id: string, body: Record<string, any>) {
    const { data, error } = await supabaseAdmin
      .from('hakedisler')
      .update(body)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    if (!data) throw ApiError.notFound('Hakediş bulunamadı')
    return data
  },

  async updateKalemler(hakedisId: string, kalemler: Array<Record<string, any>>) {
    // Mevcut hakediş kontrolü
    const { data: hakedis, error: hErr } = await supabaseAdmin
      .from('hakedisler')
      .select('durum, diger_kesintiler, sozlesme_id, sozlesmeler(teminat_orani, stopaj_orani)')
      .eq('id', hakedisId)
      .single()

    if (hErr || !hakedis) throw ApiError.notFound('Hakediş bulunamadı')
    if ((hakedis as any).durum !== 'taslak') throw ApiError.badRequest('Sadece taslak hakediş düzenlenebilir')

    // Mevcut kalemleri sil ve yeniden oluştur
    await supabaseAdmin.from('hakedis_kalemleri').delete().eq('hakedis_id', hakedisId)

    const { data: yeniKalemler, error: insertErr } = await supabaseAdmin
      .from('hakedis_kalemleri')
      .insert(kalemler.map(k => ({ 
        hakedis_id: hakedisId, 
        is_kalemi_id: k.is_kalemi_id,
        bu_ay_miktar: k.bu_ay_miktar,
        birim_fiyat: k.birim_fiyat,
        kdv_orani: k.kdv_orani,
        onceki_miktar: k.onceki_miktar || 0
      })))
      .select()

    if (insertErr) throw insertErr

    // Hakediş toplamlarını hesapla
    let araToplam = 0
    let kdvToplam = 0
    
    yeniKalemler?.forEach(k => {
      const kalemTutar = Number(k.bu_ay_miktar || 0) * Number(k.birim_fiyat || 0)
      const kdvOrani = k.kdv_orani !== null && k.kdv_orani !== undefined ? Number(k.kdv_orani) : 20
      const kalemKdv = kalemTutar * (kdvOrani / 100)
      araToplam += kalemTutar
      kdvToplam += kalemKdv
    })

    const hakedisToplam = araToplam + kdvToplam

    const sozlesme = hakedis.sozlesmeler as any
    const teminatOrani = Number(sozlesme?.teminat_orani || 0)
    const stopajOrani = Number(sozlesme?.stopaj_orani || 0)
    
    const teminatKesintisi = araToplam * (teminatOrani / 100)
    const stopajKesintisi = araToplam * (stopajOrani / 100)
    const digerKesintiler = Number((hakedis as any).diger_kesintiler || 0)
    const netTutar = hakedisToplam - teminatKesintisi - stopajKesintisi - digerKesintiler

    await supabaseAdmin
      .from('hakedisler')
      .update({
        ara_toplam: araToplam,
        kdv_tutar: kdvToplam,
        hakedis_toplam: hakedisToplam,
        teminat_kesintisi: teminatKesintisi,
        stopaj_kesintisi: stopajKesintisi,
        net_tutar: netTutar
      })
      .eq('id', hakedisId)

    return yeniKalemler
  },

  async approve(id: string) {
    logger.info(`Hakediş onaylama işlemi başlatıldı: ${id}`)
    
    const { data: hakedis, error: getErr } = await supabaseAdmin
      .from('hakedisler')
      .select('*, sozlesmeler(firma_id, teminat_orani, stopaj_orani), hakedis_kalemleri(*)')
      .eq('id', id)
      .single()

    if (getErr || !hakedis) {
      logger.error(`Hakediş bulunamadı: ${id}`, getErr)
      throw ApiError.notFound('Hakediş bulunamadı')
    }
    
    if (hakedis.durum !== 'taslak') {
      throw ApiError.badRequest('Sadece taslak hakediş onaylanabilir')
    }

    // Onaylamadan önce toplamları hakediş kalemlerine göre yeniden hesapla (Güvenlik için)
    let araToplam = 0
    let kdvToplam = 0
    
    const kalemler = hakedis.hakedis_kalemleri || []
    kalemler.forEach((k: any) => {
      const miktar = Number(k.bu_ay_miktar || 0)
      const fiyat = Number(k.birim_fiyat || 0)
      const kalemTutar = miktar * fiyat
      const kdvOrani = k.kdv_orani !== null && k.kdv_orani !== undefined ? Number(k.kdv_orani) : 20
      const kalemKdv = kalemTutar * (kdvOrani / 100)
      araToplam += kalemTutar
      kdvToplam += kalemKdv
    })

    const hakedisToplam = araToplam + kdvToplam
    const sozlesme = hakedis.sozlesmeler as any
    const teminatKesintisi = araToplam * (Number(sozlesme?.teminat_orani || 0) / 100)
    const stopajKesintisi = araToplam * (Number(sozlesme?.stopaj_orani || 0) / 100)
    const digerKesintiler = Number(hakedis.diger_kesintiler || 0)
    const netTutar = hakedisToplam - teminatKesintisi - stopajKesintisi - digerKesintiler

    logger.info(`Hakediş hesaplamaları tamamlandı. Toplam: ${hakedisToplam}, Net: ${netTutar}`)

    // Hakediş'i güncelle ve onayla
    const { data, error } = await supabaseAdmin
      .from('hakedisler')
      .update({ 
        durum: 'onaylandi', 
        onay_tarihi: new Date().toISOString().split('T')[0],
        ara_toplam: araToplam,
        kdv_tutar: kdvToplam,
        hakedis_toplam: hakedisToplam,
        teminat_kesintisi: teminatKesintisi,
        stopaj_kesintisi: stopajKesintisi,
        net_tutar: netTutar
      })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      logger.error('Hakediş güncelleme hatası:', error)
      throw error
    }

    // Otomatik cari hareket oluştur
    if (sozlesme?.firma_id && Number(data.hakedis_toplam) > 0) {
      const { data: cari } = await supabaseAdmin
        .from('cari_hesaplar')
        .select('id')
        .eq('proje_id', hakedis.proje_id)
        .eq('firma_id', sozlesme.firma_id)
        .maybeSingle()

      if (!cari) {
        logger.error(`Cari hesap bulunamadı: Proje ${hakedis.proje_id}, Firma ${sozlesme.firma_id}`)
        throw ApiError.badRequest('Firmaya ait cari hesap bulunamadı. Lütfen önce cari hesap oluşturun.')
      }

      const { error: movementError } = await supabaseAdmin
        .from('cari_hareketler')
        .insert([{
          proje_id: hakedis.proje_id,
          cari_hesap_id: cari.id,
          islem_turu: 'hakedis',
          borc: Number(data.hakedis_toplam),
          alacak: 0,
          tarih: new Date().toISOString().split('T')[0],
          aciklama: `Hakediş #${hakedis.hakedis_no} onayı (KDV Dahil)`,
          kaynak_tipi: 'hakedis',
          kaynak_id: id
        }])

      if (movementError) {
        logger.error('Cari hareket oluşturma hatası:', movementError)
        // Hakediş onayını geri alma veya hatayı yönetme
        await supabaseAdmin.from('hakedisler').update({ durum: 'taslak', onay_tarihi: null }).eq('id', id)
        throw movementError
      }
    }

    return data
  },

  async unapprove(id: string) {
    const { data: hakedis, error: getErr } = await supabaseAdmin
      .from('hakedisler')
      .select('*')
      .eq('id', id)
      .single()

    if (getErr || !hakedis) throw ApiError.notFound('Hakediş bulunamadı')
    if (hakedis.durum !== 'onaylandi') throw ApiError.badRequest('Sadece onaylı hakedişlerin onayı iptal edilebilir')

    // İlişkili cari hareketi sil
    await supabaseAdmin
      .from('cari_hareketler')
      .delete()
      .eq('kaynak_tipi', 'hakedis')
      .eq('kaynak_id', id)

    // Hakediş durumunu taslağa çek
    const { data, error } = await supabaseAdmin
      .from('hakedisler')
      .update({ durum: 'taslak', onay_tarihi: null })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  },

  async getPDFData(id: string) {
    const { data: hakedis, error } = await supabaseAdmin
      .from('hakedisler')
      .select(`
        *,
        sozlesmeler (
          sozlesme_no,
          konu,
          teminat_orani,
          stopaj_orani,
          firmalar (
            unvan,
            vergi_no,
            vergi_dairesi
          )
        ),
        hakedis_kalemleri (
          bu_ay_miktar,
          bu_ay_tutar,
          toplam_miktar,
          toplam_tutar,
          kdv_orani,
          sozlesme_is_kalemleri (
            poz_no,
            tanim,
            birim
          )
        )
      `)
      .eq('id', id)
      .single()

    if (error || !hakedis) throw ApiError.notFound('Hakediş bulunamadı')

    return {
      hakedis,
      kalemler: hakedis.hakedis_kalemleri,
      sozlesme: hakedis.sozlesmeler,
      firma: (hakedis.sozlesmeler as any).firmalar
    }
  }
}
