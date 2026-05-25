import React, { useState, useMemo } from 'react'
import { Card, Table, Row, Col, Statistic, DatePicker, Button, Tag, Typography, Tabs } from 'antd'
import { DownloadOutlined, RiseOutlined, FallOutlined, DollarOutlined, CalendarOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import api from '../../lib/api'
import { usePageSettings } from '../../contexts/LayoutContext'
import { useProject } from '../../contexts/ProjectContext'
import { MoneyDisplay } from '../../components/common/MoneyDisplay'
import { LoadingState } from '../../components/common/LoadingState'
import { ErrorState } from '../../components/common/ErrorState'

import { trMoneyFormatter } from '../../lib/format'
import { downloadCsv } from '../../lib/csvExport'

export const AylikRaporPage: React.FC = () => {
  const [targetDate, setTargetDate] = useState(dayjs())
  const { activeProject } = useProject()
  const activeProjectId = activeProject?.id ?? null

  const { data: rapor, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['aylik-rapor', targetDate.year(), targetDate.month() + 1, activeProjectId],
    queryFn: async () => {
      if (!activeProjectId) return null
      const { data } = await api.get(`/raporlar/aylik-rapor`, {
        params: {
          yil: targetDate.year(),
          ay: targetDate.month() + 1,
          proje_id: activeProjectId
        }
      })
      return data.data
    },
    enabled: !!activeProjectId
  })

  const actions = useMemo(() => (
    <DatePicker
      picker="month"
      value={targetDate}
      onChange={(v) => v && setTargetDate(v)}
      format="MMMM YYYY"
      size="small"
    />
  ), [targetDate])

  usePageSettings('Aylık Mali Rapor', actions)

  const handleCsvDownload = () => {
    if (!rapor) return
    const yil = targetDate.year()
    const ay = targetDate.month() + 1
    // 20260525150000: yeni semantik alanlar — fallback ile geriye uyumlu.
    const aidatTahakkuku = Number(rapor.toplam_tahakkuk ?? rapor.toplam_gelir ?? 0)
    const giderTahakkuku = Number(rapor.toplam_gider_tahakkuku ?? rapor.toplam_gider ?? 0)
    downloadCsv(`aylik-rapor-${yil}-${String(ay).padStart(2, '0')}`, [
      {
        title: `Aylık Mali Rapor — ${dayjs().year(yil).month(ay - 1).format('MMMM YYYY')}`,
        headers: ['Metrik', 'Tutar'],
        rows: [
          ['Toplam Tahsilat', rapor.toplam_aidat_tahsilat || 0],
          ['Aidat Tahakkuku', aidatTahakkuku],
          ['Gider Tahakkuku', giderTahakkuku],
          ['Yaklaşan: Bu Ay (T)', rapor.yaklasan_odemeler?.t || 0],
          ['Yaklaşan: Gelecek Ay (T+1)', rapor.yaklasan_odemeler?.t1 || 0],
          ['Yaklaşan: Sonraki Ay (T+2)', rapor.yaklasan_odemeler?.t2 || 0],
        ],
      },
      {
        title: 'Tahsilatlar',
        headers: ['Tarih', 'Üye', 'Ödeme Yöntemi', 'Tutar'],
        rows: (rapor.aidat_tahsilat || []).map((r: any) => [
          dayjs(r.tarih).format('DD.MM.YYYY'),
          r.cari_hesaplar?.cari_adi || '',
          (r.odeme_turu || 'banka').toUpperCase(),
          r.borc || 0,
        ]),
      },
      {
        // 20260525160000: tahakkuk listesi aidat + gecikme_faizi + uyelik_baslangic icerir
        title: 'Tahakkuklar',
        headers: ['Tarih', 'Tür', 'Cari/Kaynak', 'Açıklama', 'Tutar'],
        rows: (rapor.gelirler || []).map((r: any) => {
          const turuTr =
            r.islem_turu === 'aidat_kayit' ? 'Aidat' :
            r.islem_turu === 'gecikme_faizi' ? 'Gecikme Faizi' :
            r.islem_turu === 'uyelik_baslangic' ? 'Üyelik Başlangıç' :
            (r.islem_turu || 'Tahakkuk')
          return [
            dayjs(r.tarih).format('DD.MM.YYYY'),
            turuTr,
            r.cari_hesaplar?.cari_adi || '',
            r.aciklama || '',
            r.alacak || 0,
          ]
        }),
      },
      {
        // 20260525160000: gider listesi hakedis + iade_odeme (fatura YOK).
        // iade_odeme `alacak` ile kaydedilir.
        title: 'Gider Tahakkukları',
        headers: ['Tarih', 'Tür', 'Cari/Firma', 'Açıklama', 'Tutar'],
        rows: (rapor.giderler || []).map((r: any) => {
          const turuTr =
            r.islem_turu === 'hakedis' ? 'Hakediş' :
            r.islem_turu === 'iade_odeme' ? 'Üyelik Bedeli İadesi' :
            (r.islem_turu || 'Gider')
          const tutar = r.islem_turu === 'iade_odeme' ? (r.alacak || 0) : (r.borc || 0)
          return [
            dayjs(r.tarih).format('DD.MM.YYYY'),
            turuTr,
            r.cari_hesaplar?.cari_adi || '',
            r.aciklama || '',
            tutar,
          ]
        }),
      },
    ], { projectName: activeProject?.proje_adi })
  }

  // 20260525160000: tahakkuk listesi artik aidat_kayit + gecikme_faizi + uyelik_baslangic
  // (kaynak_tipi NULL — ham tahakkuk) icerir. Tur sutunu eklendi.
  const gelirColumns = [
    { title: 'Tarih', dataIndex: 'tarih', key: 'tarih', render: (t: string) => dayjs(t).format('DD.MM.YYYY') },
    {
      title: 'Tür',
      key: 'tip',
      render: (_: any, r: any) => {
        if (r.islem_turu === 'aidat_kayit') return <Tag color="blue">Aidat</Tag>
        if (r.islem_turu === 'gecikme_faizi') return <Tag color="orange">Gecikme Faizi</Tag>
        if (r.islem_turu === 'uyelik_baslangic') return <Tag color="purple">Üyelik Başlangıç</Tag>
        return <Tag>Tahakkuk</Tag>
      }
    },
    { title: 'Cari/Kaynak', dataIndex: ['cari_hesaplar', 'cari_adi'], key: 'cari' },
    { title: 'Açıklama', dataIndex: 'aciklama', key: 'aciklama' },
    { title: 'Tutar', dataIndex: 'alacak', key: 'tutar', align: 'right' as const, render: (v: number) => <MoneyDisplay amount={v} /> }
  ]

  // 20260525160000: gider listesi artik hakedis + iade_odeme icerir (fatura YOK).
  // iade_odeme cari_hareketler'de `alacak` ile kaydedildigi icin tutar yon-bilincli.
  const giderColumns = [
    { title: 'Tarih', dataIndex: 'tarih', key: 'tarih', render: (t: string) => dayjs(t).format('DD.MM.YYYY') },
    {
      title: 'Tür',
      key: 'tip',
      render: (_: any, r: any) => {
        if (r.islem_turu === 'hakedis') return <Tag color="blue">Hakediş</Tag>
        if (r.islem_turu === 'iade_odeme') return <Tag color="green">Üyelik Bedeli İadesi</Tag>
        return <Tag color="orange">Gider</Tag>
      }
    },
    { title: 'Cari/Firma', dataIndex: ['cari_hesaplar', 'cari_adi'], key: 'cari' },
    { title: 'Açıklama', dataIndex: 'aciklama', key: 'aciklama' },
    {
      title: 'Tutar',
      key: 'tutar',
      align: 'right' as const,
      render: (_: any, r: any) => {
        const tutar = r.islem_turu === 'iade_odeme' ? Number(r.alacak || 0) : Number(r.borc || 0)
        return <MoneyDisplay amount={tutar} />
      }
    }
  ]

  const aidatColumns = [
    { title: 'Tarih', dataIndex: 'tarih', key: 'tarih', render: (t: string) => dayjs(t).format('DD.MM.YYYY') },
    { title: 'Üye', dataIndex: ['cari_hesaplar', 'cari_adi'], key: 'uye' },
    { title: 'Ödeme Yöntemi', dataIndex: 'odeme_turu', key: 'yontem', render: (v: string) => <Tag>{(v || 'Banka').toUpperCase()}</Tag> },
    { title: 'Tutar', dataIndex: 'borc', key: 'tutar', align: 'right' as const, render: (v: number) => <MoneyDisplay amount={v} /> }
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
    <div style={{ padding: '0 0 24px 0' }}>
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
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Card variant="borderless" size="small" className="stat-card shadow-sm">
            <Statistic
              title="Toplam Tahsilat"
              value={rapor?.toplam_aidat_tahsilat || 0}
              prefix={<DollarOutlined />}
              formatter={(v) => trMoneyFormatter(v as number)}
              styles={{ content: { color: '#3f8600', fontSize: '1.2rem' } }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card variant="borderless" size="small" className="stat-card shadow-sm">
            <Statistic
              title="Aidat Tahakkuku"
              value={Number(rapor?.toplam_tahakkuk ?? rapor?.toplam_gelir ?? 0)}
              prefix={<RiseOutlined />}
              formatter={(v) => trMoneyFormatter(v as number)}
              styles={{ content: { color: '#3f8600', fontSize: '1.2rem' } }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card variant="borderless" size="small" className="stat-card shadow-sm">
            <Statistic
              title="Gider Tahakkuku"
              value={Number(rapor?.toplam_gider_tahakkuku ?? rapor?.toplam_gider ?? 0)}
              prefix={<FallOutlined />}
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
                  styles={{ content: { fontSize: '1.1rem' } }}
              />
            </Card>
          </Col>
        </Row>
      </div>

      <Card size="small" style={{ marginTop: 12 }}>
        <Tabs
          defaultActiveKey="aidat"
          size="small"
          items={[
            {
              key: 'aidat',
              label: `Tahsilatlar (${rapor?.aidat_tahsilat?.length || 0})`,
              children: (
                <Table
                  dataSource={rapor?.aidat_tahsilat || []}
                  columns={aidatColumns}
                  rowKey={(r, i) => i!}
                  pagination={{ pageSize: 10 }}
                  size="small"
                />
              ),
            },
            {
              key: 'tahakkuk',
              // 20260525160000: liste artik aidat + gecikme_faizi + uyelik_baslangic icerir
              label: `Tahakkuklar (${rapor?.gelirler?.length || 0})`,
              children: (
                <Table
                  dataSource={rapor?.gelirler || []}
                  columns={gelirColumns}
                  rowKey="id"
                  pagination={{ pageSize: 10 }}
                  size="small"
                />
              ),
            },
            {
              key: 'gider_tahakkuku',
              label: `Gider Tahakkukları (${rapor?.giderler?.length || 0})`,
              children: (
                <Table
                  dataSource={rapor?.giderler || []}
                  columns={giderColumns}
                  rowKey="id"
                  pagination={{ pageSize: 10 }}
                  size="small"
                />
              ),
            },
          ]}
        />
      </Card>
    </div>
  )
}
