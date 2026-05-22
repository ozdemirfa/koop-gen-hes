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
      userRole?: 'admin' | 'yetkili' | 'staff' | null
      /**
       * Sprint role-system-modernization (PR-B): yeni model owner/manager/user.
       * Legacy değerler (admin/staff/viewer) geriye uyumluluk için tip union'da
       * kalır — eski cache entry'ler veya migrate edilmemiş test fixture'lar
       * için. Faz 3'te (PR-D sonrası) legacy değerler kaldırılacak.
       */
      projectRole?: 'owner' | 'manager' | 'user' | 'admin' | 'staff' | 'viewer' | null
    }
  }
}
