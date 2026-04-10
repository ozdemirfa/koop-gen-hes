import React from 'react'
import { Typography, Card, Row, Col, Statistic, Spin } from 'antd'
import { UserOutlined, DollarOutlined, RiseOutlined, FallOutlined, BankOutlined, WarningOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import api from '../lib/api'

const { Title } = Typography

export const Dashboard: React.FC = () => {
  const { data: ozet, isLoading } = useQuery({
    queryKey: ['dashboard-ozet'],
    queryFn: async () => {
      const { data } = await api.get('/dashboard/ozet')
      return data.data
    },
  })

  if (isLoading) {
    return <div style={{ textAlign: 'center', padding: 100 }}><Spin size="large" /></div>
  }

  return (
    <div>
      <Title level={2}>Yönetim Paneli</Title>

      <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
        <Col xs={24} sm={12} lg={8}>
          <Card>
            <Statistic
              title="Aktif Üye Sayısı"
              value={ozet?.aktif_uye_sayisi || 0}
              prefix={<UserOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <Card>
            <Statistic
              title="Toplam Gelir"
              value={ozet?.toplam_gelir || 0}
              prefix={<RiseOutlined />}
              suffix="TL"
              precision={2}
              valueStyle={{ color: '#3f8600' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <Card>
            <Statistic
              title="Toplam Gider"
              value={ozet?.toplam_gider || 0}
              prefix={<FallOutlined />}
              suffix="TL"
              precision={2}
              valueStyle={{ color: '#cf1322' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <Card>
            <Statistic
              title="Net Bakiye"
              value={ozet?.net_bakiye || 0}
              prefix={<BankOutlined />}
              suffix="TL"
              precision={2}
              valueStyle={{ color: (ozet?.net_bakiye || 0) >= 0 ? '#3f8600' : '#cf1322' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <Card>
            <Statistic
              title="Aidat Tahsilatı"
              value={ozet?.aidat_tahsilat || 0}
              prefix={<DollarOutlined />}
              suffix="TL"
              precision={2}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <Card>
            <Statistic
              title="Geciken Aidatlar"
              value={ozet?.aidat_geciken || 0}
              prefix={<WarningOutlined />}
              suffix="TL"
              precision={2}
              valueStyle={{ color: '#cf1322' }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  )
}
