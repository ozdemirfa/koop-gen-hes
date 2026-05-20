import { supabaseAdmin } from '../config/supabase'
import { ApiError } from '../utils/ApiError'
import { clearProjectAccessCache } from '../middleware/projectAccessCache'
import logger from '../utils/logger'

/**
 * Sprint role-system-modernization (PR-B): Yeni rol modeli — owner/manager/user.
 * Legacy değerler (admin/staff/viewer) tip union'da geriye uyumluluk için kalır
 * ama bu PR'da yeni davet/atama flowları sadece yeni değerleri kabul eder.
 */
export type NewProjectRole = 'owner' | 'manager' | 'user'
export type LegacyProjectRole = 'admin' | 'staff' | 'viewer'
export type ProjectRole = NewProjectRole | LegacyProjectRole

interface ProjeUyeligi {
  user_id: string
  proje_id: string
  rol: ProjectRole
  created_at: string
  email?: string
}

/**
 * Yalnızca yeni model rollerini kabul eden tip-guard. Davet/atama akışları
 * frontend'den 'admin'/'staff'/'viewer' alırsa 400 dönmek için kullanılır.
 */
function assertNewRole(rol: unknown): asserts rol is NewProjectRole {
  if (rol !== 'owner' && rol !== 'manager' && rol !== 'user') {
    throw ApiError.badRequest(`Geçersiz rol: ${rol}. Beklenen: owner/manager/user.`)
  }
}

