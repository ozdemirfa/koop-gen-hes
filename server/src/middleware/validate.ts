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
        req.body = schemas.body.parse(req.body)
      }
      if (schemas.query) {
        // Express 5'te `req.query` getter-only — direct atama strict mode'da
        // TypeError firlatir. Express 5 getter'i `configurable: true` ile
        // tanimlandigi icin Object.defineProperty ile data property'e cevrilebilir.
        const parsed = schemas.query.parse(req.query)
        Object.defineProperty(req, 'query', {
          value: parsed,
          writable: true,
          configurable: true,
          enumerable: true,
        })
      }
      if (schemas.params) {
        (req as any).params = schemas.params.parse(req.params)
      }
      next()
    } catch (err) {
      next(err)
    }
  }
}
