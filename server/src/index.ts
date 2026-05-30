import './config/env'

import express, { Request, Response } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import logger from './utils/logger'

import apiRoutes from './routes/index'
import publicInvitationsRoutes from './routes/publicInvitations.routes'
import { errorHandler } from './middleware/errorHandler'
import cache from './lib/cache'

const app = express()
const port = process.env.PORT || 3001

// Render gibi reverse-proxy arkasında çalışıyoruz; X-Forwarded-For header'ı
// doğru okunsun ki express-rate-limit (davet endpoint'lerinde) gerçek client
// IP'sini sayabilsin. Aksi halde tüm trafik proxy IP'siyle gözükür.
app.set('trust proxy', 1)

app.use(helmet())

const allowedOrigins = (process.env.CORS_ORIGINS ?? '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)

app.use(cors({
  origin: (origin, cb) => {
    // origin undefined (curl/server-to-server) ise izin ver
    if (!origin) return cb(null, true)
    // Geliştirme: allowedOrigins boşsa wildcard (sadece NODE_ENV=development)
    if (allowedOrigins.length === 0 && process.env.NODE_ENV !== 'production') {
      return cb(null, true)
    }
    if (allowedOrigins.includes(origin)) return cb(null, true)
    return cb(new Error('Origin not allowed by CORS'))
  },
  credentials: false,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Active-Project-Id'],
}))

app.use(express.json())

// TASK-BE-09 (sprint 20260511-backlog-batch3, SEC-011):
// PII-leak koruması — query string'leri redact et. Üye/cari aramada `?search=Ahmet+Yilmaz`
// gibi PII log'a sızabilir. Redact kuralı: sadece path tut, query'yi `?[redacted]` yap.
// Whitelist (proje_id, page, page_size gibi) production log debug'ını korumak için kalır.
const REDACT_WHITELIST = new Set(['page', 'page_size', 'proje_id', 'order'])
morgan.token('redacted-url', (req: Request) => {
  const url = req.url || ''
  const qIdx = url.indexOf('?')
  if (qIdx === -1) return url
  const path = url.slice(0, qIdx)
  const qs = new URLSearchParams(url.slice(qIdx + 1))
  const kept: string[] = []
  let redactedCount = 0
  qs.forEach((value, key) => {
    if (REDACT_WHITELIST.has(key)) {
      kept.push(`${key}=${value}`)
    } else {
      redactedCount++
    }
  })
  const suffix = redactedCount > 0 ? `${kept.length ? '&' : ''}[redacted:${redactedCount}]` : ''
  return kept.length || redactedCount
    ? `${path}?${kept.join('&')}${suffix}`
    : path
})

const morganFormat = process.env.NODE_ENV === 'production'
  ? ':remote-addr - :remote-user [:date[clf]] ":method :redacted-url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"'
  : ':method :redacted-url :status :res[content-length] - :response-time ms'

app.use(morgan(morganFormat, {
  stream: { write: (msg: string) => logger.info(msg.trim()) },
}))

// === HEALTH ===
// GET /api/health — auth gerektirmez; Redis bağlantı durumunu da yansıtır.
// Sprint V2 redis-cache-hot-swap (2026-05-26).
app.get('/api/health', async (_req: Request, res: Response) => {
  const redisStatus = await cache.health()
  res.json({ ok: true, redis: redisStatus })
})

// Public invitation endpoint'leri — authMiddleware'i bypass eder.
// /api/invitations/by-token/:token + /api/invitations/accept-by-token
// IP rate-limit middleware (5/dk + 30/saat) içeride uygulanır.
app.use('/api/invitations', publicInvitationsRoutes)

// API Routes (authMiddleware altında)
app.use('/api', apiRoutes)

// 404 handler for unmatched routes
app.use((req, res) => {
  logger.warn(`[404] ${req.method} ${req.url} - No route matched`)
  res.status(404).json({
    success: false,
    error: 'İstediğiniz kaynak bulunamadı (Route not found)'
  })
})

// Error handler
app.use(errorHandler)

if (process.env.NODE_ENV !== 'test' && (process.env.NODE_ENV !== 'production' || !process.env.VERCEL)) {
  // Cache init — Redis bağlantısı REDIS_URL varsa kurulur; yoksa no-op.
  cache.init()
    .then(() => {
      logger.info('[cache]: initialized')
      app.listen(port, () => {
        logger.info(`[server]: Server is running at http://localhost:${port}`)
      })
    })
    .catch((err) => {
      logger.error('[cache]: init failed', { err: String(err) })
      process.exit(1)
    })

  // Graceful shutdown — connection leak önleme
  const shutdown = async (signal: string) => {
    logger.info(`[server]: ${signal} received, shutting down gracefully`)
    await cache.shutdown()
    process.exit(0)
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

export default app
