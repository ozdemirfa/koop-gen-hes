import { supabaseAdmin } from '../config/supabase'
import { ApiError } from '../utils/ApiError'
import { parsePagination, toSupabaseRange, paginationMeta } from '../utils/pagination'
import logger from '../utils/logger'

export const uyeService = {
  async list(query: Record<string, any>) {
    const pagination = parsePagination(query)
    const { from, to } = toSupabaseRange(pagination)

    logger.info(`Üye listeleme isteği - ProjeID: ${query.proje_id}, Query: ${JSON.stringify(query)}`)

    // !serefiye_id explicitly tells PostgREST to use the serefiye_id FK on the uyeler table
    let selectQuery = '*, serefiye_tablosu!serefiye_id(*, bloklar(blok_adi))'
    
    let q = supabaseAdmin
      .from('uyeler')
      .select(selectQuery, { count: 'exact' })

    const activeProjeId = query.proje_id || query.activeProjectId
    if (activeProjeId && activeProjeId !== 'null' && activeProjeId !== 'undefined') {
      q = q.eq('proje_id', activeProjeId)
    }
    
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

    if (query.search) {
      q = q.or(`ad.ilike.%${query.search}%,soyad.ilike.%${query.search}%,uye_no.ilike.%${query.search}%`)
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

  async getById(id: string) {
    const { data, error } = await supabaseAdmin
      .from('uyeler')
      .select('*, serefiye_tablosu!serefiye_id(*, bloklar(blok_adi))')
      .eq('id', id)
      .single()

    if (error) {
      logger.error(`Üye getirme hatası (ID: ${id}):`, error)
      throw ApiError.notFound('Üye bulunamadı')
    }
    return data
  },

  async create(body: Record<string, any>) {
    // Proje ID'sini gövdeden al ve doğrula
    if (!body.proje_id) {
      throw ApiError.badRequest('proje_id zorunludur')
    }

    const { data, error } = await supabaseAdmin.rpc('fn_create_member_atomic', {
      p_member_data: body
    })

    if (error) {
      logger.error('Üye oluşturma hatası:', error)
      if (error.code === '23505') throw ApiError.conflict('Bu üye no veya TC kimlik zaten kayıtlı')
      throw error
    }

    logger.info(`Yeni üye oluşturuldu: ${data.ad} ${data.soyad} (${data.id})`)
    return data
  },

  async update(id: string, body: Record<string, any>) {
    const { data, error } = await supabaseAdmin.rpc('fn_update_member_atomic', {
      p_member_id: id,
      p_update_data: body
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

  async delete(id: string) {
    const { data, error } = await supabaseAdmin
      .from('uyeler')
      .update({ durum: 'pasif' })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      logger.error(`Üye silme (pasife alma) hatası (ID: ${id}):`, error)
      throw error
    }
    if (!data) throw ApiError.notFound('Üye bulunamadı')
    
    logger.info(`Üye pasif yapıldı: ${id}`)
    return data
  },

  async getAidatlar(uyeId: string, query: Record<string, any>) {
    let q = supabaseAdmin
      .from('aidatlar')
      .select('*, aidat_tanimlari(yil, ay, katsayi_tutari)')
      .eq('uye_id', uyeId)

    if (query.proje_id) q = q.eq('proje_id', query.proje_id)
    if (query.yil) q = q.eq('aidat_tanimlari.yil', query.yil)

    const { data, error } = await q.order('created_at', { ascending: true })
    if (error) {
      logger.error(`Üye aidatları çekme hatası (UyeID: ${uyeId}):`, error)
      throw error
    }
    return data
  },

  async matchPaymentsFIFO(uyeId: string, projeId: string) {
    if (!projeId) throw ApiError.badRequest('proje_id zorunludur')
    
    const { data, error } = await supabaseAdmin.rpc('fn_match_member_payments_fifo', {
      p_proje_id: projeId,
      p_uye_id: uyeId
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

  async update(id: string, body: Record<string, any>) {
    const { data, error } = await supabaseAdmin
      .from('bloklar')
      .update(body)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    if (!data) throw ApiError.notFound('Blok bulunamadı')
    return data
  },

  async delete(id: string) {
    const { error } = await supabaseAdmin
      .from('bloklar')
      .delete()
      .eq('id', id)

    if (error) {
      if (error.code === '23503') throw ApiError.badRequest('Bu bloka atanmış üyeler var, önce üyeleri çıkarın')
      throw error
    }
    logger.info(`Blok silindi: ${id}`)
  }
}
