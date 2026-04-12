import React from 'react'
import { Card, Table, Button, Space, Typography, Statistic } from 'antd'
import { FilePdfOutlined, UserOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import api from '../../lib/api'
import { PageHeader } from '../../components/common/PageHeader'
import { MoneyDisplay } from '../../components/common/MoneyDisplay'
import { LoadingState } from '../../components/common/LoadingState'
import { ErrorState } from '../../components/common/ErrorState'

const { Text } = Typography

export const UyeBorcRaporPage: React.FC = () => {
  const navigate = useNavigate()

  const { data: list, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['uye-borc-listesi'],
    queryFn: async () => {
      const { data } = await api.get('/raporlar/uye-borc-listesi')
      return data.data
    }
  })

  const columns = [
    { title: 'Üye No', dataIndex: 'uye_no', key: 'uye_no' },
    { title: 'Ad Soyad', key: 'ad_soyad', render: (_: any, r: any) => `${r.ad} ${r.soyad}` },
    { title: 'Ödenmemiş Aidat Sayısı', dataIndex: 'odenmemis_aidat_sayisi', key: 'sayi', align: 'center' as const },
    { title: 'Toplam Borç', dataIndex: 'toplam_borc', key: 'borc', align: 'right' as const, render: (v: number) => <MoneyDisplay amount={v} /> },
    {
      title: 'İşlem',
      key: 'action',
      render: (_: any, record: any) => (
        <Button size="small" icon={<UserOutlined />} onClick={() => navigate(`/uyeler/${record.id}`)}>
          Üye Detayı
        </Button>
      )
    }
  ]

  if (isLoading) return <LoadingState fullHeight />
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />

  const genelToplamBorc = list?.reduce((s: number, r: any) => s + r.toplam_borc, 0) || 0

  return (
    <div>
      <PageHeader
        title="Üye Borç Listesi"
        extra={<Button icon={<FilePdfOutlined />} disabled>PDF İndir</Button>}
      />

      <Card style={{ marginBottom: 16 }}>
        <Space size="large">
          <Statistic title="Borçlu Üye Sayısı" value={list?.length || 0} />
          <Statistic title="Genel Toplam Borç" value={genelToplamBorc} prefix="₺" precision={2} />
        </Space>
      </Card>

      <Card>
        <Table
          dataSource={list || []}
          columns={columns}
          rowKey="uye_no"
        />
      </Card>
    </div>
  )
}
