import 'express'

declare module 'express' {
  interface Request {
    params: Record<string, string>
  }
}
