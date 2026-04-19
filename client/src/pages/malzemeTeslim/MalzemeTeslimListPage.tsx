import React, { useState, useMemo } from 'react'
import { Button, Modal, Form, Input, InputNumber, DatePicker, Select, Space, message, Row, Col, Divider, Typography } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined } from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import api from '../../lib/api'
import { usePageSettings } from '../../contexts/LayoutContext'
import { DataTable } from '../../components/common/DataTable'
import { ErrorState } from '../../components/common/ErrorState'
import { MoneyDisplay } from '../../components/common/MoneyDisplay'
import { ConfirmDelete } from '../../components/common/ConfirmDelete'
import { useDebounce } from '../../hooks/useDebounce'

const { Text } = Typography

interface IrsaliyeKalemi {
  id?: string
  malzeme_adi: string
  birim: string
  miktar: number
  birim_fiyat: number
  toplam_tutar: number
}

interface Irsaliye {
  id: string
  firma_id: string
  proje_id?: string
  irsaliye_no?: string
  teslim_tarihi: string
  teslim_alan?: string
  notlar?: string
  firmalar?: { unvan: string }
  irsaliye_kalemleri: IrsaliyeKalemi[]
}

const BIRIMLER = ['Adet', 'Metre', 'Kg', 'm2', 'm3', 'Ton', 'Litre', 'Set']

