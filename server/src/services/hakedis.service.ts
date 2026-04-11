import { supabaseAdmin } from '../config/supabase'
import { ApiError } from '../utils/ApiError'
import { parsePagination, toSupabaseRange, paginationMeta } from '../utils/pagination'

export const hakedisService = {
  async list(query: Record<string, any>) {
    const pagination = parsePagination(query)
    const { from, to } = toSupabaseRange(pagination)

    let q = supabaseAdmin
      .from('hakedisler')
      .select('*, sozlesmeler(sozlesme_no, konu, firmalar(unvan))', { count: 'exact' })

    if (query.sozlesme_id) q = q.eq('sozlesme_id', query.sozlesme_id)
    if (query.durum) q = q.eq('durum', query.durum)

    const { data, error, count } = await q
      .order('created_at', { ascending: false })
      .range(from, to)

    if (error) throw error
    return { data, pagination: paginationMeta(pagination, count || 0) }
  },

  async getById(id: string) {
    const { data, error } = await supabaseAdmin
      .from('hakedisler')
      .select('*, sozlesmeler(sozlesme_no, konu, teminat_orani, stopaj_orani, firmalar(unvan)), hakedis_kalemleri(*, sozlesme_is_kalemleri(poz_no, tanim, birim, miktar))')
      .eq('id', id)
      .single()

    if (error) throw ApiError.notFound('Hakediş bulunamadı')
    return data
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
        birim_fiyat: Number(ik.birim_fiyat)
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
      .insert(kalemler.map(k => ({ hakedis_id: hakedisId, ...k })))
      .select()

    if (insertErr) throw insertErr

    // Hakediş toplamlarını hesapla
    const brutTutar = yeniKalemler?.reduce((sum, k) => sum + Number(k.bu_ay_tutar || 0), 0) || 0
    const sozlesme = hakedis.sozlesmeler as any
    const teminatKesintisi = brutTutar * (Number(sozlesme?.teminat_orani || 0) / 100)
    const stopajKesintisi = brutTutar * (Number(sozlesme?.stopaj_orani || 0) / 100)
    const digerKesintiler = Number((hakedis as any).diger_kesintiler || 0)
    const netTutar = brutTutar - teminatKesintisi - stopajKesintisi - digerKesintiler

    await supabaseAdmin
      .from('hakedisler')
      .update({
        brut_tutar: brutTutar,
        teminat_kesintisi: teminatKesintisi,
        stopaj_kesintisi: stopajKesintisi,
        net_tutar: netTutar
      })
      .eq('id', hakedisId)

    return yeniKalemler
  },

  async approve(id: string) {
    const { data: hakedis, error: getErr } = await supabaseAdmin
      .from('hakedisler')
      .select('*, sozlesmeler(firma_id)')
      .eq('id', id)
      .single()

    if (getErr || !hakedis) throw ApiError.notFound('Hakediş bulunamadı')
    if (hakedis.durum !== 'taslak') throw ApiError.badRequest('Sadece taslak hakediş onaylanabilir')

    // Hakediş'i onayla
    const { data, error } = await supabaseAdmin
      .from('hakedisler')
      .update({ durum: 'onaylandi', onay_tarihi: new Date().toISOString().split('T')[0] })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    // Otomatik cari hareket oluştur (borç)
    const sozlesme = hakedis.sozlesmeler as any
    if (sozlesme?.firma_id && hakedis.net_tutar > 0) {
      await supabaseAdmin
        .from('cari_hareketler')
        .insert([{
          firma_id: sozlesme.firma_id,
          hareket_tipi: 'borc',
          tutar: hakedis.net_tutar,
          tarih: new Date().toISOString().split('T')[0],
          aciklama: `Hakediş #${hakedis.hakedis_no} onayı`,
          hakedis_id: id
        }])
    }

    return data
  }
}
