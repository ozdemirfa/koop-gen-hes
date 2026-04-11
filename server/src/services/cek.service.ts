import { supabaseAdmin } from '../config/supabase'
import { ApiError } from '../utils/ApiError'

export const cekService = {
  async list(query: Record<string, any>) {
    let q = supabaseAdmin
      .from('cekler')
      .select('*, firmalar(unvan), projeler(proje_adi)')

    if (query.firma_id) q = q.eq('firma_id', query.firma_id)
    if (query.proje_id) q = q.eq('proje_id', query.proje_id)

    // Vade filtreleri — `filter` parametresi `durum`u override eder (çakışma olmasın)
    const today = new Date().toISOString().split('T')[0]
    if (query.filter === 'vadesi_gelenler') {
      q = q.lte('vade_tarihi', today).eq('durum', 'beklemede')
    } else if (query.filter === 'bu_ay') {
      const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
      const endOfMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0]
      q = q.gte('vade_tarihi', startOfMonth).lte('vade_tarihi', endOfMonth)
      if (query.durum) q = q.eq('durum', query.durum)
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

    // 2. Cari harekete yansıt (Çek verildiğinde firmaya borç/alacak? Genelde firmaya verilen çek firmayı alacaklandırır? 
    // Hayır, firmaya ödeme yapıyoruz, firma bizden alacaklıydı, şimdi borçlanıyor (bakiyesi azalıyor).
    // Cari hareket tipi: 'borc' (firmaya yapılan ödeme gibi)
    const { error: cariError } = await supabaseAdmin
      .from('cari_hareketler')
      .insert([{
        firma_id: body.firma_id,
        proje_id: body.proje_id,
        hareket_tipi: 'borc',
        tutar: body.tutar,
        tarih: body.keside_tarihi || new Date().toISOString().split('T')[0],
        aciklama: `${body.banka} - ${body.cek_no} nolu çek`,
        belge_no: body.cek_no,
        cek_id: cek.id
      }])

    if (cariError) throw cariError

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
  }
}
