import React from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Row, Col, Card, Statistic, Tag, Button, Space, Divider, Typography } from 'antd'
import { CalendarOutlined, ProjectOutlined, ArrowLeftOutlined, EditOutlined, BarChartOutlined, HomeOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import api from '../../lib/api'
import { PageHeader } from '../../components/common/PageHeader'
import { ProjeIsKalemiTree } from '../../components/projeler/ProjeIsKalemiTree'
import { LoadingState } from '../../components/common/LoadingState'
import { EmptyState } from '../../components/common/EmptyState'
import { ErrorState } from '../../components/common/ErrorState'
import { usePageSettings } from '../../contexts/LayoutContext'

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

  const { data: proje, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['proje', id],
    queryFn: async () => {
      const { data } = await api.get(`/projeler/${id}`)
      return data.data
    },
    enabled: !!id
  })

  usePageSettings({
    title: proje?.proje_adi || 'Proje Detayı',
    actions: null
  })

  if (isLoading) return <LoadingState fullHeight />
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />
  if (!proje) return <EmptyState description="Proje bulunamadı" />

  return (
    <div>
      <PageHeader
        title={proje.proje_adi}
        onBack={() => navigate('/projeler')}
        extra={
          <Space>
            <Button 
              icon={<HomeOutlined />} 
              onClick={() => navigate(`/projeler/${id}/serefiye`)}
            >
              Şerefiye Tablosu
            </Button>
            <Button 
              icon={<BarChartOutlined />} 
              onClick={() => navigate(`/projeler/${id}/yillik-plan/${dayjs().year()}`)}
            >
              Yıllık Plan
            </Button>
            <Button 
              type="primary" 
              icon={<EditOutlined />}
              onClick={() => navigate('/projeler')}
            >
              Projeler Listesinde Düzenle
            </Button>
          </Space>
        }
      />

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={8}>
          <Card title="Proje Bilgileri">
            <Space direction="vertical" style={{ width: '100%' }}>
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
              <div>
                <Text type="secondary">Daire Kodlama</Text>
                <div>{proje.daire_kodlama_sistemi || 'Belirtilmemiş'}</div>
              </div>
              <Divider style={{ margin: '12px 0' }} />
              <Statistic 
                title="Toplam Bütçe" 
                value={proje.toplam_butce || 0} 
                prefix="₺" 
                groupSeparator="." 
                decimalSeparator=","
              />
            </Space>
          </Card>
          
          <Card title="Açıklama" style={{ marginTop: 16 }}>
            <Paragraph>{proje.aciklama || 'Açıklama girilmemiş.'}</Paragraph>
          </Card>
        </Col>

        <Col xs={24} lg={16}>
          <ProjeIsKalemiTree projeId={id!} data={proje.is_kalemleri_agac || []} />
        </Col>
      </Row>
    </div>
  )
}
