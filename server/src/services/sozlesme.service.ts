import { supabaseAdmin } from '../config/supabase'
import { ApiError } from '../utils/ApiError'
import { parsePagination, toSupabaseRange, paginationMeta } from '../utils/pagination'
import { requireProjeId } from '../utils/projectGuard'

export const sozlesmeService = {
  async list(query: Record<string, any>) {
    const pagination = parsePagination(query)
    const { from, to } = toSupabaseRange(pagination)

    const projeId = requireProjeId(query.proje_id)

    let q = supabaseAdmin
      .from('sozlesmeler')
      .select('*, firmalar(unvan, firma_tipi)', { count: 'exact' })
      .eq('proje_id', projeId)

    if (query.firma_id) q = q.eq('firma_id', query.firma_id)

    const { data, error, count } = await q
      .order('created_at', { ascending: false })
      .range(from, to)

    if (error) throw error
    return { data, pagination: paginationMeta(pagination, count || 0) }
  },

  // IDOR fix (security-quality-sprint, 2026-05-26):
  //   `supabaseAdmin` service-role RLS bypass eder. Tüm getById/update/delete +
  //   alt-resource (is_kalemleri) metotları artık `projeId` zorunlu — saldırgan
  //   başka projedeki sözleşme/kalem ID'sini öğrense de 404 alır (CWE-639).
  async getById(id: string, projeId: string) {
    const safeProjeId = requireProjeId(projeId)
    const { data, error } = await supabaseAdmin
      .from('sozlesmeler')
      .select('*, firmalar(unvan, firma_tipi), sozlesme_is_kalemleri(*)')
      .eq('id', id)
      .eq('proje_id', safeProjeId)
      .maybeSingle()

    if (error) throw error
    if (!data) throw ApiError.notFound('Sözleşme bulunamadı')
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

  async update(id: string, body: Record<string, any>, projeId: string) {
    const safeProjeId = requireProjeId(projeId)

    // Mass-assignment guard: caller proje_id'yi değiştiremez (cross-project taşıma yasak)
    const sanitized = { ...body }
    delete sanitized.proje_id
    delete sanitized.projeId

    const { data, error } = await supabaseAdmin
      .from('sozlesmeler')
      .update(sanitized)
      .eq('id', id)
      .eq('proje_id', safeProjeId)
      .select('*, firmalar(unvan)')
      .maybeSingle()

    if (error) throw error
    if (!data) throw ApiError.notFound('Sözleşme bulunamadı')
    return data
  },

  // İş kalemleri — parent sözleşme proje_id'sine bağlanır
  async getIsKalemleri(sozlesmeId: string, projeId: string) {
    const safeProjeId = requireProjeId(projeId)

    // IDOR pre-check: parent sözleşme caller'ın projesinde mi?
    await assertSozlesmeInProje(sozlesmeId, safeProjeId)

    const { data, error } = await supabaseAdmin
      .from('sozlesme_is_kalemleri')
      .select('*')
      .eq('sozlesme_id', sozlesmeId)
      .order('sira_no')

    if (error) throw error
    return data
  },

  async addIsKalemi(sozlesmeId: string, body: Record<string, any>, projeId: string) {
    const safeProjeId = requireProjeId(projeId)
    await assertSozlesmeInProje(sozlesmeId, safeProjeId)

    const sanitized = { ...body }
    delete sanitized.sozlesme_id  // server-side enforcement

    const { data, error } = await supabaseAdmin
      .from('sozlesme_is_kalemleri')
      .insert([{ sozlesme_id: sozlesmeId, ...sanitized }])
      .select()
      .single()

    if (error) throw error
    return data
  },

  async updateIsKalemi(id: string, body: Record<string, any>, projeId: string) {
    const safeProjeId = requireProjeId(projeId)

    // IDOR pre-check: kalem ID → parent sözleşme → proje_id eşleşmeli
    const { data: kalem, error: lookupErr } = await supabaseAdmin
      .from('sozlesme_is_kalemleri')
      .select('id, sozlesmeler!inner(proje_id)')
      .eq('id', id)
      .maybeSingle()
    if (lookupErr) throw lookupErr
    const parentProjeId = (kalem as any)?.sozlesmeler?.proje_id
    if (!kalem || parentProjeId !== safeProjeId) {
      throw ApiError.notFound('İş kalemi bulunamadı')
    }

    const sanitized = { ...body }
    delete sanitized.sozlesme_id

    const { data, error } = await supabaseAdmin
      .from('sozlesme_is_kalemleri')
      .update(sanitized)
      .eq('id', id)
      .select()
      .maybeSingle()

    if (error) throw error
    if (!data) throw ApiError.notFound('İş kalemi bulunamadı')
    return data
  },

  async deleteIsKalemi(id: string, projeId: string) {
    const safeProjeId = requireProjeId(projeId)

    const { data: kalem, error: lookupErr } = await supabaseAdmin
      .from('sozlesme_is_kalemleri')
      .select('id, sozlesmeler!inner(proje_id)')
      .eq('id', id)
      .maybeSingle()
    if (lookupErr) throw lookupErr
    const parentProjeId = (kalem as any)?.sozlesmeler?.proje_id
    if (!kalem || parentProjeId !== safeProjeId) {
      throw ApiError.notFound('İş kalemi bulunamadı')
    }

    const { error } = await supabaseAdmin
      .from('sozlesme_is_kalemleri')
      .delete()
      .eq('id', id)

    if (error) throw error
  },

  async delete(id: string, projeId: string) {
    const safeProjeId = requireProjeId(projeId)

    // IDOR pre-check: sözleşme caller'ın projesinde mi?
    const { data: existing, error: findErr } = await supabaseAdmin
      .from('sozlesmeler')
      .select('id')
      .eq('id', id)
      .eq('proje_id', safeProjeId)
      .maybeSingle()
    if (findErr) throw findErr
    if (!existing) throw ApiError.notFound('Sözleşme bulunamadı')

    // Bağımlılık kontrolü: hakediş var mı?
    const { count: hakedisCount, error: hakedisError } = await supabaseAdmin
      .from('hakedisler')
      .select('id', { count: 'exact', head: true })
      .eq('sozlesme_id', id)
      .eq('proje_id', safeProjeId)

    if (hakedisError) throw hakedisError
    if (hakedisCount && hakedisCount > 0) {
      throw ApiError.badRequest('Bu sözleşmeye ait hakediş kayıtları bulunduğu için silinemez.')
    }

    // İş kalemlerini kontrol et
    const { count: kalemCount, error: kalemError } = await supabaseAdmin
      .from('sozlesme_is_kalemleri')
      .select('id', { count: 'exact', head: true })
      .eq('sozlesme_id', id)

    if (kalemError) throw kalemError
    if (kalemCount && kalemCount > 0) {
      throw ApiError.badRequest('Bu sözleşmeye ait iş kalemleri bulunduğu için silinemez. Önce kalemleri silmelisiniz.')
    }

    const { error } = await supabaseAdmin
      .from('sozlesmeler')
      .delete()
      .eq('id', id)
      .eq('proje_id', safeProjeId)

    if (error) throw error
  }
}

/**
 * IDOR pre-check helper: sozlesmeId'nin parent proje_id'si beklenen ile eşleşiyor mu?
 * Eşleşmiyorsa 404 (saldırgana varlık bilgisi sızdırılmaz).
 */
async function assertSozlesmeInProje(sozlesmeId: string, projeId: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from('sozlesmeler')
    .select('id')
    .eq('id', sozlesmeId)
    .eq('proje_id', projeId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw ApiError.notFound('Sözleşme bulunamadı')
}
