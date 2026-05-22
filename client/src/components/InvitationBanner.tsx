/**
 * Login sonrası dashboard banner — kullanıcının pending davetleri.
 * AdminLayout Content üstüne mount edilir.
 *
 * Spec: docs/superpowers/specs/2026-05-21-invitation-flow-design.md §6.2
 */

import React from 'react'
import { Alert, Button, Popconfirm, Space, Tag, Typography } from 'antd'
import {
  useMyInvitations,
  useAcceptMyInvitation,
  useRejectMyInvitation,
} from '../hooks/useMyInvitations'
import { PROJECT_ROLE_TR, PROJECT_ROLE_COLOR } from '../lib/roleLabels'
import type { InvitedRole } from '../types/invitation'

const { Text } = Typography

export const InvitationBanner: React.FC = () => {
  const { data: invitations, isLoading } = useMyInvitations()
  const accept = useAcceptMyInvitation()
  const reject = useRejectMyInvitation()

  if (isLoading || !invitations?.length) return null

  return (
    <div style={{ padding: '12px 16px 0' }}>
      {invitations.map((inv) => (
        <Alert
          key={inv.id}
          type="info"
          showIcon
          style={{ marginBottom: 8 }}
          message={
            <Space wrap>
              {inv.proje_adi && <Text strong>"{inv.proje_adi}"</Text>}
              {inv.proje_adi && <Text>projesine</Text>}
              <Tag color={PROJECT_ROLE_COLOR[inv.invited_role as keyof typeof PROJECT_ROLE_COLOR] ?? 'blue'}>
                {PROJECT_ROLE_TR[inv.invited_role as keyof typeof PROJECT_ROLE_TR] ?? (inv.invited_role as InvitedRole)}
              </Tag>
              {inv.proje_adi
                ? <Text>rolüyle davet edildiniz.</Text>
                : <Text>rolüyle sisteme davet edildiniz.</Text>
              }
              <Text type="secondary">
                ({new Date(inv.expires_at).toLocaleDateString('tr-TR')} tarihine kadar geçerli)
              </Text>
            </Space>
          }
          action={
            <Space>
              <Button
                type="primary"
                size="small"
                loading={accept.isPending && accept.variables === inv.id}
                onClick={() => accept.mutate(inv.id)}
              >
                Kabul Et
              </Button>
              <Popconfirm
                title="Daveti reddetmek istediğinize emin misiniz?"
                onConfirm={() => reject.mutate(inv.id)}
                okText="Evet, Reddet"
                cancelText="Vazgeç"
              >
                <Button
                  danger
                  size="small"
                  loading={reject.isPending && reject.variables === inv.id}
                >
                  Reddet
                </Button>
              </Popconfirm>
            </Space>
          }
          closable={false}
        />
      ))}
    </div>
  )
}
