import React, { useState, useMemo } from 'react'
import { Button, Modal, Form, Input, Space, message, Tag, Switch, Tooltip } from 'antd'
import { PlusOutlined, EditOutlined, TransactionOutlined } from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import api from '../../lib/api'
import { usePageSettings } from '../../contexts/LayoutContext'
import { DataTable } from '../../components/common/DataTable'
import { ErrorState } from '../../components/common/ErrorState'

interface BankaHesap {
  id: string
  banka_adi: string
  sube?: string
  hesap_no?: string
  iban?: string
  aktif: boolean
}

export const BankaHesapListPage: React.FC = () => {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingHesap, setEditingHesap] = useState<BankaHesap | null>(null)
  const [form] = Form.useForm()

  const { data: hesaplar, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['banka-hesaplari'],
    queryFn: async () => {
      const { data } = await api.get('/banka/hesaplar')
      return data.data as BankaHesap[]
    },
  })

  const saveMutation = useMutation({
    mutationFn: async (values: any) => {
      if (editingHesap) {
        return await api.put(`/banka/hesaplar/${editingHesap.id}`, values)
      }
      const payload = {
        ...values,
        proje_id: localStorage.getItem('activeProjectId')
      }
      return await api.post('/banka/hesaplar', payload)
    },
    onSuccess: () => {
      message.success('Banka hesabı kaydedildi')
      queryClient.invalidateQueries({ queryKey: ['banka-hesaplari'] })
      setModalOpen(false)
      form.resetFields()
      setEditingHesap(null)
    },
    onError: (err: any) => {
      if (err.details && Array.isArray(err.details)) {
        form.setFields(err.details.map((detail: any) => ({
          name: detail.field,
          errors: [detail.message]
        })))
      } else {
        message.error(err.error || err.message || 'Hata oluştu')
      }
    },
  })

  const actions = useMemo(() => (
    <Button
      type="primary"
      icon={<PlusOutlined />}
      onClick={() => {
        setEditingHesap(null)
        form.resetFields()
        form.setFieldsValue({ aktif: true })
        setModalOpen(true)
      }}
    >
      Yeni Hesap
    </Button>
  ), [form])

  usePageSettings({
    title: 'Banka Hesapları',
    actions
  })

  const columns = [
    { title: 'Banka Adı', dataIndex: 'banka_adi', key: 'banka_adi' },
    { title: 'Şube', dataIndex: 'sube', key: 'sube' },
    { title: 'Hesap No', dataIndex: 'hesap_no', key: 'hesap_no' },
    { title: 'IBAN', dataIndex: 'iban', key: 'iban' },
    {
      title: 'Durum',
      dataIndex: 'aktif',
      key: 'aktif',
      render: (aktif: boolean) => (
        <Tag color={aktif ? 'green' : 'red'}>{aktif ? 'Aktif' : 'Pasif'}</Tag>
      ),
    },
    {
      title: 'İşlem',
      key: 'action',
      width: 120,
      render: (_: any, r: BankaHesap) => (
        <Space size="middle">
          <Tooltip title="Hareketler">
            <Button
              icon={<TransactionOutlined />}
              onClick={(e) => {
                e.stopPropagation()
                navigate(`/banka-hesaplari/${r.id}/hareketler`)
              }}
              size="small"
            />
          </Tooltip>
          <Tooltip title="Düzenle">
            <Button
              icon={<EditOutlined />}
              onClick={(e) => {
                e.stopPropagation()
                setEditingHesap(r)
                form.setFieldsValue(r)
                setModalOpen(true)
              }}
              size="small"
            />
          </Tooltip>
        </Space>
      ),
    },
  ]

  return (
    <div>
      {isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : (
        <DataTable
          columns={columns}
          dataSource={hesaplar}
          rowKey="id"
          loading={isLoading}
          pagination={false}
          size="small"
          emptyDescription="Banka hesabı eklenmemiş"
        />
      )}

      <Modal
        title={editingHesap ? 'Hesap Düzenle' : 'Yeni Banka Hesabı'}
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false)
          setEditingHesap(null)
        }}
        onOk={() => form.submit()}
        confirmLoading={saveMutation.isPending}
        destroyOnClose
        okText="Kaydet"
        cancelText="İptal"
      >
        <Form 
          form={form} 
          layout="vertical" 
          onFinish={(v) => saveMutation.mutate(v)}
          style={{ marginTop: 16 }}
          initialValues={{ aktif: true }}
        >
          <Form.Item name="banka_adi" label="Banka Adı" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="sube" label="Şube">
            <Input />
          </Form.Item>
          <Form.Item name="hesap_no" label="Hesap No">
            <Input />
          </Form.Item>
          <Form.Item name="iban" label="IBAN">
            <Input placeholder="TR..." />
          </Form.Item>
          <Form.Item name="aktif" label="Durum" valuePropName="checked">
            <Switch checkedChildren="Aktif" unCheckedChildren="Pasif" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
