import React, { useState } from 'react'
import { Table, Button, Modal, Form, InputNumber, Select, message, Card, Typography, Tag, Space, DatePicker, Input, Tabs, Row, Col, Statistic } from 'antd'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { PlusOutlined, DollarOutlined, CalculatorOutlined, SearchOutlined } from '@ant-design/icons'
import api from '../lib/api'
import dayjs from 'dayjs'
import { MoneyDisplay } from '../components/common/MoneyDisplay'
import { useDebounce } from '../hooks/useDebounce'

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
  const [yillikPlanModalOpen, setYillikPlanModalOpen] = useState(false)
  const [odemeModalOpen, setOdemeModalOpen] = useState(false)
  const [selectedAidat, setSelectedAidat] = useState<Aidat | null>(null)

  // Filtre state'leri
  const [filterYil, setFilterYil] = useState<number | undefined>(dayjs().year())
  const [filterAy, setFilterAy] = useState<number | undefined>(undefined)
  const [filterDurum, setFilterDurum] = useState<string | undefined>(undefined)
  const [filterUyeSearch, setFilterUyeSearch] = useState('')
  const debouncedUyeSearch = useDebounce(filterUyeSearch, 300)
  
  const initialKalemler = Array.from({ length: 12 }, (_, i) => ({
    ay: i + 1,
    tur: 'normal',
    katsayi_tutari: undefined,
    son_odeme_gunu: 15,
    gecikme_faiz_orani: 0
  }))

  const [yillikPlanForm] = Form.useForm()
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

  // Üye listesi (filtre için)
  const { data: uyelerData } = useQuery({
    queryKey: ['uyeler-select'],
    queryFn: async () => {
      const { data } = await api.get('/uyeler', { params: { limit: 500 } })
      return data.data as { id: string; uye_no: string; ad: string; soyad: string }[]
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

  // Yeni Yıllık Plan
  const createTanimMutation = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const { data } = await api.post('/aidatlar/yillik-plan', values)
      return data
    },
    onSuccess: (data) => {
      message.success(`Aidat planı oluşturuldu. ${data.data.olusturulan_aidat_sayisi} üyeye borç kaydı açıldı.`)
      queryClient.invalidateQueries({ queryKey: ['aidat-tanimlari'] })
      queryClient.invalidateQueries({ queryKey: ['aidatlar'] })
      setYillikPlanModalOpen(false)
      yillikPlanForm.resetFields()
    },
    onError: (err: any) => message.error(err.message || 'Hata oluştu'),
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

  const handleKatsayiChange = (value: number | null, index: number) => {
    if (value === null) return
    const currentKalemler = yillikPlanForm.getFieldValue('kalemler') || []
    const updatedKalemler = [...currentKalemler]
    
    if (updatedKalemler[index]?.tur !== 'normal') return
    
    for (let i = index; i < updatedKalemler.length; i++) {
      if (updatedKalemler[i]?.tur === 'normal') {
        updatedKalemler[i] = { ...updatedKalemler[i], katsayi_tutari: value }
      }
    }
    
    yillikPlanForm.setFieldsValue({ kalemler: updatedKalemler })
  }

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

  return (
    <div>
      <Title level={3}>Aidat Yönetimi</Title>

      {ozet && (
        <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col span={6}><Card><Statistic title="Toplam Aidat" value={ozet.toplam_aidat} suffix="TL" precision={2} /></Card></Col>
          <Col span={6}><Card><Statistic title="Toplam Tahsilat" value={ozet.toplam_tahsilat} suffix="TL" precision={2} valueStyle={{ color: '#3f8600' }} /></Card></Col>
          <Col span={6}><Card><Statistic title="Bekleyen" value={ozet.bekleyen} suffix="TL" precision={2} valueStyle={{ color: '#1677ff' }} /></Card></Col>
          <Col span={6}><Card><Statistic title="Geciken" value={ozet.geciken} suffix="TL" precision={2} valueStyle={{ color: '#cf1322' }} /></Card></Col>
        </Row>
      )}

      <Tabs
        items={[
          {
            key: 'aidatlar',
            label: 'Aidat Listesi',
            children: (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                  <Space wrap>
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
                  </Space>
                  <Button icon={<CalculatorOutlined />} onClick={() => gecikmeMutation.mutate()} loading={gecikmeMutation.isPending}>
                    Gecikme Faizi Hesapla
                  </Button>
                </div>
                <Card styles={{ body: { padding: 0 } }}>
                  <Table columns={aidatColumns} dataSource={aidatData?.data} rowKey="id" loading={aidatLoading} pagination={{ pageSize: 20 }} />
                </Card>
              </>
            ),
          },
          {
            key: 'tanimlar',
            label: 'Aidat Tanımları',
            children: (
              <>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
                  <Button type="primary" icon={<PlusOutlined />} onClick={() => {
                     yillikPlanForm.setFieldsValue({ yil: dayjs().year(), kalemler: initialKalemler });
                     setYillikPlanModalOpen(true);
                  }}>
                    Yıllık Plan Oluştur
                  </Button>
                </div>
                <Card styles={{ body: { padding: 0 } }}>
                  <Table columns={tanimColumns} dataSource={tanimlar} rowKey="id" loading={tanimLoading} pagination={false} />
                </Card>
              </>
            ),
          },
        ]}
      />

      {/* Yıllık Plan Modal */}
      <Modal
        title="Yıllık Plan Oluştur"
        open={yillikPlanModalOpen}
        onCancel={() => { setYillikPlanModalOpen(false); yillikPlanForm.resetFields() }}
        onOk={() => yillikPlanForm.submit()}
        confirmLoading={createTanimMutation.isPending}
        width={900}
      >
        <Form form={yillikPlanForm} layout="vertical" onFinish={(v) => createTanimMutation.mutate(v)}>
          <Form.Item name="yil" label="Hangi Yıl İçin Planlanıyor?" rules={[{ required: true }]} style={{ width: 200 }}>
             <InputNumber style={{ width: '100%' }} />
          </Form.Item>

          <Form.List name="kalemler">
            {(fields, { add, remove }) => (
              <>
                {fields.map(({ key, name, ...restField }) => (
                  <Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                    <Form.Item
                      {...restField}
                      name={[name, 'ay']}
                      rules={[{ required: true, message: 'Ay zorunlu' }]}
                    >
                      <Select style={{ width: 120 }}>
                        {aylar.map((a, i) => <Select.Option key={i + 1} value={i + 1}>{a}</Select.Option>)}
                      </Select>
                    </Form.Item>

                    <Form.Item
                      {...restField}
                      name={[name, 'tur']}
                      rules={[{ required: true }]}
                    >
                      <Select style={{ width: 120 }}>
                        <Select.Option value="normal">Normal</Select.Option>
                        <Select.Option value="ara_odeme">Ara Ödeme</Select.Option>
                      </Select>
                    </Form.Item>

                    <Form.Item
                      {...restField}
                      name={[name, 'katsayi_tutari']}
                      rules={[{ required: true, message: 'Katsayı tutarı zorunlu' }]}
                    >
                      <InputNumber 
                        placeholder="Katsayı TL" 
                        min={0} 
                        style={{ width: 150 }} 
                        onChange={(val) => handleKatsayiChange(val, name)}
                      />
                    </Form.Item>

                    <Form.Item
                      {...restField}
                      name={[name, 'son_odeme_gunu']}
                    >
                      <InputNumber placeholder="Son Gün" min={1} max={28} style={{ width: 100 }} />
                    </Form.Item>

                    <Form.Item
                      {...restField}
                      name={[name, 'gecikme_faiz_orani']}
                    >
                      <InputNumber placeholder="Faiz %" min={0} max={100} step={0.5} style={{ width: 100 }} />
                    </Form.Item>

                    <Button type="text" onClick={() => add({ ay: yillikPlanForm.getFieldValue(['kalemler', name, 'ay']), tur: 'ara_odeme', katsayi_tutari: undefined, son_odeme_gunu: 15, gecikme_faiz_orani: 0 }, name + 1)}>
                      + Ara Ödeme
                    </Button>
                    <Button type="text" danger onClick={() => remove(name)}>Sil</Button>
                  </Space>
                ))}
              </>
            )}
          </Form.List>
        </Form>
      </Modal>

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
