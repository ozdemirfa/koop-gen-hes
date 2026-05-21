/**
 * Davet akışı TypeScript tipleri.
 *
 * Backend endpoint'leri:
 *   GET  /api/me/invitations              → MyInvitation[]
 *   GET  /api/projeler/:projeId/invitations → ProjectInvitation[]
 *   GET  /api/invitations/by-token/:token  → InvitationPreview
 */

export type InvitationStatus = 'pending' | 'accepted' | 'rejected' | 'expired'
export type InvitedRole = 'manager' | 'user'

// Banner + ProjeListPage Bekleyen Davetler section'da gösterilen kayıt
export interface MyInvitation {
  id: string
  proje_id: string
  proje_adi: string
  invited_role: InvitedRole
  expires_at: string // ISO
  created_at: string
}

// Owner Kullanıcı Yönetimi sayfasında Aktif/Bekleyen/Geçmiş sekmeleri
export interface ProjectInvitation {
  id: string
  email: string
  user_id: string | null
  invited_role: InvitedRole
  invited_by: string | null
  status: InvitationStatus
  expires_at: string
  attempt_count: number
  accepted_at: string | null
  rejected_at: string | null
  created_at: string
}

// Public /davet-kabul/:token sayfası preview
export interface InvitationPreview {
  email: string
  proje_adi: string
  expires_at: string
  expired: boolean
}
