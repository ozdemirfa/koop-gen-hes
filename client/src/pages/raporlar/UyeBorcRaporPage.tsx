import React, { useMemo } from 'react'
import { Card, Button, Typography, Statistic, Row, Col, Tag } from 'antd'
import { DownloadOutlined, TeamOutlined, DollarOutlined, ClockCircleOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import api from '../../lib/api'
import { usePageSettings } from '../../contexts/LayoutContext'
import { useProject } from '../../contexts/ProjectContext'
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
  const { activeProject } = useProject()
  const activeProjectId = activeProject?.id ?? null

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
        headers: ['Üye No', 'Ad Soyad', 'Blok', 'Daire No', 'Geciken Borç', 'En Eski Gecikme (gün)', 'Ort. Gecikme (gün)'],
        rows: list.map((r: any) => [
          r.uye_no || '',
          `${r.ad || ''} ${r.soyad || ''}`.trim(),
          r.blok_adi || '',
          r.daire_no || '',
          r.geciken_borc || 0,
          r.max_gecikme_gun || 0,
          r.ortalama_gecikme_gun || 0,
        ]),
      },
    ], { projectName: activeProject?.proje_adi })
  }

  // LayoutContext fingerprint key — buton list değişiminde stale kalmasın
  const actions = useMemo(() => {
    const hasData = !!list && list.length > 0
    return (
      <Button
        key={`uye-borc-${hasData ? `n${list?.length}` : 'empty'}`}
        size="small"
        icon={<DownloadOutlined />}
        onClick={handleCsvDownload}
        disabled={!activeProjectId || !hasData}
      >
        CSV İndir
      </Button>
    )
  }, [activeProjectId, list])

  usePageSettings('Üye Borç Listesi', actions)

  // Sütun genişlikleri kompaktlaştırıldı (kullanıcı isteği 2026-05-24):
  // Üye No 90→70, Blok 80→60, Daire No 90→70, En Eski Gecikme 130→105,
  // Ort. Gecikme 120→95. Ad Soyad ve Geciken Borç esnek kalır.
  const columns = useMemo<any[]>(() => [
    { title: 'Üye No', dataIndex: 'uye_no', key: 'uye_no', width: 70 },
    {
      title: 'Ad Soyad',
      key: 'ad_soyad',
      ellipsis: true,
      render: (_: unknown, r: any) => <Text strong>{`${r.ad || ''} ${r.soyad || ''}`.trim()}</Text>,
    },
    {
      title: 'Blok',
      dataIndex: 'blok_adi',
      key: 'blok',
      width: 60,
      render: (v: string) => v || '-',
    },
    {
      title: 'Daire No',
      dataIndex: 'daire_no',
      key: 'daire_no',
      width: 70,
      render: (v: string) => v || '-',
    },
    {
      title: 'Geciken Borç',
      dataIndex: 'geciken_borc',
      key: 'geciken_borc',
      align: 'right' as const,
      width: 120,
      sorter: (a: any, b: any) => Number(a.geciken_borc || 0) - Number(b.geciken_borc || 0),
      render: (v: number) => (
        <Text strong style={{ color: '#cf1322' }}><MoneyDisplay amount={Number(v || 0)} /></Text>
      ),
    },
    {
      title: 'En Eski Gecikme',
      dataIndex: 'max_gecikme_gun',
      key: 'max_gecikme',
      align: 'right' as const,
      width: 105,
      sorter: (a: any, b: any) => Number(a.max_gecikme_gun || 0) - Number(b.max_gecikme_gun || 0),
      render: (v: number) => <Tag color={v > 30 ? 'red' : v > 7 ? 'orange' : 'default'}>{v || 0} gün</Tag>,
    },
    {
      title: 'Ort. Gecikme',
      dataIndex: 'ortalama_gecikme_gun',
      key: 'ort_gecikme',
      align: 'right' as const,
      width: 95,
      render: (v: number) => `${v || 0} gün`,
    },
  ], [])

  if (!activeProjectId) {
    return <EmptyState description="Lütfen önce yukarıdan bir proje seçin" />
  }

  if (isLoading) return <LoadingState fullHeight />
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />

  const genelToplamBorc = list?.reduce((s: number, r: any) => s + Number(r.geciken_borc || 0), 0) || 0
  const ortGecikme = list && list.length > 0
    ? Math.round(list.reduce((s: number, r: any) => s + Number(r.ortalama_gecikme_gun || 0), 0) / list.length)
    : 0

  return (
    <div style={{ padding: '0 0 24px 0' }}>
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={8}>
          <Card size="small">
            <Statistic
              title="Borçlu Üye Sayısı"
              value={list?.length || 0}
              prefix={<TeamOutlined />}
              styles={{ content: { fontSize: '1.2rem' } }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small">
            <Statistic
              title="Toplam Geciken Borç"
              value={genelToplamBorc}
              prefix={<DollarOutlined />}
              formatter={(v) => trMoneyFormatter(v as number)}
              styles={{ content: { color: '#cf1322', fontSize: '1.2rem' } }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small">
            <Statistic
              title="Ort. Gecikme Süresi"
              value={ortGecikme}
              prefix={<ClockCircleOutlined />}
              suffix="gün"
              styles={{ content: { color: '#fa8c16', fontSize: '1.2rem' } }}
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
