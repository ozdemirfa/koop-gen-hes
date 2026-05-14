import React, { useMemo } from 'react'
import { Button, Space, Tag } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import api from '../../lib/api'
import { DataTable } from '../../components/common/DataTable'
import { ErrorState } from '../../components/common/ErrorState'
import { MoneyDisplay } from '../../components/common/MoneyDisplay'
import { usePageSettings } from '../../contexts/LayoutContext'

interface BankaHareketi {
  id: string
  tarih: string
  tutar: number
  islem_tipi: 'gelir' | 'gider'
  aciklama?: string
  eslesti: boolean
  firma_id?: string
  banka_hesaplari?: { banka_adi: string }
  cari_hareketler?: { cari_hesaplar?: { firmalar?: { unvan: string } } } | Array<{ cari_hesaplar?: { firmalar?: { unvan: string } } }>
}

export const BankaHareketleriPage: React.FC = () => {
  const { id: bankaHesapId } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data: hesap } = useQuery({
    queryKey: ['banka-hesabi', bankaHesapId],
    queryFn: async () => {
      const { data } = await api.get('/banka/hesaplar')
      return data.data.find((h: any) => h.id === bankaHesapId)
    },
  })

  const { data: hareketler, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['banka-hareketleri', bankaHesapId],
    queryFn: async () => {
      const { data } = await api.get('/banka/hareketler', { params: { banka_hesap_id: bankaHesapId } })
      return data.data as BankaHareketi[]
    },
  })

  const actions = useMemo(() => (
    <Space size={4}>
      <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/banka-hesaplari')} size="small" />
    </Space>
  ), [navigate])

  usePageSettings(hesap ? `${hesap.banka_adi} - Hesap Hareketleri` : 'Banka Hareketleri', actions)

  const columns = [
    {
      title: 'Tarih',
      dataIndex: 'tarih',
      key: 'tarih',
      width: 110,
      render: (d: string) => dayjs(d).format('DD.MM.YYYY'),
    },
    {
      title: 'İlgili Firma',
      key: 'firma',
      render: (_: any, r: any) => {
        const cari = Array.isArray(r.cari_hareketler) ? r.cari_hareketler[0] : r.cari_hareketler
        return cari?.cari_hesaplar?.firmalar?.unvan || '-'
      }
    },
    { title: 'Açıklama', dataIndex: 'aciklama', key: 'aciklama' },
    {
      title: 'Tutar',
      dataIndex: 'tutar',
      key: 'tutar',
      align: 'right' as const,
      width: 130,
      render: (v: number, r: BankaHareketi) => (
        <span style={{ color: r.islem_tipi === 'gelir' ? '#3f8600' : '#cf1322', fontWeight: 'bold' }}>
          {r.islem_tipi === 'gelir' ? '+' : '-'}<MoneyDisplay amount={v} />
        </span>
      ),
    },
    {
      title: 'Durum',
      dataIndex: 'eslesti',
      key: 'eslesti',
      width: 110,
      render: (eslesti: boolean) => (
        <Tag color={eslesti ? 'blue' : 'default'}>{eslesti ? 'Eşleşti' : 'Eşleşmemiş'}</Tag>
      ),
    },
  ]

  return (
    <div>
      {isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : (
        <DataTable
          columns={columns}
          dataSource={hareketler}
          rowKey="id"
          loading={isLoading}
          pagination={{ pageSize: 20 }}
          emptyDescription="Hareketler ödeme/tahsilat kaydı ile otomatik oluşur"
          size="small"
        />
      )}
    </div>
  )
}
