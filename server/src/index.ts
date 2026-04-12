import './config/env' // dotenv EN BAŞTA yüklenmeli (import hoisting yüzünden)

import express, { Request, Response } from 'express'
import cors from 'cors'
import helmet from 'helmet'

import apiRoutes from './routes/index'
import { errorHandler } from './middleware/errorHandler'

const app = express()
const port = process.env.PORT || 3001

// Middlewares
app.use(helmet())
app.use(cors({
  origin: (origin, callback) => {
    const allowedOrigins = [
      'http://localhost:5173',
      'http://localhost:3000',
      /\.vercel\.app$/ // Tüm vercel alt alan adlarına izin ver
    ];
    
    if (!origin || allowedOrigins.some(allowed => 
      typeof allowed === 'string' ? allowed === origin : allowed.test(origin)
    )) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

import { supabaseAdmin } from './config/supabase'

// Health check (DB bağlantısını da kontrol eder)
app.get('/api/health', async (_req: Request, res: Response) => {
  try {
    const { error } = await supabaseAdmin.from('uyeler').select('id').limit(1)
    if (error) throw error
    res.json({ status: 'ok', database: 'connected', message: 'KoopGenHes API is running' })
  } catch (err: any) {
    res.status(500).json({ status: 'error', database: 'disconnected', error: err.message })
  }
})

// API Routes (auth middleware route aggregator içinde)
app.use('/api', apiRoutes)

// Error handler (en sonda olmalı)
app.use(errorHandler)

// Vercel için app dışa aktarılmalı
export default app

// Sadece Vercel dışında manuel çalıştığında dinlesin
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`[server]: Server is running at http://localhost:${port}`)
  })
}
