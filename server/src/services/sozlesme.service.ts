import { supabaseAdmin } from '../config/supabase'
import { ApiError } from '../utils/ApiError'
import { parsePagination, toSupabaseRange, paginationMeta } from '../utils/pagination'

export const sozlesmeService = {
  async list(query: Record<string, any>) {
    const pagination = parsePagination(query)
    const { from, to } = toSupabaseRange(pagination)

    let q = supabaseAdmin
      .from('sozlesmeler')
      .select('*, firmalar(unvan, firma_tipi)', { count: 'exact' })

    if (query.firma_id) q = q.eq('firma_id', query.firma_id)

    const { data, error, count } = await q
      .order('created_at', { ascending: false })
      .range(from, to)

    if (error) throw error
    return { data, pagination: paginationMeta(pagination, count || 0) }
  },

  async getById(id: string) {
    const { data, error } = await supabaseAdmin
      .from('sozlesmeler')
      .select('*, firmalar(unvan, firma_tipi), sozlesme_is_kalemleri(*)')
      .eq('id', id)
      .single()

    if (error) throw ApiError.notFound('Sözleşme bulunamadı')
    return data
  },

  async create(body: Record<string, any>) {
    const { data, error } = await supabaseAdmin
      .from('sozlesmeler')
      .insert([body])
      .select('*, firmalar(unvan)')
      .single()

    if (error) {
      if (error.code === '23505') throw ApiError.conflict('Bu sözleşme no zaten kayıtlı')
      throw error
    }
    return data
  },

  async update(id: string, body: Record<string, any>) {
    const { data, error } = await supabaseAdmin
      .from('sozlesmeler')
      .update(body)
      .eq('id', id)
      .select('*, firmalar(unvan)')
      .single()

    if (error) throw error
    if (!data) throw ApiError.notFound('Sözleşme bulunamadı')
    return data
  },

  // İş kalemleri
  async getIsKalemleri(sozlesmeId: string) {
    const { data, error } = await supabaseAdmin
      .from('sozlesme_is_kalemleri')
      .select('*')
      .eq('sozlesme_id', sozlesmeId)
      .order('sira_no')

    if (error) throw error
    return data
  },

  async addIsKalemi(sozlesmeId: string, body: Record<string, any>) {
    const { data, error } = await supabaseAdmin
      .from('sozlesme_is_kalemleri')
      .insert([{ sozlesme_id: sozlesmeId, ...body }])
      .select()
      .single()

    if (error) throw error
    return data
  },

  async updateIsKalemi(id: string, body: Record<string, any>) {
    const { data, error } = await supabaseAdmin
      .from('sozlesme_is_kalemleri')
      .update(body)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    if (!data) throw ApiError.notFound('İş kalemi bulunamadı')
    return data
  },

  async deleteIsKalemi(id: string) {
    const { error } = await supabaseAdmin
      .from('sozlesme_is_kalemleri')
      .delete()
      .eq('id', id)

    if (error) throw error
  }
}
