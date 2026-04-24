import React, { useEffect } from 'react'
import { Table, Button, Form, Input, App, Card, Typography } from 'antd'
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../lib/api'
import { useLayout } from '../../contexts/LayoutContext'
import { ConfirmDelete } from '../../components/common/ConfirmDelete'

interface Birim {
  id: string
  ad: string
}

export const BirimListPage: React.FC = () => {
  const [form] = Form.useForm()
  const queryClient = useQueryClient()
  const { message: messageApi } = App.useApp()
  const { setTitle, setHeaderActions } = useLayout()

  useEffect(() => {
    setTitle('Birimler')
    setHeaderActions(null)
    return () => setHeaderActions(null)
  }, [setTitle, setHeaderActions])

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
    onError: (err: any) => messageApi.error(err.message || 'Hata oluştu')
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return api.delete(`/settings/birimler/${id}`)
    },
    onSuccess: () => {
      messageApi.success('Birim silindi')
      queryClient.invalidateQueries({ queryKey: ['settings-birimler'] })
    },
    onError: (err: any) => messageApi.error(err.message || 'Hata oluştu')
  })

  const columns = [
    { title: 'Birim Adı', dataIndex: 'ad', key: 'ad' },
    {
      title: 'İşlem',
      key: 'action',
      width: 100,
      render: (_: any, record: Birim) => (
        <ConfirmDelete
          title="Birimi silmek istediğinize emin misiniz?"
          onConfirm={() => deleteMutation.mutate(record.id)}
        >
          <Button icon={<DeleteOutlined />} type="text" danger />
        </ConfirmDelete>
      )
    }
  ]

  return (
    <Card bordered={false}>
      <div style={{ marginBottom: 24, padding: '16px', background: '#f8fafc', borderRadius: '8px' }}>
        <Typography.Title level={5} style={{ marginTop: 0 }}>Yeni Birim Ekle</Typography.Title>
        <Form 
          form={form} 
          layout="inline" 
          onFinish={(v) => createMutation.mutate(v)}
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
              style={{ backgroundColor: '#52c41a', borderColor: '#52c41a' }}
            >
              Ekle
            </Button>
          </Form.Item>
        </Form>
      </div>

      <Table
        columns={columns}
        dataSource={birimler}
        rowKey="id"
        loading={isLoading}
        pagination={false}
        size="small"
      />
    </Card>
  )
}
