import React, { useState } from 'react'
import { Table, Button, Modal, Form, Input, InputNumber, Select, Popconfirm, Card, Typography, Tag, Space, DatePicker, Row, Col, Statistic, App } from 'antd'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { PlusOutlined, EditOutlined, DeleteOutlined, SettingOutlined, ArrowUpOutlined, ArrowDownOutlined, WalletOutlined, BankOutlined, CreditCardOutlined, FileTextOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import api from '../lib/api'
import dayjs from 'dayjs'
import { MoneyDisplay } from '../components/common/MoneyDisplay'
import { trNumberFormatter, trNumberParser, trMoneyFormatter } from '../lib/format'
import { usePageSettings } from '../contexts/LayoutContext'

const { Title, Text } = Typography

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
  islem_turu?: 'aidat_kayit' | 'hakedis' | 'gelen_odeme' | 'giden_odeme'
  odeme_turu?: 'nakit' | 'banka' | 'kredi_karti' | 'cek'
  gelir_gider_kategorileri?: { ad: string; tip: string }
  uyeler?: { ad: string; soyad: string; uye_no: string }
  firmalar?: { unvan: string }
  cari_hesaplar?: { cari_adi: string; cari_turu: string }
}

export const GelirGider: React.FC = () => {
  const navigate = useNavigate()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editing, setEditing] = useState<GelirGider | null>(null)
  const [tipFilter, setTipFilter] = useState<string>('')
  const [form] = Form.useForm()
  const queryClient = useQueryClient()
  const { message: messageApi } = App.useApp()

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

  const totals = listData?.data?.reduce((acc: any, curr: GelirGider) => {
    if (curr.tip === 'gelir') acc.gelir += Number(curr.tutar)
    else acc.gider += Number(curr.tutar)
    return acc
  }, { gelir: 0, gider: 0 }) || { gelir: 0, gider: 0 }

  const createMutation = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const payload = { ...values, tarih: (values.tarih as dayjs.Dayjs).format('YYYY-MM-DD') }
      const { data } = await api.post('/gelir-gider', payload)
      return data
    },
    onSuccess: () => {
      messageApi.success('Kayıt oluşturuldu')
      queryClient.invalidateQueries({ queryKey: ['gelir-gider'] })
      closeModal()
    },
    onError: (err: any) => messageApi.error(err.message || 'Hata oluştu'),
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Record<string, unknown> }) => {
      const payload = { ...values }
      if (values.tarih) payload.tarih = (values.tarih as dayjs.Dayjs).format('YYYY-MM-DD')
      const { data } = await api.put(`/gelir-gider/${id}`, payload)
      return data
    },
    onSuccess: () => {
      messageApi.success('Kayıt güncellendi')
      queryClient.invalidateQueries({ queryKey: ['gelir-gider'] })
      closeModal()
    },
    onError: (err: any) => messageApi.error(err.message || 'Hata oluştu'),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/gelir-gider/${id}`)
    },
    onSuccess: () => {
      messageApi.success('Kayıt silindi')
      queryClient.invalidateQueries({ queryKey: ['gelir-gider'] })
    },
    onError: (err: any) => messageApi.error(err.message || 'Hata oluştu'),
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

  const actions = React.useMemo(() => (
    <Space size="small">
      <Select
        allowClear
        size="small"
        placeholder="Tip Filtresi"
        style={{ width: 130 }}
        value={tipFilter || undefined}
        onChange={(v) => setTipFilter(v || '')}
      >
        <Select.Option value="gelir">Gelirler</Select.Option>
        <Select.Option value="gider">Giderler</Select.Option>
      </Select>
      <Button 
        size="small" 
        icon={<SettingOutlined />} 
        onClick={() => navigate('/gelir-gider/kategoriler')}
      >
        Kategoriler
      </Button>
      <Button 
        size="small" 
        type="primary" 
        icon={<PlusOutlined />} 
        onClick={() => setIsModalOpen(true)}
      >
        Yeni Kayıt
      </Button>
    </Space>
  ), [tipFilter, navigate])

  usePageSettings('Cari İşlemler', actions)

  const filteredKategoriler = kategoriler?.filter(k => !selectedTip || k.tip === selectedTip)

  const columns = [
    {
      title: 'Tarih',
      dataIndex: 'tarih',
      key: 'tarih',
      width: 100,
      render: (d: string) => dayjs(d).format('DD.MM.YYYY')
    },
    {
      title: 'İşlem Türü',
      dataIndex: 'islem_turu',
      key: 'islem_turu',
      width: 110,
      render: (t: string) => {
        if (!t) return '-'
        const colors: Record<string, string> = {
          gelen_odeme: 'green',
          giden_odeme: 'red',
          aidat_kayit: 'blue',
          hakedis: 'orange'
        }
        const labels: Record<string, string> = {
          gelen_odeme: 'Tahsilat',
          giden_odeme: 'Ödeme',
          aidat_kayit: 'Aidat',
          hakedis: 'Hakediş'
        }
        return <Tag color={colors[t]} style={{ fontSize: '11px' }}>{labels[t] || t}</Tag>
      }
    },
    {
      title: 'Ödeme',
      dataIndex: 'odeme_turu',
      key: 'odeme_turu',
      width: 110,
      render: (t: string) => {
        if (!t) return '-'
        const icons: Record<string, React.ReactNode> = {
          nakit: <WalletOutlined />,
          banka: <BankOutlined />,
          kredi_karti: <CreditCardOutlined />,
          cek: <FileTextOutlined />
        }
        const labels: Record<string, string> = {
          nakit: 'Nakit',
          banka: 'Banka',
          kredi_karti: 'Kart',
          cek: 'Çek'
        }
        return (
          <Space style={{ fontSize: '11px' }}>
            {icons[t]}
            <span>{labels[t] || t}</span>
          </Space>
        )
      }
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
        if (r.cari_hesaplar) return r.cari_hesaplar.cari_adi
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
      width: 110,
      render: (v: number, r: GelirGider) => <MoneyDisplay amount={v} colored={true} />
    },
    { title: 'Açıklama', dataIndex: 'aciklama', key: 'aciklama', ellipsis: true },
    {
      title: 'İşlem',
      key: 'action',
      width: 80,
      render: (_: unknown, record: GelirGider) => (
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
    <div>
      <Row gutter={12} style={{ marginBottom: 12 }}>
        <Col span={8}>
          <Card variant="borderless" className="stat-card shadow-sm" size="small">
            <Statistic
              title="Toplam Gelir"
              value={totals.gelir}
              precision={2}
              formatter={(v) => trMoneyFormatter(v as number)}
              styles={{ content: { color: '#3f8600', fontSize: '18px' } }}
              prefix={<ArrowUpOutlined />}
              suffix="TL"
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card variant="borderless" className="stat-card shadow-sm" size="small">
            <Statistic
              title="Toplam Gider"
              value={totals.gider}
              precision={2}
              formatter={(v) => trMoneyFormatter(v as number)}
              styles={{ content: { color: '#cf1322', fontSize: '18px' } }}
              prefix={<ArrowDownOutlined />}
              suffix="TL"
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card variant="borderless" className="stat-card shadow-sm" size="small">
            <Statistic
              title="Net Bakiye"
              value={totals.gelir - totals.gider}
              precision={2}
              formatter={(v) => trMoneyFormatter(v as number)}
              styles={{ content: { color: totals.gelir - totals.gider >= 0 ? '#3f8600' : '#cf1322', fontSize: '18px' } }}
              prefix={<WalletOutlined />}
              suffix="TL"
            />
          </Card>
        </Col>
      </Row>

      <Card variant="borderless" className="shadow-sm" styles={{ body: { padding: 0 } }}>
        <Table
          columns={columns}
          dataSource={listData?.data}
          rowKey="id"
          loading={isLoading}
          size="small"
          pagination={{ pageSize: 20 }}
        />
      </Card>

      <Modal
        title={editing ? 'Cari Hareket Düzenle' : 'Yeni Cari hareket'}
        open={isModalOpen}
        onCancel={closeModal}
        onOk={() => form.submit()}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
        width={640}
        destroyOnHidden
        okText="Kaydet"
        cancelText="İptal"
      >
        <Form 
          form={form} 
          layout="vertical" 
          onFinish={handleSubmit} 
          initialValues={{ tip: 'gelir', odeme_turu: 'banka', tarih: dayjs() }}
          style={{ marginTop: 16 }}
          autoComplete="off"
        >
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="tip" label="İşlem Tipi" rules={[{ required: true }]}>
                <Select onChange={() => {
                  form.setFieldValue('kategori_id', undefined)
                  form.setFieldValue('uye_id', undefined)
                  form.setFieldValue('firma_id', undefined)
                }}>
                  <Select.Option value="gelir">Para Girişi (+)</Select.Option>
                  <Select.Option value="gider">Para Çıkışı (-)</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="odeme_turu" label="Ödeme Türü" rules={[{ required: true }]}>
                <Select placeholder="Ödeme Türü">
                  <Select.Option value="banka">Banka</Select.Option>
                  <Select.Option value="nakit">Nakit</Select.Option>
                  <Select.Option value="kredi_karti">Kredi Kartı</Select.Option>
                  <Select.Option value="cek">Çek</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
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
              <Form.Item name="tutar" label="Tutar" rules={[{ required: true }]}>
                <InputNumber 
                  min={0} 
                  style={{ width: '100%' }} 
                  formatter={trMoneyFormatter}
                  parser={trNumberParser}
                  placeholder="0,00"
                  autoComplete="off"
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="tarih" label="Tarih" rules={[{ required: true }]}>
                <DatePicker 
                  size="small"
                  style={{ width: '100%' }} 
                  format="DD.MM.YYYY" 
                  getPopupContainer={(triggerNode) => triggerNode.parentNode as HTMLElement}
                  classNames={{ popup: { root: "small-datepicker-popup" } }}
                />
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
            <Input placeholder="Fatura, Makbuz no vb." autoComplete="off" />
          </Form.Item>

          <Form.Item name="aciklama" label="Açıklama">
            <Input.TextArea rows={2} autoComplete="off" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

