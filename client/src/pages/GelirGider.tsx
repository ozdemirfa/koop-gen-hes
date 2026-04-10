import React, { useState } from 'react'
import { Table, Button, Modal, Form, Input, InputNumber, Select, message, Popconfirm, Card, Typography, Tag, Space, DatePicker } from 'antd'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import api from '../lib/api'
import dayjs from 'dayjs'

const { Title } = Typography

interface Kategori {
  id: string
  ad: string
  tip: 'gelir' | 'gider'
}

interface GelirGider {
  id: string
  tip: 'gelir' | 'gider'
  kategori_id: string
  tutar: number
  tarih: string
  aciklama?: string
  belge_no?: string
  ilgili_firma?: string
  gelir_gider_kategorileri?: { ad: string; tip: string }
}

export const GelirGider: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editing, setEditing] = useState<GelirGider | null>(null)
  const [tipFilter, setTipFilter] = useState<string>('')
  const [form] = Form.useForm()
  const queryClient = useQueryClient()

  const selectedTip = Form.useWatch('tip', form)

  // Kategoriler
  const { data: kategoriler } = useQuery({
    queryKey: ['gelir-gider-kategoriler'],
    queryFn: async () => {
      const { data } = await api.get('/gelir-gider/kategoriler')
      return data.data as Kategori[]
    },
  })

  // Gelir/Gider listesi
  const { data: listData, isLoading } = useQuery({
    queryKey: ['gelir-gider', tipFilter],
    queryFn: async () => {
      const params: Record<string, string> = {}
      if (tipFilter) params.tip = tipFilter
      const { data } = await api.get('/gelir-gider', { params })
      return data
    },
  })

  const createMutation = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const payload = { ...values, tarih: (values.tarih as dayjs.Dayjs).format('YYYY-MM-DD') }
      const { data } = await api.post('/gelir-gider', payload)
      return data
    },
    onSuccess: () => {
      message.success('Kayıt oluşturuldu')
      queryClient.invalidateQueries({ queryKey: ['gelir-gider'] })
      closeModal()
    },
    onError: (err: any) => message.error(err.message || 'Hata oluştu'),
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Record<string, unknown> }) => {
      const payload = { ...values }
      if (values.tarih) payload.tarih = (values.tarih as dayjs.Dayjs).format('YYYY-MM-DD')
      const { data } = await api.put(`/gelir-gider/${id}`, payload)
      return data
    },
    onSuccess: () => {
      message.success('Kayıt güncellendi')
      queryClient.invalidateQueries({ queryKey: ['gelir-gider'] })
      closeModal()
    },
    onError: (err: any) => message.error(err.message || 'Hata oluştu'),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/gelir-gider/${id}`)
    },
    onSuccess: () => {
      message.success('Kayıt silindi')
      queryClient.invalidateQueries({ queryKey: ['gelir-gider'] })
    },
    onError: (err: any) => message.error(err.message || 'Hata oluştu'),
  })

  const closeModal = () => {
    setIsModalOpen(false)
    setEditing(null)
    form.resetFields()
  }

  const openEdit = (record: GelirGider) => {
    setEditing(record)
    form.setFieldsValue({ ...record, tarih: dayjs(record.tarih) })
    setIsModalOpen(true)
  }

  const handleSubmit = (values: Record<string, unknown>) => {
    if (editing) {
      updateMutation.mutate({ id: editing.id, values })
    } else {
      createMutation.mutate(values)
    }
  }

  const filteredKategoriler = kategoriler?.filter(k => !selectedTip || k.tip === selectedTip)

  const columns = [
    {
      title: 'Tip',
      dataIndex: 'tip',
      key: 'tip',
      width: 80,
      render: (t: string) => <Tag color={t === 'gelir' ? 'green' : 'red'}>{t.toUpperCase()}</Tag>,
    },
    {
      title: 'Kategori',
      key: 'kategori',
      render: (_: unknown, r: GelirGider) => r.gelir_gider_kategorileri?.ad || '-',
    },
    {
      title: 'Tutar',
      dataIndex: 'tutar',
      key: 'tutar',
      render: (v: number, r: GelirGider) => (
        <span style={{ color: r.tip === 'gelir' ? '#3f8600' : '#cf1322', fontWeight: 'bold' }}>
          {v.toLocaleString('tr-TR')} TL
        </span>
      ),
    },
    { title: 'Tarih', dataIndex: 'tarih', key: 'tarih' },
    { title: 'Belge No', dataIndex: 'belge_no', key: 'belge_no' },
    { title: 'Açıklama', dataIndex: 'aciklama', key: 'aciklama', ellipsis: true },
    {
      title: 'İşlem',
      key: 'action',
      width: 100,
      render: (_: unknown, record: GelirGider) => (
        <Space>
          <Button icon={<EditOutlined />} type="text" onClick={() => openEdit(record)} />
          <Popconfirm title="Silmek istediğinize emin misiniz?" onConfirm={() => deleteMutation.mutate(record.id)}>
            <Button danger icon={<DeleteOutlined />} type="text" />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <Title level={3} style={{ margin: 0 }}>Gelir / Gider Yönetimi</Title>
        <Space>
          <Select
            allowClear
            placeholder="Filtre"
            style={{ width: 130 }}
            value={tipFilter || undefined}
            onChange={(v) => setTipFilter(v || '')}
          >
            <Select.Option value="gelir">Gelirler</Select.Option>
            <Select.Option value="gider">Giderler</Select.Option>
          </Select>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsModalOpen(true)}>
            Yeni Kayıt
          </Button>
        </Space>
      </div>

      <Card styles={{ body: { padding: 0 } }}>
        <Table
          columns={columns}
          dataSource={listData?.data}
          rowKey="id"
          loading={isLoading}
          pagination={{ pageSize: 20 }}
        />
      </Card>

      <Modal
        title={editing ? 'Kayıt Düzenle' : 'Yeni Gelir/Gider'}
        open={isModalOpen}
        onCancel={closeModal}
        onOk={() => form.submit()}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
        width={600}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="tip" label="Tip" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Select>
                <Select.Option value="gelir">Gelir</Select.Option>
                <Select.Option value="gider">Gider</Select.Option>
              </Select>
            </Form.Item>
            <Form.Item name="kategori_id" label="Kategori" rules={[{ required: true }]} style={{ flex: 2 }}>
              <Select placeholder="Kategori seçin" showSearch optionFilterProp="children">
                {filteredKategoriler?.map(k => (
                  <Select.Option key={k.id} value={k.id}>{k.ad}</Select.Option>
                ))}
              </Select>
            </Form.Item>
          </div>

          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="tutar" label="Tutar (TL)" rules={[{ required: true }]} style={{ flex: 1 }}>
              <InputNumber min={0} step={100} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="tarih" label="Tarih" rules={[{ required: true }]} initialValue={dayjs()} style={{ flex: 1 }}>
              <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
            </Form.Item>
          </div>

          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="belge_no" label="Belge No" style={{ flex: 1 }}>
              <Input />
            </Form.Item>
            <Form.Item name="ilgili_firma" label="İlgili Firma" style={{ flex: 1 }}>
              <Input />
            </Form.Item>
          </div>

          <Form.Item name="aciklama" label="Açıklama">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
