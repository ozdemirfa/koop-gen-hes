import React, { useState } from 'react'
import { Card, Row, Col, Statistic, DatePicker, Space, Grid } from 'antd'
import { UserOutlined, DollarOutlined, RiseOutlined, FallOutlined, BankOutlined, WarningOutlined, SyncOutlined, WalletOutlined } from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { getErrorMessage } from '../lib/apiError'
import { LoadingState } from '../components/common/LoadingState'
import { ErrorState } from '../components/common/ErrorState'
import { EmptyState } from '../components/common/EmptyState'
import { usePageSettings } from '../contexts/LayoutContext'
import { useProject } from '../contexts/ProjectContext'
import dayjs from 'dayjs'
import { trNumberFormatter, trMoneyFormatter } from '../lib/format'
import { Button, message, Popconfirm } from 'antd'

const { RangePicker } = DatePicker
const { useBreakpoint } = Grid

export const Dashboard: React.FC = () => {
  const screens = useBreakpoint()
  const isMobile = !screens.md
  const { activeProject } = useProject()
  const queryClient = useQueryClient()
  const [dates, setDates] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null)

  const { data: ozet, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['dashboard-ozet', activeProject?.id, dates],
    queryFn: async () => {
      const params: any = {}
      if (activeProject?.id) params.projeId = activeProject.id
      if (dates?.[0]) params.baslangic_tarihi = dates[0].format('YYYY-MM-DD')
      if (dates?.[1]) params.bitis_tarihi = dates[1].format('YYYY-MM-DD')

      const response = await api.get('/dashboard/ozet', { params })

      if (typeof response.data === 'string' && response.data.includes('<!DOCTYPE html>')) {
        throw new Error('Backend bağlantısı kurulamadı (VITE_API_URL hatalı).')
      }

      if (!response.data || response.data.data === undefined) {
        throw new Error(`API cevabı eksik.`)
      }

      return response.data.data
    },
    retry: 1,
    enabled: !!activeProject?.id
  })

  const fifoClosureMutation = useMutation({
    mutationFn: async () => {
      return await api.post('/cari-hareketler/fifo-kapama', { proje_id: activeProject?.id })
    },
    onSuccess: () => {
      message.success('Hesap kapamaları başarıyla tamamlandı.')
      // FIFO closure aidat, cari ekstre, dashboard ozet ve banka kayıtlarını etkiler
      queryClient.invalidateQueries({ queryKey: ['aidatlar'] })
      queryClient.invalidateQueries({ queryKey: ['aidat-ozet'] })
      queryClient.invalidateQueries({ queryKey: ['cari-ekstre'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-ozet'] })
      queryClient.invalidateQueries({ queryKey: ['banka-hareketleri'] })
    },
    onError: (err) => message.error(getErrorMessage(err))
  })

  const actions = React.useMemo(() => (
    <Space size="small" wrap>
      <Popconfirm
        title="Hesap Kapamaları"
        description="Boştaki ödemeler FIFO mantığı ile aidat ve hakedişlerle eşleştirilecek. Devam edilsin mi?"
        onConfirm={() => fifoClosureMutation.mutate()}
        okText="Evet"
        cancelText="Hayır"
      >
        <Button 
          size="small" 
          icon={<SyncOutlined />} 
          loading={fifoClosureMutation.isPending}
          disabled={!activeProject}
        >
          {isMobile ? "FIFO Kapama" : "Hesap Kapamalarını Yap"}
        </Button>
      </Popconfirm>
      <RangePicker 
        size="small" 
        value={dates} 
        onChange={(vals) => setDates(vals as any)}
        placeholder={['Başlangıç', 'Bitiş']}
        style={{ width: isMobile ? 200 : 240 }}
      />
    </Space>
  ), [dates, activeProject, fifoClosureMutation, isMobile])
  usePageSettings('Pano', actions)

  if (!activeProject) {
    return <EmptyState description="Lütfen önce yukarıdan bir proje seçin" />
  }

  if (isLoading) return <LoadingState fullHeight />
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />

  const cardTitleStyle = { fontSize: isMobile ? '13px' : '14px' }
  const cardValueStyle = { fontWeight: 700, fontSize: isMobile ? '16px' : '18px' }

  return (
    <div className="animate-in fade-in duration-500">
      {/* 1. Satır: Proje Süresi, Aktif Üye Sayısı, Toplam Daire Sayısı */}
      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col xs={24} sm={8}>
          <Card variant="borderless" className="stat-card shadow-sm" size="small" style={{ background: '#f0f5ff' }}>
            <Statistic
              title={<span style={cardTitleStyle}>Proje Süresi</span>}
              value={`${ozet?.proje_suresi?.ay || 0} Ay, ${ozet?.proje_suresi?.gun || 0} Gün`}
              prefix={<BankOutlined style={{ color: '#2f54eb', marginRight: 8 }} />}
              styles={{ content: { color: '#2f54eb', ...cardValueStyle } }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card variant="borderless" className="stat-card shadow-sm" size="small">
            <Statistic
              title={<span style={cardTitleStyle}>Aktif Üye Sayısı</span>}
              value={ozet?.aktif_uye_sayisi || 0}
              prefix={<UserOutlined style={{ color: '#1677ff', marginRight: 8 }} />}
              formatter={(v) => trNumberFormatter(v as number)}
              styles={{ content: cardValueStyle }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card variant="borderless" className="stat-card shadow-sm" size="small">
            <Statistic
              title={<span style={cardTitleStyle}>Toplam Daire</span>}
              value={ozet?.toplam_daire_sayisi || 0}
              prefix={<BankOutlined style={{ color: '#8c8c8c', marginRight: 8 }} />}
              formatter={(v) => trNumberFormatter(v as number)}
              styles={{ content: cardValueStyle }}
            />
          </Card>
        </Col>
      </Row>

      {/* 2. Satır: Toplam Tahsilat, Geciken Aidatlar, Gecikme Faiz Tahsilatı */}
      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col xs={24} sm={8}>
          <Card variant="borderless" className="stat-card shadow-sm" size="small">
            <Statistic
              title={<span style={cardTitleStyle}>Toplam Tahsilat</span>}
              value={ozet?.toplam_tahsilat || 0}
              prefix={<DollarOutlined style={{ color: '#52c41a', marginRight: 8 }} />}
              suffix={<span style={{ fontSize: '12px', marginLeft: 4 }}>TL</span>}
              formatter={(v) => trMoneyFormatter(v as number)}
              styles={{ content: { color: '#52c41a', ...cardValueStyle } }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card variant="borderless" className="stat-card shadow-sm" size="small">
            <Statistic
              title={<span style={cardTitleStyle}>Geciken Aidatlar</span>}
              value={ozet?.bekleyen_alacak || 0}
              prefix={<WarningOutlined style={{ color: '#cf1322', marginRight: 8 }} />}
              suffix={<span style={{ fontSize: '10px', marginLeft: 4 }}>TL</span>}
              formatter={(v) => trMoneyFormatter(v as number)}
              styles={{ content: { color: '#cf1322', ...cardValueStyle } }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card variant="borderless" className="stat-card shadow-sm" size="small">
            <Statistic
              title={<span style={cardTitleStyle}>Gecikme Faizi</span>}
              value={ozet?.gecikme_faiz_tahsilati || 0}
              prefix={<RiseOutlined style={{ color: '#faad14', marginRight: 8 }} />}
              suffix={<span style={{ fontSize: '10px', marginLeft: 4 }}>TL</span>}
              formatter={(v) => trMoneyFormatter(v as number)}
              styles={{ content: { color: '#faad14', ...cardValueStyle } }}
            />
          </Card>
        </Col>
      </Row>

      {/* 3. Satır: Tahakkuk eden gider, faturalar, fatura farkı */}
      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col xs={24} sm={8}>
          <Card variant="borderless" className="stat-card shadow-sm" size="small">
            <Statistic
              title={<span style={cardTitleStyle}>Tahakkuk Eden Gider</span>}
              value={ozet?.toplam_gider || 0}
              prefix={<FallOutlined style={{ color: '#d4380d', marginRight: 8 }} />}
              suffix={<span style={{ fontSize: '12px', marginLeft: 4 }}>TL</span>}
              formatter={(v) => trMoneyFormatter(v as number)}
              styles={{ content: { color: '#d4380d', ...cardValueStyle } }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card variant="borderless" className="stat-card shadow-sm" size="small">
            <Statistic
              title={<span style={cardTitleStyle}>Faturalar</span>}
              value={ozet?.toplam_fatura || 0}
              prefix={<DollarOutlined style={{ color: '#faad14', marginRight: 8 }} />}
              suffix={<span style={{ fontSize: '10px', marginLeft: 4 }}>TL</span>}
              formatter={(v) => trMoneyFormatter(v as number)}
              styles={{ content: { color: '#faad14', ...cardValueStyle } }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card variant="borderless" className="stat-card shadow-sm" size="small">
            <Statistic
              title={<span style={cardTitleStyle}>Fatura Farkı</span>}
              value={ozet?.fatura_farki || 0}
              prefix={<WarningOutlined style={{ color: (ozet?.fatura_farki || 0) > 0 ? '#faad14' : 'inherit', marginRight: 8 }} />}
              suffix={<span style={{ fontSize: '10px', marginLeft: 4 }}>TL</span>}
              formatter={(v) => trMoneyFormatter(v as number)}
              styles={{ content: { color: (ozet?.fatura_farki || 0) > 0 ? '#faad14' : 'inherit', ...cardValueStyle } }}
            />
          </Card>
        </Col>
      </Row>

      {/* 4. Satır: Toplam Cari Ödeme, Birikmiş Teminatlar, Cari Bakiye */}
      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col xs={24} sm={8}>
          <Card variant="borderless" className="stat-card shadow-sm" size="small">
            <Statistic
              title={<span style={cardTitleStyle}>Toplam Cari Ödeme</span>}
              value={ozet?.toplam_odeme || 0}
              prefix={<FallOutlined style={{ color: '#cf1322', marginRight: 8 }} />}
              suffix={<span style={{ fontSize: '12px', marginLeft: 4 }}>TL</span>}
              formatter={(v) => trMoneyFormatter(v as number)}
              styles={{ content: { color: '#cf1322', ...cardValueStyle } }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card variant="borderless" className="stat-card shadow-sm" size="small">
            <Statistic
              title={<span style={cardTitleStyle}>Birimmiş Teminatlar</span>}
              value={ozet?.birikmis_teminat || 0}
              prefix={<BankOutlined style={{ color: '#13c2c2', marginRight: 8 }} />}
              suffix={<span style={{ fontSize: '10px', marginLeft: 4 }}>TL</span>}
              formatter={(v) => trMoneyFormatter(v as number)}
              styles={{ content: cardValueStyle }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card variant="borderless" className="stat-card shadow-sm" size="small">
            <Statistic
              title={<span style={cardTitleStyle}>Cari Bakiye</span>}
              value={ozet?.cari_bakiye || 0}
              prefix={<BankOutlined style={{ color: (ozet?.cari_bakiye || 0) >= 0 ? '#1677ff' : '#cf1322', marginRight: 8 }} />}
              suffix={<span style={{ fontSize: '10px', marginLeft: 4 }}>TL</span>}
              formatter={(v) => trMoneyFormatter(v as number)}
              styles={{ content: { 
                color: (ozet?.cari_bakiye || 0) >= 0 ? '#1677ff' : '#cf1322',
                ...cardValueStyle
              } }}
            />
          </Card>
        </Col>
      </Row>

      {/* 5. Satır: Bankalar Bakiye Toplamı, Çekler, Ödemeler Sonrası Nakit */}
      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col xs={24} sm={8}>
          <Card variant="borderless" className="stat-card shadow-sm" size="small">
            <Statistic
              title={<span style={cardTitleStyle}>Bankalar Toplamı</span>}
              value={ozet?.banka_toplami || 0}
              prefix={<BankOutlined style={{ color: '#722ed1', marginRight: 8 }} />}
              suffix={<span style={{ fontSize: '12px', marginLeft: 4 }}>TL</span>}
              formatter={(v) => trMoneyFormatter(v as number)}
              styles={{ content: { color: '#722ed1', ...cardValueStyle } }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card variant="borderless" className="stat-card shadow-sm" size="small">
            <Statistic
              title={<span style={cardTitleStyle}>Çekler</span>}
              value={ozet?.cek_toplami || 0}
              prefix={<DollarOutlined style={{ color: '#eb2f96', marginRight: 8 }} />}
              suffix={<span style={{ fontSize: '10px', marginLeft: 4 }}>TL</span>}
              formatter={(v) => trMoneyFormatter(v as number)}
              styles={{ content: { color: '#eb2f96', ...cardValueStyle } }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card variant="borderless" className="stat-card shadow-sm" size="small" style={{ background: '#f0f5ff' }}>
            <Statistic
              title={<span style={cardTitleStyle}>Nakit Durumu</span>}
              value={ozet?.odeme_sonrasi_nakit || 0}
              prefix={<RiseOutlined style={{ color: (ozet?.odeme_sonrasi_nakit || 0) >= 0 ? '#fa8c16' : '#cf1322', marginRight: 8 }} />}
              suffix={<span style={{ fontSize: '10px', marginLeft: 4 }}>TL</span>}
              formatter={(v) => trMoneyFormatter(v as number)}
              styles={{ content: { 
                color: (ozet?.odeme_sonrasi_nakit || 0) >= 0 ? '#fa8c16' : '#cf1322', 
                ...cardValueStyle,
                fontSize: isMobile ? '18px' : '20px'
              } }}
            />
          </Card>
        </Col>
      </Row>

      {/* 6. Satır: Kasa Nakit (1/3 boyut) */}
      <Row gutter={[12, 12]}>
        <Col xs={24} sm={8}>
          <Card variant="borderless" className="stat-card shadow-sm" size="small">
            <Statistic
              title={<span style={cardTitleStyle}>Kasa Nakit</span>}
              value={ozet?.kasa_nakit ?? 0}
              prefix={<WalletOutlined style={{ color: '#fa8c16', marginRight: 8 }} />}
              suffix={<span style={{ fontSize: '12px', marginLeft: 4 }}>TL</span>}
              formatter={(v) => trMoneyFormatter(v as number)}
              styles={{ content: { color: '#fa8c16', ...cardValueStyle } }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  )
}
