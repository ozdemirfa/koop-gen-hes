import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import { raporService } from '../services/rapor.service'
import { pdfGenerator } from '../utils/pdfGenerator'
import { catchAsync } from '../utils/catchAsync'

export const getAylikRapor = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const yil = parseInt(req.query.yil as string) || new Date().getFullYear()
  const ay = parseInt(req.query.ay as string) || new Date().getMonth() + 1
  const projeId = req.query.projeId as string
  const data = await raporService.aylikRapor(yil, ay, projeId)
  res.json({ success: true, data })
})

export const downloadAylikRaporPdf = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const yil = parseInt(req.query.yil as string) || new Date().getFullYear()
  const ay = parseInt(req.query.ay as string) || new Date().getMonth() + 1
  const projeId = req.query.projeId as string
  const data = await raporService.aylikRapor(yil, ay, projeId)
  
  const docDefinition = pdfGenerator.generateMaliRaporPDF(data)
  const pdfDoc = pdfGenerator.createPdfStream(docDefinition)
  
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename=mali_rapor_${yil}_${ay}.pdf`)
  
  pdfDoc.pipe(res)
  pdfDoc.end()
})

export const getYillikRapor = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const yil = parseInt(req.query.yil as string) || new Date().getFullYear()
  const projeId = req.query.projeId as string
  const data = await raporService.yillikRapor(yil, projeId)
  res.json({ success: true, data })
})

export const getUyeBorcListesi = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const projeId = req.query.projeId as string
  const data = await raporService.uyeBorcListesi(projeId)
  res.json({ success: true, data })
})

export const getHakedisOzet = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const projeId = req.query.projeId as string
  const data = await raporService.hakedisOzet(projeId)
  res.json({ success: true, data })
})

export const getMizan = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const projeId = req.query.projeId as string
  const data = await raporService.getMizan(projeId)
  res.json({ success: true, data })
})
