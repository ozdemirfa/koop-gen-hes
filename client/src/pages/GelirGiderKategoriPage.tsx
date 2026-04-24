import React, { useState, useMemo } from 'react'
import { Table, Button, Modal, Form, Input, Select, message, Popconfirm, Card, Tag, Space } from 'antd'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { PlusOutlined, EditOutlined, DeleteOutlined, ArrowLeftOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import api from '../lib/api'
import { usePageSettings } from '../contexts/LayoutContext'

interface Kategori {
  id: string
  ad: string
  tip: 'gelir' | 'gider'
}

export const GelirGiderKategoriPage: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editing, setEditing] = useState<Kategori | null>(null)
  const [form] = Form.useForm()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const { data: kategoriler, isLoading } = useQuery({
    queryKey: ['gelir-gider-kategoriler'],
    queryFn: async () => {
      const { data } = await api.get('/gelir-gider/kategoriler')
      return data.data as Kategori[]
    },
  })

  const createMutation = useMutation({
    mutationFn: async (values: any) => {
      const { data } = await api.post('/gelir-gider/kategoriler', values)
      return data
    },
    onSuccess: () => {
      message.success('Kategori oluşturuldu')
      queryClient.invalidateQueries({ queryKey: ['gelir-gider-kategoriler'] })
      closeModal()
    },
    onError: (err: any) => message.error(err.message || 'Hata oluştu'),
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: any }) => {
      const { data } = await api.put(`/gelir-gider/kategoriler/${id}`, values)
      return data
    },
    onSuccess: () => {
      message.success('Kategori güncellendi')
      queryClient.invalidateQueries({ queryKey: ['gelir-gider-kategoriler'] })
      closeModal()
    },
    onError: (err: any) => message.error(err.message || 'Hata oluştu'),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/gelir-gider/kategoriler/${id}`)
    },
    onSuccess: () => {
      message.success('Kategori silindi')
      queryClient.invalidateQueries({ queryKey: ['gelir-gider-kategoriler'] })
    },
    onError: (err: any) => message.error(err.message || 'Bu kategori kullanımda olduğu için silinemez'),
  })

  const closeModal = () => {
    setIsModalOpen(false)
    setEditing(null)
    form.resetFields()
  }

  const openEdit = (record: Kategori) => {
    setEditing(record)
    form.setFieldsValue(record)
    setIsModalOpen(true)
  }

  const actions = useMemo(() => (
    <Space size="small">
      <Button 
        size="small" 
        icon={<ArrowLeftOutlined />} 
        onClick={() => navigate('/gelir-gider')}
      >
        Geri
      </Button>
      <Button 
        size="small" 
        type="primary" 
        icon={<PlusOutlined />} 
        onClick={() => setIsModalOpen(true)}
      >
        Yeni Kategori
      </Button>
    </Space>
  ), [navigate])

  usePageSettings('Gelir / Gider Kategorileri', actions)

  const columns = [
    {
      title: 'Kategori Adı',
      dataIndex: 'ad',
      key: 'ad',
    },
    {
      title: 'Tip',
      dataIndex: 'tip',
      key: 'tip',
      width: 100,
      render: (t: string) => <Tag color={t === 'gelir' ? 'green' : 'red'} style={{ fontSize: '11px' }}>{t.toUpperCase()}</Tag>,
    },
    {
      title: 'İşlem',
      key: 'action',
      width: 100,
      render: (_: any, record: Kategori) => (
        <Space>
          <Button icon={<EditOutlined />} type="text" size="small" onClick={() => openEdit(record)} />
          <Popconfirm title="Silmek istediğinize emin misiniz?" onConfirm={() => deleteMutation.mutate(record.id)}>
            <Button danger icon={<DeleteOutlined />} type="text" size="small" />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <Card styles={{ body: { padding: 0 } }}>
        <Table
          columns={columns}
          dataSource={kategoriler}
          rowKey="id"
          loading={isLoading}
          pagination={false}
          size="small"
        />
      </Card>

      <Modal
        title={editing ? 'Kategori Düzenle' : 'Yeni Kategori'}
        open={isModalOpen}
        onCancel={closeModal}
        onOk={() => form.submit()}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
      >
        <Form 
          form={form} 
          layout="vertical" 
          onFinish={(v) => editing ? updateMutation.mutate({ id: editing.id, values: v }) : createMutation.mutate(v)} 
          initialValues={{ tip: 'gider' }}
        >
          <Form.Item name="tip" label="Tip" rules={[{ required: true }]}>
            <Select>
              <Select.Option value="gelir">Gelir</Select.Option>
              <Select.Option value="gider">Gider</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="ad" label="Kategori Adı" rules={[{ required: true, message: 'Kategori adı zorunlu' }]}>
            <Input placeholder="Örn: Kırtasiye, Aidat, Tamirat" autoComplete="off" />
          </Form.Item>        </Form>
      </Modal>
    </div>
  )
}
