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
        (req as any).query = schemas.query.parse(req.query)
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
