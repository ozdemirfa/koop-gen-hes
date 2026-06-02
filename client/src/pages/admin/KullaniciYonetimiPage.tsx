import React, { useMemo, useState } from 'react'
import {
  Alert,
  App,
  Button,
  Card,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Statistic,
  Switch,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import {
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  KeyOutlined,
  MailOutlined,
  ReloadOutlined,
  UserAddOutlined,
} from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../lib/api'
import { invitationsApi } from '../../lib/invitationsApi'
import type { ProjectInvitation } from '../../types/invitation'
import { getErrorMessage } from '../../lib/apiError'
import { ErrorState } from '../../components/common/ErrorState'
import { PageHeader } from '../../components/common/PageHeader'
import { usePageSettings } from '../../contexts/LayoutContext'
import { useProject } from '../../contexts/ProjectContext'
import { usePermissions } from '../../hooks/usePermissions'
import { useAuth } from '../../contexts/AuthContext'
import { GLOBAL_ROLE_TR } from '../../lib/roleLabels'
import { YetkiliInviteModal } from '../../components/YetkiliInviteModal'

/**
 * Sprint role-system-modernization (PR-D, 2026-05-20):
 * Kullanıcı Yönetimi — proje-bazlı revizyon.
 *
 *   - Erişim: owner + manager (`canManageUsers`)
 *   - Listeleme: aktif projenin üyeleri (`GET /api/projeler/:projeId/uyeler`)
 *   - Davet: yeni payload `{ email, projeId, projectRole }` (manager/user)
 *   - Rol değiştir: `PATCH /api/projeler/:projeId/uyeler/:userId` (owner only,
 *     owner satırına dokunulamaz — backend zaten reddediyor)
 *   - Şifre yenile: `POST /api/admin/users/:userId/sifre-yenile` (owner only,
 *     target manager/user olmalı, owner kendi şifresini yenileyemez)
 *   - Üyelikten çıkar: `DELETE /api/projeler/:projeId/uyeler/:userId` (owner)
 *
 * Aktif proje değişince queryKey['proje-uyelikler', projeId] otomatik yeniden
 * fetch eder.
 */

type ProjectRole = 'owner' | 'manager' | 'user'

interface ProjeUye {
  user_id: string
  proje_id: string
  rol: ProjectRole
  email?: string
  created_at: string
}

// PR-B: PROJECT_ROLE_TR sözlüğünü referans al
const ROLE_LABELS: Record<ProjectRole, string> = {
  owner: 'Yetkili',
  manager: 'Yönetici',
  user: 'Kullanıcı',
}

const ROLE_COLORS: Record<ProjectRole, string> = {
  owner: 'gold',
  manager: 'blue',
  user: 'default',
}

// Sistem genelindeki kullanıcı (GET /api/admin/users response shape)
// Backend adminService.listUsers `id` field'ı döndürüyor (Supabase auth user.id),
// `user_id` değil — proje üyeliği tablosundaki `user_id` ile karıştırma.
interface SistemKullanici {
  id: string
  email: string
  global_role: 'admin' | 'yetkili' | 'staff' | null
  can_create_projects: boolean
}

export const KullaniciYonetimiPage: React.FC = () => {
  const queryClient = useQueryClient()
  const { message } = App.useApp()
  const { activeProject } = useProject()
  const { isOwner, isAdmin } = usePermissions()
  const { user: currentUser } = useAuth()
  const projeId = activeProject?.id

  const [inviteOpen, setInviteOpen] = useState(false)
  const [roleEdit, setRoleEdit] = useState<ProjeUye | null>(null)
  const [pwResetTarget, setPwResetTarget] = useState<ProjeUye | null>(null)
  const [pwResetResult, setPwResetResult] = useState<{ email: string; password: string; generated: boolean } | null>(null)
  const [yetkiliInviteOpen, setYetkiliInviteOpen] = useState(false)

  const [inviteForm] = Form.useForm()
  const [roleForm] = Form.useForm()
  const [pwForm] = Form.useForm()

  usePageSettings('Kullanıcı Yönetimi')

  const {
    data: uyeler,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['proje-uyelikler', projeId],
    queryFn: async () => {
      if (!projeId) return [] as ProjeUye[]
      const { data } = await api.get(`/projeler/${projeId}/uyeler`)
      return data.data as ProjeUye[]
    },
    enabled: !!projeId,
  })

  // Davet listesi sorguları (Bekleyen + Geçmiş sekmeleri)
  const { data: pendingInvites, isLoading: pendingLoading } = useQuery({
    queryKey: ['project-invitations', projeId, 'pending'],
    queryFn: () => invitationsApi.listForProject(projeId!, ['pending']),
    enabled: !!projeId,
  })

  const { data: historyInvites, isLoading: historyLoading } = useQuery({
    queryKey: ['project-invitations', projeId, 'history'],
    queryFn: () => invitationsApi.listForProject(projeId!, ['accepted', 'rejected', 'expired']),
    enabled: !!projeId,
  })

  // PR-B: Sistem Kullanıcıları — sadece admin görür
  const {
    data: sistemKullanicilar,
    isLoading: sistemLoading,
  } = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const { data } = await api.get('/admin/users')
      return (data.data ?? data) as SistemKullanici[]
    },
    enabled: isAdmin,
  })

  const setRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: 'yetkili' | 'staff' | null }) =>
      invitationsApi.setUserGlobalRole(userId, role),
    onSuccess: () => {
      message.success('Kullanıcı rolü güncellendi')
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
    },
    onError: (err) => message.error(getErrorMessage(err, 'Rol güncellenemedi')),
  })

  const cancelInviteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!projeId) throw new Error('Aktif proje yok')
      await invitationsApi.cancel(projeId, id)
    },
    onSuccess: () => {
      message.success('Davet iptal edildi')
      queryClient.invalidateQueries({ queryKey: ['project-invitations', projeId] })
    },
    onError: (err) => message.error(getErrorMessage(err, 'İptal edilemedi')),
  })

  // Yeni davet akışı (2026-05-21): POST /api/projeler/:projeId/invitations
  // Yeni kullanıcı: token + OTP + signup (DavetKabulPage)
  // Kayıtlı kullanıcı: in-app banner (InvitationBanner)
  const inviteMutation = useMutation({
    mutationFn: async (values: { email: string; projectRole: 'manager' | 'user' }) => {
      if (!projeId) throw new Error('Aktif proje yok')
      return invitationsApi.create(projeId, values)
    },
    onSuccess: (res) => {
      message.success(
        res.isNewUser
          ? 'Davet e-postası gönderildi. Kullanıcı linki tıklayarak kayıt olacak.'
          : 'Davet gönderildi. Kullanıcı uygulamadan kabul/red seçecek.',
      )
      queryClient.invalidateQueries({ queryKey: ['proje-uyelikler', projeId] })
      queryClient.invalidateQueries({ queryKey: ['project-invitations', projeId] })
      setInviteOpen(false)
      inviteForm.resetFields()
    },
    onError: (err: any) => {
      const status = err?.response?.status
      if (status === 409) {
        message.error('Bu e-mail için bekleyen davet var. Önce iptal etmeniz gerekiyor.')
      } else {
        message.error(getErrorMessage(err, 'Davet gönderilemedi'))
      }
    },
  })

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, rol }: { userId: string; rol: ProjectRole }) => {
      if (!projeId) throw new Error('Aktif proje yok')
      const { data } = await api.patch(`/projeler/${projeId}/uyeler/${userId}`, { rol })
      return data
    },
    onSuccess: () => {
      message.success('Rol güncellendi')
      queryClient.invalidateQueries({ queryKey: ['proje-uyelikler', projeId] })
      setRoleEdit(null)
      roleForm.resetFields()
    },
    onError: (err) => message.error(getErrorMessage(err, 'Rol güncellenemedi')),
  })

  const removeMutation = useMutation({
    mutationFn: async (userId: string) => {
      if (!projeId) throw new Error('Aktif proje yok')
      const { data } = await api.delete(`/projeler/${projeId}/uyeler/${userId}`)
      return data
    },
    onSuccess: () => {
      message.success('Üyelikten çıkarıldı')
      queryClient.invalidateQueries({ queryKey: ['proje-uyelikler', projeId] })
    },
    onError: (err) => message.error(getErrorMessage(err, 'Üyelikten çıkarma başarısız')),
  })

  const passwordResetMutation = useMutation({
    mutationFn: async ({ userId, newPassword }: { userId: string; newPassword?: string }) => {
      if (!projeId) throw new Error('Aktif proje yok')
      const { data } = await api.post(`/admin/users/${userId}/sifre-yenile`, {
        projeId,
        newPassword: newPassword || undefined,
      })
      return data
    },
    onSuccess: (res) => {
      const result = res?.data as { email: string; password: string; generated: boolean }
      setPwResetResult(result)
      setPwResetTarget(null)
      pwForm.resetFields()
      message.success('Şifre güncellendi')
    },
    onError: (err) => message.error(getErrorMessage(err, 'Şifre yenilenemedi')),
  })

  const openRoleEdit = (u: ProjeUye) => {
    setRoleEdit(u)
    roleForm.setFieldsValue({ rol: u.rol })
  }

  const openPasswordReset = (u: ProjeUye) => {
    setPwResetTarget(u)
    pwForm.setFieldsValue({ generate: true, newPassword: '' })
  }

  const handleInviteSubmit = async () => {
    const values = await inviteForm.validateFields()
    inviteMutation.mutate(values)
  }

  const handleRoleSubmit = async () => {
    const values = await roleForm.validateFields()
    if (!roleEdit) return
    updateRoleMutation.mutate({ userId: roleEdit.user_id, rol: values.rol })
  }

  const handlePasswordReset = async () => {
    const values = await pwForm.validateFields()
    if (!pwResetTarget) return
    passwordResetMutation.mutate({
      userId: pwResetTarget.user_id,
      newPassword: values.generate ? undefined : values.newPassword,
    })
  }

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      message.success('Panoya kopyalandı')
    } catch {
      message.error('Kopyalanamadı — manuel seçin')
    }
  }

  // Sütun genişlikleri yeniden ayarlandı (kullanıcı isteği 2026-05-24):
  // E-posta esnek (artık fixed 400 vermiyoruz, ellipsis ile uzar), Rol 130→90,
  // Eklendi 140→100, İşlem 180→130.
  const columns = useMemo(
    () => [
      {
        title: 'E-posta',
        dataIndex: 'email',
        key: 'email',
        ellipsis: true,
        render: (v?: string) => <Typography.Text strong>{v ?? '-'}</Typography.Text>,
      },
      {
        title: 'Rol',
        dataIndex: 'rol',
        key: 'rol',
        width: 90,
        render: (v: ProjectRole) => <Tag color={ROLE_COLORS[v] ?? 'default'}>{ROLE_LABELS[v] ?? v}</Tag>,
      },
      {
        title: 'Eklendi',
        dataIndex: 'created_at',
        key: 'created_at',
        width: 100,
        render: (v: string) => {
          if (!v) return '-'
          const d = new Date(v)
          return d.toLocaleDateString('tr-TR')
        },
      },
      {
        title: 'İşlem',
        key: 'actions',
        width: 130,
        align: 'center' as const,
        render: (_: unknown, r: ProjeUye) => {
          const targetIsOwner = r.rol === 'owner'
          // Backend kuralları:
          //   - Rol değiştir: owner satırına dokunulamaz (backend reddeder).
          //     Owner kendisi de değiştiremez (backend reddeder).
          //   - Şifre yenile: sadece owner çağırabilir + target owner olmamalı.
          //   - Çıkar: owner çıkarılamaz.
          return (
            <Space size={4}>
              <Tooltip title={targetIsOwner ? 'Owner rolü değiştirilemez' : 'Rol değiştir'}>
                <Button
                  type="text"
                  size="small"
                  icon={<EditOutlined />}
                  disabled={targetIsOwner}
                  onClick={() => openRoleEdit(r)}
                />
              </Tooltip>
              {isOwner && (
                <Tooltip
                  title={
                    targetIsOwner
                      ? "Owner'ın şifresi başkası tarafından sıfırlanamaz"
                      : 'Şifre yenile'
                  }
                >
                  <Button
                    type="text"
                    size="small"
                    icon={<KeyOutlined />}
                    disabled={targetIsOwner}
                    onClick={() => openPasswordReset(r)}
                  />
                </Tooltip>
              )}
              <Popconfirm
                title="Üyelikten çıkar"
                description="Bu kullanıcı projeden çıkarılır (hesabı silinmez). Emin misiniz?"
                onConfirm={() => removeMutation.mutate(r.user_id)}
                okText="Evet, Çıkar"
                cancelText="Vazgeç"
                okButtonProps={{ danger: true }}
                disabled={targetIsOwner}
              >
                <Tooltip title={targetIsOwner ? 'Owner çıkarılamaz' : 'Üyelikten çıkar'}>
                  <Button
                    type="text"
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    disabled={targetIsOwner}
                    loading={removeMutation.isPending && removeMutation.variables === r.user_id}
                  />
                </Tooltip>
              </Popconfirm>
            </Space>
          )
        },
      },
    ],
    [removeMutation, isOwner],
  )

  if (!projeId) {
    return (
      <div>
        <PageHeader
          title="Kullanıcı Yönetimi"
          subtitle="Aktif proje seçilmedi"
        />
        <Card>
          <Empty description="Önce bir proje seçin (sol menüden Proje Listesi → bir projeye girin)" />
        </Card>
      </div>
    )
  }

  if (isError) {
    return <ErrorState error={error} title="Üyeler yüklenemedi" onRetry={() => refetch()} />
  }

  const uyeSayisi = uyeler?.length ?? 0

  return (
    <div>
      <PageHeader
        title="Kullanıcı Yönetimi"
        subtitle={`Aktif proje: ${activeProject?.proje_adi ?? '-'} — Üye sayısı: ${uyeSayisi}`}
        extra={
          <Space size={8}>
            <Button icon={<ReloadOutlined />} onClick={() => refetch()}>
              Yenile
            </Button>
            <Button type="primary" icon={<UserAddOutlined />} onClick={() => setInviteOpen(true)}>
              Üye Davet Et
            </Button>
            {isAdmin && (
              <Button
                icon={<MailOutlined />}
                data-testid="yetkili-davet-btn"
                onClick={() => setYetkiliInviteOpen(true)}
              >
                Yetkili Davet Et
              </Button>
            )}
          </Space>
        }
      />

      <Card>
        <Tabs
          defaultActiveKey="active"
          items={[
            // PR-B: Admin'e özel "Sistem Kullanıcıları" sekmesi
            ...(isAdmin
              ? [
                  {
                    key: 'sistem',
                    label: 'Sistem Kullanıcıları',
                    children: (
                      <Table<SistemKullanici>
                        dataSource={sistemKullanicilar}
                        rowKey="id"
                        loading={sistemLoading}
                        pagination={{ pageSize: 50 }}
                        locale={{ emptyText: 'Kullanıcı yok' }}
                        columns={[
                          {
                            title: 'E-posta',
                            dataIndex: 'email',
                            render: (v: string) => <Typography.Text strong>{v}</Typography.Text>,
                          },
                          {
                            title: 'Global Rol',
                            dataIndex: 'global_role',
                            width: 140,
                            render: (v: SistemKullanici['global_role']) => {
                              if (!v) return <Tag>Rol Yok</Tag>
                              const colors: Record<string, string> = { admin: 'red', yetkili: 'gold', staff: 'default' }
                              return <Tag color={colors[v] ?? 'default'}>{GLOBAL_ROLE_TR[v as keyof typeof GLOBAL_ROLE_TR] ?? v}</Tag>
                            },
                          },
                          {
                            title: 'Proje Açabilir',
                            dataIndex: 'can_create_projects',
                            width: 120,
                            render: (v: boolean) => (
                              <Tag color={v ? 'green' : 'default'}>{v ? 'Evet' : 'Hayır'}</Tag>
                            ),
                          },
                          {
                            title: 'Aksiyon',
                            key: 'actions',
                            width: 240,
                            render: (_: unknown, r: SistemKullanici) => {
                              const isSelf = r.id === currentUser?.id
                              const isTargetAdmin = r.global_role === 'admin'
                              const isYetkiliUser = r.global_role === 'yetkili'

                              if (isTargetAdmin) {
                                return (
                                  <Tooltip title="Admin rolü sadece DB üzerinden değiştirilebilir">
                                    <Tag color="red">Admin (değiştirilemez)</Tag>
                                  </Tooltip>
                                )
                              }

                              return (
                                <Space size={4}>
                                  {!isYetkiliUser ? (
                                    <Tooltip title={isSelf ? 'Kendi rolünüzü değiştiremezsiniz' : 'Yetkili yap'}>
                                      <Button
                                        size="small"
                                        type="primary"
                                        disabled={isSelf || setRoleMutation.isPending}
                                        loading={
                                          setRoleMutation.isPending &&
                                          (setRoleMutation.variables as any)?.userId === r.id
                                        }
                                        data-testid={`promote-btn-${r.id}`}
                                        onClick={() => setRoleMutation.mutate({ userId: r.id, role: 'yetkili' })}
                                      >
                                        Yetkili Yap
                                      </Button>
                                    </Tooltip>
                                  ) : (
                                    <Tooltip title={isSelf ? 'Kendi rolünüzü değiştiremezsiniz' : 'Yetkili yetkisini kaldır'}>
                                      <Popconfirm
                                        title="Yetkili yetkisini kaldır"
                                        description="Bu kullanıcı artık yeni proje açamaz. Mevcut üyelikleri değişmez."
                                        onConfirm={() => setRoleMutation.mutate({ userId: r.id, role: 'staff' })}
                                        okText="Evet, Kaldır"
                                        cancelText="Vazgeç"
                                        okButtonProps={{ danger: true }}
                                        disabled={isSelf}
                                      >
                                        <Button
                                          size="small"
                                          danger
                                          disabled={isSelf}
                                          loading={
                                            setRoleMutation.isPending &&
                                            (setRoleMutation.variables as any)?.userId === r.id
                                          }
                                          data-testid={`demote-btn-${r.id}`}
                                        >
                                          Yetkili Yetkisini Kaldır
                                        </Button>
                                      </Popconfirm>
                                    </Tooltip>
                                  )}
                                </Space>
                              )
                            },
                          },
                        ]}
                      />
                    ),
                  },
                ]
              : []),
            {
              key: 'active',
              label: `Aktif Üyeler (${uyeSayisi})`,
              children: (
                <>
                  <div style={{ marginBottom: 16, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                    <Statistic title="Toplam Üye" value={uyeSayisi} />
                    <Statistic
                      title="Owner"
                      value={uyeler?.filter((u) => u.rol === 'owner').length ?? 0}
                    />
                    <Statistic
                      title="Yönetici"
                      value={uyeler?.filter((u) => u.rol === 'manager').length ?? 0}
                    />
                    <Statistic
                      title="Kullanıcı"
                      value={uyeler?.filter((u) => u.rol === 'user').length ?? 0}
                    />
                  </div>
                  <Table
                    columns={columns}
                    dataSource={uyeler}
                    rowKey="user_id"
                    loading={isLoading}
                    pagination={{ pageSize: 50, showSizeChanger: true }}
                    locale={{ emptyText: 'Bu projede henüz üye yok — yukarıdan davet edin' }}
                  />
                </>
              ),
            },
            {
              key: 'pending',
              label: `Bekleyen Davetler (${pendingInvites?.length ?? 0})`,
              children: (
                <Table<ProjectInvitation>
                  dataSource={pendingInvites}
                  rowKey="id"
                  loading={pendingLoading}
                  pagination={false}
                  locale={{ emptyText: 'Bekleyen davet yok' }}
                  columns={[
                    { title: 'E-Mail', dataIndex: 'email' },
                    {
                      title: 'Rol',
                      dataIndex: 'invited_role',
                      render: (r: string) => <Tag color="blue">{r}</Tag>,
                    },
                    {
                      title: 'Davet Tarihi',
                      dataIndex: 'created_at',
                      render: (v: string) => new Date(v).toLocaleDateString('tr-TR'),
                    },
                    {
                      title: 'Geçerlilik',
                      dataIndex: 'expires_at',
                      render: (v: string) => new Date(v).toLocaleDateString('tr-TR'),
                    },
                    { title: 'Deneme', dataIndex: 'attempt_count', width: 80 },
                    {
                      title: 'Aksiyon',
                      width: 120,
                      render: (_: unknown, row: ProjectInvitation) => (
                        <Popconfirm
                          title="Bu daveti iptal etmek istediğinize emin misiniz?"
                          onConfirm={() => cancelInviteMutation.mutate(row.id)}
                          okText="Evet, İptal Et"
                          cancelText="Vazgeç"
                        >
                          <Button danger size="small" loading={cancelInviteMutation.isPending}>
                            İptal
                          </Button>
                        </Popconfirm>
                      ),
                    },
                  ]}
                />
              ),
            },
            {
              key: 'history',
              label: 'Geçmiş',
              children: (
                <Table<ProjectInvitation>
                  dataSource={historyInvites}
                  rowKey="id"
                  loading={historyLoading}
                  pagination={{ pageSize: 50 }}
                  locale={{ emptyText: 'Geçmiş davet yok' }}
                  columns={[
                    { title: 'E-Mail', dataIndex: 'email' },
                    {
                      title: 'Rol',
                      dataIndex: 'invited_role',
                      render: (r: string) => <Tag color="blue">{r}</Tag>,
                    },
                    {
                      title: 'Durum',
                      dataIndex: 'status',
                      render: (s: string) => {
                        const color =
                          s === 'accepted' ? 'green' : s === 'rejected' ? 'red' : 'default'
                        return <Tag color={color}>{s}</Tag>
                      },
                    },
                    {
                      title: 'Davet Tarihi',
                      dataIndex: 'created_at',
                      render: (v: string) => new Date(v).toLocaleDateString('tr-TR'),
                    },
                    {
                      title: 'Aksiyon',
                      width: 140,
                      render: (_: unknown, row: ProjectInvitation) =>
                        ['rejected', 'expired'].includes(row.status) ? (
                          <Button
                            size="small"
                            loading={inviteMutation.isPending}
                            onClick={() =>
                              inviteMutation.mutate({
                                email: row.email,
                                // yetkili daveti proje bazlı tekrar davet ile uyumsuz — sadece manager/user
                                projectRole: (row.invited_role === 'yetkili' ? 'user' : row.invited_role) as 'manager' | 'user',
                              })
                            }
                          >
                            Tekrar Davet Et
                          </Button>
                        ) : null,
                    },
                  ]}
                />
              ),
            },
          ]}
        />
      </Card>

      {/* Davet Modal */}
      <Modal
        title="Projeye Üye Davet Et"
        open={inviteOpen}
        onCancel={() => {
          setInviteOpen(false)
          inviteForm.resetFields()
        }}
        onOk={handleInviteSubmit}
        okText="Davet Gönder"
        cancelText="Vazgeç"
        confirmLoading={inviteMutation.isPending}
        destroyOnClose
        width={520}
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={`Davet edilen kullanıcı "${activeProject?.proje_adi ?? ''}" projesine eklenecektir.`}
          description="E-posta zaten kayıtlıysa yeni magic-link gönderilmez; sadece projeye eklenir."
        />
        <Form form={inviteForm} layout="vertical" autoComplete="off">
          <Form.Item
            label="E-posta"
            name="email"
            rules={[
              { required: true, message: 'E-posta zorunlu' },
              { type: 'email', message: 'Geçerli bir e-posta girin' },
            ]}
          >
            <Input prefix={<MailOutlined />} placeholder="ornek@firma.com" autoComplete="off" />
          </Form.Item>

          <Form.Item
            label="Proje Rolü"
            name="projectRole"
            initialValue="user"
            rules={[{ required: true, message: 'Rol seçin' }]}
            tooltip="Yönetici: yıkıcı işlemler + parametre değişiklikleri. Kullanıcı: form girişi + okuma."
          >
            <Select
              options={[
                { value: 'manager', label: 'Yönetici (manager) — yıkıcı işlemler + ayarlar' },
                { value: 'user', label: 'Kullanıcı (user) — form girişi + okuma' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* Rol Değiştir Modal */}
      <Modal
        title={`Rol Değiştir — ${roleEdit?.email ?? ''}`}
        open={!!roleEdit}
        onCancel={() => {
          setRoleEdit(null)
          roleForm.resetFields()
        }}
        onOk={handleRoleSubmit}
        okText="Kaydet"
        cancelText="Vazgeç"
        confirmLoading={updateRoleMutation.isPending}
        destroyOnClose
      >
        <Form form={roleForm} layout="vertical" autoComplete="off">
          <Form.Item
            label="Proje Rolü"
            name="rol"
            rules={[{ required: true }]}
            tooltip="Owner rolüne yükseltme bu akışta desteklenmez."
          >
            <Select
              options={[
                { value: 'manager', label: 'Yönetici (manager)' },
                { value: 'user', label: 'Kullanıcı (user)' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* Şifre Yenile Modal */}
      <Modal
        title={`Şifre Yenile — ${pwResetTarget?.email ?? ''}`}
        open={!!pwResetTarget}
        onCancel={() => {
          setPwResetTarget(null)
          pwForm.resetFields()
        }}
        onOk={handlePasswordReset}
        okText="Şifreyi Yenile"
        cancelText="Vazgeç"
        confirmLoading={passwordResetMutation.isPending}
        destroyOnClose
        okButtonProps={{ danger: true }}
      >
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="Bu işlem hedef kullanıcının şifresini hemen değiştirir. Yeni şifre size gösterilir — kullanıcıya güvenli bir kanaldan iletin."
        />
        <Form form={pwForm} layout="vertical" autoComplete="off" initialValues={{ generate: true }}>
          <Form.Item label="Otomatik üret" name="generate" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item
            noStyle
            shouldUpdate={(prev, cur) => prev.generate !== cur.generate}
          >
            {({ getFieldValue }) =>
              !getFieldValue('generate') ? (
                <Form.Item
                  label="Yeni Şifre"
                  name="newPassword"
                  rules={[
                    { required: true, message: 'Şifre girin' },
                    { min: 8, message: 'En az 8 karakter' },
                    { max: 72, message: 'En fazla 72 karakter' },
                  ]}
                >
                  <Input.Password autoComplete="new-password" placeholder="Yeni şifre" />
                </Form.Item>
              ) : (
                <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                  16 karakter rastgele güvenli şifre üretilecek.
                </Typography.Paragraph>
              )
            }
          </Form.Item>
        </Form>
      </Modal>

      {/* PR-B: Yetkili davet modal — sadece admin */}
      {isAdmin && (
        <YetkiliInviteModal
          open={yetkiliInviteOpen}
          onClose={() => setYetkiliInviteOpen(false)}
        />
      )}

      {/* Yenilenmiş şifre gösterim modalı */}
      <Modal
        title="Şifre Güncellendi"
        open={!!pwResetResult}
        onCancel={() => setPwResetResult(null)}
        footer={[
          <Button key="close" type="primary" onClick={() => setPwResetResult(null)}>
            Kapat
          </Button>,
        ]}
        destroyOnClose
      >
        <Alert
          type="success"
          showIcon
          style={{ marginBottom: 16 }}
          message={`${pwResetResult?.email} kullanıcısının şifresi güncellendi`}
          description={
            pwResetResult?.generated
              ? 'Aşağıdaki şifreyi kopyalayın ve güvenli bir kanaldan kullanıcıya iletin. Bu pencere kapatıldıktan sonra şifre sistemde tutulmaz.'
              : 'Belirttiğiniz şifre kullanıldı. Kullanıcıya iletin.'
          }
        />
        {pwResetResult && (
          <Space.Compact style={{ width: '100%' }}>
            <Input value={pwResetResult.password} readOnly style={{ fontFamily: 'monospace' }} />
            <Button
              icon={<CopyOutlined />}
              onClick={() => copyToClipboard(pwResetResult.password)}
            >
              Kopyala
            </Button>
          </Space.Compact>
        )}
      </Modal>
    </div>
  )
}
