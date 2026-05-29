import { supabaseAdmin } from '../config/supabase'
import { ApiError } from '../utils/ApiError'
import logger from '../utils/logger'
import { getUserRole } from '../middleware/roleCache'

// Sprint birim-poz-user-scope (2026-05-27):
//   birimler ve pozlar hibrit model:
//     kullanici_id NULL → global (admin/yetkili/manager ekledi, herkes görür)
//     kullanici_id = req.user.id → kişisel (sadece sahibi görür)
//
//   supabaseAdmin RLS bypass eder — visibility ve ownership filtresi service
//   katmanında manuel uygulanır:
//     - getXxx(userId)   : kullanici_id IS NULL OR kullanici_id = userId
//     - createXxx(body, userId) : is_global=true → NULL (yetki middleware), aksi → userId
//     - deleteXxx(id, userId, isAdmin) : admin VEYA sahibi
//     - updateXxx(id, body, userId, isAdmin) : admin VEYA sahibi; kullanici_id readonly

interface SettingsContext {
  userId: string
  isAdmin: boolean
}

async function assertOwnershipOrAdmin(
  table: 'birimler' | 'pozlar',
  id: string,
  ctx: SettingsContext
): Promise<{ kullanici_id: string | null }> {
  const { data, error } = await supabaseAdmin
    .from(table)
    .select('kullanici_id')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    logger.error(`[settings] ${table} ownership lookup error`, { id, code: error.code, message: error.message })
    throw error
  }
  if (!data) {
    throw ApiError.notFound('Kayıt bulunamadı')
  }

  // Admin geçer; non-admin sadece kendi (kullanici_id) kayıtlarını düzenleyebilir/silebilir
  if (!ctx.isAdmin && data.kullanici_id !== ctx.userId) {
    throw ApiError.forbidden(
      'Bu kayıt başka bir kullanıcıya ait veya global referans — yalnız sistem admin değiştirebilir'
    )
  }
  return data as { kullanici_id: string | null }
}

export const settingsService = {
  // ---------------------------------------------------------------
  // Birimler
  // ---------------------------------------------------------------
  async getBirimler(userId: string) {
    // Hibrit: global (NULL) + kullanıcının kendi kayıtları
    const { data, error } = await supabaseAdmin
      .from('birimler')
      .select('*')
      .or(`kullanici_id.is.null,kullanici_id.eq.${userId}`)
      .order('kullanici_id', { ascending: true, nullsFirst: true })
      .order('ad', { ascending: true })
    if (error) {
      logger.error('Birim listeleme hatası:', error)
      throw error
    }
    return data
  },

  async createBirim(body: any, ctx: SettingsContext) {
    // proje_id eski legacy alanı — strip
    const { proje_id, is_global, kullanici_id: _ignored, ...rest } = body
    const kullanici_id = is_global === true ? null : ctx.userId

    const { data, error } = await supabaseAdmin
      .from('birimler')
      .insert([{ ...rest, kullanici_id }])
      .select()

    if (error) {
      logger.error('Birim oluşturma hatası:', error)
      if (error.code === '23505') throw ApiError.conflict('Bu birim zaten kayıtlı')
      throw error
    }
    return data ? data[0] : null
  },

  async deleteBirim(id: string, ctx: SettingsContext) {
    await assertOwnershipOrAdmin('birimler', id, ctx)
    const { error } = await supabaseAdmin
      .from('birimler')
      .delete()
      .eq('id', id)
    if (error) {
      if (error.code === '23503') throw ApiError.badRequest('Bu birime bağlı pozlar veya iş kalemleri var, silemezsiniz.')
      throw error
    }
  },

  // ---------------------------------------------------------------
  // Pozlar
  // ---------------------------------------------------------------
  async getPozlar(userId: string) {
    const { data, error } = await supabaseAdmin
      .from('pozlar')
      .select('*, birimler(ad)')
      .or(`kullanici_id.is.null,kullanici_id.eq.${userId}`)
      .order('kullanici_id', { ascending: true, nullsFirst: true })
      .order('poz_no', { ascending: true })
    if (error) throw error
    return data
  },

  async createPoz(body: any, ctx: SettingsContext) {
    const { proje_id, is_global, kullanici_id: _ignored, ...rest } = body
    const kullanici_id = is_global === true ? null : ctx.userId

    const { data, error } = await supabaseAdmin
      .from('pozlar')
      .insert([{ ...rest, kullanici_id }])
      .select('*, birimler(ad)')

    if (error) {
      logger.error('Poz oluşturma hatası:', error)
      if (error.code === '23505') throw ApiError.conflict('Bu poz no zaten kayıtlı')
      throw error
    }
    return data ? data[0] : null
  },

  async updatePoz(id: string, body: any, ctx: SettingsContext) {
    await assertOwnershipOrAdmin('pozlar', id, ctx)
    // kullanici_id readonly — transfer'e izin verilmez
    const { kullanici_id: _drop, is_global: _drop2, proje_id: _drop3, ...cleanBody } = body
    const { data, error } = await supabaseAdmin
      .from('pozlar')
      .update(cleanBody)
      .eq('id', id)
      .select('*, birimler(ad)')
      .single()
    if (error) throw error
    return data
  },

  async deletePoz(id: string, ctx: SettingsContext) {
    await assertOwnershipOrAdmin('pozlar', id, ctx)
    const { error } = await supabaseAdmin
      .from('pozlar')
      .delete()
      .eq('id', id)
    if (error) throw error
  },
}

// Yardımcı: controller'dan SettingsContext kurar (role lookup cache hit eder)
export async function buildSettingsContext(userId: string): Promise<SettingsContext> {
  const role = await getUserRole(userId).catch(() => null)
  return { userId, isAdmin: role === 'admin' }
}