export const projeUyelikService = {
  /**
   * Bir projenin tüm üyelerini email + rol + tarih ile döndürür.
   */
  async listMembers(projeId: string): Promise<ProjeUyeligi[]> {
    const { data: memberships, error } = await supabaseAdmin
      .from('proje_uyelikleri')
      .select('user_id, proje_id, rol, created_at')
      .eq('proje_id', projeId)
      .order('created_at', { ascending: true })

    if (error) {
      logger.error('[PROJE_UYELIK] list failed', { err: error, projeId })
      throw ApiError.internal('Üye listesi alınamadı')
    }

    if (!memberships || memberships.length === 0) return []

    // Email'leri auth.admin.getUserById ile çek (paralel)
    const enriched = await Promise.all(
      memberships.map(async (m) => {
        const { data } = await supabaseAdmin.auth.admin.getUserById(m.user_id)
        return {
          user_id: m.user_id,
          proje_id: m.proje_id,
          rol: m.rol as ProjectRole,
          created_at: m.created_at,
          email: data?.user?.email,
        }
      })
    )

    return enriched
  },

  /**
   * Yeni üye atar veya mevcut üyenin rolünü değiştirir.
   *
   * Sprint role-system-modernization (PR-B) kuralları:
   *   - rol: yalnızca yeni model değerleri (owner/manager/user) kabul edilir.
   *   - 'owner' rolüyle yeni üye eklenemez (her projede tam 1 owner; owner
   *     transferi henüz desteklenmiyor — manuel SQL gerekir).
   *   - Mevcut bir 'owner' üyesinin rolü asla değiştirilemez (owner transferi
   *     gerekir — bu RPC zaten reddediyor; service tarafında erken 400 döner).
   *   - Caller kendisinin rolünü değiştiremez (controller seviyesinde kontrol
   *     edilir — bu service callerId bilmeyebilir).
   */
  async upsertMember(
    projeId: string,
    userId: string,
    rol: ProjectRole,
    options: { callerId?: string } = {},
  ) {
    // Yeni model değerleri zorla. Eski değerler (admin/staff/viewer) bu PR'dan
    // sonra atama akışlarından kabul edilmez — yalnızca cache geriye uyumluluk
    // için tip union'da tutulur.
    assertNewRole(rol)

    if (options.callerId && options.callerId === userId) {
      throw ApiError.forbidden('Kendi rolünüzü değiştiremezsiniz')
    }

    // Önce auth.users varlığını doğrula
    const { data: userResp, error: userErr } = await supabaseAdmin.auth.admin.getUserById(userId)
    if (userErr || !userResp?.user) {
      throw ApiError.badRequest('Kullanıcı bulunamadı')
    }

    // Hedef üyenin mevcut rolünü oku
    const { data: existing, error: existingErr } = await supabaseAdmin
      .from('proje_uyelikleri')
      .select('rol')
      .eq('user_id', userId)
      .eq('proje_id', projeId)
      .maybeSingle()

    if (existingErr) {
      logger.error('[PROJE_UYELIK] existing lookup failed', { err: existingErr, projeId, userId })
      throw ApiError.internal('Üyelik durumu okunamadı')
    }

    const currentRole = existing?.rol as ProjectRole | undefined

    // Owner'a dokunma kuralları
    if (currentRole === 'owner' && rol !== 'owner') {
      throw ApiError.forbidden(
        'Projenin owner\'ı manager/user yapılamaz — owner transferi gerekir',
      )
    }
    if (rol === 'owner' && currentRole !== 'owner') {
      throw ApiError.forbidden(
        'Yeni owner ataması bu akışta desteklenmiyor (her projede tek owner). Owner transferi için ayrı bir süreç gerekir.',
      )
    }

    const { data, error } = await supabaseAdmin
      .from('proje_uyelikleri')
      .upsert({ user_id: userId, proje_id: projeId, rol }, { onConflict: 'user_id,proje_id' })
      .select()
      .single()

    if (error) {
      logger.error('[PROJE_UYELIK] upsert failed', { err: error, projeId, userId, rol })
      throw ApiError.internal('Üyelik kaydedilemedi')
    }

    clearProjectAccessCache(userId, projeId)
    logger.info(`[PROJE_UYELIK] upsert: user=${userId}, proje=${projeId}, rol=${rol}`)
    return { ...data, email: userResp.user.email }
  },

  /**
   * Üyelikten çıkar.
   *
   * Sprint role-system-modernization (PR-B) kuralları:
   *   - 'owner' rolündeki üye asla silinemez (owner transferi gerekir).
   *   - Caller kendisini silemez (controller seviyesinde callerId geçirilir).
   */
  async removeMember(
    projeId: string,
    userId: string,
    options: { callerId?: string } = {},
  ) {
    if (options.callerId && options.callerId === userId) {
      throw ApiError.forbidden('Kendinizi projeden çıkaramazsınız')
    }

    const { data: existing, error: existingErr } = await supabaseAdmin
      .from('proje_uyelikleri')
      .select('rol')
      .eq('user_id', userId)
      .eq('proje_id', projeId)
      .maybeSingle()

    if (existingErr) {
      logger.error('[PROJE_UYELIK] existing lookup failed', { err: existingErr, projeId, userId })
      throw ApiError.internal('Üyelik durumu okunamadı')
    }

    if (existing?.rol === 'owner') {
      throw ApiError.forbidden(
        'Owner projeden çıkarılamaz — owner transferi gerekir',
      )
    }

    const { error } = await supabaseAdmin
      .from('proje_uyelikleri')
      .delete()
      .eq('user_id', userId)
      .eq('proje_id', projeId)

    if (error) {
      logger.error('[PROJE_UYELIK] delete failed', { err: error, projeId, userId })
      throw ApiError.internal('Üyelik silinemedi')
    }

    clearProjectAccessCache(userId, projeId)
    logger.info(`[PROJE_UYELIK] removed: user=${userId}, proje=${projeId}`)
    return { success: true }
  },

  /**
   * Kullanıcının verilen projedeki rolünü döner (yoksa null).
   * Frontend'in /api/projeler/:id/me endpoint'i için kullanılır.
   */
  async getMyRole(userId: string, projeId: string): Promise<ProjectRole | null> {
    const { data, error } = await supabaseAdmin
      .from('proje_uyelikleri')
      .select('rol')
      .eq('user_id', userId)
      .eq('proje_id', projeId)
      .maybeSingle()

    if (error) {
      logger.error('[PROJE_UYELIK] getMyRole failed', { err: error, userId, projeId })
      return null
    }
    return (data?.rol ?? null) as ProjectRole | null
  },
}
