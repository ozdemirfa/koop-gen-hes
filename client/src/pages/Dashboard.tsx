import React, { useState } from 'react'
import { Card, Row, Col, Statistic, DatePicker, Space, Typography } from 'antd'
import {
  CalendarOutlined,
  TeamOutlined,
  HomeOutlined,
  DollarCircleOutlined,
  WarningOutlined,
  PercentageOutlined,
  ContainerOutlined,
  FileTextOutlined,
  DiffOutlined,
  SendOutlined,
  SafetyOutlined,
  FundOutlined,
  BankOutlined,
  FileProtectOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  WalletOutlined,
  SyncOutlined,
} from '@ant-design/icons'
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

const IconBadge: React.FC<{ icon: React.ReactNode; color: string }> = ({ icon, color }) => (
  <span className="stat-icon-badge" style={{ background: `${color}1F`, color }}>
    {icon}
  </span>
)

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Typography.Text className="stat-section-title">{children}</Typography.Text>
)

const TLSuffix = <span className="stat-suffix">TL</span>

export const Dashboard: React.FC = () => {
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
          Hesap Kapamalarını Yap
        </Button>
      </Popconfirm>
      <RangePicker
        size="small"
        value={dates}
        onChange={(vals) => setDates(vals as any)}
        placeholder={['Başlangıç', 'Bitiş']}
        style={{ width: 240 }}
      />
    </Space>
  ), [dates, activeProject, fifoClosureMutation])
  usePageSettings('Pano', actions)

  if (!activeProject) {
    return <EmptyState description="Lütfen önce yukarıdan bir proje seçin" />
  }

  if (isLoading) return <LoadingState fullHeight />
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />

  const cardTitleStyle = { fontSize: 'clamp(13px, 3vw, 14px)' }
  const cardValueStyle = { fontWeight: 700, fontSize: 'clamp(16px, 4vw, 18px)' }

  const cariBakiyePositive = (ozet?.cari_bakiye || 0) >= 0
  const nakitPositive = (ozet?.odeme_sonrasi_nakit || 0) >= 0
  const faturaFarkiPositive = (ozet?.fatura_farki || 0) > 0

  return (
    <div className="animate-in fade-in duration-500">
      {/* PROJE BİLGİLERİ */}
      <SectionTitle>Proje Bilgileri</SectionTitle>
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={8}>
          <Card variant="borderless" className="stat-card shadow-sm" size="small">
            <Statistic
              title={<span style={cardTitleStyle}>Proje Süresi</span>}
              value={`${ozet?.proje_suresi?.ay || 0} Ay, ${ozet?.proje_suresi?.gun || 0} Gün`}
              prefix={<IconBadge icon={<CalendarOutlined />} color="#2f54eb" />}
              styles={{ content: { color: '#2f54eb', ...cardValueStyle } }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card variant="borderless" className="stat-card shadow-sm" size="small">
            <Statistic
              title={<span style={cardTitleStyle}>Aktif Üye Sayısı</span>}
              value={ozet?.aktif_uye_sayisi || 0}
              prefix={<IconBadge icon={<TeamOutlined />} color="#1677ff" />}
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
              prefix={<IconBadge icon={<HomeOutlined />} color="#8c8c8c" />}
              formatter={(v) => trNumberFormatter(v as number)}
              styles={{ content: cardValueStyle }}
            />
          </Card>
        </Col>
      </Row>

      {/* TAHSİLAT */}
      <SectionTitle>Tahsilat</SectionTitle>
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={8}>
          <Card variant="borderless" className="stat-card shadow-sm" size="small">
            <Statistic
              title={<span style={cardTitleStyle}>Toplam Tahsilat</span>}
              value={ozet?.toplam_tahsilat || 0}
              prefix={<IconBadge icon={<DollarCircleOutlined />} color="#52c41a" />}
              suffix={TLSuffix}
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
              prefix={<IconBadge icon={<WarningOutlined />} color="#cf1322" />}
              suffix={TLSuffix}
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
              prefix={<IconBadge icon={<PercentageOutlined />} color="#faad14" />}
              suffix={TLSuffix}
              formatter={(v) => trMoneyFormatter(v as number)}
              styles={{ content: { color: '#faad14', ...cardValueStyle } }}
            />
          </Card>
        </Col>
      </Row>

      {/* GİDER */}
      <SectionTitle>Gider</SectionTitle>
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={8}>
          <Card variant="borderless" className="stat-card shadow-sm" size="small">
            <Statistic
              title={<span style={cardTitleStyle}>Tahakkuk Eden Gider</span>}
              value={ozet?.toplam_gider || 0}
              prefix={<IconBadge icon={<ContainerOutlined />} color="#d4380d" />}
              suffix={TLSuffix}
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
              prefix={<IconBadge icon={<FileTextOutlined />} color="#fa8c16" />}
              suffix={TLSuffix}
              formatter={(v) => trMoneyFormatter(v as number)}
              styles={{ content: { color: '#fa8c16', ...cardValueStyle } }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card variant="borderless" className="stat-card shadow-sm" size="small">
            <Statistic
              title={<span style={cardTitleStyle}>Fatura Farkı</span>}
              value={ozet?.fatura_farki || 0}
              prefix={<IconBadge icon={<DiffOutlined />} color={faturaFarkiPositive ? '#faad14' : '#8c8c8c'} />}
              suffix={TLSuffix}
              formatter={(v) => trMoneyFormatter(v as number)}
              styles={{ content: { color: faturaFarkiPositive ? '#faad14' : 'inherit', ...cardValueStyle } }}
            />
          </Card>
        </Col>
      </Row>

      {/* CARİ HESAP */}
      <SectionTitle>Cari Hesap</SectionTitle>
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={8}>
          <Card variant="borderless" className="stat-card shadow-sm" size="small">
            <Statistic
              title={<span style={cardTitleStyle}>Toplam Cari Ödeme</span>}
              value={ozet?.toplam_odeme || 0}
              prefix={<IconBadge icon={<SendOutlined />} color="#cf1322" />}
              suffix={TLSuffix}
              formatter={(v) => trMoneyFormatter(v as number)}
              styles={{ content: { color: '#cf1322', ...cardValueStyle } }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card variant="borderless" className="stat-card shadow-sm" size="small">
            <Statistic
              title={<span style={cardTitleStyle}>Birikmiş Teminatlar</span>}
              value={ozet?.birikmis_teminat || 0}
              prefix={<IconBadge icon={<SafetyOutlined />} color="#13c2c2" />}
              suffix={TLSuffix}
              formatter={(v) => trMoneyFormatter(v as number)}
              styles={{ content: { color: '#13c2c2', ...cardValueStyle } }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card
            variant="borderless"
            className="stat-card stat-card-accent shadow-sm"
            size="small"
            style={{ '--accent-color': cariBakiyePositive ? '#1677ff' : '#cf1322' } as React.CSSProperties}
          >
            <Statistic
              title={<span style={cardTitleStyle}>Cari Bakiye</span>}
              value={ozet?.cari_bakiye || 0}
              prefix={<IconBadge icon={<FundOutlined />} color={cariBakiyePositive ? '#1677ff' : '#cf1322'} />}
              suffix={TLSuffix}
              formatter={(v) => trMoneyFormatter(v as number)}
              styles={{ content: {
                color: cariBakiyePositive ? '#1677ff' : '#cf1322',
                ...cardValueStyle
              } }}
            />
          </Card>
        </Col>
      </Row>

      {/* LİKİDİTE */}
      <SectionTitle>Likidite</SectionTitle>
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={8}>
          <Card variant="borderless" className="stat-card shadow-sm" size="small">
            <Statistic
              title={<span style={cardTitleStyle}>Bankalar Toplamı</span>}
              value={ozet?.banka_toplami || 0}
              prefix={<IconBadge icon={<BankOutlined />} color="#722ed1" />}
              suffix={TLSuffix}
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
              prefix={<IconBadge icon={<FileProtectOutlined />} color="#eb2f96" />}
              suffix={TLSuffix}
              formatter={(v) => trMoneyFormatter(v as number)}
              styles={{ content: { color: '#eb2f96', ...cardValueStyle } }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card
            variant="borderless"
            className="stat-card stat-card-accent shadow-sm"
            size="small"
            style={{ '--accent-color': nakitPositive ? '#fa8c16' : '#cf1322' } as React.CSSProperties}
          >
            <Statistic
              title={<span style={cardTitleStyle}>Nakit Durumu</span>}
              value={ozet?.odeme_sonrasi_nakit || 0}
              prefix={<IconBadge icon={nakitPositive ? <ArrowUpOutlined /> : <ArrowDownOutlined />} color={nakitPositive ? '#fa8c16' : '#cf1322'} />}
              suffix={TLSuffix}
              formatter={(v) => trMoneyFormatter(v as number)}
              styles={{ content: {
                color: nakitPositive ? '#fa8c16' : '#cf1322',
                ...cardValueStyle,
                fontSize: 'clamp(18px, 4vw, 20px)'
              } }}
            />
          </Card>
        </Col>
      </Row>

      {/* KASA */}
      <SectionTitle>Kasa</SectionTitle>
      <Row gutter={[12, 12]}>
        <Col xs={24} sm={8}>
          <Card variant="borderless" className="stat-card shadow-sm" size="small">
            <Statistic
              title={<span style={cardTitleStyle}>Kasa Nakit</span>}
              value={ozet?.kasa_nakit ?? 0}
              prefix={<IconBadge icon={<WalletOutlined />} color="#fa8c16" />}
              suffix={TLSuffix}
              formatter={(v) => trMoneyFormatter(v as number)}
              styles={{ content: { color: '#fa8c16', ...cardValueStyle } }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  )
}
