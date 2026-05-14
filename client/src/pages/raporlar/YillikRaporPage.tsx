import React, { useState, useMemo } from 'react'
import { Card, Row, Col, Statistic, DatePicker, Button, Typography } from 'antd'
import { DownloadOutlined, RiseOutlined, FallOutlined, DollarOutlined, BarChartOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import api from '../../lib/api'
import { usePageSettings } from '../../contexts/LayoutContext'
import { LoadingState } from '../../components/common/LoadingState'
import { ErrorState } from '../../components/common/ErrorState'
import { DataTable } from '../../components/common/DataTable'

import { trMoneyFormatter } from '../../lib/format'
import { downloadCsv } from '../../lib/csvExport'

const AY_ETIKETLERI = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']

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

  const handleCsvDownload = () => {
    if (!rapor) return
    const yil = targetYear.year()
    const netBakiye = (rapor.toplam_aidat || 0) + (rapor.toplam_gelir || 0) - (rapor.toplam_gider || 0)
    downloadCsv(`yillik-rapor-${yil}`, [
      {
        title: `Yıllık Mali Rapor — ${yil}`,
        headers: ['Metrik', 'Tutar (TL)'],
        rows: [
          ['Yıllık Aidat Tahsilatı', rapor.toplam_aidat || 0],
          ['Yıllık Diğer Gelirler', rapor.toplam_gelir || 0],
          ['Yıllık Toplam Gider', rapor.toplam_gider || 0],
          ['Yıllık Net Bakiye', netBakiye],
        ],
      },
      {
        title: `${yil} Aylık Döküm`,
        headers: ['Ay', 'Aidat Tahsilatı', 'Diğer Gelirler', 'Giderler', 'Net'],
        rows: (rapor.aylik || []).map((r: any) => [
          AY_ETIKETLERI[(r.ay || 1) - 1] || r.ay,
          r.aidat || 0,
          r.gelir || 0,
          r.gider || 0,
          (r.aidat || 0) + (r.gelir || 0) - (r.gider || 0),
        ]),
      },
    ])
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
          icon={<DownloadOutlined />}
          onClick={handleCsvDownload}
          disabled={!activeProjectId || !rapor}
        >
          CSV İndir
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
