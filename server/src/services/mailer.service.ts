/**
 * Transactional mail wrapper (Brevo / eski Sendinblue).
 *
 * BREVO_API_KEY tanımlı değilse mail gönderimi stub mode'a düşer ve
 * logger'a yazılır — lokal geliştirme için yeterli. Production'da
 * Render env'de BREVO_API_KEY + MAIL_FROM set edilmelidir.
 *
 * Brevo Transactional Email API: https://developers.brevo.com/reference/sendtransacemail
 *
 * Spec: docs/superpowers/specs/2026-05-21-invitation-flow-design.md
 */

import logger from '../utils/logger'

const BREVO_API_KEY = process.env.BREVO_API_KEY
const MAIL_FROM = process.env.MAIL_FROM ?? 'noreply@koopgenhes.com'
const MAIL_FROM_NAME = process.env.MAIL_FROM_NAME ?? 'koopGenHes'
const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email'

if (!BREVO_API_KEY) {
  logger.warn('[MAILER] BREVO_API_KEY tanımlı değil; mail gönderimleri stub mode')
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

interface BrevoSendPayload {
  to: string
  subject: string
  textContent: string
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })
}

async function brevoSend(payload: BrevoSendPayload): Promise<void> {
  if (!BREVO_API_KEY) {
    logger.info(`[MAILER STUB] → ${payload.to}; subject="${payload.subject}"`)
    return
  }
  let res: Response
  try {
    res = await fetch(BREVO_ENDPOINT, {
      method: 'POST',
      headers: {
        'api-key': BREVO_API_KEY,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { email: MAIL_FROM, name: MAIL_FROM_NAME },
        to: [{ email: payload.to }],
        subject: payload.subject,
        textContent: payload.textContent,
      }),
    })
  } catch (networkErr) {
    logger.error('[MAILER] brevo network error', { err: networkErr, to: payload.to })
    throw new Error('Mail gönderilemedi (ağ hatası)')
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '<no body>')
    logger.error('[MAILER] brevo send failed', {
      status: res.status,
      body,
      to: payload.to,
      from: MAIL_FROM,
    })
    throw new Error(`Mail gönderilemedi (Brevo ${res.status})`)
  }
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

    await brevoSend({ to: data.to, subject, textContent: text })
  },

  async sendExistingUserInvite(data: ExistingUserInviteMailData): Promise<void> {
    const subject = `koopGenHes — ${data.projeAdi} projesi için davet edildiniz`
    const text = `Merhaba,

${data.inviterName} sizi koopGenHes uygulamasında "${data.projeAdi}" projesine ${data.role} rolüyle davet etti.

Uygulamaya giriş yaptığınızda davetinizi göreceksiniz; oradan kabul edebilir veya reddedebilirsiniz.

${data.loginUrl}

Davet ${formatDate(data.expiresAt)} tarihine kadar geçerlidir.

— koopGenHes`

    await brevoSend({ to: data.to, subject, textContent: text })
  },
}
