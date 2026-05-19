import React, { useMemo, useState } from 'react'
import {
  App,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import { DeleteOutlined, EditOutlined, MailOutlined, ReloadOutlined, UserAddOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../lib/api'
import { getErrorMessage } from '../../lib/apiError'
import { ErrorState } from '../../components/common/ErrorState'
import { PageHeader } from '../../components/common/PageHeader'
import { usePageSettings } from '../../contexts/LayoutContext'

// Sprint 20260520-frontend-role-awareness (Faz 3c):
// Kullanıcı Yönetimi — global admin only. Faz 2 (#58) admin API'leri kullanır.
//
// Endpoint'ler:
//   - GET    /api/admin/users
//   - POST   /api/admin/users/invite (email + globalRole + projectAssignments)
//   - PATCH  /api/admin/users/:id/role
//   - DELETE /api/admin/users/:id
//
// Davet akışı: Supabase auth.admin.inviteUserByEmail magic-link gönderir.
// Kullanıcı magic-link'e tıklayıp /sifre-belirle sayfasında şifresini belirler.

interface AdminUser {
  id: string
  email: string
  role: 'admin' | 'staff' | null
  proje_count: number
  created_at: string
}

interface Proje {
  id: string
  proje_adi: string
}

type GlobalRole = 'admin' | 'staff' | null

export const KullaniciYonetimiPage: React.FC = () => {
  const queryClient = useQueryClient()
  const { message } = App.useApp()
  const [inviteOpen, setInviteOpen] = useState(false)
  const [roleEditUser, setRoleEditUser] = useState<AdminUser | null>(null)
  const [inviteForm] = Form.useForm()
  const [roleForm] = Form.useForm()

  usePageSettings('Kullanıcı Yönetimi')

  const {
    data: users,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const { data } = await api.get('/admin/users')
      return data.data as AdminUser[]
    },
  })

  const { data: projeler } = useQuery({
    queryKey: ['projeler-for-invite'],
    queryFn: async () => {
      const { data } = await api.get('/projeler')
      return data.data as Proje[]
    },
  })

  const inviteMutation = useMutation({
    mutationFn: async (values: any) => {
      const payload = {
        email: values.email,
        globalRole: (values.globalRole as string) === 'none' ? null : values.globalRole,
        projectAssignments: (values.projectAssignments ?? []).map((p: any) => ({
          proje_id: p.proje_id,
          rol: p.rol,
        })),
      }
      const { data } = await api.post('/admin/users/invite', payload)
      return data
    },
    onSuccess: () => {
      message.success('Davet e-postası gönderildi')
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      setInviteOpen(false)
      inviteForm.resetFields()
    },
    onError: (err) => message.error(getErrorMessage(err, 'Davet gönderilemedi')),
  })

  const roleMutation = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: GlobalRole }) => {
      const { data } = await api.patch(`/admin/users/${id}/role`, { role })
      return data
    },
    onSuccess: () => {
      message.success('Rol güncellendi')
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      setRoleEditUser(null)
      roleForm.resetFields()
    },
    onError: (err) => message.error(getErrorMessage(err, 'Rol güncellenemedi')),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.delete(`/admin/users/${id}`)
      return data
    },
    onSuccess: () => {
      message.success('Kullanıcı silindi')
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
    },
    onError: (err) => message.error(getErrorMessage(err, 'Silme başarısız')),
  })

  const openRoleEdit = (user: AdminUser) => {
    setRoleEditUser(user)
    roleForm.setFieldsValue({ role: user.role ?? 'none' })
  }

  const handleRoleSubmit = async () => {
    const values = await roleForm.validateFields()
    if (!roleEditUser) return
    const newRole: GlobalRole = values.role === 'none' ? null : values.role
    roleMutation.mutate({ id: roleEditUser.id, role: newRole })
  }

  const handleInviteSubmit = async () => {
    const values = await inviteForm.validateFields()
    inviteMutation.mutate(values)
  }

  const columns = useMemo(
    () => [
      {
        title: 'E-posta',
        dataIndex: 'email',
        key: 'email',
        render: (v: string) => <Typography.Text strong>{v}</Typography.Text>,
      },
      {
        title: 'Global Rol',
        dataIndex: 'role',
        key: 'role',
        width: 130,
        render: (v: GlobalRole) => {
          if (v === 'admin') return <Tag color="red">Admin</Tag>
          if (v === 'staff') return <Tag color="blue">Staff</Tag>
          return <Tag>—</Tag>
        },
      },
      {
        title: 'Proje Sayısı',
        dataIndex: 'proje_count',
        key: 'proje_count',
        width: 120,
        align: 'center' as const,
      },
      {
        title: 'İşlem',
        key: 'actions',
        width: 140,
        align: 'center' as const,
        render: (_: unknown, r: AdminUser) => (
          <Space size={4}>
            <Tooltip title="Rol değiştir">
              <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openRoleEdit(r)} />
            </Tooltip>
            <Popconfirm
              title="Kullanıcıyı sil"
              description="Bu kullanıcı ve tüm üyelikleri kalıcı olarak silinir. Emin misiniz?"
              onConfirm={() => deleteMutation.mutate(r.id)}
              okText="Evet, Sil"
              cancelText="Vazgeç"
              okButtonProps={{ danger: true }}
            >
              <Tooltip title="Kullanıcıyı sil">
                <Button
                  type="text"
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  loading={deleteMutation.isPending && deleteMutation.variables === r.id}
                />
              </Tooltip>
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [deleteMutation],
  )

  if (isError) {
    return <ErrorState error={error} title="Kullanıcılar yüklenemedi" onRetry={() => refetch()} />
  }

  return (
    <div>
      <PageHeader
        title="Kullanıcı Yönetimi"
        subtitle="Sistemdeki tüm kullanıcıları görüntüle, davet et, rol değiştir veya sil"
        extra={
          <Space size={8}>
            <Button icon={<ReloadOutlined />} onClick={() => refetch()}>
              Yenile
            </Button>
            <Button type="primary" icon={<UserAddOutlined />} onClick={() => setInviteOpen(true)}>
              Yeni Kullanıcı Davet Et
            </Button>
          </Space>
        }
      />

      <Card>
        <Table
          columns={columns}
          dataSource={users}
          rowKey="id"
          loading={isLoading}
          pagination={{ pageSize: 50, showSizeChanger: true }}
        />
      </Card>

      {/* Davet Modal */}
      <Modal
        title="Yeni Kullanıcı Davet Et"
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
        width={600}
      >
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
            label="Global Rol"
            name="globalRole"
            initialValue="none"
            tooltip="Admin: tüm sistemde tam yetki. Staff: sadece atandığı projelerde işlem yapabilir."
          >
            <Select
              options={[
                { value: 'none', label: 'Yok (sadece proje üyesi)' },
                { value: 'staff', label: 'Staff' },
                { value: 'admin', label: 'Admin (tam yetki)' },
              ]}
            />
          </Form.Item>

          <Form.Item label="Proje Atamaları (opsiyonel)">
            <Form.List name="projectAssignments">
              {(fields, { add, remove }) => (
                <>
                  {fields.map((field) => (
                    <Space key={field.key} align="start" style={{ display: 'flex', marginBottom: 8 }}>
                      <Form.Item
                        name={[field.name, 'proje_id']}
                        rules={[{ required: true, message: 'Proje seçin' }]}
                        style={{ flex: 2, marginBottom: 0 }}
                      >
                        <Select
                          showSearch
                          optionFilterProp="label"
                          placeholder="Proje seç"
                          options={(projeler ?? []).map((p) => ({ value: p.id, label: p.proje_adi }))}
                          style={{ width: 280 }}
                        />
                      </Form.Item>
                      <Form.Item
                        name={[field.name, 'rol']}
                        initialValue="viewer"
                        rules={[{ required: true }]}
                        style={{ flex: 1, marginBottom: 0 }}
                      >
                        <Select
                          options={[
                            { value: 'admin', label: 'Admin' },
                            { value: 'staff', label: 'Staff' },
                            { value: 'viewer', label: 'Viewer' },
                          ]}
                          style={{ width: 110 }}
                        />
                      </Form.Item>
                      <Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(field.name)} />
                    </Space>
                  ))}
                  <Button type="dashed" block onClick={() => add({ rol: 'viewer' })}>
                    + Proje Ataması Ekle
                  </Button>
                </>
              )}
            </Form.List>
          </Form.Item>
        </Form>
      </Modal>

      {/* Rol Değiştir Modal */}
      <Modal
        title={`Rol Değiştir — ${roleEditUser?.email ?? ''}`}
        open={!!roleEditUser}
        onCancel={() => {
          setRoleEditUser(null)
          roleForm.resetFields()
        }}
        onOk={handleRoleSubmit}
        okText="Kaydet"
        cancelText="Vazgeç"
        confirmLoading={roleMutation.isPending}
        destroyOnClose
      >
        <Form form={roleForm} layout="vertical" autoComplete="off">
          <Form.Item label="Global Rol" name="role" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'none', label: 'Yok (sadece proje üyesi)' },
                { value: 'staff', label: 'Staff' },
                { value: 'admin', label: 'Admin' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
