import React, { useState, useMemo } from 'react'
import { Card, Space, Select, DatePicker, Statistic, Row, Col, Tag, Button, message, Typography, Badge, Popconfirm } from 'antd'
import { DownloadOutlined, AuditOutlined, RollbackOutlined } from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import api from '../../lib/api'
import { DataTable } from '../../components/common/DataTable'
import { ErrorState } from '../../components/common/ErrorState'
import { MoneyDisplay } from '../../components/common/MoneyDisplay'
import { trMoneyFormatter, trNumberParser } from '../../lib/format'
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
    onError: (err: any) => message.error(err.message || 'Hata oluştu')
  })

  // Cari Hesaplar (Sadece Firmalar) Fetch
  const { data: accounts, isLoading: accountsLoading } = useQuery({
    queryKey: ['cari-accounts', activeProject?.id, 'firma'],
    queryFn: async () => {
      if (!activeProject?.id) return []
      // Proje ID interceptor tarafından otomatik ekleniyor
      const { data } = await api.get('/cari-hareketler/accounts', { 
        params: { cari_turu: 'firma' } 
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
        cari_turu: 'firma'
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
    <Space size="small">
      <Button icon={<DownloadOutlined />} onClick={exportToCSV}>CSV İndir</Button>
      <Select
        showSearch
        placeholder="Firma Seçin"
        value={cariHesapId}
        onChange={setCariHesapId}
        allowClear
        style={{ width: 280 }}
        loading={accountsLoading}
        optionFilterProp="label"
        suffixIcon={<AuditOutlined />}
        options={accounts?.map(acc => ({
          value: acc.id,
          label: acc.cari_adi
        }))}
      />
      <RangePicker
        value={dates}
        onChange={(vals) => setDates(vals as any)}
        format="DD.MM.YYYY"
        style={{ width: 240 }}
      />
    </Space>
  ), [cariHesapId, dates, accounts, accountsLoading])

  usePageSettings('Firma Ekstre', actions)

  // Hesaplamalar (summaryStats'tan gelir, bakiye Ödeme - KDVli Tutar olarak standartlaştırıldı)
  const stats = useMemo(() => {
    if (summaryStats) {
      return {
        borc: summaryStats.toplam_kdvli, // Hak edilen
        alacak: summaryStats.toplam_odeme, // Ödenen
        bakiye: summaryStats.bakiye, // Cari Bakiye (Ödeme - KDVli)
        teminat: summaryStats.birikmis_teminat,
        matrah: summaryStats.toplam_hakedis,
        fatura: summaryStats.toplam_fatura
      }
    }

    return {
      borc: 0,
      alacak: 0,
      bakiye: 0,
      teminat: 0,
      matrah: 0,
      fatura: 0
    }
  }, [summaryStats])

  const columns = [
    {
      title: 'Tarih',
      dataIndex: 'tarih',
      key: 'tarih',
      width: 110,
      render: (d: string) => <span className="text-slate-600 font-medium">{dayjs(d).format('DD.MM.YYYY')}</span>,
    },
    {
      title: 'Firma Adı',
      key: 'cari_hesap',
      width: 200,
      render: (_: any, r: CariHareket) => (
        <Typography.Text strong className="text-slate-800">{r.cari_hesaplar?.cari_adi || '-'}</Typography.Text>
      ),
    },
    {
      title: 'İşlem / Tür',
      key: 'islem_odeme',
      width: 180,
      render: (_: any, r: CariHareket) => {
        const typeInfo = ISLEM_TURU_LABELS[r.islem_turu] || { label: r.islem_turu, color: 'default' }
        
        // Hakediş satırı mı ve bu hakedişe bağlı ödeme var mı kontrol et
        const isHakedis = r.islem_turu === 'hakedis';
        // kaynak_id hakedis satırında hakedis.id'yi tutuyor. 
        // Ödemelerde de kaynak_id hakedis.id'yi tutuyor.
        const hasMatchedPayments = isHakedis && r.kaynak_id && hareketler?.some(m => m.kaynak_id === r.kaynak_id && m.islem_turu !== 'hakedis');

        return (
          <Space orientation="vertical" size={2}>
            <Space>
              <Tag color={typeInfo.color} style={{ fontSize: '11px', margin: 0, borderRadius: '4px' }}>
                {typeInfo.label}
              </Tag>
              {hasMatchedPayments && (
                <Popconfirm
                  title="Eşleşmeyi Kaldır"
                  description="Bu hakedişe bağlı tüm ödemeler serbest bırakılacaktır. Emin misiniz?"
                  onConfirm={() => undoMatchMutation.mutate(r.kaynak_id!)}
                  okText="Evet, Kaldır"
                  cancelText="Vazgeç"
                >
                  <Button 
                    type="text" 
                    size="small" 
                    danger 
                    icon={<RollbackOutlined style={{ fontSize: '12px' }} />}
                    loading={undoMatchMutation.isPending && undoMatchMutation.variables === r.kaynak_id}
                    title="Eşleşmeleri Geri Al"
                  />
                </Popconfirm>
              )}
            </Space>
            {r.odeme_turu && (
              <Typography.Text type="secondary" italic style={{ fontSize: '11px', marginLeft: 4 }}>
                {ODEME_TURU_LABELS[r.odeme_turu] || r.odeme_turu}
                {r.kaynak_id && r.islem_turu !== 'hakedis' && ` (Eşleşmiş)`}
              </Typography.Text>
            )}
          </Space>
        )
      }
    },
    { 
      title: 'Açıklama', 
      key: 'aciklama',
      render: (_: any, r: CariHareket) => (
        <Space orientation="vertical" size={0}>
          <Typography.Text className="text-slate-600">{r.aciklama || '-'}</Typography.Text>
          {r.belge_no && <Typography.Text type="secondary" style={{ fontSize: '11px' }}>Belge No: {r.belge_no}</Typography.Text>}
        </Space>
      )
    },
    {
      title: 'Borç (TL)',
      dataIndex: 'borc',
      key: 'borc',
      width: 130,
      align: 'right' as const,
      render: (v: number) => v > 0 ? (
        <span style={{ color: '#cf1322', fontWeight: 500 }}>
          <MoneyDisplay amount={v} />
        </span>
      ) : <Typography.Text type="secondary">-</Typography.Text>,
    },
    {
      title: 'Alacak (TL)',
      dataIndex: 'alacak',
      key: 'alacak',
      width: 130,
      align: 'right' as const,
      render: (v: number) => v > 0 ? (
        <span style={{ color: '#3f8600', fontWeight: 500 }}>
          <MoneyDisplay amount={v} />
        </span>
      ) : <Typography.Text type="secondary">-</Typography.Text>,
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
      {/* 5 Bilgi Kartı Düzeni */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} lg={4}>
          <Card variant="borderless" className="stat-card shadow-sm" size="small">
            <Space orientation="vertical" size={0} style={{ width: '100%' }}>
              <Statistic 
                title={<span style={{ fontSize: '12px' }}>Hakediş (Matrah)</span>} 
                value={stats.matrah} 
                formatter={(v) => trMoneyFormatter(v as number)}
                styles={{ content: { color: '#1677ff', fontSize: '15px', fontWeight: 'bold' } }}
              />
              <div style={{ borderTop: '1px solid #f0f0f0', marginTop: 4, paddingTop: 4 }}>
                <Typography.Text type="secondary" style={{ fontSize: '11px' }}>KDVli: </Typography.Text>
                <Typography.Text strong style={{ fontSize: '15px', color: '#1677ff' }}>
                  {trMoneyFormatter(stats.borc)} TL
                </Typography.Text>
              </div>
            </Space>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={4}>
          <Card variant="borderless" className="stat-card shadow-sm" size="small">
            <Space orientation="vertical" size={0} style={{ width: '100%' }}>
              <Statistic 
                title={<span style={{ fontSize: '12px' }}>Gelen Faturalar</span>} 
                value={stats.fatura} 
                formatter={(v) => trMoneyFormatter(v as number)}
                styles={{ content: { color: '#faad14', fontSize: '15px', fontWeight: 'bold' } }}
              />
              <div style={{ borderTop: '1px solid #f0f0f0', marginTop: 4, paddingTop: 4 }}>
                <Typography.Text type="secondary" style={{ fontSize: '11px' }}>Fatura Açığı: </Typography.Text>
                <Typography.Text strong style={{ fontSize: '12px', color: (stats.fatura - stats.borc < 0) ? '#b91c1c' : '#faad14' }}>
                  {trMoneyFormatter(stats.fatura - stats.borc)} TL
                </Typography.Text>
              </div>
            </Space>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={4}>
          <Card variant="borderless" className="stat-card shadow-sm" size="small">
            <Statistic 
              title={<span style={{ fontSize: '12px' }}>Birikmiş Teminat</span>} 
              value={stats.teminat} 
              formatter={(v) => trMoneyFormatter(v as number)}
              styles={{ content: { color: '#722ed1', fontSize: '15px', fontWeight: 'bold' } }}
              suffix={<span style={{ fontSize: '11px', fontWeight: 'normal', marginLeft: 4 }}>TL</span>}
            />
            <div style={{ borderTop: '1px solid #f0f0f0', marginTop: 4, paddingTop: 4 }}>
              <Typography.Text type="secondary" style={{ fontSize: '11px' }}>Net Kalan Teminat</Typography.Text>
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={4}>
          <Card variant="borderless" className="stat-card shadow-sm" size="small">
            <Statistic 
              title={<span style={{ fontSize: '12px' }}>Toplam Ödeme</span>} 
              value={stats.alacak} 
              formatter={(v) => trMoneyFormatter(v as number)}
              styles={{ content: { color: '#3f8600', fontSize: '15px', fontWeight: 'bold' } }}
              suffix={<span style={{ fontSize: '11px', fontWeight: 'normal', marginLeft: 4 }}>TL</span>}
            />
            <div style={{ borderTop: '1px solid #f0f0f0', marginTop: 4, paddingTop: 4 }}>
              <Typography.Text type="secondary" style={{ fontSize: '11px' }}>Yapılan Toplam Ödeme</Typography.Text>
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={24} lg={8}>
          <Card variant="borderless" className="stat-card shadow-sm" size="small" style={{ background: '#f0f5ff' }}>
            <Statistic 
              title={<span style={{ fontSize: '12px', fontWeight: 'bold' }}>Cari Bakiye</span>} 
              value={stats.bakiye} 
              formatter={(v) => trMoneyFormatter(v as number)}
              styles={{ content: { color: stats.bakiye < 0 ? '#cf1322' : '#1677ff', fontSize: '20px', fontWeight: 'bold' } }}
              suffix={<span style={{ fontSize: '12px', fontWeight: 'normal', marginLeft: 4 }}>TL</span>}
            />
            <div style={{ borderTop: '1px solid #ddecff', marginTop: 4, paddingTop: 4 }}>
              <Typography.Text type="secondary" style={{ fontSize: '11px' }}>Ödeme - KDVli Tutar</Typography.Text>
            </div>
          </Card>
        </Col>
      </Row>

      {isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : (
        <Card variant="borderless" styles={{ body: { padding: 0 } }} className="shadow-sm overflow-hidden rounded-xl">
          <DataTable
            columns={columns}
            dataSource={hareketler}
            rowKey="id"
            loading={isLoading}
            pagination={{ 
              total: hareketler?.length || 0,
              pageSize: 50, 
              showSizeChanger: true 
            }}
            size="small"
            emptyDescription="Seçilen kriterlere uygun cari hareket bulunamadı"
          />
        </Card>
      )}
    </div>
  )
}
