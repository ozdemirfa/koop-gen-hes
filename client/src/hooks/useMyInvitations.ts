/**
 * Kullanıcının kendi pending davetleri için react-query hook'ları.
 * Banner + ProjeListPage Bekleyen Davetler section + (ileride) header bell.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { invitationsApi } from '../lib/invitationsApi'

export const MY_INVITATIONS_KEY = ['my-invitations'] as const

export function useMyInvitations() {
  return useQuery({
    queryKey: MY_INVITATIONS_KEY,
    queryFn: () => invitationsApi.listMine(),
    staleTime: 60_000,
  })
}

export function useAcceptMyInvitation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => invitationsApi.acceptMine(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: MY_INVITATIONS_KEY })
      qc.invalidateQueries({ queryKey: ['projeler'] })
      qc.invalidateQueries({ queryKey: ['projeler-list'] })
    },
  })
}

export function useRejectMyInvitation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => invitationsApi.rejectMine(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: MY_INVITATIONS_KEY })
    },
  })
}
