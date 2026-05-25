import React, { useState, useMemo } from 'react'
import { Card, Row, Col, Statistic, DatePicker, Button, Typography } from 'antd'
import { DownloadOutlined, RiseOutlined, FallOutlined, DollarOutlined, BarChartOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import api from '../../lib/api'
import { usePageSettings } from '../../contexts/LayoutContext'
import { useProject } from '../../contexts/ProjectContext'
import { LoadingState } from '../../components/common/LoadingState'
import { ErrorState } from '../../components/common/ErrorState'
import { DataTable } from '../../components/common/DataTable'

import { trMoneyFormatter } from '../../lib/format'
import { downloadCsv } from '../../lib/csvExport'

const AY_ETIKETLERI = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']

export const YillikRaporPage: React.FC = () => {
  const [targetYear, setTargetYear] = useState(dayjs())
  const { activeProject } = useProject()
  const activeProjectId = activeProject?.id ?? null

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
    const toplamTahsilat = Number(rapor.toplam_tahsilat || 0)
    // 20260525150000: semantik field naming — yeni alanlar öncelikli, eski'lere fallback.
    const toplamTahakkuk = Number(rapor.toplam_tahakkuk ?? rapor.toplam_gelir ?? 0)
    const toplamGiderTahakkuku = Number(rapor.toplam_gider_tahakkuku ?? rapor.toplam_gider ?? 0)
    const netBakiye = toplamTahsilat - toplamGiderTahakkuku
    downloadCsv(`yillik-rapor-${yil}`, [
      {
        title: `Yıllık Mali Rapor — ${yil}`,
        headers: ['Metrik', 'Tutar (TL)'],
        rows: [
          ['Yıllık Aidat Tahakkuku', toplamTahakkuk],
          ['Yıllık Tahsilat (Aidat + Üyelik Başlangıç)', toplamTahsilat],
          ['Yıllık Gider Tahakkuku', toplamGiderTahakkuku],
          ['Yıllık Nakit Farkı', netBakiye],
        ],
      },
      {
        title: `${yil} Aylık Döküm`,
        headers: ['Ay', 'Aidat Tahakkuku', 'Tahsilat', 'Geciken Alacak', 'Ort. Gecikme Gün', 'Gider Tahakkuku', 'Nakit Farkı'],
        rows: (rapor.aylik || []).map((r: any) => {
          const tahakkuk = Number(r.tahakkuk ?? r.gelir ?? 0)
          const tahsilat = Number(r.tahsilat || 0)
          const giderTahakkuku = Number(r.gider_tahakkuku ?? r.gider ?? 0)
          const geciken = Number(r.geciken_alacak || 0)
          const ortGecikme = Number(r.ortalama_gecikme_gun || 0)
          return [
            AY_ETIKETLERI[(r.ay || 1) - 1] || r.ay,
            tahakkuk,
            tahsilat,
            geciken,
            ortGecikme,
            giderTahakkuku,
            tahsilat - giderTahakkuku,
          ]
        }),
      },
    ], { projectName: activeProject?.proje_adi })
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

  const columns = useMemo<any[]>(() => [
    {
      title: 'Ay',
      dataIndex: 'ay',
      key: 'ay',
      width: 100,
      render: (a: number) => AY_ETIKETLERI[(a || 1) - 1] || a,
    },
    {
      // 20260525150000: dataIndex 'tahakkuk' (yeni); render fallback ile geriye uyumlu.
      title: 'Aidat Tahakkuku',
      key: 'tahakkuk',
      align: 'right' as const,
      render: (_: unknown, r: any) => trMoneyFormatter(Number(r.tahakkuk ?? r.gelir ?? 0)),
    },
    {
      title: 'Tahsilat',
      dataIndex: 'tahsilat',
      key: 'tahsilat',
      align: 'right' as const,
      render: (v: number) => (
        <span style={{ color: '#3f8600', fontWeight: 500 }}>{trMoneyFormatter(Number(v || 0))}</span>
      ),
    },
    {
      title: 'Geciken Alacaklar',
      dataIndex: 'geciken_alacak',
      key: 'geciken',
      align: 'right' as const,
      render: (v: number) => (
        <span style={{ color: '#fa8c16' }}>{trMoneyFormatter(Number(v || 0))}</span>
      ),
    },
    {
      title: 'Ort. Gecikme Gün',
      dataIndex: 'ortalama_gecikme_gun',
      key: 'ortGecikme',
      align: 'right' as const,
      width: 130,
      render: (v: number) => `${Number(v || 0)} gün`,
    },
    {
      // 20260525150000: yeni semantik dataIndex; render fallback ile geriye uyumlu.
      title: 'Gider Tahakkuku',
      key: 'gider_tahakkuku',
      align: 'right' as const,
      render: (_: unknown, r: any) => (
        <span style={{ color: '#cf1322' }}>{trMoneyFormatter(Number(r.gider_tahakkuku ?? r.gider ?? 0))}</span>
      ),
    },
    {
      title: 'Nakit Farkı',
      key: 'fark',
      align: 'right' as const,
      render: (_: unknown, r: any) => {
        const giderTahakkuku = Number(r.gider_tahakkuku ?? r.gider ?? 0)
        const fark = Number(r.tahsilat || 0) - giderTahakkuku
        return (
          <span style={{ color: fark >= 0 ? '#3f8600' : '#cf1322', fontWeight: 600 }}>
            {trMoneyFormatter(fark)}
          </span>
        )
      },
    },
  ], [])

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

      {/* 20260525150000: yeni semantik alanlar — fallback ile geriye uyumlu. */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Yıllık Aidat Tahakkuku"
              value={Number(rapor?.toplam_tahakkuk ?? rapor?.toplam_gelir ?? 0)}
              prefix={<RiseOutlined />}
              suffix="TL"
              formatter={(v) => trMoneyFormatter(v as number)}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Yıllık Tahsilat"
              value={Number(rapor?.toplam_tahsilat || 0)}
              prefix={<DollarOutlined />}
              suffix="TL"
              formatter={(v) => trMoneyFormatter(v as number)}
              styles={{ content: { color: '#3f8600' } }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Yıllık Gider Tahakkuku"
              value={Number(rapor?.toplam_gider_tahakkuku ?? rapor?.toplam_gider ?? 0)}
              prefix={<FallOutlined />}
              suffix="TL"
              formatter={(v) => trMoneyFormatter(v as number)}
              styles={{ content: { color: '#cf1322' } }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Yıllık Nakit Farkı"
              value={Number(rapor?.toplam_tahsilat || 0) - Number(rapor?.toplam_gider_tahakkuku ?? rapor?.toplam_gider ?? 0)}
              prefix={<BarChartOutlined />}
              suffix="TL"
              formatter={(v) => trMoneyFormatter(v as number)}
              styles={{ content: { color: (Number(rapor?.toplam_tahsilat || 0) - Number(rapor?.toplam_gider_tahakkuku ?? rapor?.toplam_gider ?? 0)) >= 0 ? '#3f8600' : '#cf1322' } }}
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
