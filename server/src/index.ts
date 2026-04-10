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
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Health check (auth gerektirmez)
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', message: 'KoopGenHes API is running' })
})

// API Routes (auth middleware route aggregator içinde)
app.use('/api', apiRoutes)

// Error handler (en sonda olmalı)
app.use(errorHandler)

app.listen(port, () => {
  console.log(`[server]: Server is running at http://localhost:${port}`)
})