export const MalzemeTeslimListPage: React.FC = () => {
  const queryClient = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingIrsaliye, setEditingIrsaliye] = useState<Irsaliye | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const debouncedSearch = useDebounce(searchTerm, 500)
  const [form] = Form.useForm()

  const { data: firmalar } = useQuery({
    queryKey: ['firmalar-select'],
    queryFn: async () => {
      const { data } = await api.get('/firmalar', { params: { aktif: 'true', limit: 500 } })
      return data.data as { id: string; unvan: string }[]
    },
  })

  const { data: irsaliyeData, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['irsaliyeler', debouncedSearch],
    queryFn: async () => {
      const { data } = await api.get('/malzeme-teslimleri', {
        params: { search: debouncedSearch }
      })
      return data
    },
  })

  const saveMutation = useMutation({
    mutationFn: async (values: any) => {
      const payload = {
        ...values,
        teslim_tarihi: values.teslim_tarihi.format('YYYY-MM-DD'),
      }
      if (editingIrsaliye) {
        return await api.put(`/malzeme-teslimleri/${editingIrsaliye.id}`, payload)
      }
      return await api.post('/malzeme-teslimleri', payload)
    },
    onSuccess: () => {
      message.success('İrsaliye kaydedildi')
      queryClient.invalidateQueries({ queryKey: ['irsaliyeler'] })
      setModalOpen(false)
      form.resetFields()
      setEditingIrsaliye(null)
    },
    onError: (err: any) => message.error(err.message || 'Hata oluştu'),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await api.delete(`/malzeme-teslimleri/${id}`) },
    onSuccess: () => {
      message.success('İrsaliye silindi')
      queryClient.invalidateQueries({ queryKey: ['irsaliyeler'] })
    },
    onError: (err: any) => message.error(err.message || 'Hata oluştu'),
  })

  const actions = useMemo(() => (
    <Space size="small">
      <Input
        placeholder="İrsaliye No Ara..."
        prefix={<SearchOutlined style={{ color: 'var(--text-tertiary)' }} />}
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        allowClear
        style={{ width: 220 }}
        className="header-search-input"
      />
      <Button
        type="primary"
        icon={<PlusOutlined />}
        onClick={() => {
          setEditingIrsaliye(null)
          form.resetFields()
          form.setFieldsValue({ kalemler: [{ malzeme_adi: '', birim: 'Adet', miktar: 1, birim_fiyat: 0 }] })
          setModalOpen(true)
        }}
      >
        Yeni İrsaliye
      </Button>
    </Space>
  ), [searchTerm, form])

  usePageSettings({
    title: 'Malzeme Teslimatı ve İrsaliye',
    actions
  })

  const columns = [
    {
      title: 'Tarih',
      dataIndex: 'teslim_tarihi',
      key: 'teslim_tarihi',
      width: 100,
      render: (d: string) => dayjs(d).format('DD.MM.YYYY'),
    },
    { 
      title: 'İrsaliye No', 
      dataIndex: 'irsaliye_no', 
      key: 'no',
      render: (v: string) => <Text strong style={{ color: 'var(--brand-primary)' }}>{v || '-'}</Text>
    },
    { title: 'Firma', key: 'firma', render: (_: any, r: Irsaliye) => r.firmalar?.unvan || '-' },
    {
      title: 'Kalem Sayısı',
      key: 'kalemler',
      width: 100,
      render: (_: any, r: Irsaliye) => r.irsaliye_kalemleri?.length || 0,
    },
    {
      title: 'Toplam Tutar',
      key: 'toplam',
      align: 'right' as const,
      width: 130,
      render: (_: any, r: Irsaliye) => {
        const total = r.irsaliye_kalemleri?.reduce((sum, k) => sum + (k.miktar * (k.birim_fiyat || 0)), 0) || 0
        return <MoneyDisplay amount={total} />
      }
    },
    {
      title: 'İşlem',
      key: 'action',
      fixed: 'right' as const,
      width: 90,
      render: (_: any, r: Irsaliye) => (
        <Space size="small">
          <Button
            icon={<EditOutlined />}
            size="small"
            className="action-btn-edit"
            onClick={() => {
              setEditingIrsaliye(r)
              form.setFieldsValue({ 
                ...r, 
                teslim_tarihi: dayjs(r.teslim_tarihi),
                kalemler: r.irsaliye_kalemleri 
              })
              setModalOpen(true)
            }}
          />
          <ConfirmDelete onConfirm={() => deleteMutation.mutate(r.id)} />
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
          dataSource={irsaliyeData?.data}
          rowKey="id"
          loading={isLoading}
          size="small"
          totalItems={irsaliyeData?.pagination?.total}
          emptyDescription="Kayıtlı teslim/irsaliye bulunamadı"
        />
      )}

      <Modal
        title={editingIrsaliye ? 'İrsaliye Düzenle' : 'Yeni İrsaliye Girişi'}
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false)
          setEditingIrsaliye(null)
        }}
        onOk={() => form.submit()}
        confirmLoading={saveMutation.isPending}
        width={800}
        destroyOnClose
        okText="Kaydet"
        cancelText="İptal"
        styles={{ body: { paddingTop: 16 } }}
      >
        <Form 
          form={form} 
          layout="vertical" 
          onFinish={(v) => saveMutation.mutate(v)}
          size="small"
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="firma_id" label="Firma" rules={[{ required: true }]}>
                <Select showSearch placeholder="Firma seçin" optionFilterProp="children">
                  {firmalar?.map(f => <Select.Option key={f.id} value={f.id}>{f.unvan}</Select.Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="teslim_tarihi" label="Teslim Tarihi" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="irsaliye_no" label="İrsaliye No">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="teslim_alan" label="Teslim Alan">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="notlar" label="Notlar">
                <Input />
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation={"left" as any} style={{ margin: '12px 0' }}>Malzemeler</Divider>
          
          <Form.List name="kalemler">
            {(fields, { add, remove }) => (
              <>
                {fields.map(({ key, name, ...restField }) => (
                  <Row key={key} gutter={8} align="middle" style={{ marginBottom: 4 }}>
                    <Col span={10}>
                      <Form.Item
                        {...restField}
                        name={[name, 'malzeme_adi']}
                        rules={[{ required: true, message: 'Zorunlu' }]}
                        noStyle
                      >
                        <Input placeholder="Malzeme Adı" />
                      </Form.Item>
                    </Col>
                    <Col span={4}>
                      <Form.Item
                        {...restField}
                        name={[name, 'birim']}
                        rules={[{ required: true }]}
                        noStyle
                      >
                        <Select placeholder="Birim">
                          {BIRIMLER.map(b => <Select.Option key={b} value={b}>{b}</Select.Option>)}
                        </Select>
                      </Form.Item>
                    </Col>
                    <Col span={4}>
                      <Form.Item
                        {...restField}
                        name={[name, 'miktar']}
                        rules={[{ required: true }]}
                        noStyle
                      >
                        <InputNumber placeholder="Miktar" style={{ width: '100%' }} min={0.001} />
                      </Form.Item>
                    </Col>
                    <Col span={4}>
                      <Form.Item
                        {...restField}
                        name={[name, 'birim_fiyat']}
                        noStyle
                      >
                        <InputNumber placeholder="Fiyat" style={{ width: '100%' }} min={0} />
                      </Form.Item>
                    </Col>
                    <Col span={2}>
                      <Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(name)} size="small" />
                    </Col>
                  </Row>
                ))}
                <Form.Item style={{ marginTop: 12 }}>
                  <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                    Malzeme Ekle
                  </Button>
                </Form.Item>
              </>
            )}
          </Form.List>
        </Form>
      </Modal>
    </div>
  )
}

