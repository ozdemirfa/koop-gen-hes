import React, { useState, useMemo } from 'react'
import { Card, Table, Row, Col, Statistic, DatePicker, Button, Space, Tag } from 'antd'
import { FilePdfOutlined, RiseOutlined, FallOutlined, DollarOutlined, CalendarOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import api from '../../lib/api'
import { usePageSettings } from '../../contexts/LayoutContext'
import { MoneyDisplay } from '../../components/common/MoneyDisplay'
import { LoadingState } from '../../components/common/LoadingState'
import { ErrorState } from '../../components/common/ErrorState'

import { trMoneyFormatter } from '../../lib/format'

export const AylikRaporPage: React.FC = () => {
  const [targetDate, setTargetDate] = useState(dayjs())

  const { data: rapor, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['aylik-rapor', targetDate.year(), targetDate.month() + 1],
    queryFn: async () => {
      const { data } = await api.get(`/raporlar/aylik-rapor?yil=${targetDate.year()}&ay=${targetDate.month() + 1}`)
      return data.data
    }
  })

  const actions = useMemo(() => (
    <Space>
      <DatePicker
        picker="month"
        value={targetDate}
        onChange={(v) => v && setTargetDate(v)}
        format="MMMM YYYY"
        size="small"
      />
      <Button 
        size="small"
        icon={<FilePdfOutlined />} 
        onClick={() => window.open(`${import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1'}/raporlar/aylik-rapor/pdf?yil=${targetDate.year()}&ay=${targetDate.month() + 1}`, '_blank')}
      >
        PDF İndir
      </Button>
    </Space>
  ), [targetDate])

  usePageSettings('Aylık Mali Rapor', actions)

  const gelirColumns = [
    { title: 'Tarih', dataIndex: 'tarih', key: 'tarih', render: (t: string) => dayjs(t).format('DD.MM.YYYY') },
    { title: 'Kategori', dataIndex: ['gelir_gider_kategorileri', 'ad'], key: 'kategori' },
    { title: 'Açıklama', dataIndex: 'aciklama', key: 'aciklama' },
    { title: 'Tutar', dataIndex: 'tutar', key: 'tutar', align: 'right' as const, render: (v: number) => <MoneyDisplay amount={v} /> }
  ]

  const giderColumns = [
    { title: 'Tarih', dataIndex: 'tarih', key: 'tarih', render: (t: string) => dayjs(t).format('DD.MM.YYYY') },
    { 
      title: 'Kaynak/Tip', 
      key: 'tip', 
      render: (_: any, r: any) => (
        <Tag color={r.kategori === 'Hakediş' ? 'blue' : 'orange'}>
          {r.kategori === 'Hakediş' ? 'Hakediş' : (r.gelir_gider_kategorileri?.ad || 'Gider')}
        </Tag>
      ) 
    },
    { title: 'Açıklama', dataIndex: 'aciklama', key: 'aciklama' },
    { title: 'Tutar', dataIndex: 'tutar', key: 'tutar', align: 'right' as const, render: (v: number) => <MoneyDisplay amount={v} /> }
  ]

  const aidatColumns = [
    { title: 'Tarih', dataIndex: 'odeme_tarihi', key: 'tarih', render: (t: string) => dayjs(t).format('DD.MM.YYYY') },
    { title: 'Ödeme Yöntemi', dataIndex: 'odeme_yontemi', key: 'yontem', render: (v: string) => <Tag>{v.toUpperCase()}</Tag> },
    { title: 'Tutar', dataIndex: 'tutar', key: 'tutar', align: 'right' as const, render: (v: number) => <MoneyDisplay amount={v} /> }
  ]

  if (isLoading) return <LoadingState fullHeight />
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />

  return (
    <div style={{ padding: '0 0 24px 0' }}>
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Card size="small" className="stat-card">
            <Statistic
              title="Toplam Aidat Tahsilatı"
              value={rapor?.toplam_aidat_tahsilat || 0}
              prefix={<DollarOutlined />}
              suffix="TL"
              formatter={(v) => trMoneyFormatter(v as number)}
              styles={{ content: { color: '#3f8600', fontSize: '1.2rem' } }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small" className="stat-card">
            <Statistic
              title="Diğer Gelirler"
              value={rapor?.toplam_gelir || 0}
              prefix={<RiseOutlined />}
              suffix="TL"
              formatter={(v) => trMoneyFormatter(v as number)}
              styles={{ content: { color: '#3f8600', fontSize: '1.2rem' } }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small" className="stat-card">
            <Statistic
              title="Toplam Giderler"
              value={rapor?.toplam_gider || 0}
              prefix={<FallOutlined />}
              suffix="TL"
              formatter={(v) => trMoneyFormatter(v as number)}
              styles={{ content: { color: '#cf1322', fontSize: '1.2rem' } }}
            />
          </Card>
        </Col>
      </Row>

      <div style={{ marginBottom: 16 }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600, color: '#666' }}>
          <CalendarOutlined style={{ marginRight: 8 }} />
          Yaklaşan Ödemeler
        </h4>
        <Row gutter={[12, 12]}>
          <Col span={8}>
            <Card size="small">
              <Statistic
                title="Bu Ay (T)"
                value={rapor?.yaklasan_odemeler?.t || 0}
                formatter={(v) => trMoneyFormatter(v as number)}
                suffix="TL"
                styles={{ content: { fontSize: '1.1rem' } }}
              />
            </Card>
          </Col>
          <Col span={8}>
            <Card size="small">
              <Statistic
                title="Gelecek Ay (T+1)"
                value={rapor?.yaklasan_odemeler?.t1 || 0}
                formatter={(v) => trMoneyFormatter(v as number)}
                suffix="TL"
                styles={{ content: { fontSize: '1.1rem' } }}
              />
            </Card>
          </Col>
          <Col span={8}>
            <Card size="small">
              <Statistic
                title="Sonraki Ay (T+2)"
                value={rapor?.yaklasan_odemeler?.t2 || 0}
                formatter={(v) => trMoneyFormatter(v as number)}
                suffix="TL"
                styles={{ content: { fontSize: '1.1rem' } }}
              />
            </Card>
          </Col>
        </Row>
      </div>

      <Row gutter={[12, 12]}>
        <Col span={24}>
          <Card title="Aidat Tahsilatları" size="small">
            <Table
              dataSource={rapor?.aidat_tahsilat || []}
              columns={aidatColumns}
              rowKey={(r, i) => i!}
              pagination={{ pageSize: 5 }}
              size="small"
            />
          </Card>
        </Col>
        <Col lg={12} span={24}>
          <Card title="Gelirler" size="small">
            <Table
              dataSource={rapor?.gelirler || []}
              columns={gelirColumns}
              rowKey="id"
              pagination={{ pageSize: 5 }}
              size="small"
            />
          </Card>
        </Col>
        <Col lg={12} span={24}>
          <Card title="Giderler" size="small">
            <Table
              dataSource={rapor?.giderler || []}
              columns={giderColumns}
              rowKey="id"
              pagination={{ pageSize: 5 }}
              size="small"
            />
          </Card>
        </Col>
      </Row>
    </div>
  )
}
