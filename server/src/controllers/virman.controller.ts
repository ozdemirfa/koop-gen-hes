import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import { virmanService } from '../services/virman.service'
import { catchAsync } from '../utils/catchAsync'
import logger from '../utils/logger'

export const listVirmanlar = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await virmanService.list(req.query as Record<string, any>)
  res.json({ success: true, data })
})

export const createVirman = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  // DIAGNOSTIC: virman proje_id bug — remove after fix
  // Üretimde "Zorunlu alan eksik: proje_id" 400 dönüyor; payload'da proje_id var.
  // req.body controller'a ulaştığında proje_id'nin hâlâ orada olup olmadığını,
  // tipi ve Content-Type'ı doğrulamak için geçici. Service log'u ile karşılaştır.
  logger.info('DIAGNOSTIC virman POST controller', {
    body: req.body,
    proje_id: req.body?.proje_id,
    proje_id_type: typeof req.body?.proje_id,
    body_keys: Object.keys(req.body || {}),
    content_type: req.headers['content-type'],
    user_id: req.user?.id,
  })

  const data = await virmanService.create(req.body, req.user?.id)
  res.status(201).json({ success: true, data })
})

export const deleteVirman = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  // proje_id query string'inden gelir; middleware aynı id'yi requireProjectAccess
  // ile doğrulamış olur → service tekrar eşleştirir (defense in depth).
  const projeId = String((req.query as any).proje_id || '')
  const data = await virmanService.remove(req.params.id, projeId)
  res.json({ success: true, data })
})
