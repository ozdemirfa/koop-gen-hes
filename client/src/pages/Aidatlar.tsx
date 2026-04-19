import React, { useState, useMemo, useEffect } from 'react'
import { Table, Button, Modal, Form, InputNumber, Select, message, Card, Typography, Tag, Space, DatePicker, Input, Row, Col, Statistic, App } from 'antd'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { PlusOutlined, DollarOutlined, CalculatorOutlined } from '@ant-design/icons'
import { useNavigate, useLocation } from 'react-router-dom'
import api from '../lib/api'
import dayjs from 'dayjs'
import { PageHeader } from '../components/common/PageHeader'
import { MoneyDisplay } from '../components/common/MoneyDisplay'
import { trNumberFormatter, formatMoney } from '../lib/format'
import { usePageSettings } from '../contexts/LayoutContext'
import { useProject } from '../contexts/ProjectContext'

const { Text } = Typography

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
  aidat_tanimlari?: { yil: number; ay: number; tur: string }
  serefiye_tablosu?: { daire_no: string; bloklar: { blok_adi: string } }
}

const aylar = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']

export const Aidatlar: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  
  // URL'den hangi sayfada olduğumuzu anla
  const isTanimlarPage = location.pathname.includes('/tanimlar')

  // Filtre state'leri (Aidat Listesi)
  const [filterYil, setFilterYil] = useState<number | undefined>(dayjs().year())
  const [filterAy, setFilterAy] = useState<number | undefined>(undefined)
  const [filterDurum, setFilterDurum] = useState<string | undefined>(undefined)
  const [filterBlokId, setFilterBlokId] = useState<string | undefined>(undefined)
  const [pagination, setPagination] = useState({ current: 1, pageSize: 50 })

  // Filtre state'leri (Aidat Tanımları)
  const [filterTanimYil, setFilterTanimYil] = useState<number | undefined>(dayjs().year())
  const [filterTanimAy, setFilterTanimAy] = useState<number | undefined>(undefined)
  const [filterTanimTur, setFilterTanimTur] = useState<string | undefined>(undefined)
  
  const queryClient = useQueryClient()
  const { activeProject } = useProject()
  const { message: messageApi } = App.useApp()

  // Proje tarihlerine göre yıl listesi oluştur
  const yearOptions = useMemo(() => {
    const currentYear = dayjs().year()
    if (!activeProject?.baslangic_tarihi) {
      return Array.from({ length: 5 }, (_, i) => currentYear - 2 + i)
    }

    const startYear = dayjs(activeProject.baslangic_tarihi).year()
    const endYear = activeProject.bitis_tarihi 
      ? dayjs(activeProject.bitis_tarihi).year() 
      : currentYear + 1

    const years = []
    for (let y = startYear; y <= endYear; y++) {
      years.push(y)
    }
    return years
  }, [activeProject])

  // Bloklar (Aktif proje için)
  const { data: bloklar } = useQuery({
    queryKey: ['bloklar', activeProject?.id],
    queryFn: async () => {
      if (!activeProject?.id) return []
      const { data } = await api.get('/bloklar', { params: { proje_id: activeProject?.id } })
      return data.data as { id: string; blok_adi: string; toplam_daire: number }[]
    },
    enabled: !!activeProject?.id
  })

  // Aidat tanımları
  const { data: tanimlar, isLoading: tanimLoading } = useQuery({
    queryKey: ['aidat-tanimlari', activeProject?.id, filterTanimYil, filterTanimAy, filterTanimTur],
    queryFn: async () => {
      const params: Record<string, string> = { proje_id: activeProject?.id! }
      if (filterTanimYil) params.yil = String(filterTanimYil)
      if (filterTanimAy) params.ay = String(filterTanimAy)
      if (filterTanimTur) params.tur = filterTanimTur
      
      const { data } = await api.get('/aidatlar/tanimlar', { params })
      return data.data as AidatTanimi[]
    },
    enabled: !!activeProject?.id
  })

  // Aidatlar listesi (filtreli + sayfalı)
  const { data: aidatData, isLoading: aidatLoading } = useQuery({
    queryKey: ['aidatlar', activeProject?.id, filterYil, filterAy, filterDurum, filterBlokId, pagination.current, pagination.pageSize],
    queryFn: async () => {
      const params: Record<string, string> = {
        page: String(pagination.current),
        limit: String(pagination.pageSize)
      }
      if (activeProject?.id) params.proje_id = activeProject.id
      if (filterYil) params.yil = String(filterYil)
      if (filterAy) params.ay = String(filterAy)
      if (filterDurum) params.durum = filterDurum
      if (filterBlokId) params.blok_id = filterBlokId
      const { data } = await api.get('/aidatlar', { params })
      return data
    },
    enabled: !!activeProject?.id && !isTanimlarPage
  })

  // Aidat özet (filtrelere göre)
  const { data: ozet } = useQuery({
    queryKey: ['aidat-ozet', activeProject?.id, filterYil, filterAy, filterDurum, filterBlokId],
    queryFn: async () => {
      const params: Record<string, string> = {}
      if (activeProject?.id) params.proje_id = activeProject.id
      if (filterYil) params.yil = String(filterYil)
      if (filterAy) params.ay = String(filterAy)
      if (filterDurum) params.durum = filterDurum
      if (filterBlokId) params.blok_id = filterBlokId
      const { data } = await api.get('/aidatlar/ozet', { params })
      return data.data
    },
    enabled: !!activeProject?.id && !isTanimlarPage
  })

  // Filtreler değişince başa dön
  useEffect(() => {
    setPagination(prev => ({ ...prev, current: 1 }))
  }, [filterYil, filterAy, filterDurum, filterBlokId, activeProject?.id])

  // Gecikme faizi hesapla
  const gecikmeMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/aidatlar/gecikme-hesapla', { proje_id: activeProject?.id })
      return data
    },
    onSuccess: () => {
      messageApi.success('Gecikme faizleri hesaplandı')
      queryClient.invalidateQueries({ queryKey: ['aidatlar'] })
      queryClient.invalidateQueries({ queryKey: ['aidat-ozet'] })
    },
  })

  // Toplam daire sayısını hesapla
  const toplamDaireSayisi = useMemo(() => {
    return bloklar?.reduce((sum, b) => sum + (Number(b.toplam_daire) || 0), 0) || 0
  }, [bloklar])

  // Filtrelenmiş tanımların katsayı toplamını hesapla
  const tanimlarKatsayiToplami = useMemo(() => {
    return (tanimlar || []).reduce((sum, t) => sum + (Number(t.katsayi_tutari) || 0), 0)
  }, [tanimlar])

  const aidatlarGenelToplami = tanimlarKatsayiToplami * toplamDaireSayisi

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
      title: 'Tür',
      key: 'tur',
      render: (_: unknown, r: Aidat) => {
        const tur = r.aidat_tanimlari?.tur || 'normal'
        return <Tag color={tur === 'normal' ? 'blue' : 'purple'}>{tur === 'normal' ? 'Normal' : 'Ara Ödeme'}</Tag>
      }
    },
    {
      title: 'Tutar',
      dataIndex: 'tutar',
      key: 'tutar',
      render: (v: number) => <MoneyDisplay amount={v} />,
    },
    {
      title: 'Faiz',
      dataIndex: 'gecikme_faizi',
      key: 'gecikme_faizi',
      render: (v: number) => v > 0 ? <MoneyDisplay amount={v} colored /> : '-',
    },
    {
      title: 'Toplam',
      dataIndex: 'toplam_tutar',
      key: 'toplam_tutar',
      render: (v: number) => <MoneyDisplay amount={v} />,
    },
    {
      title: 'Durum',
      dataIndex: 'durum',
      key: 'durum',
      render: (d: string) => <Tag color={durumRenk[d] || 'default'}>{d.toUpperCase()}</Tag>,
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

  const listActions = useMemo(() => (
    <Space>
      <Select
        placeholder="Yıl"
        value={filterYil}
        onChange={setFilterYil}
        allowClear
        style={{ width: 100 }}
      >
        {yearOptions.map(y => (
          <Select.Option key={y} value={y}>{y}</Select.Option>
        ))}
      </Select>
      <Select
        placeholder="Ay"
        value={filterAy}
        onChange={setFilterAy}
        allowClear
        style={{ width: 110 }}
      >
        {aylar.map((a, i) => <Select.Option key={i + 1} value={i + 1}>{a}</Select.Option>)}
      </Select>
      <Select
        placeholder="Durum"
        value={filterDurum}
        onChange={setFilterDurum}
        allowClear
        style={{ width: 110 }}
      >
        <Select.Option value="bekliyor">Bekliyor</Select.Option>
        <Select.Option value="odendi">Ödendi</Select.Option>
        <Select.Option value="gecikti">Gecikti</Select.Option>
        <Select.Option value="iptal">İptal</Select.Option>
      </Select>
      <Select
        placeholder="Blok Seçin"
        value={filterBlokId}
        onChange={setFilterBlokId}
        allowClear
        style={{ width: 120 }}
      >
        {bloklar?.map(b => (
          <Select.Option key={b.id} value={b.id}>{b.blok_adi}</Select.Option>
        ))}
      </Select>
      <Button 
        type="primary" 
        size="middle"
        icon={<CalculatorOutlined />} 
        onClick={() => gecikmeMutation.mutate()} 
        loading={gecikmeMutation.isPending}
        style={{ color: '#ffffff' }}
      >
        Gecikme Faizi Hesapla
      </Button>
    </Space>
  ), [filterYil, filterAy, filterDurum, filterBlokId, bloklar, yearOptions, gecikmeMutation.isPending])

  const tanimActions = useMemo(() => (
    <Space size="middle">
      <Select
        placeholder="Yıl"
        value={filterTanimYil}
        onChange={setFilterTanimYil}
        allowClear
        style={{ width: 90 }}
      >
        {yearOptions.map(y => (
          <Select.Option key={y} value={y}>{y}</Select.Option>
        ))}
      </Select>
      <Select
        placeholder="Ay"
        value={filterTanimAy}
        onChange={setFilterTanimAy}
        allowClear
        style={{ width: 100 }}
      >
        {aylar.map((a, i) => <Select.Option key={i + 1} value={i + 1}>{a}</Select.Option>)}
      </Select>
      <Select
        placeholder="Tür"
        value={filterTanimTur}
        onChange={setFilterTanimTur}
        allowClear
        style={{ width: 110 }}
      >
        <Select.Option value="normal">Normal</Select.Option>
        <Select.Option value="ara_odeme">Ara Ödeme</Select.Option>
      </Select>
      <Button 
        type="primary" 
        icon={<PlusOutlined />} 
        onClick={() => navigate('/aidatlar/yillik-plan')}
        size="middle"
        style={{ color: '#ffffff' }}
      >
        Yıllık Plan Oluştur
      </Button>
      <div style={{ marginLeft: 4, display: 'flex', alignItems: 'center', gap: '6px' }}>
        <Text type="secondary" style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>Aidatlar Toplamı:</Text>
        <Text strong style={{ fontSize: '15px', color: '#1890ff', whiteSpace: 'nowrap' }}>
          {formatMoney(aidatlarGenelToplami)} TL
        </Text>
      </div>
    </Space>
  ), [filterTanimYil, filterTanimAy, filterTanimTur, yearOptions, aidatlarGenelToplami, navigate])

  usePageSettings({
    title: isTanimlarPage ? 'Aidat Tanımları' : 'Aidat Listesi',
    actions: isTanimlarPage ? tanimActions : listActions
  })

  if (isTanimlarPage) {
    return (
      <div>
        <Card>
          <Table 
            columns={tanimColumns} 
            dataSource={tanimlar} 
            rowKey="id" 
            loading={tanimLoading} 
            pagination={false} 
            bordered={false}
            size="small"
          />
        </Card>
      </div>
    )
  }

  return (
    <div>
      {ozet && (
        <Row gutter={[12, 12]} style={{ marginBottom: 24 }}>
          <Col xs={24} sm={12} lg={4} md={8}>
            <Card className="stat-card" size="small">
              <Statistic 
                title="Toplam Aidat" 
                value={ozet.toplam_aidat} 
                prefix="₺" 
                formatter={(v) => formatMoney(v as number)}
                styles={{ content: { fontWeight: 700, fontSize: '16px' } }} 
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={5} md={8}>
            <Card className="stat-card" size="small">
              <Statistic 
                title="Toplam Tahsilat" 
                value={ozet.toplam_tahsilat} 
                prefix="₺" 
                formatter={(v) => formatMoney(v as number)}
                styles={{ content: { color: 'var(--success)', fontWeight: 700, fontSize: '16px' } }} 
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={5} md={8}>
            <Card className="stat-card" size="small">
              <Statistic 
                title="Bekleyen" 
                value={ozet.bekleyen} 
                prefix="₺" 
                formatter={(v) => formatMoney(v as number)}
                styles={{ content: { color: 'var(--info)', fontWeight: 700, fontSize: '16px' } }} 
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={5} md={12}>
            <Card className="stat-card" size="small">
              <Statistic 
                title="Geciken" 
                value={ozet.geciken} 
                prefix="₺" 
                formatter={(v) => formatMoney(v as number)}
                styles={{ content: { color: 'var(--error)', fontWeight: 700, fontSize: '16px' } }} 
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={5} md={12}>
            <Card className="stat-card" size="small">
              <Statistic 
                title="Toplam Faiz" 
                value={ozet.toplam_gecikme_faizi} 
                prefix="₺" 
                formatter={(v) => formatMoney(v as number)}
                styles={{ content: { color: '#fa8c16', fontWeight: 700, fontSize: '16px' } }} 
              />
            </Card>
          </Col>
        </Row>
      )}

      <Card styles={{ body: { padding: 0 } }}>
        <Table 
          columns={aidatColumns} 
          dataSource={aidatData?.data} 
          rowKey="id" 
          loading={aidatLoading} 
          pagination={{ 
            ...pagination, 
            total: aidatData?.pagination?.total || 0,
            showSizeChanger: true,
            showTotal: (total) => `Toplam ${total} kayıt`
          }}
          onChange={(p) => setPagination({ current: p.current || 1, pageSize: p.pageSize || 50 })}
          bordered={false}
          size="small"
        />
      </Card>
    </div>
  )
}
