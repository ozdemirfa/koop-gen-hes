import { Request, Response, NextFunction } from 'express'
import { ZodSchema } from 'zod'

interface ValidateSchemas {
  body?: ZodSchema
  query?: ZodSchema
  params?: ZodSchema
}

export function validate(schemas: ValidateSchemas) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schemas.body) {
        const originalProjeId = req.body.proje_id
        req.body = schemas.body.parse(req.body)
        // Global olarak enjekte edilen proje_id'yi koru (Eğer Zod şeması strip ediyorsa geri ekle)
        if (originalProjeId !== undefined && req.body.proje_id === undefined) {
          req.body.proje_id = originalProjeId
        }
      }
      if (schemas.query) {
        (req as any).query = schemas.query.parse(req.query)
      }
      if (schemas.params) {
        (req as any).params = schemas.params.parse(req.params)
      }
      next()
    } catch (err) {
      console.error('Validation Error:', err)
      next(err)
    }
  }
}
