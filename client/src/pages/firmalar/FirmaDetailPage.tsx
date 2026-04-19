import React from 'react'
import { Card, Descriptions, Tabs, Tag, Table, Button, Space, Row, Col, Statistic } from 'antd'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { PlusOutlined, FileTextOutlined, DollarOutlined, SolutionOutlined, FileSearchOutlined, EditOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import api from '../../lib/api'
import { PageHeader } from '../../components/common/PageHeader'
import { MoneyDisplay } from '../../components/common/MoneyDisplay'

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
      render: (v: number) => <MoneyDisplay amount={v} />,
    },
    {
      title: 'Teminat',
      dataIndex: 'teminat_orani',
      key: 'teminat_orani',
      width: 90,
      render: (v: number) => `%${v}`,
    },
    {
      title: 'Stopaj',
      dataIndex: 'stopaj_orani',
      key: 'stopaj_orani',
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
    { title: 'No', dataIndex: 'hakedis_no', key: 'no' },
    { title: 'Dönem', key: 'donem', render: (_: any, r: any) => r.donem_ay ? `${r.donem_ay}/${r.donem_yil}` : dayjs(r.donem_baslangic).format('MM/YYYY') },
    { title: 'Tarih', dataIndex: 'hakedis_tarihi', key: 'tarih', render: (d: string) => d ? dayjs(d).format('DD.MM.YYYY') : '-' },
    { title: 'Brüt Tutar', key: 'brut', render: (_: any, r: any) => <MoneyDisplay amount={r.brut_tutar || r.toplam_tutar || 0} /> },
    { title: 'Kesintiler', key: 'kesinti', render: (_: any, r: any) => <MoneyDisplay amount={Number(r.teminat_kesintisi || 0) + Number(r.stopaj_kesintisi || 0) + Number(r.diger_kesintiler || 0)} colored /> },
    { title: 'Net Ödenen', dataIndex: 'net_tutar', key: 'net', render: (v: number) => <MoneyDisplay amount={v} /> },
    { title: 'Durum', dataIndex: 'durum', key: 'durum', render: (d: string) => <Tag>{d.toUpperCase()}</Tag> },
    { 
      title: 'İşlem', 
      key: 'action', 
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
    { title: 'Tutar', dataIndex: 'toplam_tutar', key: 'tutar', render: (v: number) => <MoneyDisplay amount={v} /> },
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
    { title: 'Açıklama', dataIndex: 'aciklama', key: 'aciklama' },
    { title: 'Belge No', dataIndex: 'belge_no', key: 'belge_no', width: 120 },
    {
      title: 'Tip',
      dataIndex: 'hareket_tipi',
      key: 'hareket_tipi',
      width: 90,
      render: (t: string) => (
        <Tag color={t === 'borc' ? 'red' : 'green'}>
          {t === 'borc' ? 'Borç' : 'Alacak'}
        </Tag>
      ),
    },
    {
      title: 'Tutar',
      dataIndex: 'tutar',
      key: 'tutar',
      width: 130,
      render: (v: number) => <MoneyDisplay amount={v} />,
    },
    {
      title: 'Bakiye',
      dataIndex: 'bakiye',
      key: 'bakiye',
      width: 130,
      render: (v: number) => <MoneyDisplay amount={v} colored />,
    },
  ]

  // Finansal Özet Hesaplamaları
  const toplamBrutHakedis = hakedisler?.filter(h => h.durum === 'onaylandi' || h.durum === 'odendi').reduce((s, h) => s + Number(h.brut_tutar), 0) || 0
  const toplamOdenen = hakedisler?.filter(h => h.durum === 'odendi').reduce((s, h) => s + Number(h.net_tutar), 0) || 0
  const toplamFatura = faturalar?.filter(f => f.fatura_tipi === 'gelen').reduce((s, f) => s + Number(f.toplam_tutar), 0) || 0
  const birikmisTeminat = hakedisler?.filter(h => h.durum === 'onaylandi' || h.durum === 'odendi').reduce((s, h) => s + Number(h.teminat_kesintisi || 0), 0) || 0
  const faturaAcigi = toplamBrutHakedis - toplamFatura

  return (
    <div>
      <PageHeader
        title={firma ? firma.unvan : 'Firma Detayı'}
        onBack={() => navigate('/firmalar')}
      />

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={5}>
          <Card size="small"><Statistic title="Toplam Hakediş (Brüt)" value={toplamBrutHakedis} prefix="₺" precision={2} groupSeparator="." decimalSeparator="," /></Card>
        </Col>
        <Col span={5}>
          <Card size="small"><Statistic title="Toplam Fatura" value={toplamFatura} prefix="₺" precision={2} groupSeparator="." decimalSeparator="," /></Card>
        </Col>
        <Col span={5}>
          <Card size="small"><Statistic title="Toplam Ödemeler" value={toplamOdenen} prefix="₺" precision={2} styles={{ content: { color: '#3f8600' } }} groupSeparator="." decimalSeparator="," /></Card>
        </Col>
        <Col span={5}>
          <Card size="small"><Statistic title="Birikmiş Teminat" value={birikmisTeminat} prefix="₺" precision={2} styles={{ content: { color: '#1890ff' } }} groupSeparator="." decimalSeparator="," /></Card>
        </Col>
        <Col span={4}>
          <Card size="small"><Statistic title="Fatura Açığı" value={faturaAcigi} prefix="₺" precision={2} styles={{ content: { color: faturaAcigi > 0 ? '#faad14' : 'inherit' } }} groupSeparator="." decimalSeparator="," /></Card>
        </Col>
      </Row>

      <Card loading={isLoading} style={{ marginBottom: 24 }}>
        {firma && (
          <Descriptions bordered column={{ xxl: 3, xl: 3, lg: 3, md: 2, sm: 1, xs: 1 }}>
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
            <Descriptions.Item label="IBAN">{firma.iban || '-'}</Descriptions.Item>
            <Descriptions.Item label="Adres" span={3}>{firma.adres || '-'}</Descriptions.Item>
            {firma.notlar && <Descriptions.Item label="Notlar" span={3}>{firma.notlar}</Descriptions.Item>}
          </Descriptions>
        )}
      </Card>

      <Card styles={{ body: { padding: 0 } }}>
        <Tabs
          style={{ padding: '0 24px 24px' }}
          items={[
            {
              key: 'sozlesmeler',
              label: <Space><SolutionOutlined />Sözleşmeler ({sozlesmeler?.length || 0})</Space>,
              children: (
                <>
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
                </>
              ),
            },
            {
              key: 'hakedisler',
              label: <Space><FileSearchOutlined />Hakedişler ({hakedisler?.length || 0})</Space>,
              children: (
                <Table
                  columns={hakedisColumns}
                  dataSource={hakedisler}
                  rowKey="id"
                  loading={hakedisLoading}
                  size="small"
                />
              ),
            },
            {
              key: 'faturalar',
              label: <Space><FileTextOutlined />Faturalar ({faturalar?.length || 0})</Space>,
              children: (
                <Table
                  columns={faturaColumns}
                  dataSource={faturalar}
                  rowKey="id"
                  loading={faturaLoading}
                  size="small"
                />
              ),
            },
            {
              key: 'cari',
              label: <Space><DollarOutlined />Cari Ekstre {cariData ? ` (Bakiye: ${cariData.guncel_bakiye?.toLocaleString('tr-TR')} TL)` : ''}</Space>,
              children: (
                <Table
                  columns={cariColumns}
                  dataSource={cariData?.hareketler}
                  rowKey="id"
                  loading={cariLoading}
                  pagination={false}
                  size="small"
                />
              ),
            },
          ]}
        />
      </Card>
    </div>
  )
}

