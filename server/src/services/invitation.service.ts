/**
 * Davet servisi — davet akışı yeniden tasarımı.
 *
 * Spec: docs/superpowers/specs/2026-05-21-invitation-flow-design.md
 *
 * İki akış:
 *   1. Yeni kullanıcı (token + Argon2-hashed OTP)
 *   2. Kayıtlı kullanıcı (banner ile in-app kabul/red)
 *
 * Pending durum proje_uyelikleri'ne yansımaz; mevcut RLS (is_project_member)
 * pending kullanıcıyı otomatik olarak engelliyor.
 */

import { supabaseAdmin } from '../config/supabase'
import { ApiError } from '../utils/ApiError'
import logger from '../utils/logger'
import { mailer } from './mailer.service'
import { clearProjectAccessCache } from '../middleware/projectAccessCache'
import {
  generateInviteToken,
  generateOtpCode,
  hashOtp,
  verifyOtp,
} from './invitation.helpers'

const TTL_DAYS = 7
const MAX_ATTEMPTS = 5
const APP_PUBLIC_URL = (process.env.APP_PUBLIC_URL ?? '').replace(/\/$/, '')

interface CreateInvitationInput {
  projeId: string
  email: string
  invitedRole: 'manager' | 'user'
  invitedBy: string
  invitedByName: string
}

interface InvitationRow {
  id: string
  proje_id: string
  email: string
  user_id: string | null
  invited_role: 'manager' | 'user'
  invited_by: string | null
  token: string | null
  otp_hash: string | null
  attempt_count: number
  status: 'pending' | 'accepted' | 'rejected' | 'expired'
  expires_at: string
  accepted_at: string | null
  rejected_at: string | null
  created_at: string
  updated_at: string
}

async function findUserByEmail(email: string): Promise<{ id: string; email: string } | null> {
  // Mevcut admin.service.ts ile aynı pattern; production'da kullanıcı sayısı
  // 1000'i aşarsa pagination loop veya Supabase getUserByEmail kullanılmalı.
  const { data, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 })
  if (error) {
    logger.error('[INVITATION] listUsers failed', { err: error })
    throw ApiError.internal('Kullanıcı aramada hata')
  }
  const found = data?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase())
  return found ? { id: found.id, email: found.email ?? email } : null
}

async function findProjeAdi(projeId: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from('projeler')
    .select('proje_adi')
    .eq('id', projeId)
    .single()
  if (error || !data) {
    throw ApiError.notFound('Proje bulunamadı')
  }
  return (data as { proje_adi: string }).proje_adi
}

