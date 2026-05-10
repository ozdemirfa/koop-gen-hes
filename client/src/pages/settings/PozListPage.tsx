import React, { useState } from 'react'
import { Button, Modal, Form, Input, Space, Select, App } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../lib/api'
import { getErrorMessage } from '../../lib/apiError'
import { usePageSettings } from '../../contexts/LayoutContext'
import { ConfirmDelete } from '../../components/common/ConfirmDelete'
import { DataTable } from '../../components/common/DataTable'

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

  usePageSettings('Pozlar')

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
    onError: (err) => messageApi.error(getErrorMessage(err))
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return api.delete(`/settings/pozlar/${id}`)
    },
    onSuccess: () => {
      messageApi.success('Poz silindi')
      queryClient.invalidateQueries({ queryKey: ['settings-pozlar'] })
    },
    onError: (err) => messageApi.error(getErrorMessage(err))
  })

  const closeModal = () => {
    setModalVisible(false)
    setEditingPoz(null)
    form.resetFields()
  }

  const formatPozNo = (value: string) => {
    const digits = value.replace(/\D/g, '').substring(0, 9);
    let formatted = '';
    if (digits.length > 0) {
      formatted += digits.substring(0, 2);
      if (digits.length > 2) {
        formatted += '.' + digits.substring(2, 5);
        if (digits.length > 5) {
          formatted += '.' + digits.substring(5, 9);
        }
      }
    }
    return formatted;
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
        >
          Yeni Poz Ekle
        </Button>
      </div>

      <DataTable
        columns={columns}
        dataSource={pozlar}
        rowKey="id"
        loading={isLoading}
        size="small"
        emptyDescription="Henüz poz tanımlanmamış"
      />

      <Modal
        title={editingPoz ? 'Poz Düzenle' : 'Yeni Poz Ekle'}
        open={modalVisible}
        onCancel={closeModal}
        onOk={() => form.submit()}
        confirmLoading={saveMutation.isPending}
        destroyOnHidden
        width="min(520px, 95vw)"
      >
        <Form form={form} layout="vertical" onFinish={(v) => saveMutation.mutate(v)}>
          <Form.Item 
            name="poz_no" 
            label="Poz No" 
            rules={[
              { required: true, message: 'Poz no zorunlu' },
              { max: 11, message: 'En fazla 11 karakter olabilir' }
            ]}
            getValueFromEvent={(e) => formatPozNo(e.target.value)}
          >
            <Input placeholder="Örn: 10.100.1001" maxLength={11} />
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
