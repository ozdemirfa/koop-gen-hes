import { supabaseAdmin } from '../config/supabase'
import { ApiError } from '../utils/ApiError'
import logger from '../utils/logger'
import crypto from 'crypto'

/**
 * Sprint role-system-modernization (PR-D, 2026-05-20):
 * Owner-only şifre yenileme akışı.
 *
 * Kural seti:
 *   - Caller (request sahibi) hedef projede 'owner' olmalı — guard
 *     `requireProjectAccess('owner')` route'da uygulanır.
 *   - Target kullanıcı hedef projenin üyesi olmalı (manager veya user).
 *   - Target owner olamaz (owner kendi şifresini /sifre-degistir veya PR-E e-mail
 *     reset ile değiştirir — başka bir owner tarafından sıfırlanamaz).
 *   - Caller kendisini bu endpoint ile sıfırlayamaz (controller seviyesinde
 *     callerId geçirilir).
 *   - Yeni şifre verilmezse 16 karakter random şifre üretilir; çağıran kopyalar.
 *   - Şifre min 8 karakter, max 72 karakter (Supabase Auth limiti) kontrolü.
 *
 * Audit: logger.info ile kaydedilir (sistem_audit_log tablosu henüz yok;
 * mevcut admin.service ile aynı pattern).
 */

const MIN_PASSWORD_LENGTH = 8
const MAX_PASSWORD_LENGTH = 72

/**
 * Cryptographically secure 16 karakter şifre üret.
 * Karakter seti: a-zA-Z0-9 + sembol → 72 char alphabet (URL-safe sınırlı set).
 * 16 char * log2(72) ≈ 98.7 bit entropy.
 */
function generatePassword(length = 16): string {
  const alphabet =
    'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*?'
  const bytes = crypto.randomBytes(length)
  let result = ''
  for (let i = 0; i < length; i++) {
    result += alphabet[bytes[i] % alphabet.length]
  }
  return result
}

export interface ResetPasswordInput {
  /** Hedef kullanıcının auth.users.id'si (URL :userId param'ından). */
  userId: string
  /** Hangi projede üyelik kontrolü yapılacak (body'den, requireProjectAccess
   *  ile aynı projeId). */
  projeId: string
  /** Caller (owner) — auth middleware'dan gelir. */
  callerId: string
  /** Opsiyonel yeni şifre. Yoksa otomatik üretilir. */
  newPassword?: string
}

export interface ResetPasswordResult {
  userId: string
  email: string
  /** Üretilmiş veya verilmiş şifre — frontend kullanıcıya gösterir, sonra
   *  bellekten temizler. Backend bunu hiçbir yerde persist etmez. */
  password: string
  /** newPassword sağlanmadıysa true. */
  generated: boolean
}

export const passwordResetService = {
  async resetUserPassword(input: ResetPasswordInput): Promise<ResetPasswordResult> {
    const { userId, projeId, callerId, newPassword } = input

    if (userId === callerId) {
      throw ApiError.forbidden(
        'Kendi şifrenizi bu akışla sıfırlayamazsınız — Ayarlar > Şifre Değiştir kullanın',
      )
    }

    // Hedef üyenin proje rolü
    const { data: membership, error: memErr } = await supabaseAdmin
      .from('proje_uyelikleri')
      .select('rol')
      .eq('user_id', userId)
      .eq('proje_id', projeId)
      .maybeSingle()

    if (memErr) {
      logger.error('[PASSWORD_RESET] membership lookup failed', {
        err: memErr,
        userId,
        projeId,
      })
      throw ApiError.internal('Üyelik durumu okunamadı')
    }

    if (!membership) {
      throw ApiError.badRequest(
        'Hedef kullanıcı bu projenin üyesi değil — sadece proje üyelerinin şifresi sıfırlanabilir',
      )
    }

    if (membership.rol === 'owner') {
      throw ApiError.forbidden(
        'Owner rolündeki bir kullanıcının şifresi başkası tarafından sıfırlanamaz',
      )
    }

    // Şifre belirle
    let password: string
    let generated: boolean
    if (newPassword && newPassword.length > 0) {
      if (newPassword.length < MIN_PASSWORD_LENGTH) {
        throw ApiError.badRequest(
          `Şifre en az ${MIN_PASSWORD_LENGTH} karakter olmalı`,
        )
      }
      if (newPassword.length > MAX_PASSWORD_LENGTH) {
        throw ApiError.badRequest(
          `Şifre en fazla ${MAX_PASSWORD_LENGTH} karakter olabilir`,
        )
      }
      password = newPassword
      generated = false
    } else {
      password = generatePassword(16)
      generated = true
    }

    // Hedef kullanıcının email'ini al (audit + response için)
    const { data: userResp, error: userErr } = await supabaseAdmin.auth.admin.getUserById(userId)
    if (userErr || !userResp?.user) {
      logger.error('[PASSWORD_RESET] target user lookup failed', { err: userErr, userId })
      throw ApiError.badRequest('Hedef kullanıcı bulunamadı')
    }

    const targetEmail = userResp.user.email ?? ''

    // Supabase Auth Admin API ile şifreyi güncelle
    const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(userId, { password })
    if (updErr) {
      logger.error('[PASSWORD_RESET] updateUserById failed', {
        err: updErr,
        userId,
      })
      throw ApiError.internal(`Şifre güncellenemedi: ${updErr.message}`)
    }

    // Audit log (logger.info — sistem_audit_log tablosu PR-E'de eklenir)
    logger.info(
      `[PASSWORD_RESET] owner ${callerId} reset password for ${userId} (${targetEmail}) in proje=${projeId}, generated=${generated}`,
    )

    return {
      userId,
      email: targetEmail,
      password,
      generated,
    }
  },
}
