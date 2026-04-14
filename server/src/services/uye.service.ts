import { supabaseAdmin } from '../config/supabase'
import { ApiError } from '../utils/ApiError'
import { parsePagination, toSupabaseRange, paginationMeta } from '../utils/pagination'
import logger from '../utils/logger'

export const uyeService = {
  async list(query: Record<string, any>) {
    const pagination = parsePagination(query)
    const { from, to } = toSupabaseRange(pagination)

    let q = supabaseAdmin
      .from('uyeler')
      .select('*, bloklar(blok_adi)', { count: 'exact' })

    if (query.durum) q = q.eq('durum', query.durum)
    if (query.blok_id) q = q.eq('blok_id', query.blok_id)
    if (query.search) {
      q = q.or(`ad.ilike.%${query.search}%,soyad.ilike.%${query.search}%,uye_no.ilike.%${query.search}%`)
    }

    const { data, error, count } = await q
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
      .select('*, bloklar(blok_adi)')
      .eq('id', id)
      .single()

    if (error) {
      logger.error(`Üye getirme hatası (ID: ${id}):`, error)
      throw ApiError.notFound('Üye bulunamadı')
    }
    return data
  },

  async create(body: Record<string, any>) {
    const { data, error } = await supabaseAdmin
      .from('uyeler')
      .insert([body])
      .select('*, bloklar(blok_adi)')
      .single()

    if (error) {
      logger.error('Üye oluşturma hatası:', error)
      if (error.code === '23505') throw ApiError.conflict('Bu üye no veya TC kimlik zaten kayıtlı')
      throw error
    }

    // Eğer bir daire atandıysa şerefiye tablosunu güncelle
    if (data.serefiye_id && data.durum === 'aktif') {
      const { error: sError } = await supabaseAdmin
        .from('serefiye_tablosu')
        .update({ durum: 'dolu' })
        .eq('id', data.serefiye_id)
      
      if (sError) logger.error('Şerefiye güncelleme hatası:', sError)
    }

    logger.info(`Yeni üye oluşturuldu: ${data.ad} ${data.soyad} (${data.id})`)
    return data
  },

  async update(id: string, body: Record<string, any>) {
    // Mevcut üyeyi al (önceki serefiye_id'yi kontrol etmek için)
    const { data: oldUye } = await supabaseAdmin
      .from('uyeler')
      .select('serefiye_id, durum')
      .eq('id', id)
      .single()

    const { data, error } = await supabaseAdmin
      .from('uyeler')
      .update(body)
      .eq('id', id)
      .select('*, bloklar(blok_adi)')
      .single()

    if (error) {
      logger.error(`Üye güncelleme hatası (ID: ${id}):`, error)
      if (error.code === '23505') throw ApiError.conflict('Bu üye no veya TC kimlik zaten kayıtlı')
      throw error
    }
    if (!data) throw ApiError.notFound('Üye bulunamadı')

    // Şerefiye durumu güncelleme mantığı
    if (oldUye && oldUye.serefiye_id !== data.serefiye_id) {
      // Eski daireyi boşalt
      if (oldUye.serefiye_id) {
        await supabaseAdmin
          .from('serefiye_tablosu')
          .update({ durum: 'bos' })
          .eq('id', oldUye.serefiye_id)
      }
      // Yeni daireyi doldur
      if (data.serefiye_id && data.durum === 'aktif') {
        await supabaseAdmin
          .from('serefiye_tablosu')
          .update({ durum: 'dolu' })
          .eq('id', data.serefiye_id)
      }
    } else if (oldUye && oldUye.serefiye_id && oldUye.durum !== data.durum) {
      if (data.durum === 'aktif') {
        await supabaseAdmin.from('serefiye_tablosu').update({ durum: 'dolu' }).eq('id', data.serefiye_id)
      } else {
        await supabaseAdmin.from('serefiye_tablosu').update({ durum: 'bos' }).eq('id', data.serefiye_id)
      }
    }

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
      .select('*, aidat_tanimlari(yil, ay, tutar)')
      .eq('uye_id', uyeId)

    if (query.yil) q = q.eq('aidat_tanimlari.yil', query.yil)

    const { data, error } = await q.order('created_at', { ascending: false })
    if (error) {
      logger.error(`Üye aidatları çekme hatası (UyeID: ${uyeId}):`, error)
      throw error
    }
    return data
  }
}

export const blokService = {
  async list() {
    const { data, error } = await supabaseAdmin
      .from('bloklar')
      .select('*')
      .order('blok_adi')

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
