import { supabaseAdmin } from '../config/supabase'
import { ApiError } from '../utils/ApiError'
import { parsePagination, toSupabaseRange, paginationMeta } from '../utils/pagination'

export const firmaService = {
  async list(query: Record<string, any>) {
    const pagination = parsePagination(query)
    const { from, to } = toSupabaseRange(pagination)

    let q = supabaseAdmin
      .from('firmalar')
      .select('*', { count: 'exact' })

    if (query.firma_tipi) q = q.eq('firma_tipi', query.firma_tipi)
    if (query.aktif !== undefined) q = q.eq('aktif', query.aktif === 'true')
    if (query.search) q = q.ilike('unvan', `%${query.search}%`)

    const { data, error, count } = await q
      .order('unvan')
      .range(from, to)

    if (error) throw error
    return { data, pagination: paginationMeta(pagination, count || 0) }
  },

  async getById(id: string) {
    const { data, error } = await supabaseAdmin
      .from('firmalar')
      .select('*')
      .eq('id', id)
      .single()

    if (error) throw ApiError.notFound('Firma bulunamadı')
    return data
  },

  async create(body: Record<string, any>) {
    const { data, error } = await supabaseAdmin
      .from('firmalar')
      .insert([body])
      .select()
      .single()

    if (error) throw error
    return data
  },

  async update(id: string, body: Record<string, any>) {
    const { data, error } = await supabaseAdmin
      .from('firmalar')
      .update(body)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    if (!data) throw ApiError.notFound('Firma bulunamadı')
    return data
  },

  async getCariEkstre(firmaId: string) {
    const { data, error } = await supabaseAdmin
      .from('cari_hareketler')
      .select('*')
      .eq('firma_id', firmaId)
      .order('tarih', { ascending: true })

    if (error) throw error

    // Çalışan bakiye hesapla
    let bakiye = 0
    const ekstre = data?.map(hareket => {
      if (hareket.hareket_tipi === 'borc') {
        bakiye += Number(hareket.tutar)
      } else {
        bakiye -= Number(hareket.tutar)
      }
      return { ...hareket, bakiye }
    })

    return { hareketler: ekstre, guncel_bakiye: bakiye }
  }
}
