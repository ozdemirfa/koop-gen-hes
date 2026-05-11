import React, { useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Row, Col, Card, Statistic, Tag, Button, Space, Divider, Typography, Select } from 'antd'
import { CalendarOutlined, ProjectOutlined, ArrowLeftOutlined, EditOutlined, BarChartOutlined, HomeOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import api from '../../lib/api'
import { PageHeader } from '../../components/common/PageHeader'
import { ProjeIsKalemiTree } from '../../components/projeler/ProjeIsKalemiTree'
import { LoadingState } from '../../components/common/LoadingState'
import { EmptyState } from '../../components/common/EmptyState'
import { ErrorState } from '../../components/common/ErrorState'
import { usePageSettings } from '../../contexts/LayoutContext'
import { trMoneyFormatter } from '../../lib/format'

const { Title, Paragraph, Text } = Typography

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

export const ProjeDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [selectedYear, setSelectedYear] = useState<number>(dayjs().year())

  const { data: proje, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['proje', id, selectedYear],
    queryFn: async () => {
      const { data } = await api.get(`/projeler/${id}`, { params: { yil: selectedYear } })
      return data.data
    },
    enabled: !!id
  })

  const yearOptions = useMemo(() => {
    const current = dayjs().year()
    let start = current - 1
    let end = current + 1
    if (proje?.baslangic_tarihi) start = dayjs(proje.baslangic_tarihi).year()
    if (proje?.bitis_tarihi) end = dayjs(proje.bitis_tarihi).year()
    else if (proje?.baslangic_tarihi) end = start + 5
    if (start > end) end = start
    const opts: { label: string; value: number }[] = []
    for (let y = start; y <= end; y++) opts.push({ label: `${y}`, value: y })
    return opts
  }, [proje])

  const actions = useMemo(() => (
    <Space>
      <Select
        size="small"
        value={selectedYear}
        onChange={setSelectedYear}
        options={yearOptions}
        style={{ width: 90 }}
        title="Yıllık plan görüntüleme yılı"
      />
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
        icon={<EditOutlined />}
        onClick={() => navigate('/projeler')}
        style={{ background: 'white' }}
      >
        Projeler Listesinde Düzenle
      </Button>
    </Space>
  ), [id, navigate, selectedYear, yearOptions])

  usePageSettings(proje?.proje_adi || 'Proje Detayı', actions)

  if (isLoading) return <LoadingState fullHeight />
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />
  if (!proje) return (
    <EmptyState
      description="Bu proje bulunamadı veya silinmiş olabilir."
      action={<Button type="primary" onClick={() => navigate('/projeler')}>Projeler Listesine Dön</Button>}
    />
  )

  return (
    <div className="animate-in fade-in duration-500">
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={8}>
          <Card title="Proje Bilgileri" variant="borderless">
            <Space orientation="vertical" style={{ width: '100%' }}>
              <div>
                <Text type="secondary">Durum</Text>
                <div><Tag color={durumRenkleri[proje.durum]}>{durumEtiketleri[proje.durum]}</Tag></div>
              </div>
              <div>
                <Text type="secondary">Tarih Aralığı</Text>
                <div>
                  <CalendarOutlined /> {proje.baslangic_tarihi ? dayjs(proje.baslangic_tarihi).format('DD.MM.YYYY') : '?'} - {proje.bitis_tarihi ? dayjs(proje.bitis_tarihi).format('DD.MM.YYYY') : '?'}
                </div>
              </div>
              <Divider style={{ margin: '12px 0' }} />
              <Row gutter={16}>
                <Col span={12}>
                  <Statistic title="Blok Sayısı" value={proje.bloklar?.length || 0} />
                </Col>
                <Col span={12}>
                  <Statistic 
                    title="Toplam Daire" 
                    value={proje.bloklar?.reduce((acc: number, b: any) => acc + (b.toplam_daire || 0), 0) || 0} 
                  />
                </Col>
              </Row>
              <Divider style={{ margin: '12px 0' }} />
              <Statistic 
                title="Toplam Bütçe" 
                value={proje.toplam_butce || 0} 
                prefix="₺" 
                formatter={(v) => trMoneyFormatter(v as number)}
              />
            </Space>
          </Card>
          
          <Card title="Açıklama" variant="borderless" style={{ marginTop: 16 }}>
            <Paragraph>{proje.aciklama || 'Açıklama girilmemiş.'}</Paragraph>
          </Card>
        </Col>

        <Col xs={24} lg={16}>
          <ProjeIsKalemiTree projeId={id!} data={proje.proje_is_kalemleri || []} yil={selectedYear} />
        </Col>
      </Row>
    </div>
  )
}
