import React, { useState, useMemo, useEffect, useCallback } from 'react'
import { Card, Space, Select, DatePicker, Statistic, Row, Col, Tag, Button, message, Typography, Badge, Popconfirm } from 'antd'
import { DownloadOutlined, AuditOutlined, RollbackOutlined } from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import dayjs from 'dayjs'
import api from '../../lib/api'
import { getErrorMessage } from '../../lib/apiError'
import { groupCariParcalari } from '../../lib/groupCariParcalari'
import { DataTable } from '../../components/common/DataTable'
import { ErrorState } from '../../components/common/ErrorState'
import { MoneyDisplay } from '../../components/common/MoneyDisplay'
import { HeaderActionsToolbar } from '../../components/common/HeaderActionsToolbar'
import { trMoneyFormatter, trNumberParser } from '../../lib/format'
import { downloadCsv } from '../../lib/csvExport'
import { usePageSettings } from '../../contexts/LayoutContext'
import { useProject } from '../../contexts/ProjectContext'

const { RangePicker } = DatePicker

interface CariHesap {
  id: string
  cari_adi: string
  cari_turu: 'uye' | 'firma'
  firma_id?: string
  uye_id?: string
}

interface CariHareket {
  id: string
  cari_hesap_id: string
  borc: number
  alacak: number
  islem_turu: string
  odeme_turu?: string
  tarih: string
  aciklama?: string
  belge_no?: string
  kaynak_tipi?: string
  kaynak_id?: string
  cari_hesaplar?: {
    cari_adi: string
    cari_turu: 'uye' | 'firma'
  }
}

const ISLEM_TURU_LABELS: Record<string, { label: string, color: string }> = {
  aidat_kayit: { label: 'Aidat Tahakkuku', color: 'orange' },
  hakedis: { label: 'Hakediş', color: 'purple' },
  gelen_odeme: { label: 'Tahsilat (Gelen)', color: 'green' },
  giden_odeme: { label: 'Ödeme (Giden)', color: 'blue' },
}

const ODEME_TURU_LABELS: Record<string, string> = {
  nakit: 'Nakit',
  banka: 'Banka',
  kredi_karti: 'Kredi Kartı',
  cek: 'Çek',
}

