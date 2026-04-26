import React, { useState } from 'react'
import { Typography, Card, Row, Col, Statistic, DatePicker, Space } from 'antd'
import { UserOutlined, DollarOutlined, RiseOutlined, FallOutlined, BankOutlined, WarningOutlined, SyncOutlined, WalletOutlined } from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { LoadingState } from '../components/common/LoadingState'
import { ErrorState } from '../components/common/ErrorState'
import { usePageSettings } from '../contexts/LayoutContext'
import { useProject } from '../contexts/ProjectContext'
import dayjs from 'dayjs'
import { trNumberFormatter, trMoneyFormatter } from '../lib/format'
import { Button, message, Popconfirm } from 'antd'

const { RangePicker } = DatePicker

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
      queryClient.invalidateQueries()
    },
    onError: (err: any) => message.error(err.message || 'Hata oluştu')
  })

  const actions = React.useMemo(() => (
    <Space size="small">
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
    return (
      <Card style={{ textAlign: 'center', marginTop: 50 }}>
        <Typography.Title level={4}>Lütfen bir proje seçin</Typography.Title>
        <Typography.Text type="secondary">Pano verilerini görebilmek için üst menüden bir proje seçmelisiniz.</Typography.Text>
      </Card>
    )
  }

  if (isLoading) return <LoadingState fullHeight />
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />

  return (
    <div className="animate-in fade-in duration-500">
      {/* 1. Satır: Proje Süresi, Aktif Üye Sayısı, Toplam Daire Sayısı */}
      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col xs={24} sm={8}>
          <Card variant="borderless" className="stat-card shadow-sm" size="small" style={{ background: '#f0f5ff' }}>
            <Statistic
              title="Proje Süresi"
              value={`${ozet?.proje_suresi?.ay || 0} Ay, ${ozet?.proje_suresi?.gun || 0} Gün`}
              prefix={<BankOutlined style={{ color: '#2f54eb', marginRight: 8 }} />}
              styles={{ content: { color: '#2f54eb', fontWeight: 700, fontSize: '18px' } }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card variant="borderless" className="stat-card shadow-sm" size="small">
            <Statistic
              title="Aktif Üye Sayısı"
              value={ozet?.aktif_uye_sayisi || 0}
              prefix={<UserOutlined style={{ color: '#1677ff', marginRight: 8 }} />}
              formatter={(v) => trNumberFormatter(v as number)}
              styles={{ content: { fontWeight: 700, fontSize: '18px' } }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card variant="borderless" className="stat-card shadow-sm" size="small">
            <Statistic
              title="Toplam Daire Sayısı"
              value={ozet?.toplam_daire_sayisi || 0}
              prefix={<BankOutlined style={{ color: '#8c8c8c', marginRight: 8 }} />}
              formatter={(v) => trNumberFormatter(v as number)}
              styles={{ content: { fontWeight: 700, fontSize: '18px' } }}
            />
          </Card>
        </Col>
      </Row>

      {/* 2. Satır: Toplam Tahsilat, Geciken Aidatlar, Gecikme Faiz Tahsilatı */}
      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col xs={24} sm={8}>
          <Card variant="borderless" className="stat-card shadow-sm" size="small">
            <Statistic
              title="Toplam Tahsilat"
              value={ozet?.toplam_tahsilat || 0}
              prefix={<DollarOutlined style={{ color: '#52c41a', marginRight: 8 }} />}
              suffix={<span style={{ fontSize: '12px', marginLeft: 4 }}>TL</span>}
              formatter={(v) => trMoneyFormatter(v as number)}
              styles={{ content: { color: '#52c41a', fontWeight: 700, fontSize: '18px' } }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card variant="borderless" className="stat-card shadow-sm" size="small">
            <Statistic
              title="Geciken Aidatlar"
              value={ozet?.bekleyen_alacak || 0}
              prefix={<WarningOutlined style={{ color: '#cf1322', marginRight: 8 }} />}
              suffix={<span style={{ fontSize: '12px', marginLeft: 4 }}>TL</span>}
              formatter={(v) => trMoneyFormatter(v as number)}
              styles={{ content: { color: '#cf1322', fontWeight: 700, fontSize: '18px' } }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card variant="borderless" className="stat-card shadow-sm" size="small">
            <Statistic
              title="Gecikme Faiz Tahsilatı"
              value={ozet?.gecikme_faiz_tahsilati || 0}
              prefix={<RiseOutlined style={{ color: '#faad14', marginRight: 8 }} />}
              suffix={<span style={{ fontSize: '12px', marginLeft: 4 }}>TL</span>}
              formatter={(v) => trMoneyFormatter(v as number)}
              styles={{ content: { color: '#faad14', fontWeight: 700, fontSize: '18px' } }}
            />
          </Card>
        </Col>
      </Row>

      {/* 3. Satır: Tahakkuk eden gider, faturalar, fatura farkı */}
      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col xs={24} sm={8}>
          <Card variant="borderless" className="stat-card shadow-sm" size="small">
            <Statistic
              title="Tahakkuk Eden Gider"
              value={ozet?.toplam_gider || 0}
              prefix={<FallOutlined style={{ color: '#d4380d', marginRight: 8 }} />}
              suffix={<span style={{ fontSize: '12px', marginLeft: 4 }}>TL</span>}
              formatter={(v) => trMoneyFormatter(v as number)}
              styles={{ content: { color: '#d4380d', fontWeight: 700, fontSize: '18px' } }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card variant="borderless" className="stat-card shadow-sm" size="small">
            <Statistic
              title="Faturalar"
              value={ozet?.toplam_fatura || 0}
              prefix={<DollarOutlined style={{ color: '#faad14', marginRight: 8 }} />}
              suffix={<span style={{ fontSize: '12px', marginLeft: 4 }}>TL</span>}
              formatter={(v) => trMoneyFormatter(v as number)}
              styles={{ content: { color: '#faad14', fontWeight: 700, fontSize: '18px' } }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card variant="borderless" className="stat-card shadow-sm" size="small">
            <Statistic
              title="Fatura Farkı"
              value={ozet?.fatura_farki || 0}
              prefix={<WarningOutlined style={{ color: (ozet?.fatura_farki || 0) > 0 ? '#faad14' : 'inherit', marginRight: 8 }} />}
              suffix={<span style={{ fontSize: '12px', marginLeft: 4 }}>TL</span>}
              formatter={(v) => trMoneyFormatter(v as number)}
              styles={{ content: { color: (ozet?.fatura_farki || 0) > 0 ? '#faad14' : 'inherit', fontWeight: 700, fontSize: '18px' } }}
            />
          </Card>
        </Col>
      </Row>

      {/* 4. Satır: Toplam Cari Ödeme, Birikmiş Teminatlar, Cari Bakiye */}
      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col xs={24} sm={8}>
          <Card variant="borderless" className="stat-card shadow-sm" size="small">
            <Statistic
              title="Toplam Cari Ödeme"
              value={ozet?.toplam_odeme || 0}
              prefix={<FallOutlined style={{ color: '#cf1322', marginRight: 8 }} />}
              suffix={<span style={{ fontSize: '12px', marginLeft: 4 }}>TL</span>}
              formatter={(v) => trMoneyFormatter(v as number)}
              styles={{ content: { color: '#cf1322', fontWeight: 700, fontSize: '18px' } }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card variant="borderless" className="stat-card shadow-sm" size="small">
            <Statistic
              title="Birikmiş Teminatlar"
              value={ozet?.birikmis_teminat || 0}
              prefix={<BankOutlined style={{ color: '#13c2c2', marginRight: 8 }} />}
              suffix={<span style={{ fontSize: '12px', marginLeft: 4 }}>TL</span>}
              formatter={(v) => trMoneyFormatter(v as number)}
              styles={{ content: { color: '#13c2c2', fontWeight: 700, fontSize: '18px' } }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card variant="borderless" className="stat-card shadow-sm" size="small">
            <Statistic
              title="Cari Bakiye"
              value={ozet?.cari_bakiye || 0}
              prefix={<BankOutlined style={{ color: (ozet?.cari_bakiye || 0) >= 0 ? '#1677ff' : '#cf1322', marginRight: 8 }} />}
              suffix={<span style={{ fontSize: '12px', marginLeft: 4 }}>TL</span>}
              formatter={(v) => trMoneyFormatter(v as number)}
              styles={{ content: { 
                color: (ozet?.cari_bakiye || 0) >= 0 ? '#1677ff' : '#cf1322',
                fontWeight: 700,
                fontSize: '18px'
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
              title="Bankalar Bakiye Toplamı"
              value={ozet?.banka_toplami || 0}
              prefix={<BankOutlined style={{ color: '#722ed1', marginRight: 8 }} />}
              suffix={<span style={{ fontSize: '12px', marginLeft: 4 }}>TL</span>}
              formatter={(v) => trMoneyFormatter(v as number)}
              styles={{ content: { color: '#722ed1', fontWeight: 700, fontSize: '18px' } }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card variant="borderless" className="stat-card shadow-sm" size="small">
            <Statistic
              title="Çekler"
              value={ozet?.cek_toplami || 0}
              prefix={<DollarOutlined style={{ color: '#eb2f96', marginRight: 8 }} />}
              suffix={<span style={{ fontSize: '12px', marginLeft: 4 }}>TL</span>}
              formatter={(v) => trMoneyFormatter(v as number)}
              styles={{ content: { color: '#eb2f96', fontWeight: 700, fontSize: '18px' } }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card variant="borderless" className="stat-card shadow-sm" size="small" style={{ background: '#f0f5ff' }}>
            <Statistic
              title="Ödemeler Sonrası Nakit"
              value={ozet?.odeme_sonrasi_nakit || 0}
              prefix={<RiseOutlined style={{ color: (ozet?.odeme_sonrasi_nakit || 0) >= 0 ? '#fa8c16' : '#cf1322', marginRight: 8 }} />}
              suffix={<span style={{ fontSize: '12px', marginLeft: 4 }}>TL</span>}
              formatter={(v) => trMoneyFormatter(v as number)}
              styles={{ content: { 
                color: (ozet?.odeme_sonrasi_nakit || 0) >= 0 ? '#fa8c16' : '#cf1322', 
                fontWeight: 700, 
                fontSize: '20px' 
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
              title="Kasa Nakit"
              value={ozet?.kasa_nakit ?? 0}
              prefix={<WalletOutlined style={{ color: '#fa8c16', marginRight: 8 }} />}
              suffix={<span style={{ fontSize: '12px', marginLeft: 4 }}>TL</span>}
              formatter={(v) => trMoneyFormatter(v as number)}
              styles={{ content: { color: '#fa8c16', fontWeight: 700, fontSize: '18px' } }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  )
}

