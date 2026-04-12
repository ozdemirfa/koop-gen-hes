import { Request } from 'express'

/**
 * Express 5'te req.params değerleri string | string[] olabilir.
 * Bu helper tek bir string parametre döndürür.
 */
export function getParam(req: Request, name: string): string {
  const params = req.params as any
  const value = params[name]
  if (Array.isArray(value)) return value[0]
  return value as string
}
