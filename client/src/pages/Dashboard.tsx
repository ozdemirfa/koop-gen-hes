import React from 'react'
import { Typography, Card, Row, Col, Statistic } from 'antd'
import { UserOutlined, DollarOutlined, RiseOutlined, FallOutlined, BankOutlined, WarningOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import api from '../lib/api'
import { LoadingState } from '../components/common/LoadingState'
import { ErrorState } from '../components/common/ErrorState'

const { Title } = Typography

export const Dashboard: React.FC = () => {
  const { data: ozet, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['dashboard-ozet'],
    queryFn: async () => {
      console.log('Fetching dashboard summary from:', api.defaults.baseURL)
      const response = await api.get('/dashboard/ozet')
      
      // Teşhis: Gelen verinin tipini ve ilk 100 karakterini kontrol et
      if (typeof response.data === 'string' && response.data.includes('<!DOCTYPE html>')) {
        console.error('HATA: Backend yerine Frontend HTML dosyası döndü! VITE_API_URL ayarını kontrol edin.')
        throw new Error('Backend bağlantısı kurulamadı (VITE_API_URL hatalı).')
      }

      console.log('Dashboard response data:', response.data)
      
      if (!response.data || response.data.data === undefined) {
        throw new Error(`API cevabı eksik. Gelen yapı: ${JSON.stringify(response.data).substring(0, 100)}`)
      }
      
      return response.data.data
    },
    retry: 1
  })

  if (isLoading) return <LoadingState fullHeight />
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />

  return (
    <div>
      <div className="page-header" style={{ marginBottom: 32 }}>
        <div>
          <Title level={2} style={{ margin: 0 }}>Yönetim Paneli</Title>
          <Typography.Text type="secondary">
            Kooperatifin mali durumuna ve üye özetine hızlı bir bakış.
          </Typography.Text>
        </div>
      </div>

      <Row gutter={[24, 24]}>
        <Col xs={24} sm={12} lg={8}>
          <Card className="stat-card">
            <Statistic
              title="Aktif Üye Sayısı"
              value={ozet?.aktif_uye_sayisi || 0}
              prefix={<UserOutlined style={{ color: 'var(--primary-color)', marginRight: 8 }} />}
              valueStyle={{ fontWeight: 700 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <Card className="stat-card">
            <Statistic
              title="Toplam Gelir"
              value={ozet?.toplam_gelir || 0}
              prefix={<RiseOutlined style={{ color: 'var(--success)', marginRight: 8 }} />}
              suffix="TL"
              precision={2}
              valueStyle={{ color: 'var(--success)', fontWeight: 700 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <Card className="stat-card">
            <Statistic
              title="Toplam Gider"
              value={ozet?.toplam_gider || 0}
              prefix={<FallOutlined style={{ color: 'var(--error)', marginRight: 8 }} />}
              suffix="TL"
              precision={2}
              valueStyle={{ color: 'var(--error)', fontWeight: 700 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <Card className="stat-card">
            <Statistic
              title="Net Bakiye"
              value={ozet?.net_bakiye || 0}
              prefix={<BankOutlined style={{ color: (ozet?.net_bakiye || 0) >= 0 ? 'var(--info)' : 'var(--error)', marginRight: 8 }} />}
              suffix="TL"
              precision={2}
              valueStyle={{ 
                color: (ozet?.net_bakiye || 0) >= 0 ? 'var(--info)' : 'var(--error)',
                fontWeight: 700 
              }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <Card className="stat-card">
            <Statistic
              title="Aidat Tahsilatı"
              value={ozet?.aidat_tahsilat || 0}
              prefix={<DollarOutlined style={{ color: 'var(--primary-color)', marginRight: 8 }} />}
              suffix="TL"
              precision={2}
              valueStyle={{ fontWeight: 700 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <Card className="stat-card">
            <Statistic
              title="Geciken Aidatlar"
              value={ozet?.aidat_geciken || 0}
              prefix={<WarningOutlined style={{ color: 'var(--warning)', marginRight: 8 }} />}
              suffix="TL"
              precision={2}
              valueStyle={{ color: 'var(--warning)', fontWeight: 700 }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  )
}
