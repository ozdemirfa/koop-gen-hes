import React, { useState } from 'react'
import { Table, Button, Modal, Form, Input, InputNumber, Select, message, Popconfirm, Card, Typography, Tag, Space, DatePicker, Row, Col } from 'antd'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import api from '../lib/api'
import dayjs from 'dayjs'
import { MoneyDisplay } from '../components/common/MoneyDisplay'
import { trNumberFormatter, trNumberParser } from '../lib/format'

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
  uye_id?: string
  firma_id?: string
  gelir_gider_kategorileri?: { ad: string; tip: string }
  uyeler?: { ad: string; soyad: string; uye_no: string }
  firmalar?: { unvan: string }
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

  // Üyeler (Gelir için)
  const { data: uyeler } = useQuery({
    queryKey: ['uyeler-select'],
    queryFn: async () => {
      const { data } = await api.get('/uyeler', { params: { limit: 1000 } })
      return data.data as any[]
    },
  })

  // Firmalar (Gider için)
  const { data: firmalar } = useQuery({
    queryKey: ['firmalar-select'],
    queryFn: async () => {
      const { data } = await api.get('/firmalar', { params: { limit: 1000 } })
      return data.data as any[]
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

  const [isKategoriModalOpen, setIsKategoriModalOpen] = useState(false)
  const [kategoriForm] = Form.useForm()

  const kategoriCreateMutation = useMutation({
    mutationFn: async (values: { ad: string; tip: 'gelir' | 'gider' }) => {
      const { data } = await api.post('/gelir-gider/kategoriler', values)
      return data
    },
    onSuccess: () => {
      message.success('Kategori eklendi')
      queryClient.invalidateQueries({ queryKey: ['gelir-gider-kategoriler'] })
      setIsKategoriModalOpen(false)
      kategoriForm.resetFields()
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
      title: 'Tarih',
      dataIndex: 'tarih',
      key: 'tarih',
      width: 110,
      render: (d: string) => dayjs(d).format('DD.MM.YYYY')
    },
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
      title: 'İlgili Kişi / Firma',
      key: 'related',
      render: (_: unknown, r: GelirGider) => {
        if (r.uyeler) return `${r.uyeler.ad} ${r.uyeler.soyad} (${r.uyeler.uye_no})`
        if (r.firmalar) return r.firmalar.unvan
        return '-'
      }
    },
    {
      title: 'Tutar',
      dataIndex: 'tutar',
      key: 'tutar',
      align: 'right' as const,
      render: (v: number, r: GelirGider) => <MoneyDisplay amount={v} colored={true} />
    },
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
          <Button icon={<PlusOutlined />} onClick={() => setIsKategoriModalOpen(true)}>
            Yeni Kategori
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsModalOpen(true)}>
            Yeni Kayıt
          </Button>
        </Space>
      </div>

      {/* Kategori Modalı */}
      <Modal
        title="Yeni Kategori"
        open={isKategoriModalOpen}
        onCancel={() => setIsKategoriModalOpen(false)}
        onOk={() => kategoriForm.submit()}
        confirmLoading={kategoriCreateMutation.isPending}
      >
        <Form form={kategoriForm} layout="vertical" onFinish={(v) => kategoriCreateMutation.mutate(v)} initialValues={{ tip: 'gider' }}>
          <Form.Item name="tip" label="Tip" rules={[{ required: true }]}>
            <Select>
              <Select.Option value="gelir">Gelir</Select.Option>
              <Select.Option value="gider">Gider</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="ad" label="Kategori Adı" rules={[{ required: true }]}>
            <Input placeholder="Örn: Kırtasiye, Tamirat" />
          </Form.Item>
        </Form>
      </Modal>

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
        width={640}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit} initialValues={{ tip: 'gelir', tarih: dayjs() }}>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="tip" label="Tip" rules={[{ required: true }]}>
                <Select onChange={() => {
                  form.setFieldValue('kategori_id', undefined)
                  form.setFieldValue('uye_id', undefined)
                  form.setFieldValue('firma_id', undefined)
                }}>
                  <Select.Option value="gelir">Gelir</Select.Option>
                  <Select.Option value="gider">Gider</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={16}>
              <Form.Item name="kategori_id" label="Kategori" rules={[{ required: true }]}>
                <Select placeholder="Kategori seçin" showSearch optionFilterProp="children">
                  {filteredKategoriler?.map(k => (
                    <Select.Option key={k.id} value={k.id}>{k.ad}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="tutar" label="Tutar (TL)" rules={[{ required: true }]}>
                <InputNumber 
                  min={0} 
                  style={{ width: '100%' }} 
                  formatter={trNumberFormatter}
                  parser={trNumberParser}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="tarih" label="Tarih" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            {selectedTip === 'gelir' ? (
              <Col span={24}>
                <Form.Item name="uye_id" label="İlgili Üye">
                  <Select 
                    placeholder="Üye seçin" 
                    showSearch 
                    optionFilterProp="children" 
                    allowClear
                    filterOption={(input, option) =>
                      (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                    }
                    options={uyeler?.map(u => ({
                      value: u.id,
                      label: `${u.ad} ${u.soyad} (${u.uye_no})`
                    }))}
                  />
                </Form.Item>
              </Col>
            ) : (
              <Col span={24}>
                <Form.Item name="firma_id" label="İlgili Firma">
                  <Select 
                    placeholder="Firma seçin" 
                    showSearch 
                    optionFilterProp="children" 
                    allowClear
                    options={firmalar?.map(f => ({
                      value: f.id,
                      label: f.unvan
                    }))}
                  />
                </Form.Item>
              </Col>
            )}
          </Row>

          <Form.Item name="belge_no" label="Belge No">
            <Input placeholder="Fatura, Makbuz no vb." />
          </Form.Item>

          <Form.Item name="aciklama" label="Açıklama">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

