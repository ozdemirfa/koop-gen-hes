import React, { useMemo } from 'react'
import { Card, Descriptions, Tabs, Tag, Table, Button, Space, Row, Col, Statistic, Typography } from 'antd'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { PlusOutlined, FileTextOutlined, DollarOutlined, SolutionOutlined, FileSearchOutlined, EditOutlined, InfoCircleOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import api from '../../lib/api'
import { PageHeader } from '../../components/common/PageHeader'
import { MoneyDisplay } from '../../components/common/MoneyDisplay'
import { formatIBAN, getIBANRaw, trMoneyFormatter } from '../../lib/format'

interface Sozlesme {
  id: string
  sozlesme_no?: string
  konu: string
  toplam_tutar: number
  baslangic_tarihi?: string
  bitis_tarihi?: string
  teminat_orani: number
  stopaj_orani: number
}

const durumRenk: Record<string, string> = {
  taslak: 'default',
  onaylandi: 'blue',
  odendi: 'green',
  iptal: 'red',
}

const { Text } = Typography

export const FirmaDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const activeProjectId = localStorage.getItem('activeProjectId')

  const { data: firma, isLoading } = useQuery({
    queryKey: ['firma', id],
    queryFn: async () => {
      const { data } = await api.get(`/firmalar/${id}`)
      return data.data
    },
  })

  const { data: sozlesmeler, isLoading: sozlesmeLoading } = useQuery({
    queryKey: ['sozlesmeler', { firma_id: id, activeProjectId }],
    queryFn: async () => {
      const params: any = { firma_id: id }
      if (activeProjectId) params.proje_id = activeProjectId
      const { data } = await api.get('/sozlesmeler', { params })
      return data.data
    },
  })

  const { data: hakedisler, isLoading: hakedisLoading } = useQuery({
    queryKey: ['hakedisler', { firma_id: id, activeProjectId }],
    queryFn: async () => {
      const params: any = { firma_id: id, limit: 1000 }
      if (activeProjectId) params.proje_id = activeProjectId
      const { data } = await api.get('/hakedisler', { params })
      return data.data as any[]
    },
  })

  const { data: faturalar, isLoading: faturaLoading } = useQuery({
    queryKey: ['faturalar', { firma_id: id, activeProjectId }],
    queryFn: async () => {
      const params: any = { firma_id: id, limit: 1000 }
      if (activeProjectId) params.proje_id = activeProjectId
      const { data } = await api.get('/faturalar', { params })
      return data.data as any[]
    },
  })

  const { data: cariData, isLoading: cariLoading } = useQuery({
    queryKey: ['cari-ekstre', id, activeProjectId],
    queryFn: async () => {
      const params: any = {}
      if (activeProjectId) params.proje_id = activeProjectId
      const { data } = await api.get(`/firmalar/${id}/cari-ekstre`, { params })
      return data.data
    },
  })

  const sozlesmeColumns = [
    { title: 'Sözleşme No', dataIndex: 'sozlesme_no', key: 'sozlesme_no', width: 130 },
    { title: 'Konu', dataIndex: 'konu', key: 'konu' },
    {
      title: 'Toplam Tutar',
      dataIndex: 'toplam_tutar',
      key: 'toplam_tutar',
      align: 'right' as const,
      render: (v: number) => <MoneyDisplay amount={v} />,
    },
    {
      title: 'Teminat',
      dataIndex: 'teminat_orani',
      key: 'teminat_orani',
      align: 'right' as const,
      width: 90,
      render: (v: number) => `%${v}`,
    },
    {
      title: 'Stopaj',
      dataIndex: 'stopaj_orani',
      key: 'stopaj_orani',
      align: 'right' as const,
      width: 90,
      render: (v: number) => `%${v}`,
    },
    {
      title: 'Tarih',
      key: 'tarih',
      render: (_: unknown, r: Sozlesme) => {
        const start = r.baslangic_tarihi ? dayjs(r.baslangic_tarihi).format('DD.MM.YYYY') : '-'
        const end = r.bitis_tarihi ? dayjs(r.bitis_tarihi).format('DD.MM.YYYY') : '-'
        return `${start} - ${end}`
      },
    },
    {
      title: 'İşlem',
      key: 'action',
      width: 80,
      render: (_: unknown, r: Sozlesme) => (
        <Button
          icon={<FileTextOutlined />}
          type="text"
          onClick={() => navigate(`/sozlesmeler/${r.id}`)}
        />
      ),
    },
  ]

  const hakedisColumns = [
    { title: 'No', dataIndex: 'hakedis_no', key: 'no', width: 60 },
    { title: 'Dönem', key: 'donem', width: 90, render: (_: any, r: any) => r.donem_ay ? `${r.donem_ay}/${r.donem_yil}` : dayjs(r.donem_baslangic).format('MM/YYYY') },
    { title: 'Onay Tarihi', dataIndex: 'onay_tarihi', key: 'onay_tarihi', width: 110, render: (d: string) => d ? dayjs(d).format('DD.MM.YYYY') : '-' },
    { title: 'Hakediş Toplamı', key: 'brut', align: 'right' as const, width: 130, render: (_: any, r: any) => <MoneyDisplay amount={r.ara_toplam || r.brut_tutar || 0} /> },
    { title: 'KDVli Tutar', dataIndex: 'hakedis_toplam', key: 'kdvli', align: 'right' as const, width: 130, render: (v: number) => <MoneyDisplay amount={v} /> },
    { title: 'Teminat', dataIndex: 'teminat_kesintisi', key: 'teminat', align: 'right' as const, width: 110, render: (v: number) => <MoneyDisplay amount={v} colored /> },
    { title: 'Stopaj', dataIndex: 'stopaj_kesintisi', key: 'stopaj', align: 'right' as const, width: 110, render: (v: number) => <MoneyDisplay amount={v} colored /> },
    { title: 'Net Ödeme', dataIndex: 'net_tutar', key: 'net', align: 'right' as const, width: 130, render: (v: number) => <MoneyDisplay amount={v} /> },
    { title: 'Durum', dataIndex: 'durum', key: 'durum', width: 100, render: (d: string) => <Tag color={durumRenk[d] || 'default'}>{d.toUpperCase()}</Tag> },
    { 
      title: 'İşlem', 
      key: 'action', 
      fixed: 'right' as const,
      width: 180,
      render: (_: any, r: any) => (
        <Space>
          <Button icon={<FileSearchOutlined />} size="small" onClick={() => navigate(`/hakedisler/${r.id}`)}>Görüntüle</Button>
          <Button icon={<EditOutlined />} size="small" onClick={() => navigate(`/hakedisler/${r.id}?edit=true`)}>Düzenle</Button>
        </Space>
      ) 
    },
  ]

  const faturaColumns = [
    { title: 'Fatura No', dataIndex: 'fatura_no', key: 'no' },
    { title: 'Tarih', dataIndex: 'fatura_tarihi', key: 'tarih', render: (d: string) => dayjs(d).format('DD.MM.YYYY') },
    { title: 'Tutar', dataIndex: 'toplam_tutar', key: 'tutar', align: 'right' as const, render: (v: number) => <MoneyDisplay amount={v} /> },
    { title: 'Tip', dataIndex: 'fatura_tipi', key: 'tip', render: (t: string) => <Tag color={t === 'gelen' ? 'red' : 'green'}>{t.toUpperCase()}</Tag> },
    { title: 'Durum', dataIndex: 'durum', key: 'durum', render: (d: string) => <Tag>{d.toUpperCase()}</Tag> },
  ]

  const cariColumns = [
    {
      title: 'Tarih',
      dataIndex: 'tarih',
      key: 'tarih',
      width: 110,
      render: (d: string) => dayjs(d).format('DD.MM.YYYY'),
    },
    {
      title: 'İşlem Türü',
      dataIndex: 'islem_turu',
      key: 'islem_turu',
      width: 120,
      render: (t: string) => <Tag>{t.toUpperCase()}</Tag>,
    },
    { title: 'Açıklama', dataIndex: 'aciklama', key: 'aciklama' },
    {
      title: 'Borç',
      key: 'borc',
      width: 130,
      align: 'right' as const,
      render: (_: any, r: any) => r.hareket_tipi === 'borc' ? <MoneyDisplay amount={r.tutar} /> : '-',
    },
    {
      title: 'Alacak',
      key: 'alacak',
      width: 130,
      align: 'right' as const,
      render: (_: any, r: any) => r.hareket_tipi === 'alacak' ? <MoneyDisplay amount={r.tutar} /> : '-',
    },
    {
      title: 'Bakiye',
      dataIndex: 'bakiye',
      key: 'bakiye',
      width: 130,
      align: 'right' as const,
      render: (v: number) => <MoneyDisplay amount={v} colored />,
    },
  ]

  // Finansal Özet Hesaplamaları
  const stats = useMemo(() => {
    const list = hakedisler?.filter(h => h.durum === 'onaylandi' || h.durum === 'odendi') || []
    const hakedisMatrah = list.reduce((s, h) => s + Number(h.ara_toplam || h.brut_tutar || 0), 0)
    const hakedisKdvli = list.reduce((s, h) => s + Number(h.hakedis_toplam || 0), 0)
    const teminatKesintisi = list.reduce((s, h) => s + Number(h.teminat_kesintisi || 0), 0)
    
    const fList = faturalar?.filter(f => f.fatura_tipi === 'gelen') || []
    const faturaToplam = fList.reduce((s, f) => s + Number(f.toplam_tutar || 0), 0)
    
    // Cari hareketler üzerinden ödemeleri ve teminat iadelerini bul
    const movements = cariData?.hareketler || []
    let toplamOdeme = 0
    let odenenTeminat = 0
    
    movements.forEach((m: any) => {
      if (m.islem_turu === 'giden_odeme' || m.islem_turu === 'odeme') {
        toplamOdeme += Number(m.alacak || m.tutar || 0)
        if (m.kaynak_tipi === 'teminat') {
          odenenTeminat += Number(m.alacak || m.tutar || 0)
        }
      }
    })

    const birikmisTeminat = teminatKesintisi - odenenTeminat
    // Cari Bakiye = Toplam Ödeme - KDVli Tutar - Birikmiş Teminat
    const bakiye = toplamOdeme - hakedisKdvli - birikmisTeminat

    return {
      toplamMatrah: hakedisMatrah,
      toplamKdvli: hakedisKdvli,
      toplamTeminat: birikmisTeminat,
      toplamOdeme: toplamOdeme,
      toplamFatura: faturaToplam,
      faturaAcigi: hakedisKdvli - faturaToplam,
      cariBakiye: bakiye
    }
  }, [hakedisler, faturalar, cariData])

  return (
    <div>
      <PageHeader
        title={firma ? firma.unvan : 'Firma Detayı'}
        onBack={() => navigate('/firmalar')}
      />

      {/* 7 Kartlı Tek Satır Düzeni */}
      <Row gutter={[8, 8]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} lg={4}>
          <Card variant="borderless" className="stat-card shadow-sm" size="small">
            <Space orientation="vertical" size={0} style={{ width: '100%' }}>
              <Statistic 
                title={<span style={{ fontSize: '12px' }}>Hakediş (Matrah)</span>} 
                value={stats.toplamMatrah} 
                formatter={(v) => trMoneyFormatter(v as number)}
                styles={{ content: { color: '#1677ff', fontSize: '15px', fontWeight: 'bold' } }}
              />
              <div style={{ borderTop: '1px solid #f0f0f0', marginTop: 4, paddingTop: 4 }}>
                <Text type="secondary" style={{ fontSize: '11px' }}>KDVli: </Text>
                <Text strong style={{ fontSize: '15px', color: '#1677ff' }}>{trMoneyFormatter(stats.toplamKdvli)} TL</Text>
              </div>
            </Space>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={4}>
          <Card variant="borderless" className="stat-card shadow-sm" size="small">
            <Space orientation="vertical" size={0} style={{ width: '100%' }}>
              <Statistic 
                title={<span style={{ fontSize: '12px' }}>Gelen Faturalar</span>} 
                value={stats.toplamFatura} 
                formatter={(v) => trMoneyFormatter(v as number)}
                styles={{ content: { color: '#faad14', fontSize: '15px', fontWeight: 'bold' } }}
              />
              <div style={{ borderTop: '1px solid #f0f0f0', marginTop: 4, paddingTop: 4 }}>
                <Text type="secondary" style={{ fontSize: '11px' }}>Fatura Açığı: </Text>
                <Text strong style={{ fontSize: '12px', color: stats.toplamFatura - stats.toplamKdvli < 0 ? '#faad14' : 'inherit' }}>
                  {trMoneyFormatter(stats.toplamFatura - stats.toplamKdvli)} TL
                </Text>
              </div>
            </Space>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={4}>
          <Card variant="borderless" className="stat-card shadow-sm" size="small">
            <Statistic 
              title={<span style={{ fontSize: '12px' }}>Birikmiş Teminat</span>} 
              value={stats.toplamTeminat} 
              formatter={(v) => trMoneyFormatter(v as number)}
              styles={{ content: { color: '#722ed1', fontSize: '15px', fontWeight: 'bold' } }}
              suffix={<span style={{ fontSize: '11px', fontWeight: 'normal', marginLeft: 4 }}>TL</span>}
            />
            <div style={{ borderTop: '1px solid #f0f0f0', marginTop: 4, paddingTop: 4 }}>
              <Text type="secondary" style={{ fontSize: '11px' }}>Net Kalan Teminat</Text>
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={4}>
          <Card variant="borderless" className="stat-card shadow-sm" size="small">
            <Statistic 
              title={<span style={{ fontSize: '12px' }}>Toplam Ödeme</span>} 
              value={stats.toplamOdeme} 
              formatter={(v) => trMoneyFormatter(v as number)}
              styles={{ content: { color: '#3f8600', fontSize: '15px', fontWeight: 'bold' } }}
              suffix={<span style={{ fontSize: '11px', fontWeight: 'normal', marginLeft: 4 }}>TL</span>}
            />
            <div style={{ borderTop: '1px solid #f0f0f0', marginTop: 4, paddingTop: 4 }}>
              <Text type="secondary" style={{ fontSize: '11px' }}>Yapılan Toplam Ödeme</Text>
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={24} lg={8}>
          <Card variant="borderless" className="stat-card shadow-sm" size="small" style={{ background: '#f0f5ff' }}>
            <Statistic 
              title={<span style={{ fontSize: '12px', fontWeight: 'bold' }}>Cari Bakiye</span>} 
              value={stats.cariBakiye} 
              formatter={(v) => trMoneyFormatter(v as number)}
              styles={{ content: { color: stats.cariBakiye < 0 ? '#cf1322' : '#1677ff', fontSize: '20px', fontWeight: 'bold' } }}
              suffix={<span style={{ fontSize: '12px', fontWeight: 'normal', marginLeft: 4 }}>TL</span>}
            />
            <div style={{ borderTop: '1px solid #ddecff', marginTop: 4, paddingTop: 4 }}>
              <Text type="secondary" style={{ fontSize: '11px' }}>Ödeme - KDVli Tutar - Teminat</Text>
            </div>
          </Card>
        </Col>
      </Row>

      <Card styles={{ body: { padding: 0 } }}>
        <Tabs
          defaultActiveKey="info"
          style={{ padding: '0 24px 24px' }}
          items={[
            {
              key: 'info',
              label: <Space><InfoCircleOutlined />Firma Bilgileri</Space>,
              children: (
                <div style={{ paddingTop: 16 }}>
                  {firma && (
                    <Descriptions 
                      bordered 
                      column={{ xxl: 3, xl: 3, lg: 3, md: 2, sm: 1, xs: 1 }}
                    >
                      <Descriptions.Item label="Tip">
                        <Tag color={firma.firma_tipi === 'yuklenici' ? 'blue' : 'purple'}>
                          {firma.firma_tipi === 'yuklenici' ? 'Yüklenici' : 'Tedarikçi'}
                        </Tag>
                      </Descriptions.Item>
                      <Descriptions.Item label="Durum">
                        <Tag color={firma.aktif ? 'green' : 'default'}>{firma.aktif ? 'Aktif' : 'Pasif'}</Tag>
                      </Descriptions.Item>
                      <Descriptions.Item label="Vergi No">{firma.vergi_no || '-'}</Descriptions.Item>
                      <Descriptions.Item label="Vergi Dairesi">{firma.vergi_dairesi || '-'}</Descriptions.Item>
                      <Descriptions.Item label="Telefon">{firma.telefon || '-'}</Descriptions.Item>
                      <Descriptions.Item label="E-posta">{firma.email || '-'}</Descriptions.Item>
                      <Descriptions.Item label="Yetkili Kişi">{firma.yetkili_kisi || '-'}</Descriptions.Item>
                      <Descriptions.Item label="IBAN" span={2}>
                        {firma.iban ? (
                          <Typography.Text copyable={{ text: getIBANRaw(firma.iban), tooltips: ['Kopyala (Sadece Rakamlar)', 'Kopyalandı!'] }}>
                            {formatIBAN(firma.iban)}
                          </Typography.Text>
                        ) : '-'}
                      </Descriptions.Item>
                      <Descriptions.Item label="Adres" span={3}>{firma.adres || '-'}</Descriptions.Item>
                      {firma.notlar && <Descriptions.Item label="Notlar" span={3}>{firma.notlar}</Descriptions.Item>}
                    </Descriptions>
                  )}
                </div>
              ),
            },
            {
              key: 'sozlesmeler',
              label: <Space><SolutionOutlined />Sözleşmeler ({sozlesmeler?.length || 0})</Space>,
              children: (
                <div style={{ paddingTop: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      onClick={() => navigate(`/sozlesmeler/yeni?firma_id=${id}`)}
                    >
                      Yeni Sözleşme
                    </Button>
                  </div>
                  <Table
                    columns={sozlesmeColumns}
                    dataSource={sozlesmeler}
                    rowKey="id"
                    loading={sozlesmeLoading}
                    pagination={false}
                    size="small"
                  />
                </div>
              ),
            },
            {
              key: 'hakedisler',
              label: <Space><FileSearchOutlined />Hakedişler ({hakedisler?.length || 0})</Space>,
              children: (
                <div style={{ paddingTop: 16 }}>
                  <Table
                    columns={hakedisColumns}
                    dataSource={hakedisler}
                    rowKey="id"
                    loading={hakedisLoading}
                    size="small"
                  />
                </div>
              ),
            },
            {
              key: 'faturalar',
              label: <Space><FileTextOutlined />Faturalar ({faturalar?.length || 0})</Space>,
              children: (
                <div style={{ paddingTop: 16 }}>
                  <Table
                    columns={faturaColumns}
                    dataSource={faturalar}
                    rowKey="id"
                    loading={faturaLoading}
                    size="small"
                  />
                </div>
              ),
            },
            {
              key: 'cari',
              label: <Space><DollarOutlined />Cari Ekstre {cariData ? ` (Bakiye: ${cariData.guncel_bakiye?.toLocaleString('tr-TR')} TL)` : ''}</Space>,
              children: (
                <div style={{ paddingTop: 16 }}>
                  <Table
                    columns={cariColumns}
                    dataSource={cariData?.hareketler}
                    rowKey="id"
                    loading={cariLoading}
                    pagination={false}
                    size="small"
                  />
                </div>
              ),
            },
          ]}
        />
      </Card>
    </div>
  )
}
