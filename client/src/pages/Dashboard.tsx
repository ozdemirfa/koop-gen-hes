import React, { useState } from 'react'
import { Typography, Card, Row, Col, Statistic, DatePicker, Space } from 'antd'
import { UserOutlined, DollarOutlined, RiseOutlined, FallOutlined, BankOutlined, WarningOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import api from '../lib/api'
import { LoadingState } from '../components/common/LoadingState'
import { ErrorState } from '../components/common/ErrorState'
import { usePageSettings } from '../contexts/LayoutContext'
import { useProject } from '../contexts/ProjectContext'
import dayjs from 'dayjs'
import { trNumberFormatter } from '../lib/format'

const { RangePicker } = DatePicker

export const Dashboard: React.FC = () => {
  const { activeProject } = useProject()
  const [dates, setDates] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null)

  const { data: ozet, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['dashboard-ozet', activeProject?.id, dates],
    queryFn: async () => {
      const params: any = {}
      if (activeProject?.id) params.projeId = activeProject.id
      if (dates?.[0]) params.baslangic_tarihi = dates[0].format('YYYY-MM-DD')
      if (dates?.[1]) params.bitis_tarihi = dates[1].format('YYYY-MM-DD')

      const response = await api.get('/dashboard/ozet', { params })
      
      if (typeof response.data === 'string' && response.data.includes('<!DOCTYPE html>')) {
        throw new Error('Backend bağlantısı kurulamadı (VITE_API_URL hatalı).')
      }

      if (!response.data || response.data.data === undefined) {
        throw new Error(`API cevabı eksik.`)
      }
      
      return response.data.data
    },
    retry: 1,
    enabled: !!activeProject?.id
  })

  const actions = React.useMemo(() => (
    <Space size="small">
      <RangePicker 
        size="small" 
        value={dates} 
        onChange={(vals) => setDates(vals as any)}
        placeholder={['Başlangıç', 'Bitiş']}
        style={{ width: 240 }}
      />
    </Space>
  ), [dates])

  usePageSettings({
    title: 'Dashboard',
    actions
  })

  if (!activeProject) {
    return (
      <Card style={{ textAlign: 'center', marginTop: 50 }}>
        <Typography.Title level={4}>Lütfen bir proje seçin</Typography.Title>
        <Typography.Text type="secondary">Dashboard verilerini görebilmek için üst menüden bir proje seçmelisiniz.</Typography.Text>
      </Card>
    )
  }

  if (isLoading) return <LoadingState fullHeight />
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />

  return (
    <div>
      <Row gutter={[12, 12]}>
        <Col xs={24} sm={12} lg={8}>
          <Card className="stat-card" size="small">
            <Statistic
              title="Aktif Üye Sayısı"
              value={ozet?.aktif_uye_sayisi || 0}
              prefix={<UserOutlined style={{ color: 'var(--primary-color)', marginRight: 8 }} />}
              formatter={(v) => trNumberFormatter(v as number)}
              styles={{ content: { fontWeight: 700, fontSize: '20px' } }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <Card className="stat-card" size="small">
            <Statistic
              title="Toplam Gelir"
              value={ozet?.toplam_gelir || 0}
              prefix={<RiseOutlined style={{ color: 'var(--success)', marginRight: 8 }} />}
              suffix="TL"
              precision={2}
              formatter={(v) => trNumberFormatter(v as number)}
              styles={{ content: { color: 'var(--success)', fontWeight: 700, fontSize: '20px' } }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <Card className="stat-card" size="small">
            <Statistic
              title="Toplam Gider"
              value={ozet?.toplam_gider || 0}
              prefix={<FallOutlined style={{ color: 'var(--error)', marginRight: 8 }} />}
              suffix="TL"
              precision={2}
              formatter={(v) => trNumberFormatter(v as number)}
              styles={{ content: { color: 'var(--error)', fontWeight: 700, fontSize: '20px' } }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <Card className="stat-card" size="small">
            <Statistic
              title="Net Bakiye"
              value={ozet?.net_bakiye || 0}
              prefix={<BankOutlined style={{ color: (ozet?.net_bakiye || 0) >= 0 ? 'var(--info)' : 'var(--error)', marginRight: 8 }} />}
              suffix="TL"
              precision={2}
              formatter={(v) => trNumberFormatter(v as number)}
              styles={{ content: { 
                color: (ozet?.net_bakiye || 0) >= 0 ? 'var(--info)' : 'var(--error)',
                fontWeight: 700,
                fontSize: '20px'
              } }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <Card className="stat-card" size="small">
            <Statistic
              title="Aidat Tahsilatı"
              value={ozet?.aidat_tahsilat || 0}
              prefix={<DollarOutlined style={{ color: 'var(--primary-color)', marginRight: 8 }} />}
              suffix="TL"
              precision={2}
              formatter={(v) => trNumberFormatter(v as number)}
              styles={{ content: { fontWeight: 700, fontSize: '20px' } }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <Card className="stat-card" size="small">
            <Statistic
              title="Geciken Aidatlar"
              value={ozet?.aidat_geciken || 0}
              prefix={<WarningOutlined style={{ color: 'var(--warning)', marginRight: 8 }} />}
              suffix="TL"
              precision={2}
              formatter={(v) => trNumberFormatter(v as number)}
              styles={{ content: { color: 'var(--warning)', fontWeight: 700, fontSize: '20px' } }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  )
}
