import React, { useState } from 'react'
import { Card, Table, Row, Col, Statistic, DatePicker, Button, Space, Typography } from 'antd'
import { FilePdfOutlined, RiseOutlined, FallOutlined, DollarOutlined, BarChartOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import api from '../../lib/api'
import { PageHeader } from '../../components/common/PageHeader'
import { MoneyDisplay } from '../../components/common/MoneyDisplay'
import { LoadingState } from '../../components/common/LoadingState'
import { ErrorState } from '../../components/common/ErrorState'

const { Title, Text } = Typography

export const YillikRaporPage: React.FC = () => {
  const [targetYear, setTargetYear] = useState(dayjs())

  const { data: rapor, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['yillik-rapor', targetYear.year()],
    queryFn: async () => {
      const { data } = await api.get(`/raporlar/yillik-rapor?yil=${targetYear.year()}`)
      return data.data
    }
  })

  const columns = [
    { title: 'Ay', dataIndex: 'ay', key: 'ay', render: (v: number) => dayjs().month(v - 1).format('MMMM') },
    { title: 'Aidat Tahsilatı', dataIndex: 'aidat', key: 'aidat', align: 'right' as const, render: (v: number) => <MoneyDisplay amount={v} /> },
    { title: 'Diğer Gelirler', dataIndex: 'gelir', key: 'gelir', align: 'right' as const, render: (v: number) => <MoneyDisplay amount={v} /> },
    { title: 'Toplam Gider', dataIndex: 'gider', key: 'gider', align: 'right' as const, render: (v: number) => <MoneyDisplay amount={v} /> },
    { 
      title: 'Net Durum', 
      key: 'net', 
      align: 'right' as const, 
      render: (_: any, record: any) => {
        const net = record.aidat + record.gelir - record.gider
        return <MoneyDisplay amount={net} colored />
      }
    }
  ]

  if (isLoading) return <LoadingState fullHeight />
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />

  return (
    <div>
      <PageHeader
        title="Yıllık Mali Rapor"
        extra={
          <Space>
            <DatePicker
              picker="year"
              value={targetYear}
              onChange={(v) => v && setTargetYear(v)}
              format="YYYY"
            />
            <Button icon={<FilePdfOutlined />} disabled>PDF İndir</Button>
          </Space>
        }
      />

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="Yıllık Aidat Tahsilatı"
              value={rapor?.toplam_aidat || 0}
              prefix={<DollarOutlined />}
              suffix="TL"
              precision={2}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Yıllık Diğer Gelirler"
              value={rapor?.toplam_gelir || 0}
              prefix={<RiseOutlined />}
              suffix="TL"
              precision={2}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Yıllık Toplam Gider"
              value={rapor?.toplam_gider || 0}
              prefix={<FallOutlined />}
              suffix="TL"
              precision={2}
              styles={{ content: { color: '#cf1322' } }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Yıllık Net Bakiye"
              value={(rapor?.toplam_aidat || 0) + (rapor?.toplam_gelir || 0) - (rapor?.toplam_gider || 0)}
              prefix={<BarChartOutlined />}
              suffix="TL"
              precision={2}
              styles={{ content: { color: '#3f8600' } }}
            />
          </Card>
        </Col>
      </Row>

      <Card title={`${targetYear.year()} Yılı Aylık Döküm`}>
        <Table
          dataSource={rapor?.aylik || []}
          columns={columns}
          rowKey="ay"
          pagination={false}
        />
      </Card>
    </div>
  )
}
