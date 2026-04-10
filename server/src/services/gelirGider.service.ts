import { supabaseAdmin } from '../config/supabase'
import { ApiError } from '../utils/ApiError'
import { parsePagination, toSupabaseRange, paginationMeta } from '../utils/pagination'

export const kategoriService = {
  async list() {
    const { data, error } = await supabaseAdmin
      .from('gelir_gider_kategorileri')
      .select('*')
      .order('tip')
      .order('ad')

    if (error) throw error
    return data
  },

  async create(body: Record<string, any>) {
    const { data, error } = await supabaseAdmin
      .from('gelir_gider_kategorileri')
      .insert([body])
      .select()
      .single()

    if (error) throw error
    return data
  }
}

export const gelirGiderService = {
  async list(query: Record<string, any>) {
    const pagination = parsePagination(query)
    const { from, to } = toSupabaseRange(pagination)

    let q = supabaseAdmin
      .from('gelir_giderler')
      .select('*, gelir_gider_kategorileri(ad, tip)', { count: 'exact' })

    if (query.tip) q = q.eq('tip', query.tip)
    if (query.kategori_id) q = q.eq('kategori_id', query.kategori_id)
    if (query.baslangic_tarihi) q = q.gte('tarih', query.baslangic_tarihi)
    if (query.bitis_tarihi) q = q.lte('tarih', query.bitis_tarihi)

    const { data, error, count } = await q
      .order('tarih', { ascending: false })
      .range(from, to)

    if (error) throw error
    return { data, pagination: paginationMeta(pagination, count || 0) }
  },

  async getById(id: string) {
    const { data, error } = await supabaseAdmin
      .from('gelir_giderler')
      .select('*, gelir_gider_kategorileri(ad, tip)')
      .eq('id', id)
      .single()

    if (error) throw ApiError.notFound('Kayıt bulunamadı')
    return data
  },

  async create(body: Record<string, any>) {
    const { data, error } = await supabaseAdmin
      .from('gelir_giderler')
      .insert([body])
      .select('*, gelir_gider_kategorileri(ad, tip)')
      .single()

    if (error) throw error
    return data
  },

  async update(id: string, body: Record<string, any>) {
    const { data, error } = await supabaseAdmin
      .from('gelir_giderler')
      .update(body)
      .eq('id', id)
      .select('*, gelir_gider_kategorileri(ad, tip)')
      .single()

    if (error) throw error
    if (!data) throw ApiError.notFound('Kayıt bulunamadı')
    return data
  },

  async delete(id: string) {
    const { error } = await supabaseAdmin
      .from('gelir_giderler')
      .delete()
      .eq('id', id)

    if (error) throw error
  }
}
