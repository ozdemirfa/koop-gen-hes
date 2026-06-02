import { supabaseAdmin } from '../config/supabase'
import { ApiError } from '../utils/ApiError'
import { parsePagination, toSupabaseRange, paginationMeta } from '../utils/pagination'
import { requireProjeId, sanitizeSearchInput } from '../utils/projectGuard'
import logger from '../utils/logger'

export const uyeService = {
  async list(query: Record<string, any>) {
    const pagination = parsePagination(query)
    const { from, to } = toSupabaseRange(pagination)

    // proje_id zorunludur — service-role RLS bypass ettiğinden filtre uygulanmazsa
    // tüm projelerin verisi sızar. Cross-project leak'i önlemek için her zaman
    // bir proje kapsamı şart (admin bypass'ı gerekirse caller layer'da çözülmeli).
    const activeProjeId = requireProjeId(query.proje_id || query.activeProjectId)

    logger.info(`Üye listeleme isteği - ProjeID: ${activeProjeId}, Query: ${JSON.stringify(query)}`)

    // !serefiye_id explicitly tells PostgREST to use the serefiye_id FK on the uyeler table
    let selectQuery = '*, serefiye_tablosu!serefiye_id(*, bloklar(blok_adi))'

    let q = supabaseAdmin
      .from('uyeler')
      .select(selectQuery, { count: 'exact' })
      .eq('proje_id', activeProjeId)
    
    if (query.durum) q = q.eq('durum', query.durum)
    
    // Blok bazlı filtreleme
    if (query.blok_id) {
      // Filter on joined table
      q = q.eq('serefiye_tablosu.blok_id', query.blok_id)
      // To ensure parent records are filtered out if join is empty or mismatched, 
      // we might need !inner but PostgREST behavior varies by version.
    }
    
    // Daire atama durumuna göre filtreleme
    if (query.has_daire === 'false') {
      q = q.is('serefiye_id', null)
    } else if (query.has_daire === 'true') {
      q = q.not('serefiye_id', 'is', null)
    }

    // Sprint security-quality-audit (2026-05-26):
    // User input PostgREST OR string'ine doğrudan gömülemez — `,` `%` `*` gibi
    // karakterler delimiter/wildcard işlevi görüp pattern'i bozar veya geniş
    // eşleşme üretir. sanitizeSearchInput tehlikeli karakterleri strip eder.
    if (query.search) {
      const safe = sanitizeSearchInput(query.search)
      if (safe) {
        q = q.or(`ad.ilike.%${safe}%,soyad.ilike.%${safe}%,uye_no.ilike.%${safe}%`)
      }
    }

    const { data, error, count } = await q
      .order('durum', { ascending: true })
      .order('created_at', { ascending: false })
      .range(from, to)

    if (error) {
      logger.error('Üye listeleme hatası:', error)
      throw error
    }
    return { data, pagination: paginationMeta(pagination, count || 0) }
  },

  // IDOR fix (security-quality-sprint, 2026-05-26):
  //   getById/delete/getAidatlar zorunlu projeId + .eq('proje_id', projeId).
  async getById(id: string, projeId: string) {
    const safeProjeId = requireProjeId(projeId)
    const { data, error } = await supabaseAdmin
      .from('uyeler')
      .select('*, serefiye_tablosu!serefiye_id(*, bloklar(blok_adi))')
      .eq('id', id)
      .eq('proje_id', safeProjeId)
      .maybeSingle()

    if (error) {
      logger.error(`Üye getirme hatası (ID: ${id}):`, error)
      throw error
    }
    if (!data) throw ApiError.notFound('Üye bulunamadı')
    return data
  },

  async create(body: Record<string, any>, actorId?: string) {
    // Proje ID'sini gövdeden al ve doğrula
    if (!body.proje_id) {
      throw ApiError.badRequest('proje_id zorunludur')
    }

    const { data, error } = await supabaseAdmin.rpc('fn_create_member_atomic', {
      p_member_data: body,
      p_actor_id: actorId ?? null
    })

    if (error) {
      logger.error('Üye oluşturma hatası:', error)
      if (error.code === '23505') throw ApiError.conflict('Bu üye no veya TC kimlik zaten kayıtlı')
      throw error
    }

    logger.info(`Yeni üye oluşturuldu: ${data.ad} ${data.soyad} (${data.id})`)
    return data
  },

  // IDOR fix (SEC-2, 2026-06-02): zorunlu projeId — RPC proje_id guard'lar.
  //   Yabancı/yanlış proje → RPC NULL döner → 404. service-role RLS bypass
  //   ettiğinden bu kontrol şart (aksi halde başka projenin üyesi güncellenebilir).
  async update(id: string, body: Record<string, any>, projeId: string, actorId?: string) {
    const safeProjeId = requireProjeId(projeId)
    const { data, error } = await supabaseAdmin.rpc('fn_update_member_atomic', {
      p_member_id: id,
      p_proje_id: safeProjeId,
      p_update_data: body,
      p_actor_id: actorId ?? null
    })

    if (error) {
      logger.error(`Üye güncelleme hatası (ID: ${id}):`, error)
      if (error.code === '23505') throw ApiError.conflict('Bu üye no veya TC kimlik zaten kayıtlı')
      throw error
    }
    if (!data) throw ApiError.notFound('Üye bulunamadı')

    logger.info(`Üye güncellendi: ${id}`)
    return data
  },

  async delete(id: string, projeId: string) {
    const safeProjeId = requireProjeId(projeId)
    const { data, error } = await supabaseAdmin
      .from('uyeler')
      .update({ durum: 'pasif' })
      .eq('id', id)
      .eq('proje_id', safeProjeId)
      .select()
      .maybeSingle()

    if (error) {
      logger.error(`Üye silme (pasife alma) hatası (ID: ${id}):`, error)
      throw error
    }
    if (!data) throw ApiError.notFound('Üye bulunamadı')

    logger.info(`Üye pasif yapıldı: ${id}`)
    return data
  },

  async getAidatlar(uyeId: string, query: Record<string, any>) {
    // IDOR: proje_id zorunlu — aksi takdirde başka projedeki üye aidatları sızar.
    const projeId = requireProjeId(query.proje_id)

    let q = supabaseAdmin
      .from('aidatlar')
      .select('*, aidat_tanimlari(yil, ay, katsayi_tutari)')
      .eq('uye_id', uyeId)
      .eq('proje_id', projeId)

    if (query.yil) q = q.eq('aidat_tanimlari.yil', query.yil)

    const { data, error } = await q.order('created_at', { ascending: true })
    if (error) {
      logger.error(`Üye aidatları çekme hatası (UyeID: ${uyeId}):`, error)
      throw error
    }
    return data
  },

  async matchPaymentsFIFO(uyeId: string, projeId: string, actorId?: string) {
    if (!projeId) throw ApiError.badRequest('proje_id zorunludur')

    const { data, error } = await supabaseAdmin.rpc('fn_match_member_payments_fifo', {
      p_proje_id: projeId,
      p_uye_id: uyeId,
      p_actor_id: actorId ?? null
    })

    if (error) {
      logger.error(`FIFO eşleştirme hatası (UyeID: ${uyeId}, ProjeID: ${projeId}):`, error)
      throw error
    }

    return data
  }
}

