import { supabaseAdmin } from '../config/supabase'
import { ApiError } from '../utils/ApiError'
import { clearProjectAccessCache } from '../middleware/projectAccessCache'
import logger from '../utils/logger'

export type ProjectRole = 'admin' | 'staff' | 'viewer'

interface ProjeUyeligi {
  user_id: string
  proje_id: string
  rol: ProjectRole
  created_at: string
  email?: string
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
   * Üye ekle veya rolünü güncelle.
   */
  async upsertMember(projeId: string, userId: string, rol: ProjectRole) {
    // Önce auth.users varlığını doğrula
    const { data: userResp, error: userErr } = await supabaseAdmin.auth.admin.getUserById(userId)
    if (userErr || !userResp?.user) {
      throw ApiError.badRequest('Kullanıcı bulunamadı')
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
   */
  async removeMember(projeId: string, userId: string) {
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