export const CariEkstrePage: React.FC = () => {
  const { activeProject } = useProject()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  // C8 (sprint 20260511-uye-tahsilat-firma-revisions): URL params'tan gelen
  // firma_id veya cari_hesap_id ile sayfa açıldığında header'daki Select kutusu
  // boş kalmasın. accounts listesi yüklendikten sonra useEffect ile default değer atanır.
  const initialFirmaId = searchParams.get('firma_id') || undefined
  const initialCariHesapId = searchParams.get('cari_hesap_id') || undefined
  const [dates, setDates] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null]>([
    dayjs().startOf('year'),
    dayjs().endOf('year'),
  ])
  const [cariHesapId, setCariHesapId] = useState<string | undefined>(initialCariHesapId)
  // Default seçimin sadece bir kez yapılması — kullanıcı manuel temizleme yaptıktan
  // sonra accounts refetch olsa bile tekrar dolmasın.
  const [defaultApplied, setDefaultApplied] = useState<boolean>(!!initialCariHesapId)

  // Undo Match Mutation
  const undoMatchMutation = useMutation({
    mutationFn: async (hakedisId: string) => {
      const { data } = await api.post(`/cari-hareketler/hakedis/${hakedisId}/undo-closure`)
      return data
    },
    onSuccess: () => {
      message.success('Hakediş eşleşmeleri başarıyla kaldırıldı')
      queryClient.invalidateQueries({ queryKey: ['cari-ekstre'] })
      queryClient.invalidateQueries({ queryKey: ['firma-summary-stats'] })
      queryClient.invalidateQueries({ queryKey: ['aidatlar'] })
    },
    onError: (err) => message.error(getErrorMessage(err))
  })

  // Cari Hesaplar (Sadece Firmalar) Fetch
  const { data: accounts, isLoading: accountsLoading } = useQuery({
    queryKey: ['cari-accounts', activeProject?.id, 'firma'],
    queryFn: async () => {
      if (!activeProject?.id) return []
      const { data } = await api.get('/cari-hareketler/accounts', {
        params: { cari_turu: 'firma', proje_id: activeProject.id }
      })
      return data.data as CariHesap[]
    },
    enabled: !!activeProject?.id
  })

  // C8: accounts yüklendikten sonra URL'den gelen firma_id'yi cari_hesap_id'ye eşle.
  // Sadece bir kez uygulanır (defaultApplied flag) — kullanıcı sonra clear yapabilir.
  useEffect(() => {
    if (defaultApplied) return
    if (!accounts || accounts.length === 0) return

    if (initialCariHesapId) {
      // Direkt cari_hesap_id geldiyse, listedeki ile doğrula
      const found = accounts.find((a) => a.id === initialCariHesapId)
      if (found) {
        setCariHesapId(found.id)
        setDefaultApplied(true)
        return
      }
    }
    if (initialFirmaId) {
      const found = accounts.find((a) => a.firma_id === initialFirmaId)
      if (found) {
        setCariHesapId(found.id)
        setDefaultApplied(true)
      }
    }
  }, [accounts, defaultApplied, initialCariHesapId, initialFirmaId])

  // Hareketler Fetch
  const { data: rawHareketler, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['cari-ekstre', activeProject?.id, dates, cariHesapId],
    queryFn: async () => {
      if (!activeProject?.id) return []
      const params: any = {
        cari_turu: 'firma',
        proje_id: activeProject.id
      }
      if (dates?.[0]) params.baslangic_tarihi = dates[0].format('YYYY-MM-DD')
      if (dates?.[1]) params.bitis_tarihi = dates[1].format('YYYY-MM-DD')
      if (cariHesapId) params.cari_hesap_id = cariHesapId

      const { data } = await api.get('/cari-hareketler', { params })
      return data.data as CariHareket[]
    },
    enabled: !!activeProject?.id
  })

  // Fatura dışı işlemleri filtrele + FIFO parça grouping (US-3, sprint 20260519).
  // Cari ekstre muhasebe görünümü olduğundan `exclude_tahakkuk` GÖNDERİLMEZ (US-2):
  // tahakkuk + tahsilat satırları aynı tabloda görünür. Grouping anahtarı default'tur;
  // `cari_hesap_id` artık DEFAULT_KEY_FIELDS içinde — farklı cari'lere giden parçalar
  // birleşmez (bkz. groupCariParcalari.ts 2026-05-30 bugfix).
  const hareketler = useMemo(() => {
    if (!rawHareketler) return []
    const filtered = rawHareketler.filter(h =>
      h.islem_turu === 'hakedis' ||
      h.islem_turu === 'giden_odeme' ||
      h.islem_turu === 'odeme'
    )
    return groupCariParcalari(filtered)
  }, [rawHareketler])

  // Birikmiş Teminat ve Hakediş Detayları Sorgusu
  const selectedCari = useMemo(() => accounts?.find(a => a.id === cariHesapId), [accounts, cariHesapId])
  const targetFirmaId = selectedCari?.firma_id

  const { data: summaryStats } = useQuery({
    queryKey: ['firma-summary-stats', targetFirmaId, activeProject?.id],
    queryFn: async () => {
      if (!activeProject?.id) return null
      const url = targetFirmaId ? `/firmalar/${targetFirmaId}/stats` : `/firmalar/stats`
      const { data } = await api.get(url, { params: { proje_id: activeProject.id } })
      return data.data
    },
    enabled: !!activeProject?.id
  })

  // useCallback zorunlu: bu fonksiyon primaryAction useMemo'nun dep'inde
  // (`[exportToCSV]`). Memoize edilmezse her render'da yeni ref doğar →
  // primaryAction useMemo invalidate → actions useMemo invalidate →
  // usePageSettings/setHeaderActions sonsuz döngüye girer (React error #185,
  // c850ea8 + 44ac886 ile aynı pattern).
  const exportToCSV = useCallback(() => {
    if (!hareketler || hareketler.length === 0) {
      message.warning('Dışa aktarılacak veri bulunamadı')
      return
    }

    const headers = ['Tarih', 'Cari Hesap', 'İşlem Türü', 'Ödeme Türü', 'Açıklama', 'Belge No', 'Borç', 'Alacak']
    const rows = hareketler.map(h => [
      dayjs(h.tarih).format('DD.MM.YYYY'),
      h.cari_hesaplar?.cari_adi || '',
      ISLEM_TURU_LABELS[h.islem_turu]?.label || h.islem_turu,
      h.odeme_turu ? (ODEME_TURU_LABELS[h.odeme_turu] || h.odeme_turu) : '',
      h.aciklama || '',
      h.belge_no || '',
      h.borc,
      h.alacak,
    ])

    downloadCsv(
      `cari_ekstre_${dayjs().format('YYYYMMDD')}`,
      [{ headers, rows }],
      { projectName: activeProject?.proje_adi }
    )
  }, [hareketler, activeProject?.proje_adi])

  // OC-06 (sprint 20260511-ui-responsive-sprint extension):
  // HeaderActionsToolbar — primary=CSV İndir, secondary=Firma Select + RangePicker
  const activeFilterCount = useMemo(() => {
    let count = 0
    if (cariHesapId) count++
    // dates default = bu yılın başlangıç/bitişi — default kabul edilirse filter sayılmaz
    return count
  }, [cariHesapId])

  const primaryAction = useMemo(() => (
    <Button size="small" icon={<DownloadOutlined />} onClick={exportToCSV}>CSV İndir</Button>
  ), [exportToCSV])

  const secondaryActions = useMemo(() => (
    <>
      <Select
        showSearch
        placeholder="Firma Seçin"
        value={cariHesapId}
        onChange={setCariHesapId}
        allowClear
        style={{ width: 220 }}
        size="small"
        loading={accountsLoading}
        optionFilterProp="label"
        suffixIcon={<AuditOutlined />}
        options={accounts?.map(acc => ({
          value: acc.id,
          label: acc.cari_adi
        }))}
      />
      <RangePicker
        size="small"
        value={dates}
        onChange={(vals) => setDates(vals as any)}
        format="DD.MM.YYYY"
        style={{ width: 240 }}
      />
    </>
  ), [cariHesapId, dates, accounts, accountsLoading])

  const actions = useMemo(() => {
    // LayoutContext.setHeaderActionsStable, type + key shallow eşitliğinde prev'i tutar.
    // accounts undefined → array geçişinde HeaderActionsToolbar'ın type'ı/keyi değişmiyor
    // ve Select options'ı boş kalıyordu (Firma Ekstre header'da "Firma Seçin" boş dropdown).
    // İçeriği etkileyen state'lerden fingerprint key türetip stale güncellemeyi kırıyoruz.
    const stateKey = [
      accountsLoading ? 'loading' : `acc${accounts?.length ?? 0}`,
      cariHesapId ?? 'none',
      `f${activeFilterCount}`,
      dates?.[0]?.format('YYYYMMDD') ?? '',
      dates?.[1]?.format('YYYYMMDD') ?? '',
    ].filter(Boolean).join('|')
    return (
      <HeaderActionsToolbar
        key={`cari-ekstre-${stateKey}`}
        primary={primaryAction}
        secondary={secondaryActions}
        filterCount={activeFilterCount}
        drawerTitle="Ekstre Filtreleri"
      />
    )
  }, [primaryAction, secondaryActions, activeFilterCount, accounts, accountsLoading, cariHesapId, dates])

  usePageSettings('Firma Ekstre', actions)

  // Hesaplamalar
  const stats = useMemo(() => {
    if (summaryStats) {
      return {
        borc: summaryStats.toplam_kdvli,
        alacak: summaryStats.toplam_odeme,
        bakiye: summaryStats.bakiye,
        teminat: summaryStats.birikmis_teminat,
        matrah: summaryStats.toplam_hakedis,
        fatura: summaryStats.toplam_fatura
      }
    }

    return { borc: 0, alacak: 0, bakiye: 0, teminat: 0, matrah: 0, fatura: 0 }
  }, [summaryStats])

  const columns = [
    {
      title: 'Tarih',
      dataIndex: 'tarih',
      key: 'tarih',
      width: 85,
      render: (d: string) => <span className="text-slate-600 font-medium">{dayjs(d).format('DD.MM.YYYY')}</span>,
    },
    {
      title: 'Firma Adı',
      key: 'cari_hesap',
      width: 150,
      responsive: ['md'] as ('md')[],
      render: (_: any, r: CariHareket) => (
        <Typography.Text strong className="text-slate-800">{r.cari_hesaplar?.cari_adi || '-'}</Typography.Text>
      ),
    },
    {
      title: 'İşlem',
      key: 'islem_odeme',
      width: 115,
      render: (_: any, r: CariHareket) => {
        const typeInfo = ISLEM_TURU_LABELS[r.islem_turu] || { label: r.islem_turu, color: 'default' }
        const isHakedis = r.islem_turu === 'hakedis';
        const hasMatchedPayments = isHakedis && r.kaynak_id && hareketler?.some(m => m.kaynak_id === r.kaynak_id && m.islem_turu !== 'hakedis');

        return (
          <Space orientation="vertical" size={2}>
            <Space>
              <Tag color={typeInfo.color} style={{ fontSize: '10px', margin: 0, borderRadius: '4px' }}>
                {typeInfo.label}
              </Tag>
              {hasMatchedPayments && (
                <Popconfirm
                  title="Eşleşmeyi Kaldır"
                  onConfirm={() => undoMatchMutation.mutate(r.kaynak_id!)}
                  okText="Evet"
                  cancelText="Hayır"
                >
                  <Button type="text" size="small" danger icon={<RollbackOutlined style={{ fontSize: '11px' }} />} />
                </Popconfirm>
              )}
            </Space>
          </Space>
        )
      }
    },
    { 
      title: 'Açıklama', 
      key: 'aciklama',
      responsive: ['sm'] as ('sm')[],
      render: (_: any, r: CariHareket) => (
        <Space orientation="vertical" size={0}>
          <Typography.Text className="text-slate-600" style={{ fontSize: '12px' }}>{r.aciklama || '-'}</Typography.Text>
          {r.belge_no && <Typography.Text type="secondary" style={{ fontSize: '11px' }}>No: {r.belge_no}</Typography.Text>}
        </Space>
      )
    },
    {
      title: 'Borç',
      dataIndex: 'borc',
      key: 'borc',
      width: 140,
      align: 'right' as const,
      render: (v: number) => v > 0 ? (
        <span style={{ color: '#cf1322', fontWeight: 500 }}><MoneyDisplay amount={v} /></span>
      ) : '-',
    },
    {
      title: 'Alacak',
      dataIndex: 'alacak',
      key: 'alacak',
      width: 110,
      align: 'right' as const,
      render: (v: number) => v > 0 ? (
        <span style={{ color: '#3f8600', fontWeight: 500 }}><MoneyDisplay amount={v} /></span>
      ) : '-',
    },
  ]

  if (!activeProject) {
    return (
      <Card variant="borderless" className="shadow-sm rounded-xl">
        <Typography.Text type="secondary">Cari ekstre görüntülemek için lütfen bir proje seçiniz.</Typography.Text>
      </Card>
    )
  }

  return (
    <div className="animate-in fade-in duration-500">
      <Row gutter={[8, 8]} style={{ marginBottom: 16 }}>
        {[
          { title: 'Hakediş', val: stats.borc, color: '#1677ff', sub: `Matrah: ${trMoneyFormatter(stats.matrah)}` },
          { title: 'Faturalar', val: stats.fatura, color: '#faad14', sub: `Açık: ${trMoneyFormatter(stats.fatura - stats.borc)}` },
          { title: 'Teminat', val: stats.teminat, color: '#722ed1', sub: 'Net Birikmiş' },
          { title: 'Ödeme', val: stats.alacak, color: '#3f8600', sub: 'Toplam Giden' },
        ].map((item, idx) => (
          <Col xs={12} sm={12} lg={4} key={idx}>
            <Card variant="borderless" className="stat-card shadow-sm" size="small">
              <Statistic 
                title={<span style={{ fontSize: '11px' }}>{item.title}</span>} 
                value={item.val} 
                formatter={(v) => trMoneyFormatter(v as number)}
                styles={{ content: { color: item.color, fontSize: 'clamp(14px, 3.5vw, 16px)', fontWeight: 'bold' } }}
              />
              <div style={{ borderTop: '1px solid #f0f0f0', marginTop: 4, paddingTop: 4 }}>
                <Typography.Text type="secondary" style={{ fontSize: '10px' }}>{item.sub}</Typography.Text>
              </div>
            </Card>
          </Col>
        ))}
        <Col xs={24} sm={24} lg={8}>
          <Card variant="borderless" className="stat-card shadow-sm" size="small" style={{ background: '#f0f5ff' }}>
            <Statistic 
              title={<span style={{ fontSize: '11px', fontWeight: 'bold' }}>Cari Bakiye (Ödeme - Hakediş)</span>} 
              value={stats.bakiye} 
              formatter={(v) => trMoneyFormatter(v as number)}
              styles={{ content: { color: stats.bakiye < 0 ? '#cf1322' : '#1677ff', fontSize: 'clamp(18px, 4vw, 20px)', fontWeight: 'bold' } }}
            />
          </Card>
        </Col>
      </Row>

      {isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : (
        <DataTable
          columns={columns}
          dataSource={hareketler}
          rowKey="id"
          loading={isLoading}
          pagination={{ total: hareketler?.length || 0, pageSize: 50, showSizeChanger: true }}
          size="small"
        />
      )}
    </div>
  )
}
