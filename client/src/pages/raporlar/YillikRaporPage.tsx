import React, { useState, useMemo } from 'react'
import { Card, Row, Col, Statistic, DatePicker, Button, Typography } from 'antd'
import { FilePdfOutlined, RiseOutlined, FallOutlined, DollarOutlined, BarChartOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import api from '../../lib/api'
import { usePageSettings } from '../../contexts/LayoutContext'
import { LoadingState } from '../../components/common/LoadingState'
import { ErrorState } from '../../components/common/ErrorState'
import { DataTable } from '../../components/common/DataTable'

import { trMoneyFormatter } from '../../lib/format'

export const YillikRaporPage: React.FC = () => {
  const [targetYear, setTargetYear] = useState(dayjs())
  const activeProjectId = localStorage.getItem('activeProjectId')

  const actions = useMemo(() => (
    <DatePicker
      picker="year"
      value={targetYear}
      onChange={(v) => v && setTargetYear(v)}
      format="YYYY"
      size="small"
    />
  ), [targetYear])

  usePageSettings('Yıllık Mali Rapor', actions)

  const handlePdfDownload = () => {
    window.open(`${import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1'}/raporlar/yillik-rapor/pdf?yil=${targetYear.year()}&proje_id=${activeProjectId}`, '_blank')
  }

  const { data: rapor, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['yillik-rapor', targetYear.year(), activeProjectId],
    queryFn: async () => {
      if (!activeProjectId) return null
      const { data } = await api.get(`/raporlar/yillik-rapor`, { 
        params: { 
          yil: targetYear.year(),
          proje_id: activeProjectId 
        } 
      })
      return data.data
    },
    enabled: !!activeProjectId
  })

  const columns: any[] = [
    // ... rest of columns
  ]

  if (!activeProjectId) {
    return (
      <Card>
        <Typography.Text type="secondary">Lütfen rapor görüntülemek için bir proje seçin.</Typography.Text>
      </Card>
    )
  }

  if (isLoading) return <LoadingState fullHeight />
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <Button
          size="small"
          icon={<FilePdfOutlined />}
          onClick={handlePdfDownload}
          disabled={!activeProjectId}
        >
          PDF İndir
        </Button>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="Yıllık Aidat Tahsilatı"
              value={rapor?.toplam_aidat || 0}
              prefix={<DollarOutlined />}
              suffix="TL"
              formatter={(v) => trMoneyFormatter(v as number)}
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
              formatter={(v) => trMoneyFormatter(v as number)}
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
              formatter={(v) => trMoneyFormatter(v as number)}
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
              formatter={(v) => trMoneyFormatter(v as number)}
              styles={{ content: { color: '#3f8600' } }}
            />
          </Card>
        </Col>
      </Row>

      <Card title={`${targetYear.year()} Yılı Aylık Döküm`} styles={{ body: { padding: 0 } }}>
        <DataTable
          hideCard
          dataSource={rapor?.aylik || []}
          columns={columns}
          rowKey="ay"
          pagination={false}
          emptyDescription="Yıllık rapor verisi bulunamadı"
        />
      </Card>
    </div>
  )
}
