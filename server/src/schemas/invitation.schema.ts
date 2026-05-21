import { z } from 'zod'

export const invitationCreateSchema = z.object({
  email: z.string().email('Geçerli bir e-posta girin').max(254),
  projectRole: z.enum(['manager', 'user']),
})
export type InvitationCreateBody = z.infer<typeof invitationCreateSchema>

export const invitationAcceptByTokenSchema = z.object({
  token: z.string().min(20).max(64), // base64url 32 byte = 43 char
  otp: z.string().regex(/^\d{6}$/, '6 haneli olmalı'),
  password: z.string().min(8, 'En az 8 karakter').max(72), // Supabase Auth limit
})
export type InvitationAcceptByTokenBody = z.infer<typeof invitationAcceptByTokenSchema>

const validStatuses = ['pending', 'accepted', 'rejected', 'expired'] as const

export const invitationListQuerySchema = z.object({
  status: z
    .string()
    .optional()
    .transform((s) => (s ? s.split(',') : undefined))
    .refine(
      (arr) => !arr || arr.every((v) => (validStatuses as readonly string[]).includes(v)),
      { message: 'status: pending,accepted,rejected,expired' },
    ),
})
export type InvitationListQuery = z.infer<typeof invitationListQuerySchema>
