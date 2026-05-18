import { supabaseAdmin } from '../config/supabase'
import { ApiError } from '../utils/ApiError'
import { parsePagination, toSupabaseRange, paginationMeta } from '../utils/pagination'
import { requireProjeId } from '../utils/projectGuard'

export const malzemeTeslimService = {
  async list(query: Record<string, any>) {
    const pagination = parsePagination(query)
    const { from, to } = toSupabaseRange(pagination)

    const projeId = requireProjeId(query.proje_id)

    let q = supabaseAdmin
      .from('irsaliyeler')
      .select('*, firmalar(unvan), hakedisler!irsaliyeler_hakedis_id_fkey(hakedis_no), irsaliye_kalemleri(*)', { count: 'exact' })
      .eq('proje_id', projeId)

    if (query.firma_id) q = q.eq('firma_id', query.firma_id)
    if (query.sozlesme_id) q = q.eq('sozlesme_id', query.sozlesme_id)
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

  async create(body: Record<string, any>, actorId?: string) {
    const { kalemler, ...masterData } = body

    const { data: irsaliye, error: irsaliyeError } = await supabaseAdmin.rpc('fn_create_irsaliye_atomic', {
      p_master_data: masterData,
      p_kalemler: kalemler || [],
      p_actor_id: actorId ?? null
    })

    if (irsaliyeError) throw irsaliyeError

    return this.getById(irsaliye.id)
  },

  async update(id: string, body: Record<string, any>) {
    const { kalemler, ...masterData } = body

    // Update master record
    const { data: irsaliye, error: irsaliyeError } = await supabaseAdmin
      .from('irsaliyeler')
      .update(masterData)
      .eq('id', id)
      .select()
      .single()

    if (irsaliyeError) throw irsaliyeError
    if (!irsaliye) throw ApiError.notFound('İrsaliye bulunamadı')

    // If kalemler are provided, we should ideally handle this in a single RPC as well for true atomicity.
    // For now, we'll keep it as is but note it.
    if (kalemler) {
      await supabaseAdmin.from('irsaliye_kalemleri').delete().eq('irsaliye_id', id)
      const kalemlerWithId = kalemler.map((k: any) => ({ 
        malzeme_adi: k.malzeme_adi,
        birim: k.birim,
        miktar: k.miktar,
        aciklama: k.aciklama,
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
