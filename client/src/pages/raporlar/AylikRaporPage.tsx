import React, { useState } from 'react'
import { Card, Table, Row, Col, Statistic, DatePicker, Button, Space, Typography, Spin, Empty, Tag } from 'antd'
import { FilePdfOutlined, SearchOutlined, RiseOutlined, FallOutlined, DollarOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import api from '../../lib/api'
import { PageHeader } from '../../components/common/PageHeader'
import { MoneyDisplay } from '../../components/common/MoneyDisplay'

const { Title, Text } = Typography

export const AylikRaporPage: React.FC = () => {
  const [targetDate, setTargetDate] = useState(dayjs())

  const { data: rapor, isLoading, error } = useQuery({
    queryKey: ['aylik-rapor', targetDate.year(), targetDate.month() + 1],
    queryFn: async () => {
      const { data } = await api.get(`/raporlar/aylik-rapor?yil=${targetDate.year()}&ay=${targetDate.month() + 1}`)
      return data.data
    }
  })

  const gelirGiderColumns = [
    { title: 'Tarih', dataIndex: 'tarih', key: 'tarih', render: (t: string) => dayjs(t).format('DD.MM.YYYY') },
    { title: 'Kategori', dataIndex: ['gelir_gider_kategorileri', 'ad'], key: 'kategori' },
    { title: 'Açıklama', dataIndex: 'aciklama', key: 'aciklama' },
    { title: 'Tutar', dataIndex: 'tutar', key: 'tutar', align: 'right' as const, render: (v: number) => <MoneyDisplay amount={v} /> }
  ]

  const aidatColumns = [
    { title: 'Tarih', dataIndex: 'odeme_tarihi', key: 'tarih', render: (t: string) => dayjs(t).format('DD.MM.YYYY') },
    { title: 'Ödeme Yöntemi', dataIndex: 'odeme_yontemi', key: 'yontem', render: (v: string) => <Tag>{v.toUpperCase()}</Tag> },
    { title: 'Tutar', dataIndex: 'tutar', key: 'tutar', align: 'right' as const, render: (v: number) => <MoneyDisplay amount={v} /> }
  ]

  if (isLoading) return <div style={{ textAlign: 'center', padding: '50px' }}><Spin size="large" /></div>

  return (
    <div>
      <PageHeader
        title="Aylık Mali Rapor"
        extra={
          <Space>
            <DatePicker
              picker="month"
              value={targetDate}
              onChange={(v) => v && setTargetDate(v)}
              format="MMMM YYYY"
            />
            <Button icon={<FilePdfOutlined />} disabled>PDF İndir</Button>
          </Space>
        }
      />

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col span={8}>
          <Card>
            <Statistic
              title="Toplam Aidat Tahsilatı"
              value={rapor?.toplam_aidat_tahsilat || 0}
              prefix={<DollarOutlined />}
              suffix="TL"
              precision={2}
              valueStyle={{ color: '#3f8600' }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title="Diğer Gelirler"
              value={rapor?.toplam_gelir || 0}
              prefix={<RiseOutlined />}
              suffix="TL"
              precision={2}
              valueStyle={{ color: '#3f8600' }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title="Toplam Giderler"
              value={rapor?.toplam_gider || 0}
              prefix={<FallOutlined />}
              suffix="TL"
              precision={2}
              valueStyle={{ color: '#cf1322' }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col span={24}>
          <Card title="Aidat Tahsilatları" size="small">
            <Table
              dataSource={rapor?.aidat_tahsilat || []}
              columns={aidatColumns}
              rowKey={(r, i) => i!}
              pagination={{ pageSize: 5 }}
            />
          </Card>
        </Col>
        <Col span={12}>
          <Card title="Gelirler" size="small">
            <Table
              dataSource={rapor?.gelirler || []}
              columns={gelirGiderColumns}
              rowKey="id"
              pagination={{ pageSize: 5 }}
            />
          </Card>
        </Col>
        <Col span={12}>
          <Card title="Giderler" size="small">
            <Table
              dataSource={rapor?.giderler || []}
              columns={gelirGiderColumns}
              rowKey="id"
              pagination={{ pageSize: 5 }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  )
}
