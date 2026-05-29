import React from 'react'
import { Button, Form, Input, App, Card, Typography, Switch, Tag, Tooltip } from 'antd'
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../lib/api'
import { getErrorMessage } from '../../lib/apiError'
import { usePageSettings } from '../../contexts/LayoutContext'
import { ConfirmDelete } from '../../components/common/ConfirmDelete'
import { DataTable } from '../../components/common/DataTable'
import { usePermissions } from '../../hooks/usePermissions'
import { useAuth } from '../../contexts/AuthContext'

interface Birim {
  id: string
  ad: string
  kullanici_id: string | null
}

export const BirimListPage: React.FC = () => {
  const [form] = Form.useForm()
  const queryClient = useQueryClient()
  const { message: messageApi } = App.useApp()
  // Sprint birim-poz-user-scope (2026-05-27):
  //   Hibrit model — herkes kişisel birim ekleyebilir; global ekleme yetki gerektirir.
  //   Sil/Düzenle: admin tüm kayıtlar; non-admin yalnız kendi kayıtları.
  const { canCreateGlobalDefs, canManageGlobalDefs } = usePermissions()
  const { user } = useAuth()
  const currentUserId = user?.id ?? null

  usePageSettings('Birimler')

  const { data: birimler, isLoading } = useQuery({
    queryKey: ['settings-birimler'],
    queryFn: async () => {
      const { data } = await api.get('/settings/birimler')
      return data.data as Birim[]
    }
  })

  const createMutation = useMutation({
    mutationFn: async (values: any) => {
      return api.post('/settings/birimler', values)
    },
    onSuccess: () => {
      messageApi.success('Birim eklendi')
      form.resetFields()
      // Switch component is_global'i reset etmeyebilir — explicit set
      form.setFieldValue('is_global', false)
      queryClient.invalidateQueries({ queryKey: ['settings-birimler'] })
    },
    onError: (err) => messageApi.error(getErrorMessage(err))
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return api.delete(`/settings/birimler/${id}`)
    },
    onSuccess: () => {
      messageApi.success('Birim silindi')
      queryClient.invalidateQueries({ queryKey: ['settings-birimler'] })
    },
    onError: (err) => messageApi.error(getErrorMessage(err))
  })

  /**
   * Kullanıcı bu kaydı silebilir mi?
   *  - admin (canManageGlobalDefs) tüm kayıtlar
   *  - non-admin yalnız kendi (kullanici_id = currentUserId) kayıtları
   */
  const canDeleteRecord = (record: Birim): boolean => {
    if (canManageGlobalDefs) return true
    return !!currentUserId && record.kullanici_id === currentUserId
  }

  const columns = [
    {
      title: 'Birim Adı',
      dataIndex: 'ad',
      key: 'ad',
    },
    {
      title: 'Kapsam',
      key: 'scope',
      width: 110,
      render: (_: any, record: Birim) =>
        record.kullanici_id === null ? (
          <Tag color="blue">Genel</Tag>
        ) : (
          <Tag color="green">Kişisel</Tag>
        ),
    },
    {
      title: 'İşlem',
      key: 'action',
      width: 100,
      render: (_: any, record: Birim) => {
        const allowed = canDeleteRecord(record)
        if (!allowed) {
          const tooltipText =
            record.kullanici_id === null
              ? 'Genel birimleri yalnız sistem admin silebilir'
              : 'Bu kayıt başka bir kullanıcıya ait'
          return (
            <Tooltip title={tooltipText}>
              <Button icon={<DeleteOutlined />} type="text" danger disabled />
            </Tooltip>
          )
        }
        return (
          <ConfirmDelete
            title="Birimi silmek istediğinize emin misiniz?"
            onConfirm={() => deleteMutation.mutate(record.id)}
          >
            <Button icon={<DeleteOutlined />} type="text" danger />
          </ConfirmDelete>
        )
      },
    },
  ]

  return (
    <Card variant="borderless" className="shadow-sm">
      <div style={{ marginBottom: 24, padding: '16px', background: '#f8fafc', borderRadius: '8px' }}>
        <Typography.Title level={5} style={{ marginTop: 0 }}>Yeni Birim Ekle</Typography.Title>
        <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
          Kişisel birim her kullanıcıya açıktır; yalnız sahibi görür.
          {canCreateGlobalDefs && ' Genel birimi tüm kullanıcılar görür (admin/yetkili/yönetici).'}
        </Typography.Text>
        <Form
          form={form}
          layout="inline"
          initialValues={{ is_global: false }}
          onFinish={(v) => createMutation.mutate(v)}
          validateTrigger={["onBlur", "onChange"]}
        >
          <Form.Item
            name="ad"
            rules={[{ required: true, message: 'Birim adı zorunlu' }]}
            style={{ width: 240, marginBottom: 0 }}
          >
            <Input placeholder="Örn: Adet, m2, Paket" />
          </Form.Item>
          {canCreateGlobalDefs && (
            <Form.Item
              name="is_global"
              valuePropName="checked"
              label="Genel"
              tooltip="Bu birimi tüm kullanıcılar görsün (admin/yetkili/yönetici)"
              style={{ marginBottom: 0 }}
            >
              <Switch checkedChildren="Genel" unCheckedChildren="Kişisel" />
            </Form.Item>
          )}
          <Form.Item style={{ marginBottom: 0 }}>
            <Button
              type="primary"
              htmlType="submit"
              icon={<PlusOutlined />}
              loading={createMutation.isPending}
            >
              Ekle
            </Button>
          </Form.Item>
        </Form>
      </div>

      <DataTable
        hideCard
        columns={columns}
        dataSource={birimler}
        rowKey="id"
        loading={isLoading}
        pagination={false}
        size="small"
        emptyDescription="Henüz birim eklenmemiş"
      />
    </Card>
  )
}
