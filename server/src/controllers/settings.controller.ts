import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import { settingsService, buildSettingsContext } from '../services/settings.service'
import { catchAsync } from '../utils/catchAsync'
import { ApiError } from '../utils/ApiError'

// Sprint birim-poz-user-scope (2026-05-27):
//   Controller her request için req.user.id + req.userRole baz alınan
//   SettingsContext kurar. is_admin kontrolü middleware'in koyduğu
//   req.userRole'den okunur (auth middleware her zaman set eder).

function requireUserId(req: AuthRequest): string {
  if (!req.user?.id) throw ApiError.unauthorized()
  return req.user.id
}

function buildCtx(req: AuthRequest) {
  const userId = requireUserId(req)
  // req.userRole auth middleware tarafından set edilir; null olabilir (lookup fail)
  const isAdmin = req.userRole === 'admin'
  return { userId, isAdmin }
}

export const getBirimler = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = requireUserId(req)
  const data = await settingsService.getBirimler(userId)
  res.json({ success: true, data })
})

export const createBirim = catchAsync(async (req: AuthRequest, res: Response) => {
  const ctx = buildCtx(req)
  const data = await settingsService.createBirim(req.body, ctx)
  res.status(201).json({ success: true, data })
})

export const deleteBirim = catchAsync(async (req: AuthRequest, res: Response) => {
  const ctx = buildCtx(req)
  await settingsService.deleteBirim(req.params.id, ctx)
  res.json({ success: true, message: 'Birim silindi' })
})

export const getPozlar = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = requireUserId(req)
  const data = await settingsService.getPozlar(userId)
  res.json({ success: true, data })
})

export const createPoz = catchAsync(async (req: AuthRequest, res: Response) => {
  const ctx = buildCtx(req)
  const data = await settingsService.createPoz(req.body, ctx)
  res.status(201).json({ success: true, data })
})

export const updatePoz = catchAsync(async (req: AuthRequest, res: Response) => {
  const ctx = buildCtx(req)
  const data = await settingsService.updatePoz(req.params.id, req.body, ctx)
  res.json({ success: true, data })
})

export const deletePoz = catchAsync(async (req: AuthRequest, res: Response) => {
  const ctx = buildCtx(req)
  await settingsService.deletePoz(req.params.id, ctx)
  res.json({ success: true, message: 'Poz silindi' })
})

// buildSettingsContext sadece controller'ların ihtiyaç duymadığı çapraz-iç
// kullanım için export edilir (test ve service-side helper'lar gerektiğinde).
export { buildSettingsContext }
