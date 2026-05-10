import './config/env'

import express, { Request, Response } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import logger from './utils/logger'

import apiRoutes from './routes/index'
import { errorHandler } from './middleware/errorHandler'

const app = express()
const port = process.env.PORT || 3001

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
  allowedHeaders: ['Content-Type', 'Authorization'],
}))

app.use(express.json())

app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev', {
  stream: { write: (msg: string) => logger.info(msg.trim()) },
}))

// API Routes
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
  app.listen(port, () => {
    logger.info(`[server]: Server is running at http://localhost:${port}`)
  })
}

export default app
