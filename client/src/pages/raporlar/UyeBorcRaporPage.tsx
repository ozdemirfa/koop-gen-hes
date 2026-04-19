import React, { useMemo } from 'react'
import { Card, Table, Button, Space, Typography, Statistic, Row, Col } from 'antd'
import { FilePdfOutlined, UserOutlined, TeamOutlined, DollarOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import api from '../../lib/api'
import { usePageSettings } from '../../contexts/LayoutContext'
import { MoneyDisplay } from '../../components/common/MoneyDisplay'
import { LoadingState } from '../../components/common/LoadingState'
import { ErrorState } from '../../components/common/ErrorState'

const { Text } = Typography

export const UyeBorcRaporPage: React.FC = () => {
  const navigate = useNavigate()

  const { data: list, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['uye-borc-listesi'],
    queryFn: async () => {
      const { data } = await api.get('/raporlar/uye-borc-listesi')
      return data.data
    }
  })

  const actions = useMemo(() => (
    <Button 
      size="small"
      icon={<FilePdfOutlined />} 
      onClick={() => window.open(`${import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1'}/raporlar/uye-borc-listesi/pdf`, '_blank')}
      disabled
    >
      PDF İndir
    </Button>
  ), [])

  usePageSettings({
    title: 'Üye Borç Listesi',
    actions
  })

  const columns = [
    { title: 'Üye No', dataIndex: 'uye_no', key: 'uye_no', width: 100 },
    { title: 'Ad Soyad', key: 'ad_soyad', render: (_: any, r: any) => `${r.ad} ${r.soyad}` },
    { title: 'Aidat Sayısı', dataIndex: 'odenmemis_aidat_sayisi', key: 'sayi', align: 'center' as const, width: 120 },
    { title: 'Geciken Aidat', dataIndex: 'geciken_aidat_tutari', key: 'aidat', align: 'right' as const, render: (v: number) => <MoneyDisplay amount={v} /> },
    { title: 'Gecikme Faizi', dataIndex: 'gecikme_faizi_tutari', key: 'faiz', align: 'right' as const, render: (v: number) => <MoneyDisplay amount={v} /> },
    { title: 'Toplam Borç', dataIndex: 'toplam_borc', key: 'borc', align: 'right' as const, render: (v: number) => <MoneyDisplay amount={v} />, className: 'font-semibold' },
    {
      title: 'İşlem',
      key: 'action',
      width: 120,
      render: (_: any, record: any) => (
        <Button size="small" icon={<UserOutlined />} onClick={() => navigate(`/uyeler/${record.id}`)}>
          Detay
        </Button>
      )
    }
  ]

  if (isLoading) return <LoadingState fullHeight />
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />

  const genelToplamBorc = list?.reduce((s: number, r: any) => s + r.toplam_borc, 0) || 0

  return (
    <div style={{ padding: '0 0 24px 0' }}>
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col span={12}>
          <Card size="small">
            <Statistic 
              title="Borçlu Üye Sayısı" 
              value={list?.length || 0} 
              prefix={<TeamOutlined />}
              styles={{ content: { fontSize: '1.2rem' } }}
            />
          </Card>
        </Col>
        <Col span={12}>
          <Card size="small">
            <Statistic 
              title="Genel Toplam Borç" 
              value={genelToplamBorc} 
              prefix={<DollarOutlined />} 
              suffix="TL"
              precision={2} 
              styles={{ content: { color: '#cf1322', fontSize: '1.2rem' } }}
            />
          </Card>
        </Col>
      </Row>

      <Card size="small">
        <Table
          dataSource={list || []}
          columns={columns}
          rowKey="uye_no"
          size="small"
          pagination={{ pageSize: 20 }}
        />
      </Card>
    </div>
  )
}
