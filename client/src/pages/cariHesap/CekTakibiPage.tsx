import React, { useState } from 'react'
import { Button, Modal, Form, Input, InputNumber, DatePicker, Select, Space, message, Tag, Card, Row, Col, Statistic, Radio } from 'antd'
import { PlusOutlined, EditOutlined, CheckCircleOutlined, CloseCircleOutlined, WalletOutlined } from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import api from '../../lib/api'
import { PageHeader } from '../../components/common/PageHeader'
import { DataTable } from '../../components/common/DataTable'
import { ErrorState } from '../../components/common/ErrorState'
import { MoneyDisplay } from '../../components/common/MoneyDisplay'

interface Cek {
  id: string
  firma_id: string
  proje_id?: string
  cek_no: string
  banka: string
  sube?: string
  tutar: number
  vade_tarihi: string
  keside_tarihi: string
  durum: 'beklemede' | 'odendi' | 'iade' | 'iptal'
  aciklama?: string
  firmalar?: { unvan: string }
  projeler?: { proje_adi: string }
}

export const CekTakibiPage: React.FC = () => {
  const queryClient = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingCek, setEditingCek] = useState<Cek | null>(null)
  const [filter, setFilter] = useState('all')
  const [form] = Form.useForm()

  const { data: cekler, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['cekler', filter],
    queryFn: async () => {
      const { data } = await api.get('/cekler', { params: { filter: filter !== 'all' ? filter : undefined } })
      return data.data as Cek[]
    },
  })

  const { data: firmalar } = useQuery({
    queryKey: ['firmalar-list'],
    queryFn: async () => {
      const { data } = await api.get('/firmalar', { params: { limit: 1000 } })
      return data.data
    }
  })

  const { data: projeler } = useQuery({
    queryKey: ['projeler-list'],
    queryFn: async () => {
      const { data } = await api.get('/projeler')
      return data.data
    }
  })

  const saveMutation = useMutation({
    mutationFn: async (values: any) => {
      const payload = {
        ...values,
        vade_tarihi: values.vade_tarihi.format('YYYY-MM-DD'),
        keside_tarihi: values.keside_tarihi?.format('YYYY-MM-DD'),
      }
      if (editingCek) {
        return await api.put(`/cekler/${editingCek.id}`, payload)
      }
      return await api.post('/cekler', payload)
    },
    onSuccess: () => {
      message.success('Çek kaydedildi')
      queryClient.invalidateQueries({ queryKey: ['cekler'] })
      setModalOpen(false)
      form.resetFields()
      setEditingCek(null)
    },
    onError: (err: any) => message.error(err.message || 'Hata oluştu')
  })

  const updateDurumMutation = useMutation({
    mutationFn: async ({ id, durum }: { id: string, durum: string }) => {
      return await api.patch(`/cekler/${id}/durum`, { durum })
    },
    onSuccess: () => {
      message.success('Durum güncellendi')
      queryClient.invalidateQueries({ queryKey: ['cekler'] })
    }
  })

  const columns = [
    { title: 'Vade Tarihi', dataIndex: 'vade_tarihi', key: 'vade', render: (d: string) => dayjs(d).format('DD.MM.YYYY'), sorter: (a: any, b: any) => dayjs(a.vade_tarihi).unix() - dayjs(b.vade_tarihi).unix() },
    { title: 'Banka / Çek No', key: 'banka_no', render: (_: any, r: Cek) => <div><div>{r.banka}</div><small>{r.cek_no}</small></div> },
    { title: 'Firma', dataIndex: ['firmalar', 'unvan'], key: 'firma' },
    { title: 'Proje', dataIndex: ['projeler', 'proje_adi'], key: 'proje' },
    { title: 'Tutar', dataIndex: 'tutar', key: 'tutar', render: (v: number) => <MoneyDisplay amount={v} colored /> },
    {
      title: 'Durum',
      dataIndex: 'durum',
      key: 'durum',
      render: (d: string) => {
        const colors: Record<string, string> = { beklemede: 'blue', odendi: 'green', iade: 'orange', iptal: 'red' }
        return <Tag color={colors[d]}>{d.toUpperCase()}</Tag>
      }
    },
    {
      title: 'İşlem',
      key: 'action',
      width: 150,
      render: (_: any, r: Cek) => (
        <Space>
          <Button icon={<EditOutlined />} size="small" onClick={() => { setEditingCek(r); form.setFieldsValue({ ...r, vade_tarihi: dayjs(r.vade_tarihi), keside_tarihi: r.keside_tarihi ? dayjs(r.keside_tarihi) : null }); setModalOpen(true) }} />
          {r.durum === 'beklemede' && (
            <>
              <Button icon={<CheckCircleOutlined />} size="small" type="primary" ghost onClick={() => updateDurumMutation.mutate({ id: r.id, durum: 'odendi' })} />
              <Button icon={<CloseCircleOutlined />} size="small" danger ghost onClick={() => updateDurumMutation.mutate({ id: r.id, durum: 'iptal' })} />
            </>
          )}
        </Space>
      ),
    },
  ]

  const totalBekleyen = cekler?.filter(c => c.durum === 'beklemede').reduce((sum, c) => sum + Number(c.tutar), 0) || 0
  const totalOdendi = cekler?.filter(c => c.durum === 'odendi').reduce((sum, c) => sum + Number(c.tutar), 0) || 0

  return (
    <div>
      <PageHeader
        title="Çek Takibi"
        subtitle="Verilen çeklerin vade, tutar ve ödeme durumlarını yönetin"
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditingCek(null)
              form.resetFields()
              setModalOpen(true)
            }}
          >
            Yeni Çek Kaydı
          </Button>
        }
      />

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={12}>
          <Card className="stat-card">
            <Statistic 
              title="Bekleyen Çekler Toplamı" 
              value={totalBekleyen} 
              suffix="TL" 
              precision={2} 
              valueStyle={{ color: '#1890ff' }} 
            />
          </Card>
        </Col>
        <Col span={12}>
          <Card className="stat-card">
            <Statistic 
              title="Ödenen Çekler Toplamı" 
              value={totalOdendi} 
              suffix="TL" 
              precision={2} 
              valueStyle={{ color: '#52c41a' }} 
            />
          </Card>
        </Col>
      </Row>

      <Card style={{ marginBottom: 16 }}>
        <Radio.Group value={filter} onChange={(e) => setFilter(e.target.value)}>
          <Radio.Button value="all">Tümü</Radio.Button>
          <Radio.Button value="vadesi_gelenler">Vadesi Gelenler</Radio.Button>
          <Radio.Button value="bu_ay">Bu Ay</Radio.Button>
          <Radio.Button value="beklemede">Bekleyenler</Radio.Button>
          <Radio.Button value="odendi">Ödenenler</Radio.Button>
        </Radio.Group>
      </Card>

      {isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : (
        <DataTable
          columns={columns}
          dataSource={cekler}
          rowKey="id"
          loading={isLoading}
          emptyDescription="Kayıtlı çek bulunamadı"
        />
      )}

      <Modal
        title={editingCek ? 'Çek Düzenle' : 'Yeni Çek Kaydı'}
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false)
          setEditingCek(null)
        }}
        onOk={() => form.submit()}
        confirmLoading={saveMutation.isPending}
        width={600}
      >
        <Form form={form} layout="vertical" onFinish={(v) => saveMutation.mutate(v)} initialValues={{ durum: 'beklemede', keside_tarihi: dayjs() }}>
          <Form.Item name="firma_id" label="Firma" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="children">
              {firmalar?.map((f: any) => <Select.Option key={f.id} value={f.id}>{f.unvan}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="proje_id" label="İlgili Proje">
            <Select placeholder="İsteğe bağlı">
              {projeler?.map((p: any) => <Select.Option key={p.id} value={p.id}>{p.proje_adi}</Select.Option>)}
            </Select>
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="banka" label="Banka" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="sube" label="Şube">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="cek_no" label="Çek No" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="tutar" label="Tutar" rules={[{ required: true }]}>
                <InputNumber style={{ width: '100%' }} min={0.01} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="keside_tarihi" label="Keşide Tarihi">
                <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="vade_tarihi" label="Vade Tarihi" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="aciklama" label="Açıklama">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
