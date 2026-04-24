import { supabaseAdmin } from '../config/supabase'
import { ApiError } from '../utils/ApiError'
import { parsePagination, toSupabaseRange, paginationMeta } from '../utils/pagination'

export const malzemeTeslimService = {
  async list(query: Record<string, any>) {
    const pagination = parsePagination(query)
    const { from, to } = toSupabaseRange(pagination)

    let q = supabaseAdmin
      .from('irsaliyeler')
      .select('*, firmalar(unvan), hakedisler!irsaliyeler_hakedis_id_fkey(hakedis_no), irsaliye_kalemleri(*)', { count: 'exact' })

    if (query.firma_id) q = q.eq('firma_id', query.firma_id)
    if (query.sozlesme_id) q = q.eq('sozlesme_id', query.sozlesme_id)
    if (query.proje_id) q = q.eq('proje_id', query.proje_id)
    if (query.baslangic_tarihi) q = q.gte('teslim_tarihi', query.baslangic_tarihi)
    if (query.bitis_tarihi) q = q.lte('teslim_tarihi', query.bitis_tarihi)

    if (query.has_hakedis === 'true') q = q.not('hakedis_id', 'is', null)
    if (query.has_hakedis === 'false') q = q.is('hakedis_id', null)

    const { data, error, count } = await q
      .order('teslim_tarihi', { ascending: false })
      .range(from, to)

    if (error) throw error
    return { data, pagination: paginationMeta(pagination, count || 0) }
  },

  async getById(id: string) {
    const { data, error } = await supabaseAdmin
      .from('irsaliyeler')
      .select('*, firmalar(unvan), hakedisler!irsaliyeler_hakedis_id_fkey(hakedis_no), irsaliye_kalemleri(*)')
      .eq('id', id)
      .single()

    if (error) throw ApiError.notFound('İrsaliye bulunamadı')
    return data
  },

  async create(body: Record<string, any>) {
    const { kalemler, ...masterData } = body

    const { data: irsaliye, error: irsaliyeError } = await supabaseAdmin
      .from('irsaliyeler')
      .insert([masterData])
      .select()
      .single()

    if (irsaliyeError) throw irsaliyeError

    if (kalemler && kalemler.length > 0) {
      const kalemlerWithId = kalemler.map((k: any) => ({ 
        malzeme_adi: k.malzeme_adi,
        birim: k.birim,
        miktar: k.miktar,
        irsaliye_id: irsaliye.id 
      }))
      const { error: kalemError } = await supabaseAdmin
        .from('irsaliye_kalemleri')
        .insert(kalemlerWithId)
      
      if (kalemError) throw kalemError
    }

    return this.getById(irsaliye.id)
  },

  async update(id: string, body: Record<string, any>) {
    const { kalemler, ...masterData } = body

    const { data: irsaliye, error: irsaliyeError } = await supabaseAdmin
      .from('irsaliyeler')
      .update(masterData)
      .eq('id', id)
      .select()
      .single()

    if (irsaliyeError) throw irsaliyeError
    if (!irsaliye) throw ApiError.notFound('İrsaliye bulunamadı')

    if (kalemler) {
      await supabaseAdmin.from('irsaliye_kalemleri').delete().eq('irsaliye_id', id)
      const kalemlerWithId = kalemler.map((k: any) => ({ 
        malzeme_adi: k.malzeme_adi,
        birim: k.birim,
        miktar: k.miktar,
        irsaliye_id: id 
      }))
      await supabaseAdmin.from('irsaliye_kalemleri').insert(kalemlerWithId)
    }
    
    return this.getById(id)
  },

  async delete(id: string) {
    const { error } = await supabaseAdmin
      .from('irsaliyeler')
      .delete()
      .eq('id', id)

    if (error) throw error
  }
}
