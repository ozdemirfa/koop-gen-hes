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
import { getErrorMessage } from '../../lib/apiError'
import { ErrorState } from '../../components/common/ErrorState'
import { PageHeader } from '../../components/common/PageHeader'
import { usePageSettings } from '../../contexts/LayoutContext'
import { useProject } from '../../contexts/ProjectContext'
import { usePermissions } from '../../hooks/usePermissions'

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

const ROLE_LABELS: Record<ProjectRole, string> = {
  owner: 'Owner',
  manager: 'Yönetici',
  user: 'Kullanıcı',
}

const ROLE_COLORS: Record<ProjectRole, string> = {
  owner: 'gold',
  manager: 'blue',
  user: 'default',
}

export const KullaniciYonetimiPage: React.FC = () => {
  const queryClient = useQueryClient()
  const { message } = App.useApp()
  const { activeProject } = useProject()
  const { isOwner } = usePermissions()
  const projeId = activeProject?.id

  const [inviteOpen, setInviteOpen] = useState(false)
  const [roleEdit, setRoleEdit] = useState<ProjeUye | null>(null)
  const [pwResetTarget, setPwResetTarget] = useState<ProjeUye | null>(null)
  const [pwResetResult, setPwResetResult] = useState<{ email: string; password: string; generated: boolean } | null>(null)

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

  const inviteMutation = useMutation({
    mutationFn: async (values: { email: string; projectRole: 'manager' | 'user' }) => {
      if (!projeId) throw new Error('Aktif proje yok')
      const { data } = await api.post('/admin/users/invite', {
        email: values.email,
        projeId,
        projectRole: values.projectRole,
      })
      return data
    },
    onSuccess: (res) => {
      const invited = res?.data?.invited
      message.success(
        invited
          ? 'Davet e-postası gönderildi ve üye projeye eklendi'
          : 'Kullanıcı zaten kayıtlı — projeye eklendi (yeni davet e-postası gönderilmedi)',
      )
      queryClient.invalidateQueries({ queryKey: ['proje-uyelikler', projeId] })
      setInviteOpen(false)
      inviteForm.resetFields()
    },
    onError: (err) => message.error(getErrorMessage(err, 'Davet gönderilemedi')),
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

  const columns = useMemo(
    () => [
      {
        title: 'E-posta',
        dataIndex: 'email',
        key: 'email',
        render: (v?: string) => <Typography.Text strong>{v ?? '-'}</Typography.Text>,
      },
      {
        title: 'Rol',
        dataIndex: 'rol',
        key: 'rol',
        width: 130,
        render: (v: ProjectRole) => <Tag color={ROLE_COLORS[v] ?? 'default'}>{ROLE_LABELS[v] ?? v}</Tag>,
      },
      {
        title: 'Eklendi',
        dataIndex: 'created_at',
        key: 'created_at',
        width: 140,
        render: (v: string) => {
          if (!v) return '-'
          const d = new Date(v)
          return d.toLocaleDateString('tr-TR')
        },
      },
      {
        title: 'İşlem',
        key: 'actions',
        width: 180,
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
          </Space>
        }
      />

      <Card>
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
