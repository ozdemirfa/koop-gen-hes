/**
 * Davet akışı API wrapper'ları.
 *
 * Backend endpoint'leri:
 *   - Owner (proje izolasyon middleware):
 *       POST   /api/projeler/:projeId/invitations
 *       GET    /api/projeler/:projeId/invitations
 *       DELETE /api/projeler/:projeId/invitations/:id
 *   - Authenticated user (kendi davetleri):
 *       GET    /api/me/invitations
 *       POST   /api/me/invitations/:id/accept
 *       POST   /api/me/invitations/:id/reject
 *   - Public (auth gerektirmez; rate-limited):
 *       GET    /api/invitations/by-token/:token
 *       POST   /api/invitations/accept-by-token
 */

import api from './api'
import type {
  MyInvitation,
  ProjectInvitation,
  InvitationPreview,
  InvitationStatus,
  InvitedRole,
} from '../types/invitation'

interface CreateResponse {
  id: string
  projeId: string
  email: string
  isNewUser: boolean
  expiresAt: string
}

interface AcceptByTokenResponse {
  email: string
  projeId: string
}

interface AcceptByIdResponse {
  projeId: string
  role: InvitedRole
}

// Backend response envelope: { success: true, data: T }
function unwrap<T>(payload: { data: T }): T {
  return payload.data
}

export const invitationsApi = {
  // ─── Owner ───────────────────────────────────────────────────────────
  async create(projeId: string, body: { email: string; projectRole: InvitedRole }): Promise<CreateResponse> {
    const { data } = await api.post(`/projeler/${projeId}/invitations`, body)
    return unwrap<CreateResponse>(data)
  },

  async listForProject(projeId: string, status?: InvitationStatus[]): Promise<ProjectInvitation[]> {
    const params = status?.length ? { status: status.join(',') } : undefined
    const { data } = await api.get(`/projeler/${projeId}/invitations`, { params })
    return unwrap<ProjectInvitation[]>(data)
  },

  async cancel(projeId: string, id: string): Promise<void> {
    await api.delete(`/projeler/${projeId}/invitations/${id}`)
  },

  // ─── Authenticated user (me) ─────────────────────────────────────────
  async listMine(): Promise<MyInvitation[]> {
    const { data } = await api.get('/me/invitations')
    return unwrap<MyInvitation[]>(data)
  },

  async acceptMine(id: string): Promise<AcceptByIdResponse> {
    const { data } = await api.post(`/me/invitations/${id}/accept`)
    return unwrap<AcceptByIdResponse>(data)
  },

  async rejectMine(id: string): Promise<{ ok: true }> {
    const { data } = await api.post(`/me/invitations/${id}/reject`)
    return unwrap<{ ok: true }>(data)
  },

  // ─── Admin — yetkili davet ───────────────────────────────────────────
  /** POST /admin/invitations/yetkili — global yetkili daveti (proje seçimi yok) */
  async createYetkiliInvitation(email: string): Promise<{ id: string; email: string; expiresAt: string }> {
    const { data } = await api.post('/admin/invitations/yetkili', { email })
    return unwrap<{ id: string; email: string; expiresAt: string }>(data)
  },

  // ─── Admin — kullanıcı rol yönetimi ─────────────────────────────────
  /** PATCH /admin/users/:userId/role — global rol ata veya kaldır */
  async setUserGlobalRole(userId: string, role: 'yetkili' | 'staff' | null): Promise<void> {
    await api.patch(`/admin/users/${userId}/role`, { role })
  },

  // ─── Public (no auth) ────────────────────────────────────────────────
  async previewByToken(token: string): Promise<InvitationPreview> {
    const { data } = await api.get(`/invitations/by-token/${encodeURIComponent(token)}`)
    return unwrap<InvitationPreview>(data)
  },

  async acceptByToken(body: { token: string; otp: string; password: string }): Promise<AcceptByTokenResponse> {
    const { data } = await api.post('/invitations/accept-by-token', body)
    return unwrap<AcceptByTokenResponse>(data)
  },
}
