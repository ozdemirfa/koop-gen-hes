import React, { useState, useMemo } from 'react'
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
  uye_id?: string
  serefiye_id: string
  tutar: number
  gecikme_faizi: number
  toplam_tutar: number
  odenen_tutar: number
  durum: string
  son_odeme_tarihi: string
  uyeler?: { uye_no: string; ad: string; soyad: string }
  aidat_tanimlari?: { yil: number; ay: number }
  serefiye_tablosu?: { daire_no: string; bloklar: { blok_adi: string } }
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
  const [filterDaireSearch, setFilterDaireSearch] = useState('')
  const debouncedDaireSearch = useDebounce(filterDaireSearch, 300)
  
  const [odemeForm] = Form.useForm()
  const queryClient = useQueryClient()
  const { activeProject } = useProject()

  // Aidat tanımları
  const { data: tanimlar, isLoading: tanimLoading } = useQuery({
    queryKey: ['aidat-tanimlari', activeProject?.id],
    queryFn: async () => {
      const { data } = await api.get('/aidatlar/tanimlar', { params: { proje_id: activeProject?.id } })
      return data.data as AidatTanimi[]
    },
    enabled: !!activeProject?.id
  })

  // Aidatlar listesi (filtreli)
  const { data: aidatData, isLoading: aidatLoading } = useQuery({
    queryKey: ['aidatlar', activeProject?.id, filterYil, filterAy, filterDurum, debouncedDaireSearch],
    queryFn: async () => {
      const params: Record<string, string> = {}
      if (activeProject?.id) params.proje_id = activeProject.id
      if (filterYil) params.yil = String(filterYil)
      if (filterAy) params.ay = String(filterAy)
      if (filterDurum) params.durum = filterDurum
      if (debouncedDaireSearch) params.daire_no = debouncedDaireSearch
      const { data } = await api.get('/aidatlar', { params })
      return data
    },
    enabled: !!activeProject?.id
  })

  // Aidat özet (filtrelere göre)
  const { data: ozet } = useQuery({
    queryKey: ['aidat-ozet', activeProject?.id, filterYil, filterAy, filterDurum, debouncedDaireSearch],
    queryFn: async () => {
      const params: Record<string, string> = {}
      if (activeProject?.id) params.proje_id = activeProject.id
      if (filterYil) params.yil = String(filterYil)
      if (filterAy) params.ay = String(filterAy)
      if (filterDurum) params.durum = filterDurum
      if (debouncedDaireSearch) params.daire_no = debouncedDaireSearch
      const { data } = await api.get('/aidatlar/ozet', { params })
      return data.data
    },
    enabled: !!activeProject?.id
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
      title: 'Blok/Daire',
      key: 'daire',
      render: (_: unknown, r: Aidat) => 
        r.serefiye_tablosu ? `${r.serefiye_tablosu.bloklar?.blok_adi || ''} - ${r.serefiye_tablosu.daire_no}` : '-',
    },
    {
      title: 'Üye',
      key: 'uye',
      render: (_: unknown, r: Aidat) =>
        r.uyeler ? `${r.uyeler.ad} ${r.uyeler.soyad} (${r.uyeler.uye_no})` : <Tag>Üye Yok</Tag>,
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

  const actions = useMemo(() => (
    <Button 
      type="primary" 
      size="small"
      icon={<CalculatorOutlined />} 
      onClick={() => gecikmeMutation.mutate()} 
      loading={gecikmeMutation.isPending}
      style={{ color: '#ffffff' }}
    >
      Gecikme Faizi Hesapla
    </Button>
  ), [gecikmeMutation.isPending])

  usePageSettings({
    title: 'Aidat Yönetimi',
    actions
  })

  return (
    <div>
      {ozet && (
        <Row gutter={[24, 24]} style={{ marginBottom: 32 }}>
          <Col xs={24} sm={12} lg={6}>
            <Card className="stat-card">
              <Statistic 
                title="Toplam Aidat" 
                value={ozet.toplam_aidat} 
                prefix="₺" 
                precision={2} 
                formatter={(v) => trNumberFormatter(v as number)}
                styles={{ content: { fontWeight: 700 } }} 
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card className="stat-card">
              <Statistic 
                title="Toplam Tahsilat" 
                value={ozet.toplam_tahsilat} 
                prefix="₺" 
                precision={2} 
                formatter={(v) => trNumberFormatter(v as number)}
                styles={{ content: { color: 'var(--success)', fontWeight: 700 } }} 
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card className="stat-card">
              <Statistic 
                title="Bekleyen" 
                value={ozet.bekleyen} 
                prefix="₺" 
                precision={2} 
                formatter={(v) => trNumberFormatter(v as number)}
                styles={{ content: { color: 'var(--info)', fontWeight: 700 } }} 
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card className="stat-card">
              <Statistic 
                title="Geciken" 
                value={ozet.geciken} 
                prefix="₺" 
                precision={2} 
                formatter={(v) => trNumberFormatter(v as number)}
                styles={{ content: { color: 'var(--error)', fontWeight: 700 } }} 
              />
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
                        placeholder="Daire Ara..." 
                        value={filterDaireSearch}
                        onChange={e => setFilterDaireSearch(e.target.value)}
                        style={{ width: 200 }}
                        allowClear
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
        title={selectedAidat ? `Ödeme - ${selectedAidat.uyeler ? `${selectedAidat.uyeler.ad} ${selectedAidat.uyeler.soyad}` : `${selectedAidat.serefiye_tablosu?.bloklar?.blok_adi || ''} ${selectedAidat.serefiye_tablosu?.daire_no || ''}`}` : 'Ödeme'}
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
            <DatePicker size="small" style={{ width: '100%' }} format="YYYY-MM-DD" />
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
