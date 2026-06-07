import { supabaseAdmin } from '../config/supabase'
import { ApiError } from '../utils/ApiError'
import { parsePagination, toSupabaseRange, paginationMeta } from '../utils/pagination'
import { requireProjeId, sanitizeSearchInput } from '../utils/projectGuard'
import logger from '../utils/logger'

// Kurumlar owner-bazlı (firma.service pattern'i). Aktif projenin owner'ını
// (proje_uyelikleri rol='owner') döndürür; kurum listesi/oluşturma bu owner'a
// göre filtrelenir/atanır.
async function getProjectOwnerId(projeId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('proje_uyelikleri')
    .select('user_id')
    .eq('proje_id', projeId)
    .eq('rol', 'owner')
    .limit(1)
    .maybeSingle()
  if (error) {
    logger.error('getProjectOwnerId (kurum) hatası', { projeId, error: error.message })
    return null
  }
  return data?.user_id ?? null
}

export const kurumService = {
  async list(query: Record<string, any>) {
    const pagination = parsePagination(query)
    const { from, to } = toSupabaseRange(pagination)

    const projeId = requireProjeId(query.proje_id)
    const ownerId = await getProjectOwnerId(projeId)
    if (!ownerId) return { data: [], pagination: paginationMeta(pagination, 0) }

    let q = supabaseAdmin
      .from('kurumlar')
      .select('*', { count: 'exact' })
      .eq('owner_id', ownerId)

    if (query.aktif !== undefined) q = q.eq('aktif', query.aktif === 'true')
    if (query.search) {
      const safe = sanitizeSearchInput(query.search)
      if (safe) q = q.ilike('kurum_adi', `%${safe}%`)
    }

    const { data, error, count } = await q.order('kurum_adi').range(from, to)
    if (error) throw error

    // Her kurum için aktif projede yapılan toplam ödeme (giden_odeme alacak).
    // Tablo "Toplam Ödeme" sütunu için. Kurum sayısı az → JS aggregation kabul edilebilir
    // (firma.service.list ile aynı yaklaşım).
    const kurumIds = (data || []).map((k) => k.id)
    const odemeMap = new Map<string, number>()
    if (kurumIds.length > 0) {
      const { data: rows, error: rErr } = await supabaseAdmin
        .from('cari_hareketler')
        .select('alacak, cari_hesaplar!inner(kurum_id, cari_turu)')
        .eq('proje_id', projeId)
        .eq('islem_turu', 'giden_odeme')
        .eq('cari_hesaplar.cari_turu', 'kurumsal')
      if (rErr) throw rErr
      for (const r of rows || []) {
        const kid = (r as any).cari_hesaplar?.kurum_id as string | undefined
        if (kid) odemeMap.set(kid, (odemeMap.get(kid) || 0) + Number((r as any).alacak || 0))
      }
    }

    const enriched = (data || []).map((k) => ({ ...k, toplam_odeme: odemeMap.get(k.id) || 0 }))
    return { data: enriched, pagination: paginationMeta(pagination, count || 0) }
  },

  async getById(id: string, projeId: string) {
    const ownerId = await getProjectOwnerId(requireProjeId(projeId))
    const { data, error } = await supabaseAdmin
      .from('kurumlar')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (error) throw error
    if (!data || !ownerId || data.owner_id !== ownerId) throw ApiError.notFound('Kurum bulunamadı')
    return data
  },

  async create(body: Record<string, any>, projeId: string) {
    const ownerId = await getProjectOwnerId(requireProjeId(projeId))
    if (!ownerId) throw ApiError.badRequest('Proje sahibi bulunamadı; kurum oluşturulamaz')

    // owner_id server-side (mass-assignment guard); proje_id kurumlar tablosunda yok.
    const { owner_id: _o, proje_id: _p, projeId: _pid, ...safe } = body
    const { data, error } = await supabaseAdmin
      .from('kurumlar')
      .insert([{ ...safe, owner_id: ownerId }])
      .select()
      .single()

    if (error) {
      if (error.code === '23505') throw ApiError.conflict('Bu kurum adı zaten kayıtlı')
      throw error
    }
    return data
  },

  async update(id: string, body: Record<string, any>, projeId: string) {
    const ownerId = await getProjectOwnerId(requireProjeId(projeId))
    if (!ownerId) throw ApiError.notFound('Kurum bulunamadı')

    const { owner_id: _o, proje_id: _p, projeId: _pid, ...safe } = body
    const { data, error } = await supabaseAdmin
      .from('kurumlar')
      .update(safe)
      .eq('id', id)
      .eq('owner_id', ownerId)
      .select()
      .maybeSingle()

    if (error) {
      if (error.code === '23505') throw ApiError.conflict('Bu kurum adı zaten kayıtlı')
      throw error
    }
    if (!data) throw ApiError.notFound('Kurum bulunamadı')
    return data
  },

  async delete(id: string, projeId: string) {
    const ownerId = await getProjectOwnerId(requireProjeId(projeId))
    if (!ownerId) throw ApiError.notFound('Kurum bulunamadı')

    const { data: existing } = await supabaseAdmin
      .from('kurumlar')
      .select('id')
      .eq('id', id)
      .eq('owner_id', ownerId)
      .maybeSingle()
    if (!existing) throw ApiError.notFound('Kurum bulunamadı')

    const { error } = await supabaseAdmin.from('kurumlar').delete().eq('id', id).eq('owner_id', ownerId)
    if (error) throw error
    return { success: true }
  },

  // Kurum cari ekstresi (proje bazlı; firma.getCariEkstre pattern'i).
  async getCariEkstre(kurumId: string, query?: Record<string, any>) {
    const projeId = requireProjeId(query?.proje_id)

    const { data, error } = await supabaseAdmin
      .from('cari_hareketler')
      .select('*, cari_hesaplar!inner(*)')
      .eq('cari_hesaplar.kurum_id', kurumId)
      .eq('proje_id', projeId)
      .order('tarih', { ascending: true })

    if (error) throw error

    let bakiye = 0
    const ekstre = data?.map((hareket) => {
      bakiye += Number(hareket.alacak || 0) - Number(hareket.borc || 0)
      return { ...hareket, bakiye }
    })
    return { hareketler: ekstre, guncel_bakiye: bakiye }
  },

  // Kurum ödemesi: proje_id + kurum_id → kurum cari hesabını çöz, RPC ile gider+ödeme
  // çifti (net-sıfır) oluştur.
  async createPayment(body: Record<string, any>, actorId?: string) {
    const projeId = requireProjeId(body.proje_id)
    const kurumId = body.kurum_id as string

    // Kurum bu projenin owner'ına mı ait? (IDOR guard)
    const ownerId = await getProjectOwnerId(projeId)
    const { data: kurum } = await supabaseAdmin
      .from('kurumlar')
      .select('id, owner_id')
      .eq('id', kurumId)
      .maybeSingle()
    if (!kurum || !ownerId || kurum.owner_id !== ownerId) {
      throw ApiError.notFound('Kurum bulunamadı')
    }

    // Kurum cari hesabını çöz (trigger ile otomatik açılmış olmalı).
    const { data: cari, error: cariErr } = await supabaseAdmin
      .from('cari_hesaplar')
      .select('id')
      .eq('proje_id', projeId)
      .eq('kurum_id', kurumId)
      .maybeSingle()
    if (cariErr) throw cariErr
    if (!cari) throw ApiError.badRequest('Bu projede kurum cari hesabı bulunamadı')

    const { data, error } = await supabaseAdmin.rpc('fn_create_kurum_payment_atomic', {
      p_proje_id: projeId,
      p_kurum_cari_id: cari.id,
      p_tutar: body.tutar,
      p_odeme_turu: body.odeme_turu,
      p_banka_hesap_id: body.banka_hesap_id ?? null,
      p_tarih: body.tarih,
      p_aciklama: body.aciklama ?? null,
      p_actor_id: actorId ?? null,
    })

    if (error) {
      const code = (error as any).code
      const message = (error as any).message ?? 'Kurum ödemesi oluşturulamadı'
      if (code === 'P0001') throw ApiError.badRequest(message)
      logger.error('Kurum ödemesi RPC hatası', { code, message })
      throw error
    }
    return data
  },

  // Kurum ödemesini geri al / sil (hesap kapamayı çöz): gider+ödeme çifti + banka +
  // huzur hakkı (DELETE trigger ile). p_group_id = cari_hareketler.kaynak_id (kurum_odeme).
  async deletePayment(groupId: string, projeId: string, actorId?: string) {
    const safeProjeId = requireProjeId(projeId)

    const { data, error } = await supabaseAdmin.rpc('fn_delete_kurum_payment', {
      p_group_id: groupId,
      p_proje_id: safeProjeId,
      p_actor_id: actorId ?? null,
    })

    if (error) {
      const code = (error as any).code
      const message = (error as any).message ?? 'Kurum ödemesi geri alınamadı'
      if (code === 'P0002') throw ApiError.notFound(message)
      logger.error('Kurum ödemesi silme RPC hatası', { code, message })
      throw error
    }
    return data
  },
}
