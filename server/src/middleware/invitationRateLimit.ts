/**
 * IP rate-limit middleware'leri davet public endpoint'leri için.
 *
 * Spec: docs/superpowers/specs/2026-05-21-invitation-flow-design.md §3.3
 * Render arkasında çalıştığımız için server/src/index.ts'de
 * `app.set('trust proxy', 1)` set edilmeli — yoksa rate-limit tüm trafiği
 * tek IP sayar.
 */

import rateLimit from 'express-rate-limit'

const acceptMessage = {
  error: 'Çok fazla istek. Lütfen birkaç dakika sonra tekrar deneyin.',
}

// IP başına dakikada 5 hit
export const inviteAcceptMinuteLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: acceptMessage,
})

// IP başına saatte 30 hit
export const inviteAcceptHourlyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: acceptMessage,
})
