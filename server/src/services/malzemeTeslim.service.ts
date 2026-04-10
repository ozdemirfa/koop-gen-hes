import { supabaseAdmin } from '../config/supabase'
import { ApiError } from '../utils/ApiError'
import { parsePagination, toSupabaseRange, paginationMeta } from '../utils/pagination'

export const malzemeTeslimService = {
  async list(query: Record<string, any>) {
    const pagination = parsePagination(query)
    const { from, to } = toSupabaseRange(pagination)

    let q = supabaseAdmin
      .from('malzeme_teslimleri')
      .select('*, firmalar(unvan)', { count: 'exact' })

    if (query.firma_id) q = q.eq('firma_id', query.firma_id)
    if (query.sozlesme_id) q = q.eq('sozlesme_id', query.sozlesme_id)
    if (query.baslangic_tarihi) q = q.gte('teslim_tarihi', query.baslangic_tarihi)
    if (query.bitis_tarihi) q = q.lte('teslim_tarihi', query.bitis_tarihi)

    const { data, error, count } = await q
      .order('teslim_tarihi', { ascending: false })
      .range(from, to)

    if (error) throw error
    return { data, pagination: paginationMeta(pagination, count || 0) }
  },

  async getById(id: string) {
    const { data, error } = await supabaseAdmin
      .from('malzeme_teslimleri')
      .select('*, firmalar(unvan)')
      .eq('id', id)
      .single()

    if (error) throw ApiError.notFound('Teslim kaydı bulunamadı')
    return data
  },

  async create(body: Record<string, any>) {
    const { data, error } = await supabaseAdmin
      .from('malzeme_teslimleri')
      .insert([body])
      .select('*, firmalar(unvan)')
      .single()

    if (error) throw error
    return data
  },

  async update(id: string, body: Record<string, any>) {
    const { data, error } = await supabaseAdmin
      .from('malzeme_teslimleri')
      .update(body)
      .eq('id', id)
      .select('*, firmalar(unvan)')
      .single()

    if (error) throw error
    if (!data) throw ApiError.notFound('Teslim kaydı bulunamadı')
    return data
  },

  async delete(id: string) {
    const { error } = await supabaseAdmin
      .from('malzeme_teslimleri')
      .delete()
      .eq('id', id)

    if (error) throw error
  }
}
