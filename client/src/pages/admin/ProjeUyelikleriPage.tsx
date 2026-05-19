import React, { useMemo, useState } from 'react'
import { App, Button, Card, Form, Modal, Popconfirm, Select, Space, Table, Tag, Tooltip, Typography } from 'antd'
import { DeleteOutlined, EditOutlined, ReloadOutlined, UserAddOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../../lib/api'
import { getErrorMessage } from '../../lib/apiError'
import { ErrorState } from '../../components/common/ErrorState'
import { PageHeader } from '../../components/common/PageHeader'
import { usePageSettings } from '../../contexts/LayoutContext'

// Sprint 20260520-frontend-role-awareness (Faz 3c):
// Proje Üyelikleri — global admin only. Faz 2 (#58) API'leri kullanır.
//
// Endpoint'ler:
//   - GET    /api/projeler/:projeId/uyeler           — proje üyeleri listesi
//   - POST   /api/projeler/:projeId/uyeler           — üye ekle/rol güncelle
//   - PATCH  /api/projeler/:projeId/uyeler/:userId   — rol güncelle
//   - DELETE /api/projeler/:projeId/uyeler/:userId   — üyelikten çıkar

interface ProjeUyelik {
  user_id: string
  proje_id: string
  rol: 'admin' | 'staff' | 'viewer'
  email?: string
  created_at: string
}

interface AdminUser {
  id: string
  email: string
}

interface Proje {
  id: string
  proje_adi: string
}

type ProjeRol = 'admin' | 'staff' | 'viewer'

export const ProjeUyelikleriPage: React.FC = () => {
  const { projeId } = useParams<{ projeId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { message } = App.useApp()
  const [addOpen, setAddOpen] = useState(false)
  const [editUyelik, setEditUyelik] = useState<ProjeUyelik | null>(null)
  const [addForm] = Form.useForm()
  const [editForm] = Form.useForm()

  usePageSettings('Proje Üyelikleri')

  const { data: proje } = useQuery({
    queryKey: ['proje-detail', projeId],
    queryFn: async () => {
      if (!projeId) return null
      const { data } = await api.get('/projeler')
      return (data.data as Proje[]).find((p) => p.id === projeId) ?? null
    },
    enabled: !!projeId,
  })

  const {
    data: uyelikler,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['proje-uyelikler', projeId],
    queryFn: async () => {
      if (!projeId) return [] as ProjeUyelik[]
      const { data } = await api.get(`/projeler/${projeId}/uyeler`)
      return data.data as ProjeUyelik[]
    },
    enabled: !!projeId,
  })

  // Add modal için kullanıcı listesi (zaten üye olmayanlar filtrelenir)
  const { data: allUsers } = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const { data } = await api.get('/admin/users')
      return data.data as AdminUser[]
    },
    enabled: addOpen,
  })

  const eligibleUsers = useMemo(() => {
    if (!allUsers) return []
    const memberIds = new Set((uyelikler ?? []).map((u) => u.user_id))
    return allUsers.filter((u) => !memberIds.has(u.id))
  }, [allUsers, uyelikler])

  const addMutation = useMutation({
    mutationFn: async (values: any) => {
      if (!projeId) throw new Error('proje_id gerekli')
      const { data } = await api.post(`/projeler/${projeId}/uyeler`, {
        user_id: values.user_id,
        rol: values.rol,
      })
      return data
    },
    onSuccess: () => {
      message.success('Üye eklendi')
      queryClient.invalidateQueries({ queryKey: ['proje-uyelikler', projeId] })
      setAddOpen(false)
      addForm.resetFields()
    },
    onError: (err) => message.error(getErrorMessage(err, 'Üye eklenemedi')),
  })

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, rol }: { userId: string; rol: ProjeRol }) => {
      if (!projeId) throw new Error('proje_id gerekli')
      const { data } = await api.patch(`/projeler/${projeId}/uyeler/${userId}`, { rol })
      return data
    },
    onSuccess: () => {
      message.success('Rol güncellendi')
      queryClient.invalidateQueries({ queryKey: ['proje-uyelikler', projeId] })
      setEditUyelik(null)
      editForm.resetFields()
    },
    onError: (err) => message.error(getErrorMessage(err, 'Rol güncellenemedi')),
  })

  const removeMutation = useMutation({
    mutationFn: async (userId: string) => {
      if (!projeId) throw new Error('proje_id gerekli')
      const { data } = await api.delete(`/projeler/${projeId}/uyeler/${userId}`)
      return data
    },
    onSuccess: () => {
      message.success('Üye çıkarıldı')
      queryClient.invalidateQueries({ queryKey: ['proje-uyelikler', projeId] })
    },
    onError: (err) => message.error(getErrorMessage(err, 'Çıkarma başarısız')),
  })

  const openEdit = (u: ProjeUyelik) => {
    setEditUyelik(u)
    editForm.setFieldsValue({ rol: u.rol })
  }

  const handleAddSubmit = async () => {
    const values = await addForm.validateFields()
    addMutation.mutate(values)
  }

  const handleEditSubmit = async () => {
    const values = await editForm.validateFields()
    if (!editUyelik) return
    updateRoleMutation.mutate({ userId: editUyelik.user_id, rol: values.rol })
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
        title: 'Proje Rolü',
        dataIndex: 'rol',
        key: 'rol',
        width: 130,
        render: (v: ProjeRol) => {
          const colors: Record<ProjeRol, string> = { admin: 'red', staff: 'blue', viewer: 'default' }
          return <Tag color={colors[v]}>{v.toUpperCase()}</Tag>
        },
      },
      {
        title: 'İşlem',
        key: 'actions',
        width: 140,
        align: 'center' as const,
        render: (_: unknown, r: ProjeUyelik) => (
          <Space size={4}>
            <Tooltip title="Rol değiştir">
              <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
            </Tooltip>
            <Popconfirm
              title="Üyelikten çıkar"
              description="Bu kullanıcı projeden çıkarılır (auth.users etkilenmez). Emin misiniz?"
              onConfirm={() => removeMutation.mutate(r.user_id)}
              okText="Evet, Çıkar"
              cancelText="Vazgeç"
              okButtonProps={{ danger: true }}
            >
              <Tooltip title="Üyelikten çıkar">
                <Button
                  type="text"
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  loading={removeMutation.isPending && removeMutation.variables === r.user_id}
                />
              </Tooltip>
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [removeMutation],
  )

  if (isError) {
    return <ErrorState error={error} title="Üyelikler yüklenemedi" onRetry={() => refetch()} />
  }

  return (
    <div>
      <PageHeader
        title={`Proje Üyelikleri${proje ? ` — ${proje.proje_adi}` : ''}`}
        subtitle="Bu projeye atanmış kullanıcıları yönet"
        onBack={() => navigate('/projeler')}
        extra={
          <Space size={8}>
            <Button icon={<ReloadOutlined />} onClick={() => refetch()}>
              Yenile
            </Button>
            <Button type="primary" icon={<UserAddOutlined />} onClick={() => setAddOpen(true)}>
              Üye Ekle
            </Button>
          </Space>
        }
      />

      <Card>
        <Table
          columns={columns}
          dataSource={uyelikler}
          rowKey="user_id"
          loading={isLoading}
          pagination={{ pageSize: 50, showSizeChanger: true }}
        />
      </Card>

      {/* Üye Ekle Modal */}
      <Modal
        title="Üye Ekle"
        open={addOpen}
        onCancel={() => {
          setAddOpen(false)
          addForm.resetFields()
        }}
        onOk={handleAddSubmit}
        okText="Ekle"
        cancelText="Vazgeç"
        confirmLoading={addMutation.isPending}
        destroyOnClose
      >
        <Form form={addForm} layout="vertical" autoComplete="off">
          <Form.Item
            label="Kullanıcı"
            name="user_id"
            rules={[{ required: true, message: 'Kullanıcı seçin' }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="Kullanıcı seç (zaten üye olanlar gizlendi)"
              options={eligibleUsers.map((u) => ({ value: u.id, label: u.email }))}
              notFoundContent="Eklenebilir kullanıcı yok — Kullanıcı Yönetimi'nden davet edin"
            />
          </Form.Item>
          <Form.Item
            label="Proje Rolü"
            name="rol"
            initialValue="viewer"
            rules={[{ required: true }]}
          >
            <Select
              options={[
                { value: 'admin', label: 'Admin (projede tam yetki)' },
                { value: 'staff', label: 'Staff (düzenleme yetkisi)' },
                { value: 'viewer', label: 'Viewer (sadece görüntüleme)' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* Rol Değiştir Modal */}
      <Modal
        title={`Rol Değiştir — ${editUyelik?.email ?? ''}`}
        open={!!editUyelik}
        onCancel={() => {
          setEditUyelik(null)
          editForm.resetFields()
        }}
        onOk={handleEditSubmit}
        okText="Kaydet"
        cancelText="Vazgeç"
        confirmLoading={updateRoleMutation.isPending}
        destroyOnClose
      >
        <Form form={editForm} layout="vertical" autoComplete="off">
          <Form.Item label="Proje Rolü" name="rol" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'admin', label: 'Admin' },
                { value: 'staff', label: 'Staff' },
                { value: 'viewer', label: 'Viewer' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
