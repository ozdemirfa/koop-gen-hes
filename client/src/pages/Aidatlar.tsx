import React, { useState } from 'react'
import { Table, Button, Modal, Form, InputNumber, Select, message, Card, Typography, Tag, Space, DatePicker, Input, Tabs, Row, Col, Statistic } from 'antd'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { PlusOutlined, DollarOutlined, CalculatorOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import api from '../lib/api'
import dayjs from 'dayjs'
import { PageHeader } from '../components/common/PageHeader'
import { MoneyDisplay } from '../components/common/MoneyDisplay'
import { useDebounce } from '../hooks/useDebounce'
import { usePageSettings } from '../contexts/LayoutContext'

const { Title } = Typography

interface AidatTanimi {
  id: string
  yil: number
  ay: number
  tur: string
  katsayi_tutari: number
  son_odeme_gunu: number
  gecikme_faiz_orani: number
}

interface Aidat {
  id: string
  uye_id: string
  tutar: number
  gecikme_faizi: number
  toplam_tutar: number
  odenen_tutar: number
  durum: string
  son_odeme_tarihi: string
  uyeler?: { uye_no: string; ad: string; soyad: string }
  aidat_tanimlari?: { yil: number; ay: number }
}

const aylar = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']

export const Aidatlar: React.FC = () => {
  const navigate = useNavigate()
  const [odemeModalOpen, setOdemeModalOpen] = useState(false)
  const [selectedAidat, setSelectedAidat] = useState<Aidat | null>(null)

  // Filtre state'leri
  const [filterYil, setFilterYil] = useState<number | undefined>(dayjs().year())
  const [filterAy, setFilterAy] = useState<number | undefined>(undefined)
  const [filterDurum, setFilterDurum] = useState<string | undefined>(undefined)
  const [filterUyeSearch, setFilterUyeSearch] = useState('')
  const debouncedUyeSearch = useDebounce(filterUyeSearch, 300)
  
  const [odemeForm] = Form.useForm()
  const queryClient = useQueryClient()

  // Aidat tanımları
  const { data: tanimlar, isLoading: tanimLoading } = useQuery({
    queryKey: ['aidat-tanimlari'],
    queryFn: async () => {
      const { data } = await api.get('/aidatlar/tanimlar')
      return data.data as AidatTanimi[]
    },
  })

  // Aidatlar listesi (filtreli)
  const { data: aidatData, isLoading: aidatLoading } = useQuery({
    queryKey: ['aidatlar', filterYil, filterAy, filterDurum, debouncedUyeSearch],
    queryFn: async () => {
      const params: Record<string, string> = {}
      if (filterYil) params.yil = String(filterYil)
      if (filterAy) params.ay = String(filterAy)
      if (filterDurum) params.durum = filterDurum
      const { data } = await api.get('/aidatlar', { params })
      return data
    },
  })

  // Aidat özet
  const { data: ozet } = useQuery({
    queryKey: ['aidat-ozet'],
    queryFn: async () => {
      const { data } = await api.get('/aidatlar/ozet')
      return data.data
    },
  })

  // Ödeme kaydet
  const odemeMutation = useMutation({
    mutationFn: async ({ aidatId, values }: { aidatId: string; values: Record<string, unknown> }) => {
      const { data } = await api.post(`/aidatlar/${aidatId}/odeme`, {
        ...values,
        odeme_tarihi: (values.odeme_tarihi as dayjs.Dayjs).format('YYYY-MM-DD'),
      })
      return data
    },
    onSuccess: () => {
      message.success('Ödeme kaydedildi')
      queryClient.invalidateQueries({ queryKey: ['aidatlar'] })
      queryClient.invalidateQueries({ queryKey: ['aidat-ozet'] })
      setOdemeModalOpen(false)
      odemeForm.resetFields()
    },
    onError: (err: any) => message.error(err.message || 'Hata oluştu'),
  })

  // Gecikme faizi hesapla
  const gecikmeMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/aidatlar/gecikme-hesapla')
      return data
    },
    onSuccess: () => {
      message.success('Gecikme faizleri hesaplandı')
      queryClient.invalidateQueries({ queryKey: ['aidatlar'] })
      queryClient.invalidateQueries({ queryKey: ['aidat-ozet'] })
    },
  })

  const openOdeme = (aidat: Aidat) => {
    setSelectedAidat(aidat)
    const kalanBorc = aidat.toplam_tutar - aidat.odenen_tutar
    odemeForm.setFieldsValue({ tutar: kalanBorc, odeme_tarihi: dayjs(), odeme_yontemi: 'nakit' })
    setOdemeModalOpen(true)
  }

  const durumRenk: Record<string, string> = {
    bekliyor: 'blue',
    odendi: 'green',
    gecikti: 'red',
    iptal: 'default',
  }

  const aidatColumns = [
    {
      title: 'Üye',
      key: 'uye',
      render: (_: unknown, r: Aidat) =>
        r.uyeler ? `${r.uyeler.ad} ${r.uyeler.soyad} (${r.uyeler.uye_no})` : '-',
    },
    {
      title: 'Dönem',
      key: 'donem',
      render: (_: unknown, r: Aidat) =>
        r.aidat_tanimlari ? `${aylar[r.aidat_tanimlari.ay - 1]} ${r.aidat_tanimlari.yil}` : '-',
    },
    {
      title: 'Tutar',
      dataIndex: 'tutar',
      key: 'tutar',
      render: (v: number) => <MoneyDisplay amount={v} />,
    },
    {
      title: 'Gecikme Faizi',
      dataIndex: 'gecikme_faizi',
      key: 'gecikme_faizi',
      render: (v: number) => v > 0 ? <MoneyDisplay amount={v} colored /> : '-',
    },
    {
      title: 'Ödenen',
      dataIndex: 'odenen_tutar',
      key: 'odenen_tutar',
      render: (v: number) => v > 0 ? <MoneyDisplay amount={v} colored /> : '-',
    },
    {
      title: 'Durum',
      dataIndex: 'durum',
      key: 'durum',
      render: (d: string) => <Tag color={durumRenk[d] || 'default'}>{d.toUpperCase()}</Tag>,
    },
    {
      title: 'İşlem',
      key: 'action',
      render: (_: unknown, r: Aidat) =>
        r.durum !== 'odendi' && r.durum !== 'iptal' ? (
          <Button icon={<DollarOutlined />} type="link" onClick={() => openOdeme(r)}>
            Ödeme Al
          </Button>
        ) : null,
    },
  ]

  const tanimColumns = [
    {
      title: 'Dönem',
      key: 'donem',
      render: (_: unknown, r: AidatTanimi) => `${aylar[r.ay - 1]} ${r.yil}`,
    },
    {
      title: 'Türü',
      dataIndex: 'tur',
      key: 'tur',
      render: (t: string) => <Tag color={t === 'normal' ? 'blue' : 'purple'}>{t === 'normal' ? 'Normal' : 'Ara Ödeme'}</Tag>
    },
    { title: 'Katsayı (Baz Tutar)', dataIndex: 'katsayi_tutari', key: 'katsayi_tutari', render: (v: number) => <MoneyDisplay amount={v} /> },
    { title: 'Son Ödeme Günü', dataIndex: 'son_odeme_gunu', key: 'son_odeme_gunu' },
    {
      title: 'Gecikme Faiz Oranı',
      dataIndex: 'gecikme_faiz_orani',
      key: 'gecikme_faiz_orani',
      render: (v: number) => `%${v}`,
    },
  ]

  usePageSettings({
    title: 'Aidat Yönetimi',
    actions: (
      <Button 
        type="primary" 
        size="small"
        icon={<CalculatorOutlined />} 
        onClick={() => gecikmeMutation.mutate()} 
        loading={gecikmeMutation.isPending}
      >
        Gecikme Faizi Hesapla
      </Button>
    )
  })

  return (
    <div>
      {ozet && (
        <Row gutter={[24, 24]} style={{ marginBottom: 32 }}>
          <Col xs={24} sm={12} lg={6}>
            <Card className="stat-card">
              <Statistic title="Toplam Aidat" value={ozet.toplam_aidat} suffix="TL" precision={2} valueStyle={{ fontWeight: 700 }} />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card className="stat-card">
              <Statistic title="Toplam Tahsilat" value={ozet.toplam_tahsilat} suffix="TL" precision={2} valueStyle={{ color: 'var(--success)', fontWeight: 700 }} />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card className="stat-card">
              <Statistic title="Bekleyen" value={ozet.bekleyen} suffix="TL" precision={2} valueStyle={{ color: 'var(--info)', fontWeight: 700 }} />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card className="stat-card">
              <Statistic title="Geciken" value={ozet.geciken} suffix="TL" precision={2} valueStyle={{ color: 'var(--error)', fontWeight: 700 }} />
            </Card>
          </Col>
        </Row>
      )}

      <Card styles={{ body: { padding: 0 } }}>
        <Tabs
          defaultActiveKey="aidatlar"
          type="line"
          size="large"
          style={{ padding: '0 24px 24px' }}
          items={[
            {
              key: 'aidatlar',
              label: <Space><DollarOutlined />Aidat Listesi</Space>,
              children: (
                <div style={{ paddingTop: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
                    <Space wrap size="middle">
                      <Select
                        placeholder="Yıl"
                        value={filterYil}
                        onChange={setFilterYil}
                        allowClear
                        style={{ width: 100 }}
                      >
                        {Array.from({ length: 5 }, (_, i) => dayjs().year() - 2 + i).map(y => (
                          <Select.Option key={y} value={y}>{y}</Select.Option>
                        ))}
                      </Select>
                      <Select
                        placeholder="Ay"
                        value={filterAy}
                        onChange={setFilterAy}
                        allowClear
                        style={{ width: 130 }}
                      >
                        {aylar.map((a, i) => <Select.Option key={i + 1} value={i + 1}>{a}</Select.Option>)}
                      </Select>
                      <Select
                        placeholder="Durum"
                        value={filterDurum}
                        onChange={setFilterDurum}
                        allowClear
                        style={{ width: 130 }}
                      >
                        <Select.Option value="bekliyor">Bekliyor</Select.Option>
                        <Select.Option value="odendi">Ödendi</Select.Option>
                        <Select.Option value="gecikti">Gecikti</Select.Option>
                        <Select.Option value="iptal">İptal</Select.Option>
                      </Select>
                      <Input 
                        placeholder="Üye Ara..." 
                        value={filterUyeSearch}
                        onChange={e => setFilterUyeSearch(e.target.value)}
                        style={{ width: 200 }}
                      />
                    </Space>
                  </div>
                  <Table 
                    columns={aidatColumns} 
                    dataSource={aidatData?.data} 
                    rowKey="id" 
                    loading={aidatLoading} 
                    pagination={{ pageSize: 20 }}
                    bordered={false}
                  />
                </div>
              ),
            },
            {
              key: 'tanimlar',
              label: <Space><PlusOutlined />Aidat Tanımları</Space>,
              children: (
                <div style={{ paddingTop: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 24 }}>
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/aidatlar/yillik-plan')}>
                      Yıllık Plan Oluştur
                    </Button>
                  </div>
                  <Table 
                    columns={tanimColumns} 
                    dataSource={tanimlar} 
                    rowKey="id" 
                    loading={tanimLoading} 
                    pagination={false} 
                    bordered={false}
                  />
                </div>
              ),
            },
          ]}
        />
      </Card>

      {/* Ödeme Modal */}
      <Modal
        title={selectedAidat ? `Ödeme - ${selectedAidat.uyeler?.ad} ${selectedAidat.uyeler?.soyad}` : 'Ödeme'}
        open={odemeModalOpen}
        onCancel={() => { setOdemeModalOpen(false); odemeForm.resetFields() }}
        onOk={() => odemeForm.submit()}
        confirmLoading={odemeMutation.isPending}
      >
        <Form form={odemeForm} layout="vertical" onFinish={(v) => selectedAidat && odemeMutation.mutate({ aidatId: selectedAidat.id, values: v })}>
          <Form.Item name="tutar" label="Ödeme Tutarı (TL)" rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="odeme_tarihi" label="Ödeme Tarihi" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
          </Form.Item>
          <Form.Item name="odeme_yontemi" label="Ödeme Yöntemi" rules={[{ required: true }]}>
            <Select>
              <Select.Option value="nakit">Nakit</Select.Option>
              <Select.Option value="havale">Havale</Select.Option>
              <Select.Option value="eft">EFT</Select.Option>
              <Select.Option value="kredi_karti">Kredi Kartı</Select.Option>
              <Select.Option value="diger">Diğer</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="makbuz_no" label="Makbuz No">
            <Input />
          </Form.Item>
          <Form.Item name="aciklama" label="Açıklama">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
