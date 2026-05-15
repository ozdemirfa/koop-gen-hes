import React, { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Row, Col, Card, Statistic, Tag, Button, Space, Divider, Typography, Collapse } from 'antd'
import { CalendarOutlined, ArrowLeftOutlined, BarChartOutlined, HomeOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import api from '../../lib/api'
import { ProjeIsKalemiTree } from '../../components/projeler/ProjeIsKalemiTree'
import { LoadingState } from '../../components/common/LoadingState'
import { EmptyState } from '../../components/common/EmptyState'
import { ErrorState } from '../../components/common/ErrorState'
import { usePageSettings } from '../../contexts/LayoutContext'
import { trMoneyFormatter } from '../../lib/format'

const { Paragraph, Text } = Typography

const durumRenkleri: Record<string, string> = {
  planli: 'blue',
  devam_ediyor: 'orange',
  tamamlandi: 'green',
  iptal: 'red',
}

const durumEtiketleri: Record<string, string> = {
  planli: 'Planlı',
  devam_ediyor: 'Devam Ediyor',
  tamamlandi: 'Tamamlandı',
  iptal: 'İptal',
}

// localStorage anahtarı: proje detayında bilgi panelinin son aç/kapa durumu
const INFO_COLLAPSE_LS_KEY = 'projeDetay.infoCollapsed.open'

export const ProjeDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [selectedYear] = useState<number>(dayjs().year())

  // Bilgi paneli aç/kapa durumu — varsayılan açık.
  // localStorage'tan ilk render'da okunuyor; "true"/"false" string'i değer olarak tutuluyor.
  const [infoOpen, setInfoOpen] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem(INFO_COLLAPSE_LS_KEY)
      if (raw === 'false') return false
      return true // varsayılan açık
    } catch {
      return true
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(INFO_COLLAPSE_LS_KEY, infoOpen ? 'true' : 'false')
    } catch {
      /* localStorage erişilemezse sessizce geç */
    }
  }, [infoOpen])

  const { data: proje, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['proje', id, selectedYear],
    queryFn: async () => {
      const { data } = await api.get(`/projeler/${id}`, { params: { yil: selectedYear } })
      return data.data
    },
    enabled: !!id
  })

  const actions = useMemo(() => (
    <Space>
      <Button
        icon={<HomeOutlined />}
        onClick={() => navigate(`/projeler/${id}/serefiye`)}
        style={{ background: 'white' }}
      >
        Şerefiye Tablosu
      </Button>
      <Button
        icon={<BarChartOutlined />}
        onClick={() => navigate(`/projeler/${id}/yillik-plan/${selectedYear}`)}
        style={{ background: 'white' }}
      >
        Yıllık Plan
      </Button>
      <Button
        icon={<ArrowLeftOutlined />}
        onClick={() => navigate('/projeler')}
        style={{ background: 'white' }}
      >
        Geri
      </Button>
    </Space>
  ), [id, navigate, selectedYear])

  usePageSettings(proje?.proje_adi || 'Proje Detayı', actions)

  // Multi-year sütun listesi: backend yillik_plan_yillari döndürüyor.
  // Boş/undefined ise ProjeIsKalemiTree eski tek-yıl davranışına düşer.
  const planYillari: number[] | undefined = useMemo(() => {
    const yillar = (proje as any)?.yillik_plan_yillari
    if (!Array.isArray(yillar) || yillar.length === 0) return undefined
    return [...yillar].map((y) => Number(y)).filter((y) => Number.isFinite(y)).sort((a, b) => a - b)
  }, [proje])

  if (isLoading) return <LoadingState fullHeight />
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />
  if (!proje) return (
    <EmptyState
      description="Bu proje bulunamadı veya silinmiş olabilir."
      action={<Button type="primary" onClick={() => navigate('/projeler')}>Projeler Listesine Dön</Button>}
    />
  )

  // Proje bilgileri içeriği — Collapse içine konuyor.
  // Önceden 8/16 grid'inde sol kolonda yer alıyordu; redesign sonrası tam genişlik
  // collapsible bir panel oldu. İçeride kompakt grid kullanarak yatay alanı verimli kullanıyoruz.
  const projeBilgileriContent = (
    <Row gutter={[16, 16]}>
      <Col xs={24} md={8}>
        <Space orientation="vertical" style={{ width: '100%' }}>
          <div>
            <Text type="secondary">Durum</Text>
            <div>
              <Tag color={durumRenkleri[proje.durum]}>{durumEtiketleri[proje.durum]}</Tag>
            </div>
          </div>
          <div>
            <Text type="secondary">Tarih Aralığı</Text>
            <div>
              <CalendarOutlined />{' '}
              {proje.baslangic_tarihi ? dayjs(proje.baslangic_tarihi).format('DD.MM.YYYY') : '?'} -{' '}
              {proje.bitis_tarihi ? dayjs(proje.bitis_tarihi).format('DD.MM.YYYY') : '?'}
            </div>
          </div>
        </Space>
      </Col>
      <Col xs={24} md={8}>
        <Row gutter={16}>
          <Col span={12}>
            <Statistic title="Blok Sayısı" value={proje.bloklar?.length || 0} />
          </Col>
          <Col span={12}>
            <Statistic
              title="Toplam Daire"
              value={
                proje.bloklar?.reduce(
                  (acc: number, b: any) => acc + (b.toplam_daire || 0),
                  0
                ) || 0
              }
            />
          </Col>
        </Row>
      </Col>
      <Col xs={24} md={8}>
        <Statistic
          title="Toplam Bütçe"
          value={proje.toplam_butce || 0}
          prefix="₺"
          formatter={(v) => trMoneyFormatter(v as number)}
        />
      </Col>
      <Col span={24}>
        <Divider style={{ margin: '4px 0 12px' }} />
        <Text type="secondary">Açıklama</Text>
        <Paragraph style={{ marginBottom: 0, marginTop: 4 }}>
          {proje.aciklama || 'Açıklama girilmemiş.'}
        </Paragraph>
      </Col>
    </Row>
  )

  return (
    <div className="animate-in fade-in duration-500">
      {/* 1) Proje bilgileri — collapsible, üstte tam genişlik */}
      <Collapse
        activeKey={infoOpen ? ['info'] : []}
        onChange={(keys) => setInfoOpen((Array.isArray(keys) ? keys : [keys]).includes('info'))}
        style={{ marginBottom: 16 }}
        items={[
          {
            key: 'info',
            label: 'Proje Bilgileri',
            children: projeBilgileriContent,
          },
        ]}
      />

      {/* 2) İş kalemleri tablosu — tam genişlik, multi-year sütunları */}
      <Card variant="borderless" styles={{ body: { padding: 0 } }} className="shadow-sm">
        <ProjeIsKalemiTree
          projeId={id!}
          data={proje.proje_is_kalemleri || []}
          yil={selectedYear}
          planYillari={planYillari}
        />
      </Card>
    </div>
  )
}
