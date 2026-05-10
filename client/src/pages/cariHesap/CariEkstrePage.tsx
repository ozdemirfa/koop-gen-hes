import React, { useState, useMemo } from 'react'
import { Card, Space, Select, DatePicker, Statistic, Row, Col, Tag, Button, message, Typography, Badge, Popconfirm, Grid } from 'antd'
import { DownloadOutlined, AuditOutlined, RollbackOutlined } from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import api from '../../lib/api'
import { getErrorMessage } from '../../lib/apiError'
import { DataTable } from '../../components/common/DataTable'
import { ErrorState } from '../../components/common/ErrorState'
import { MoneyDisplay } from '../../components/common/MoneyDisplay'
import { trMoneyFormatter, trNumberParser } from '../../lib/format'
import { usePageSettings } from '../../contexts/LayoutContext'
import { useProject } from '../../contexts/ProjectContext'

const { RangePicker } = DatePicker
const { useBreakpoint } = Grid

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
  const screens = useBreakpoint()
  const isMobile = !screens.md
  const { activeProject } = useProject()
  const queryClient = useQueryClient()
  const [dates, setDates] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null]>([
    dayjs().startOf('year'),
    dayjs().endOf('year'),
  ])
  const [cariHesapId, setCariHesapId] = useState<string | undefined>(undefined)

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

  // Fatura dışı işlemleri filtrele
  const hareketler = useMemo(() => {
    if (!rawHareketler) return []
    return rawHareketler.filter(h => 
      h.islem_turu === 'hakedis' || 
      h.islem_turu === 'giden_odeme' || 
      h.islem_turu === 'odeme'
    )
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

  const exportToCSV = () => {
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
      h.borc.toString().replace(/\./g, ','),
      h.alacak.toString().replace(/\./g, ',')
    ])

    const csvContent = "\uFEFF" + [headers, ...rows].map(e => e.join(";")).join("\n")
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.setAttribute("href", url)
    link.setAttribute("download", `cari_ekstre_${dayjs().format('YYYYMMDD')}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const actions = useMemo(() => (
    <Space size="small" wrap>
      <Button size="small" icon={<DownloadOutlined />} onClick={exportToCSV}>{!isMobile && "CSV İndir"}</Button>
      <Select
        showSearch
        placeholder="Firma Seçin"
        value={cariHesapId}
        onChange={setCariHesapId}
        allowClear
        style={{ width: isMobile ? 140 : 220 }}
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
        style={{ width: isMobile ? 200 : 240 }}
      />
    </Space>
  ), [cariHesapId, dates, accounts, accountsLoading, isMobile])

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
      width: 100,
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
      width: 140,
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
      width: 110,
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
                styles={{ content: { color: item.color, fontSize: isMobile ? '14px' : '16px', fontWeight: 'bold' } }}
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
              styles={{ content: { color: stats.bakiye < 0 ? '#cf1322' : '#1677ff', fontSize: isMobile ? '18px' : '20px', fontWeight: 'bold' } }}
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
