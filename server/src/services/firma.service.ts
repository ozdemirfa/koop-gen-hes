import { supabaseAdmin } from '../config/supabase'
import { ApiError } from '../utils/ApiError'
import { parsePagination, toSupabaseRange, paginationMeta } from '../utils/pagination'
import logger from '../utils/logger'

export const firmaService = {
  async list(query: Record<string, any>) {
    const pagination = parsePagination(query)
    const { from, to } = toSupabaseRange(pagination)

    logger.info(`Firma listeleme isteği - ProjeID: ${query.proje_id}`)

    let q = supabaseAdmin
      .from('firmalar')
      .select('*', { count: 'exact' })

    if (query.proje_id && query.proje_id !== 'null' && query.proje_id !== 'undefined') {
      q = q.eq('proje_id', query.proje_id)
    }
    if (query.firma_tipi) q = q.eq('firma_tipi', query.firma_tipi)
    if (query.aktif !== undefined) q = q.eq('aktif', query.aktif === 'true')
    if (query.search) q = q.ilike('unvan', `%${query.search}%`)

    const { data, error, count } = await q
      .order('unvan')
      .range(from, to)

    if (error) throw error

    // Bakiyeleri ve teminatları ekle
    const updatedData = await Promise.all((data || []).map(async (firma) => {
      // Bakiye
      let bakiyeQuery = supabaseAdmin
        .from('cari_hareketler')
        .select('tutar, hareket_tipi')
        .eq('firma_id', firma.id)
      
      if (query.proje_id) bakiyeQuery = bakiyeQuery.eq('proje_id', query.proje_id)
      
      const { data: hareketler } = await bakiyeQuery
      
      let bakiye = 0
      hareketler?.forEach(h => {
        if (h.hareket_tipi === 'borc') bakiye += Number(h.tutar)
        else bakiye -= Number(h.tutar)
      })

      // Teminat
      let hakedisQuery = supabaseAdmin
        .from('hakedisler')
        .select('teminat_kesintisi')
        .eq('firma_id', firma.id)
        .eq('durum', 'onaylandi')
      
      if (query.proje_id) hakedisQuery = hakedisQuery.eq('proje_id', query.proje_id)

      const { data: hakedisler } = await hakedisQuery
      
      const toplamTeminat = hakedisler?.reduce((sum, h) => sum + Number(h.teminat_kesintisi || 0), 0) || 0

      return { ...firma, guncel_bakiye: bakiye, toplam_teminat: toplamTeminat }
    }))

    return { data: updatedData, pagination: paginationMeta(pagination, count || 0) }
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

  async getCariEkstre(firmaId: string, query?: Record<string, any>) {
    let q = supabaseAdmin
      .from('cari_hareketler')
      .select('*')
      .eq('firma_id', firmaId)
    
    if (query?.proje_id) q = q.eq('proje_id', query.proje_id)

    const { data, error } = await q.order('tarih', { ascending: true })
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
