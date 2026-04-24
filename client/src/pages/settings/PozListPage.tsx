import React, { useState, useEffect } from 'react'
import { Table, Button, Modal, Form, Input, Space, Select, App } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../lib/api'
import { useLayout } from '../../contexts/LayoutContext'
import { ConfirmDelete } from '../../components/common/ConfirmDelete'

interface Poz {
  id: string
  poz_no: string
  tanim: string
  birim_id?: string
  birimler?: { ad: string }
}

export const PozListPage: React.FC = () => {
  const [modalVisible, setModalVisible] = useState(false)
  const [editingPoz, setEditingPoz] = useState<Poz | null>(null)
  const [form] = Form.useForm()
  const queryClient = useQueryClient()
  const { message: messageApi } = App.useApp()
  const { setTitle, setHeaderActions } = useLayout()

  useEffect(() => {
    setTitle('Pozlar')
    setHeaderActions(null)
    return () => setHeaderActions(null)
  }, [setTitle, setHeaderActions])

  const { data: pozlar, isLoading } = useQuery({
    queryKey: ['settings-pozlar'],
    queryFn: async () => {
      const { data } = await api.get('/settings/pozlar')
      return data.data as Poz[]
    }
  })

  const { data: birimler } = useQuery({
    queryKey: ['settings-birimler'],
    queryFn: async () => {
      const { data } = await api.get('/settings/birimler')
      return data.data as { id: string, ad: string }[]
    }
  })

  const saveMutation = useMutation({
    mutationFn: async (values: any) => {
      if (editingPoz) {
        return api.put(`/settings/pozlar/${editingPoz.id}`, values)
      }
      return api.post('/settings/pozlar', values)
    },
    onSuccess: () => {
      messageApi.success(editingPoz ? 'Poz güncellendi' : 'Poz eklendi')
      closeModal()
      queryClient.invalidateQueries({ queryKey: ['settings-pozlar'] })
    },
    onError: (err: any) => messageApi.error(err.message || 'Hata oluştu')
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return api.delete(`/settings/pozlar/${id}`)
    },
    onSuccess: () => {
      messageApi.success('Poz silindi')
      queryClient.invalidateQueries({ queryKey: ['settings-pozlar'] })
    },
    onError: (err: any) => messageApi.error(err.message || 'Hata oluştu')
  })

  const closeModal = () => {
    setModalVisible(false)
    setEditingPoz(null)
    form.resetFields()
  }

  const handleEdit = (record: Poz) => {
    setEditingPoz(record)
    form.setFieldsValue(record)
    setModalVisible(true)
  }

  const columns = [
    { title: 'Poz No', dataIndex: 'poz_no', key: 'poz_no', width: 150 },
    { title: 'Tanım', dataIndex: 'tanim', key: 'tanim' },
    { title: 'Birim', key: 'birim', width: 120, render: (_: any, r: Poz) => r.birimler?.ad || '-' },
    {
      title: 'İşlem',
      key: 'action',
      width: 120,
      render: (_: any, record: Poz) => (
        <Space>
          <Button icon={<EditOutlined />} type="text" onClick={() => handleEdit(record)} />
          <ConfirmDelete
            title="Pozu silmek istediğinize emin misiniz?"
            onConfirm={() => deleteMutation.mutate(record.id)}
          >
            <Button icon={<DeleteOutlined />} type="text" danger />
          </ConfirmDelete>
        </Space>
      )
    }
  ]

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-start' }}>
        <Button 
          type="primary" 
          icon={<PlusOutlined />} 
          onClick={() => setModalVisible(true)}
          style={{ backgroundColor: '#52c41a', borderColor: '#52c41a' }}
        >
          Yeni Poz Ekle
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={pozlar}
        rowKey="id"
        loading={isLoading}
        size="small"
      />

      <Modal
        title={editingPoz ? 'Poz Düzenle' : 'Yeni Poz Ekle'}
        open={modalVisible}
        onCancel={closeModal}
        onOk={() => form.submit()}
        confirmLoading={saveMutation.isPending}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={(v) => saveMutation.mutate(v)}>
          <Form.Item 
            name="poz_no" 
            label="Poz No" 
            rules={[
              { required: true, message: 'Poz no zorunlu' },
              { max: 6, message: 'En fazla 6 karakter olabilir' }
            ]}
          >
            <Input placeholder="Örn: 150101" maxLength={6} />
          </Form.Item>
          <Form.Item name="tanim" label="Tanım" rules={[{ required: true, message: 'Tanım zorunlu' }]}>
            <Input.TextArea rows={2} placeholder="İş kalemi açıklaması" />
          </Form.Item>
          <Form.Item name="birim_id" label="Birim">
            <Select placeholder="Birim seçin" allowClear>
              {birimler?.map(b => <Select.Option key={b.id} value={b.id}>{b.ad}</Select.Option>)}
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
