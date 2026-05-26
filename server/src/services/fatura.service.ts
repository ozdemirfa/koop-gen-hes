import { supabaseAdmin } from '../config/supabase'
import { ApiError } from '../utils/ApiError'
import { parsePagination, toSupabaseRange, paginationMeta } from '../utils/pagination'
import { requireProjeId } from '../utils/projectGuard'

export const faturaService = {
  async list(query: Record<string, any>) {
    const pagination = parsePagination(query)
    const { from, to } = toSupabaseRange(pagination)

    const projeId = requireProjeId(query.proje_id)

    let q = supabaseAdmin
      .from('faturalar')
      .select('*, firmalar(unvan), fatura_kalemleri(*)', { count: 'exact' })
      .eq('proje_id', projeId)

    if (query.firma_id) q = q.eq('firma_id', query.firma_id)
    if (query.fatura_tipi) q = q.eq('fatura_tipi', query.fatura_tipi)
    if (query.baslangic_tarihi) q = q.gte('fatura_tarihi', query.baslangic_tarihi)
    if (query.bitis_tarihi) q = q.lte('fatura_tarihi', query.bitis_tarihi)

    const { data, error, count } = await q
      .order('fatura_tarihi', { ascending: false })
      .range(from, to)

    if (error) throw error
    return { data, pagination: paginationMeta(pagination, count || 0) }
  },

  // IDOR fix (security-quality-sprint, 2026-05-26):
  //   getById/update/delete metotları artık zorunlu `projeId` parametresi alır.
  //   `supabaseAdmin` service-role RLS bypass ettiğinden, middleware'in
  //   doğruladığı `proje_id` service katmanında da `.eq('proje_id', projeId)`
  //   ile cross-check edilmeli. Aksi halde A projesinin üyesi B projesindeki
  //   fatura ID'sini öğrendiğinde silebilir/güncelleyebilir (CWE-639).
  async getById(id: string, projeId: string) {
    if (!id) throw ApiError.badRequest('Fatura ID belirtilmedi')
    const safeProjeId = requireProjeId(projeId)

    const { data, error } = await supabaseAdmin
      .from('faturalar')
      .select('*, firmalar(unvan), fatura_kalemleri(*)')
      .eq('id', id)
      .eq('proje_id', safeProjeId)
      .maybeSingle()

    if (error) throw error
    if (!data) throw ApiError.notFound('Fatura bulunamadı')

    return data
  },

  async create(body: Record<string, any>, actorId?: string) {
    const { kalemler, ...masterData } = body

    const { data, error } = await supabaseAdmin.rpc('fn_create_fatura_atomic', {
      p_master: masterData,
      p_kalemler: kalemler ?? null,
      p_actor_id: actorId ?? null
    })

    if (error) throw error
    return data
  },

  async update(id: string, body: Record<string, any>, projeId: string, actorId?: string) {
    const { kalemler, ...masterData } = body
    const safeProjeId = requireProjeId(projeId)

    // IDOR fix: master body içindeki `proje_id`'yi (varsa) middleware'in
    // doğruladığı `projeId` ile zorla — saldırgan body üzerinden fatura'yı
    // başka projeye taşıyamasın. `fn_update_fatura_atomic` da pre-check ile
    // cross-project erişimi engeller (migration 20260526240000).
    if (masterData && typeof masterData === 'object') {
      delete masterData.proje_id
    }

    const { data, error } = await supabaseAdmin.rpc('fn_update_fatura_atomic', {
      p_id: id,
      p_master: masterData,
      p_kalemler: kalemler ?? null,
      p_actor_id: actorId ?? null,
      p_proje_id: safeProjeId,
    })

    if (error) {
      if ((error as any).code === 'P0002') throw ApiError.notFound('Fatura bulunamadı')
      throw error
    }
    return data
  },

  async delete(id: string, projeId: string) {
    const safeProjeId = requireProjeId(projeId)

    // IDOR fix: önce fatura'nın projeye ait olduğunu doğrula. Yoksa 404.
    // Bu pre-check service-role RLS bypass'ına karşı defense-in-depth katmanı.
    const { data: existing, error: findErr } = await supabaseAdmin
      .from('faturalar')
      .select('id')
      .eq('id', id)
      .eq('proje_id', safeProjeId)
      .maybeSingle()

    if (findErr) throw findErr
    if (!existing) throw ApiError.notFound('Fatura bulunamadı')

    await supabaseAdmin
      .from('cari_hareketler')
      .delete()
      .eq('kaynak_tipi', 'fatura')
      .eq('kaynak_id', id)
      .eq('proje_id', safeProjeId)

    const { error } = await supabaseAdmin
      .from('faturalar')
      .delete()
      .eq('id', id)
      .eq('proje_id', safeProjeId)
    if (error) throw error
  }
}
