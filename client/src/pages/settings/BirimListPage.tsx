import React from 'react'
import { Button, Form, Input, App, Card, Typography } from 'antd'
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../lib/api'
import { getErrorMessage } from '../../lib/apiError'
import { usePageSettings } from '../../contexts/LayoutContext'
import { ConfirmDelete } from '../../components/common/ConfirmDelete'
import { DataTable } from '../../components/common/DataTable'
import { usePermissions } from '../../hooks/usePermissions'

interface Birim {
  id: string
  ad: string
}

export const BirimListPage: React.FC = () => {
  const [form] = Form.useForm()
  const queryClient = useQueryClient()
  const { message: messageApi } = App.useApp()
  // Sprint role-system-modernization (PR-C): Parametre/ayar sayfaları —
  // sadece manager+ değişiklik yapabilir. Spec: "kullanıcı parametre
  // değişikliği yapamaz". Form girişi ve delete butonları isManager gating.
  const { isManager } = usePermissions()

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

  const columns = [
    { title: 'Birim Adı', dataIndex: 'ad', key: 'ad' },
    {
      title: 'İşlem',
      key: 'action',
      width: 100,
      render: (_: any, record: Birim) =>
        isManager ? (
          <ConfirmDelete
            title="Birimi silmek istediğinize emin misiniz?"
            onConfirm={() => deleteMutation.mutate(record.id)}
          >
            <Button icon={<DeleteOutlined />} type="text" danger />
          </ConfirmDelete>
        ) : (
          <Button icon={<DeleteOutlined />} type="text" danger disabled title="Yetki yok (manager+ gerekli)" />
        )
    }
  ]

  return (
    <Card variant="borderless" className="shadow-sm">
      <div style={{ marginBottom: 24, padding: '16px', background: '#f8fafc', borderRadius: '8px' }}>
        <Typography.Title level={5} style={{ marginTop: 0 }}>Yeni Birim Ekle</Typography.Title>
        {!isManager && (
          <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
            Birim tanımlarını yalnızca proje yöneticileri (manager+) değiştirebilir.
          </Typography.Text>
        )}
        <Form
          form={form}
          layout="inline"
          onFinish={(v) => createMutation.mutate(v)}
          validateTrigger={["onBlur", "onChange"]}
          disabled={!isManager}
        >
          <Form.Item
            name="ad"
            rules={[{ required: true, message: 'Birim adı zorunlu' }]}
            style={{ width: 300, marginBottom: 0 }}
          >
            <Input placeholder="Örn: Adet, m2, Paket" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button
              type="primary"
              htmlType="submit"
              icon={<PlusOutlined />}
              loading={createMutation.isPending}
              disabled={!isManager}
              title={!isManager ? 'Yetki yok (manager+ gerekli)' : undefined}
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
