import 'express'

declare module 'express' {
  interface Request {
    params: Record<string, string>
  }
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: {
        id: string
        email?: string
      }
      userRole?: 'admin' | 'staff' | null
    }
  }
}
