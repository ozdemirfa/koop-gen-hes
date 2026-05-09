import { supabaseAdmin } from '../config/supabase'
import { ApiError } from '../utils/ApiError'
import { parsePagination, toSupabaseRange, paginationMeta } from '../utils/pagination'

export const faturaService = {
  async list(query: Record<string, any>) {
    const pagination = parsePagination(query)
    const { from, to } = toSupabaseRange(pagination)

    let q = supabaseAdmin
      .from('faturalar')
      .select('*, firmalar(unvan), fatura_kalemleri(*)', { count: 'exact' })

    if (query.firma_id) q = q.eq('firma_id', query.firma_id)
    if (query.proje_id) q = q.eq('proje_id', query.proje_id)
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
    if (!id) throw ApiError.badRequest('Fatura ID belirtilmedi')

    const { data, error } = await supabaseAdmin
      .from('faturalar')
      .select('*, firmalar(unvan), fatura_kalemleri(*)')
      .eq('id', id)
      .maybeSingle()

    if (error) throw error
    if (!data) throw ApiError.notFound('Fatura bulunamadı')

    return data
  },

  async create(body: Record<string, any>) {
    const { kalemler, ...masterData } = body

    const { data, error } = await supabaseAdmin.rpc('fn_create_fatura_atomic', {
      p_master: masterData,
      p_kalemler: kalemler ?? null
    })

    if (error) throw error
    return data
  },

  async update(id: string, body: Record<string, any>) {
    const { kalemler, ...masterData } = body

    const { data, error } = await supabaseAdmin.rpc('fn_update_fatura_atomic', {
      p_id: id,
      p_master: masterData,
      p_kalemler: kalemler ?? null
    })

    if (error) {
      if ((error as any).code === 'P0002') throw ApiError.notFound('Fatura bulunamadı')
      throw error
    }
    return data
  },

  async delete(id: string) {
    await supabaseAdmin.from('cari_hareketler').delete().eq('kaynak_tipi', 'fatura').eq('kaynak_id', id)
    const { error } = await supabaseAdmin.from('faturalar').delete().eq('id', id)
    if (error) throw error
  }
}
