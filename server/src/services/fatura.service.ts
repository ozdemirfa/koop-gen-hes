import { supabaseAdmin } from '../config/supabase'
import { ApiError } from '../utils/ApiError'
import { parsePagination, toSupabaseRange, paginationMeta } from '../utils/pagination'

export const faturaService = {
  async list(query: Record<string, any>) {
    const pagination = parsePagination(query)
    const { from, to } = toSupabaseRange(pagination)

    let q = supabaseAdmin
      .from('faturalar')
      .select('*, firmalar(unvan)', { count: 'exact' })

    if (query.firma_id) q = q.eq('firma_id', query.firma_id)
    if (query.fatura_tipi) q = q.eq('fatura_tipi', query.fatura_tipi)
    if (query.durum) q = q.eq('durum', query.durum)
    if (query.baslangic_tarihi) q = q.gte('fatura_tarihi', query.baslangic_tarihi)
    if (query.bitis_tarihi) q = q.lte('fatura_tarihi', query.bitis_tarihi)

    const { data, error, count } = await q
      .order('fatura_tarihi', { ascending: false })
      .range(from, to)

    if (error) throw error
    return { data, pagination: paginationMeta(pagination, count || 0) }
  },

  async getById(id: string) {
    const { data, error } = await supabaseAdmin
      .from('faturalar')
      .select('*, firmalar(unvan), odeme_planlari(*)')
      .eq('id', id)
      .single()

    if (error) throw ApiError.notFound('Fatura bulunamadı')
    return data
  },

  async create(body: Record<string, any>) {
    const { data, error } = await supabaseAdmin
      .from('faturalar')
      .insert([body])
      .select('*, firmalar(unvan)')
      .single()

    if (error) throw error

    // Otomatik cari hareket oluştur
    const hareketTipi = body.fatura_tipi === 'gelen' ? 'borc' : 'alacak'
    await supabaseAdmin.from('cari_hareketler').insert([{
      firma_id: body.firma_id,
      hareket_tipi: hareketTipi,
      tutar: body.toplam_tutar,
      tarih: body.fatura_tarihi,
      aciklama: `Fatura: ${body.fatura_no}`,
      fatura_id: data.id
    }])

    return data
  },

  async update(id: string, body: Record<string, any>) {
    const { data, error } = await supabaseAdmin
      .from('faturalar')
      .update(body)
      .eq('id', id)
      .select('*, firmalar(unvan)')
      .single()

    if (error) throw error
    if (!data) throw ApiError.notFound('Fatura bulunamadı')
    return data
  },

  async delete(id: string) {
    // İlişkili cari hareketleri de sil
    await supabaseAdmin.from('cari_hareketler').delete().eq('fatura_id', id)
    const { error } = await supabaseAdmin.from('faturalar').delete().eq('id', id)
    if (error) throw error
  },

  async createOdemePlani(faturaId: string, taksitler: Array<Record<string, any>>) {
    // Mevcut planı sil
    await supabaseAdmin.from('odeme_planlari').delete().eq('fatura_id', faturaId)

    const rows = taksitler.map(t => ({ fatura_id: faturaId, ...t }))
    const { data, error } = await supabaseAdmin
      .from('odeme_planlari')
      .insert(rows)
      .select()

    if (error) throw error
    return data
  }
}