export const invitationService = {
  async createInvitation(input: CreateInvitationInput) {
    const projeAdi = await findProjeAdi(input.projeId)

    // Zaten pending davet var mı?
    const { data: existing } = await supabaseAdmin
      .from('invitations')
      .select('id')
      .eq('proje_id', input.projeId)
      .eq('email', input.email)
      .eq('status', 'pending')
      .maybeSingle()
    if (existing) {
      throw ApiError.conflict('Bu e-mail için bekleyen davet var')
    }

    const existingUser = await findUserByEmail(input.email)
    const isNewUser = !existingUser
    const expiresAt = new Date(Date.now() + TTL_DAYS * 24 * 60 * 60 * 1000)

    let token: string | null = null
    let otpHash: string | null = null
    let otpPlain: string | null = null

    if (isNewUser) {
      token = generateInviteToken()
      otpPlain = generateOtpCode()
      otpHash = await hashOtp(otpPlain)
    }

    const { data: inserted, error: insErr } = await supabaseAdmin
      .from('invitations')
      .insert({
        proje_id: input.projeId,
        email: input.email,
        user_id: existingUser?.id ?? null,
        invited_role: input.invitedRole,
        invited_by: input.invitedBy,
        token,
        otp_hash: otpHash,
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single<InvitationRow>()
    if (insErr || !inserted) {
      logger.error('[INVITATION] insert failed', { err: insErr })
      throw ApiError.internal('Davet oluşturulamadı')
    }

    let mailSent = true
    let mailError: string | undefined
    try {
      if (isNewUser) {
        if (!token || !otpPlain) {
          throw new Error('token/otp generation race')
        }
        await mailer.sendNewUserInvite({
          to: input.email,
          projeAdi,
          inviterName: input.invitedByName,
          role: input.invitedRole,
          acceptUrl: `${APP_PUBLIC_URL}/davet-kabul/${token}`,
          otpCode: otpPlain,
          expiresAt,
        })
      } else {
        await mailer.sendExistingUserInvite({
          to: input.email,
          projeAdi,
          inviterName: input.invitedByName,
          role: input.invitedRole,
          loginUrl: `${APP_PUBLIC_URL}/login`,
          expiresAt,
        })
      }
    } catch (mailErr) {
      // Mail başarısız ise davet row'u korunur (owner Bekleyen Davetler sekmesinde
      // görebilir, "Tekrar Davet Et" ile yeniden tetikleyebilir). Audit'te kalır.
      // mailSent=false response'la UI'a iletilir; owner şeffaf şekilde uyarılır.
      mailSent = false
      mailError = mailErr instanceof Error ? mailErr.message : 'Mail gönderilemedi'
      logger.error('[INVITATION] mail send failed (invitation kept)', { err: mailErr })
    }

    logger.info(
      `[INVITATION] created id=${inserted.id} proje=${input.projeId} email=${input.email} isNew=${isNewUser} mailSent=${mailSent}`,
    )

    return {
      id: inserted.id,
      projeId: inserted.proje_id,
      email: inserted.email,
      isNewUser,
      expiresAt: inserted.expires_at,
      mailSent,
      mailError,
    }
  },

  async acceptInvitationByToken(token: string, otp: string, password: string) {
    const { data: inv, error: selErr } = await supabaseAdmin
      .from('invitations')
      .select('*')
      .eq('token', token)
      .maybeSingle<InvitationRow>()
    if (selErr) {
      logger.error('[INVITATION] accept-by-token select error', { err: selErr })
      throw ApiError.internal('Davet aranırken hata')
    }
    if (!inv) {
      throw ApiError.badRequest('Davet bulunamadı')
    }
    if (inv.status !== 'pending') {
      throw ApiError.badRequest('Davet artık geçerli değil')
    }
    if (new Date(inv.expires_at).getTime() < Date.now()) {
      await supabaseAdmin
        .from('invitations')
        .update({ status: 'expired' })
        .eq('id', inv.id)
      throw ApiError.badRequest('Davetin süresi dolmuş')
    }
    if (inv.attempt_count >= MAX_ATTEMPTS) {
      throw ApiError.badRequest('Çok fazla yanlış deneme; yeni davet gerekir')
    }
    if (!inv.otp_hash) {
      throw ApiError.badRequest('Davet OTP içermiyor (kayıtlı kullanıcı akışı)')
    }

    const otpOk = await verifyOtp(inv.otp_hash, otp)
    if (!otpOk) {
      const newCount = inv.attempt_count + 1
      const newStatus: InvitationRow['status'] = newCount >= MAX_ATTEMPTS ? 'expired' : 'pending'
      await supabaseAdmin
        .from('invitations')
        .update({ attempt_count: newCount, status: newStatus })
        .eq('id', inv.id)
      const remaining = Math.max(0, MAX_ATTEMPTS - newCount)
      if (newStatus === 'expired') {
        throw ApiError.badRequest('Çok fazla yanlış deneme; yeni davet gerekir')
      }
      throw ApiError.badRequest(`Kod yanlış. ${remaining} deneme hakkınız kaldı`)
    }

    // OTP doğru → kullanıcı yarat ve üyelik aç
    const { data: created, error: cuErr } = await supabaseAdmin.auth.admin.createUser({
      email: inv.email,
      password,
      email_confirm: true,
    })
    if (cuErr || !created?.user) {
      logger.error('[INVITATION] createUser failed', { err: cuErr, email: inv.email })
      throw ApiError.internal('Kullanıcı oluşturulamadı')
    }
    const userId = created.user.id

    const { error: memErr } = await supabaseAdmin
      .from('proje_uyelikleri')
      .upsert(
        { user_id: userId, proje_id: inv.proje_id, rol: inv.invited_role },
        { onConflict: 'user_id,proje_id' },
      )
    if (memErr) {
      logger.error('[INVITATION] proje_uyelikleri upsert failed', { err: memErr, userId })
      // Cleanup: yeni yaratılan kullanıcıyı sil (idempotent değilse manual review)
      await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => undefined)
      throw ApiError.internal('Üyelik açılamadı')
    }
    clearProjectAccessCache(userId, inv.proje_id)

    await supabaseAdmin
      .from('invitations')
      .update({
        status: 'accepted',
        accepted_at: new Date().toISOString(),
        user_id: userId,
      })
      .eq('id', inv.id)

    logger.info(`[INVITATION] accepted by-token id=${inv.id} user=${userId}`)

    return {
      email: inv.email,
      projeId: inv.proje_id,
    }
  },

  async acceptInvitationById(invitationId: string, userId: string) {
    const { data: inv, error: selErr } = await supabaseAdmin
      .from('invitations')
      .select('*')
      .eq('id', invitationId)
      .eq('user_id', userId)
      .eq('status', 'pending')
      .maybeSingle<InvitationRow>()
    if (selErr) throw ApiError.internal('Davet aranırken hata')
    if (!inv) throw ApiError.notFound('Davet bulunamadı veya artık geçerli değil')

    if (new Date(inv.expires_at).getTime() < Date.now()) {
      await supabaseAdmin.from('invitations').update({ status: 'expired' }).eq('id', inv.id)
      throw ApiError.badRequest('Davetin süresi dolmuş')
    }

    const { error: memErr } = await supabaseAdmin
      .from('proje_uyelikleri')
      .upsert(
        { user_id: userId, proje_id: inv.proje_id, rol: inv.invited_role },
        { onConflict: 'user_id,proje_id' },
      )
    if (memErr) {
      logger.error('[INVITATION] accept-by-id membership failed', { err: memErr })
      throw ApiError.internal('Üyelik açılamadı')
    }
    clearProjectAccessCache(userId, inv.proje_id)

    await supabaseAdmin
      .from('invitations')
      .update({ status: 'accepted', accepted_at: new Date().toISOString() })
      .eq('id', inv.id)

    return { projeId: inv.proje_id, role: inv.invited_role }
  },

  async rejectInvitationById(invitationId: string, userId: string) {
    const { error } = await supabaseAdmin
      .from('invitations')
      .update({ status: 'rejected', rejected_at: new Date().toISOString() })
      .eq('id', invitationId)
      .eq('user_id', userId)
      .eq('status', 'pending')
    if (error) {
      logger.error('[INVITATION] reject failed', { err: error })
      throw ApiError.internal('Reddedilemedi')
    }
    return { ok: true }
  },

  async listPendingForUser(userId: string) {
    const { data, error } = await supabaseAdmin
      .from('invitations')
      .select(
        `id, proje_id, invited_role, expires_at, created_at,
         proje:projeler ( proje_adi )`,
      )
      .eq('user_id', userId)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
    if (error) {
      logger.error('[INVITATION] list-for-user failed', { err: error })
      throw ApiError.internal('Davetler alınamadı')
    }
    return (data ?? []).map((r: any) => ({
      id: r.id,
      proje_id: r.proje_id,
      proje_adi: r.proje?.proje_adi ?? '',
      invited_role: r.invited_role,
      expires_at: r.expires_at,
      created_at: r.created_at,
    }))
  },

  async listForProject(projeId: string, statusFilter?: string[]) {
    let q = supabaseAdmin
      .from('invitations')
      .select(
        'id, email, user_id, invited_role, invited_by, status, expires_at, attempt_count, created_at, accepted_at, rejected_at',
      )
      .eq('proje_id', projeId)
      .order('created_at', { ascending: false })
    if (statusFilter && statusFilter.length > 0) {
      q = q.in('status', statusFilter)
    } else {
      q = q.eq('status', 'pending')
    }
    const { data, error } = await q
    if (error) {
      logger.error('[INVITATION] list-for-project failed', { err: error })
      throw ApiError.internal('Davetler alınamadı')
    }
    return data ?? []
  },

  async cancelInvitation(invitationId: string, projeId: string) {
    const { error } = await supabaseAdmin
      .from('invitations')
      .update({ status: 'expired' })
      .eq('id', invitationId)
      .eq('proje_id', projeId)
      .eq('status', 'pending')
    if (error) {
      logger.error('[INVITATION] cancel failed', { err: error })
      throw ApiError.internal('İptal edilemedi')
    }
    return { ok: true }
  },

  async getPreviewByToken(token: string) {
    const { data, error } = await supabaseAdmin
      .from('invitations')
      .select(
        `email, expires_at, status, attempt_count,
         proje:projeler ( proje_adi )`,
      )
      .eq('token', token)
      .maybeSingle()
    if (error) throw ApiError.internal('Önizleme alınamadı')
    if (!data) throw ApiError.notFound('Davet bulunamadı')
    const row = data as any
    const expired =
      row.status !== 'pending' ||
      new Date(row.expires_at).getTime() < Date.now() ||
      (row.attempt_count ?? 0) >= MAX_ATTEMPTS
    return {
      email: row.email,
      proje_adi: row.proje?.proje_adi ?? '',
      expires_at: row.expires_at,
      expired,
    }
  },
}
