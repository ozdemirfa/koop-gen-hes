/**
 * Transactional mail wrapper (Resend).
 *
 * RESEND_API_KEY tanımlı değilse mail gönderimi stub mode'a düşer ve
 * logger'a yazılır — lokal geliştirme için yeterli. Production'da
 * Render env'de RESEND_API_KEY + MAIL_FROM set edilmelidir.
 *
 * Spec: docs/superpowers/specs/2026-05-21-invitation-flow-design.md
 */

import { Resend } from 'resend'
import logger from '../utils/logger'

const RESEND_API_KEY = process.env.RESEND_API_KEY
const MAIL_FROM = process.env.MAIL_FROM ?? 'noreply@koopgenhes.com'

let resend: Resend | null = null
if (RESEND_API_KEY) {
  resend = new Resend(RESEND_API_KEY)
} else {
  logger.warn('[MAILER] RESEND_API_KEY tanımlı değil; mail gönderimleri stub mode')
}

export interface NewUserInviteMailData {
  to: string
  projeAdi: string
  inviterName: string
  role: 'manager' | 'user'
  acceptUrl: string
  otpCode: string
  expiresAt: Date
}

export interface ExistingUserInviteMailData {
  to: string
  projeAdi: string
  inviterName: string
  role: 'manager' | 'user'
  loginUrl: string
  expiresAt: Date
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })
}

export const mailer = {
  async sendNewUserInvite(data: NewUserInviteMailData): Promise<void> {
    const subject = `koopGenHes — ${data.projeAdi} projesi için davet edildiniz`
    const text = `Merhaba,

${data.inviterName} sizi koopGenHes uygulamasında "${data.projeAdi}" projesine ${data.role} rolüyle davet etti.

Daveti tamamlamak için:

1. Aşağıdaki linki tıklayın:
   ${data.acceptUrl}

2. Açılan sayfada şu 6 haneli doğrulama kodunu girin:
   ${data.otpCode}

3. Yeni şifrenizi belirleyin.

Davet ${formatDate(data.expiresAt)} tarihine kadar geçerlidir.

Daveti siz talep etmediyseniz bu maili göz ardı edebilirsiniz.

— koopGenHes`

    if (!resend) {
      logger.info(
        `[MAILER STUB] new-user invite → ${data.to}; otp=${data.otpCode}; url=${data.acceptUrl}`,
      )
      return
    }
    const { error } = await resend.emails.send({
      from: MAIL_FROM,
      to: data.to,
      subject,
      text,
    })
    if (error) {
      logger.error('[MAILER] new-user invite send failed', { err: error, to: data.to })
      throw new Error('Mail gönderilemedi')
    }
  },

  async sendExistingUserInvite(data: ExistingUserInviteMailData): Promise<void> {
    const subject = `koopGenHes — ${data.projeAdi} projesi için davet edildiniz`
    const text = `Merhaba,

${data.inviterName} sizi koopGenHes uygulamasında "${data.projeAdi}" projesine ${data.role} rolüyle davet etti.

Uygulamaya giriş yaptığınızda davetinizi göreceksiniz; oradan kabul edebilir veya reddedebilirsiniz.

${data.loginUrl}

Davet ${formatDate(data.expiresAt)} tarihine kadar geçerlidir.

— koopGenHes`

    if (!resend) {
      logger.info(`[MAILER STUB] existing-user invite → ${data.to}; url=${data.loginUrl}`)
      return
    }
    const { error } = await resend.emails.send({
      from: MAIL_FROM,
      to: data.to,
      subject,
      text,
    })
    if (error) {
      logger.error('[MAILER] existing-user invite send failed', { err: error, to: data.to })
      throw new Error('Mail gönderilemedi')
    }
  },
}