export const blokService = {
  async list(query?: Record<string, any>) {
    let q = supabaseAdmin
      .from('bloklar')
      .select('*')

    if (query?.proje_id) q = q.eq('proje_id', query.proje_id)

    const { data, error } = await q.order('blok_adi')

    if (error) throw error
    return data
  },

  async create(body: Record<string, any>) {
    const { data, error } = await supabaseAdmin
      .from('bloklar')
      .insert([body])
      .select()
      .single()

    if (error) throw error
    logger.info(`Yeni blok oluşturuldu: ${data.blok_adi}`)
    return data
  },

  // IDOR fix (security-quality-sprint, 2026-05-26):
  //   blokService.update/delete zorunlu projeId + .eq('proje_id', projeId).
  //   body içinde proje_id silinir (mass-assignment: cross-project taşıma yasak).
  async update(id: string, body: Record<string, any>, projeId: string) {
    const safeProjeId = requireProjeId(projeId)
    const sanitized = { ...body }
    delete sanitized.proje_id
    delete sanitized.projeId

    const { data, error } = await supabaseAdmin
      .from('bloklar')
      .update(sanitized)
      .eq('id', id)
      .eq('proje_id', safeProjeId)
      .select()
      .maybeSingle()

    if (error) throw error
    if (!data) throw ApiError.notFound('Blok bulunamadı')
    return data
  },

  async delete(id: string, projeId: string) {
    const safeProjeId = requireProjeId(projeId)

    // IDOR pre-check
    const { data: existing, error: lookupErr } = await supabaseAdmin
      .from('bloklar')
      .select('id')
      .eq('id', id)
      .eq('proje_id', safeProjeId)
      .maybeSingle()
    if (lookupErr) throw lookupErr
    if (!existing) throw ApiError.notFound('Blok bulunamadı')

    const { error } = await supabaseAdmin
      .from('bloklar')
      .delete()
      .eq('id', id)
      .eq('proje_id', safeProjeId)

    if (error) {
      if (error.code === '23503') throw ApiError.badRequest('Bu bloka atanmış üyeler var, önce üyeleri çıkarın')
      throw error
    }
    logger.info(`Blok silindi: ${id}`)
  }
}
