import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import { sozlesmeService } from '../services/sozlesme.service'
import { catchAsync } from '../utils/catchAsync'

export const getSozlesmeler = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const result = await sozlesmeService.list(req.query as Record<string, any>)
  res.json({ success: true, ...result })
})

export const getSozlesmeById = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await sozlesmeService.getById(req.params.id)
  res.json({ success: true, data })
})

export const createSozlesme = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await sozlesmeService.create(req.body)
  res.status(201).json({ success: true, data })
})

export const updateSozlesme = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await sozlesmeService.update(req.params.id, req.body)
  res.json({ success: true, data })
})

export const getIsKalemleri = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await sozlesmeService.getIsKalemleri(req.params.id)
  res.json({ success: true, data })
})

export const addIsKalemi = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await sozlesmeService.addIsKalemi(req.params.id, req.body)
  res.status(201).json({ success: true, data })
})

export const updateIsKalemi = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await sozlesmeService.updateIsKalemi(req.params.id, req.body)
  res.json({ success: true, data })
})

export const deleteIsKalemi = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  await sozlesmeService.deleteIsKalemi(req.params.id)
  res.json({ success: true, message: 'İş kalemi silindi' })
})

export const deleteSozlesme = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  await sozlesmeService.delete(req.params.id)
  res.json({ success: true, message: 'Sözleşme silindi' })
})
