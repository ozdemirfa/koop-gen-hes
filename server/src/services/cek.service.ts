import { supabaseAdmin } from '../config/supabase'
import { ApiError } from '../utils/ApiError'

export const cekService = {
  async list(query: Record<string, any>) {
    let q = supabaseAdmin
      .from('cekler')
      .select('*, firmalar(unvan), projeler(proje_adi)')

    if (query.firma_id) q = q.eq('firma_id', query.firma_id)
    if (query.proje_id) q = q.eq('proje_id', query.proje_id)

    // Filtreleme mantığı
    const today = new Date().toISOString().split('T')[0]
    
    if (query.filter === 'vadesi_gelenler') {
      q = q.lte('vade_tarihi', today).eq('durum', 'beklemede')
    } else if (query.filter === 'bu_ay') {
      const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
      const endOfMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0]
      q = q.gte('vade_tarihi', startOfMonth).lte('vade_tarihi', endOfMonth)
    } else if (query.filter === 'beklemede' || query.filter === 'odendi' || query.filter === 'iade' || query.filter === 'iptal') {
      q = q.eq('durum', query.filter)
    } else if (query.durum) {
      q = q.eq('durum', query.durum)
    }

    const { data, error } = await q.order('vade_tarihi', { ascending: true })
    if (error) throw error
    return data
  },

  async getById(id: string) {
    const { data, error } = await supabaseAdmin
      .from('cekler')
      .select('*, firmalar(unvan), projeler(proje_adi)')
      .eq('id', id)
      .single()

    if (error) throw ApiError.notFound('Çek bulunamadı')
    return data
  },

  async create(body: Record<string, any>) {
    // 1. Çeki kaydet
    const { data: cek, error: cekError } = await supabaseAdmin
      .from('cekler')
      .insert([body])
      .select()
      .single()

    if (cekError) throw cekError

    return cek
  },

  async update(id: string, body: Record<string, any>) {
    const { data, error } = await supabaseAdmin
      .from('cekler')
      .update(body)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    if (!data) throw ApiError.notFound('Çek bulunamadı')
    return data
  },

  async updateDurum(id: string, durum: string) {
    const { data, error } = await supabaseAdmin
      .from('cekler')
      .update({ durum })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  },

  async payCheck(id: string, bankaHesapId: string) {
    // 1. Çeki bul
    const { data: cek, error: getErr } = await supabaseAdmin
      .from('cekler')
      .select('*')
      .eq('id', id)
      .single()

    if (getErr || !cek) throw ApiError.notFound('Çek bulunamadı')
    if (cek.durum === 'odendi') throw ApiError.badRequest('Çek zaten ödendi olarak işaretlenmiş')

    // 2. Çeki "ödendi" yap
    const { data: updatedCek, error: updateErr } = await supabaseAdmin
      .from('cekler')
      .update({ durum: 'odendi' })
      .eq('id', id)
      .select()
      .single()

    if (updateErr) throw updateErr

    // 3. Cari hesabı bul
    const { data: cari } = await supabaseAdmin
      .from('cari_hesaplar')
      .select('id')
      .eq('proje_id', cek.proje_id)
      .eq('firma_id', cek.firma_id)
      .single()

    // 4. Cari harekete kayıt at (Faz 2)
    if (cari) {
      const { data: hareket, error: chError } = await supabaseAdmin
        .from('cari_hareketler')
        .insert([{
          proje_id: cek.proje_id,
          cari_hesap_id: cari.id,
          islem_turu: 'giden_odeme',
          odeme_turu: 'cek',
          alacak: Number(cek.tutar),
          borc: 0,
          tarih: new Date().toISOString().split('T')[0],
          aciklama: `${cek.banka} - ${cek.cek_no} nolu çek ödemesi (Banka)`,
          belge_no: cek.cek_no,
          cek_id: cek.id
        }])
        .select()
        .single()

      if (chError) throw chError

      // 5. Banka hareketi
      const { error: bankaError } = await supabaseAdmin
        .from('banka_hareketleri')
        .insert([{
          banka_hesap_id: bankaHesapId,
          tarih: new Date().toISOString().split('T')[0],
          tutar: Number(cek.tutar),
          islem_tipi: 'gider',
          aciklama: `${cek.banka} - ${cek.cek_no} nolu çek ödemesi`,
          eslesen_cari_hareket_id: hareket.id,
          eslesti: true
        }])

      if (bankaError) throw bankaError
    }

    return updatedCek
  }
}
