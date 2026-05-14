import React, { useMemo } from 'react'
import { Card, Button, Space, Typography, Statistic, Row, Col } from 'antd'
import { DownloadOutlined, UserOutlined, TeamOutlined, DollarOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import api from '../../lib/api'
import { usePageSettings } from '../../contexts/LayoutContext'
import { MoneyDisplay } from '../../components/common/MoneyDisplay'
import { LoadingState } from '../../components/common/LoadingState'
import { ErrorState } from '../../components/common/ErrorState'
import { DataTable } from '../../components/common/DataTable'
import { EmptyState } from '../../components/common/EmptyState'

import { trMoneyFormatter } from '../../lib/format'
import { downloadCsv } from '../../lib/csvExport'
import dayjs from 'dayjs'

const { Text } = Typography

export const UyeBorcRaporPage: React.FC = () => {
  const navigate = useNavigate()
  const activeProjectId = localStorage.getItem('activeProjectId')

  const { data: list, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['uye-borc-listesi', activeProjectId],
    queryFn: async () => {
      if (!activeProjectId) return []
      const { data } = await api.get('/raporlar/uye-borc-listesi', {
        params: { proje_id: activeProjectId }
      })
      return data.data
    },
    enabled: !!activeProjectId
  })

  const handleCsvDownload = () => {
    if (!list || list.length === 0) return
    downloadCsv(`uye-borc-listesi-${dayjs().format('YYYYMMDD')}`, [
      {
        title: `Üye Borç Listesi — ${dayjs().format('DD.MM.YYYY')}`,
        headers: ['Üye No', 'Ad Soyad', 'Toplam Borç (TL)', 'Toplam Tahsilat (TL)', 'Kalan Borç (TL)', 'Geciken Aidat Sayısı'],
        rows: list.map((r: any) => [
          r.uye_no || '',
          `${r.ad || ''} ${r.soyad || ''}`.trim(),
          r.toplam_borc || 0,
          r.toplam_tahsilat || 0,
          (r.toplam_borc || 0) - (r.toplam_tahsilat || 0),
          r.geciken_sayisi || 0,
        ]),
      },
    ])
  }

  const actions = useMemo(() => (
    <Button
      size="small"
      icon={<DownloadOutlined />}
      onClick={handleCsvDownload}
      disabled={!activeProjectId || !list || list.length === 0}
    >
      CSV İndir
    </Button>
  ), [activeProjectId, list])

  usePageSettings('Üye Borç Listesi', actions)

  const columns: any[] = [
    // ... rest of columns
  ]

  if (!activeProjectId) {
    return <EmptyState description="Lütfen önce yukarıdan bir proje seçin" />
  }

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
              formatter={(v) => trMoneyFormatter(v as number)} 
              styles={{ content: { color: '#cf1322', fontSize: '1.2rem' } }}
            />
          </Card>
        </Col>
      </Row>

      <DataTable
        dataSource={list || []}
        columns={columns}
        rowKey="uye_no"
        size="small"
        pagination={{ pageSize: 20 }}
        emptyDescription="Borçlu üye bulunamadı"
      />
    </div>
  )
}
