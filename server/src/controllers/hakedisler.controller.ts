import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import { hakedisService } from '../services/hakedis.service'
import { pdfGenerator } from '../utils/pdfGenerator'
import { catchAsync } from '../utils/catchAsync'

export const getHakedisler = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const result = await hakedisService.list(req.query as Record<string, any>)
  res.json({ success: true, ...result })
})

export const getHakedisById = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await hakedisService.getById(req.params.id)
  res.json({ success: true, data })
})

export const downloadHakedisPdf = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await hakedisService.getPDFData(req.params.id)
  const docDefinition = pdfGenerator.generateHakedisPDF(data)
  const pdfDoc = pdfGenerator.createPdfStream(docDefinition)
  
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename=hakedis_${req.params.id}.pdf`)
  
  pdfDoc.pipe(res)
  pdfDoc.end()
})

export const createHakedis = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await hakedisService.create(req.body)
  res.status(201).json({ success: true, data })
})

export const updateHakedis = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await hakedisService.update(req.params.id, req.body)
  res.json({ success: true, data })
})

export const approveHakedis = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await hakedisService.approve(req.params.id)
  res.json({ success: true, data })
})

export const updateKalemler = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await hakedisService.updateKalemler(req.params.id, req.body.kalemler)
  res.json({ success: true, data })
})
