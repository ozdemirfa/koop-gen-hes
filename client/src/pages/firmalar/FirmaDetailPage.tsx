import React from 'react'
import { Card, Descriptions, Tabs, Tag, Table, Button, Space } from 'antd'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { PlusOutlined, FileTextOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import api from '../../lib/api'
import { PageHeader } from '../../components/common/PageHeader'
import { MoneyDisplay } from '../../components/common/MoneyDisplay'

interface Sozlesme {
  id: string
  sozlesme_no?: string
  konu: string
  toplam_tutar: number
  baslangic_tarihi?: string
  bitis_tarihi?: string
  teminat_orani: number
  stopaj_orani: number
}

interface CariHareket {
  id: string
  hareket_tipi: 'borc' | 'alacak'
  tutar: number
  tarih: string
  aciklama?: string
  belge_no?: string
  bakiye: number
}

export const FirmaDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data: firma, isLoading } = useQuery({
    queryKey: ['firma', id],
    queryFn: async () => {
      const { data } = await api.get(`/firmalar/${id}`)
      return data.data
    },
  })

  const { data: sozlesmeler, isLoading: sozlesmeLoading } = useQuery({
    queryKey: ['sozlesmeler', { firma_id: id }],
    queryFn: async () => {
      const { data } = await api.get('/sozlesmeler', { params: { firma_id: id } })
      return data.data
    },
  })

  const { data: cariData, isLoading: cariLoading } = useQuery({
    queryKey: ['cari-ekstre', id],
    queryFn: async () => {
      const { data } = await api.get(`/firmalar/${id}/cari-ekstre`)
      return data.data
    },
  })

  const sozlesmeColumns = [
    { title: 'Sözleşme No', dataIndex: 'sozlesme_no', key: 'sozlesme_no', width: 130 },
    { title: 'Konu', dataIndex: 'konu', key: 'konu' },
    {
      title: 'Toplam Tutar',
      dataIndex: 'toplam_tutar',
      key: 'toplam_tutar',
      render: (v: number) => <MoneyDisplay amount={v} />,
    },
    {
      title: 'Teminat',
      dataIndex: 'teminat_orani',
      key: 'teminat_orani',
      width: 90,
      render: (v: number) => `%${v}`,
    },
    {
      title: 'Stopaj',
      dataIndex: 'stopaj_orani',
      key: 'stopaj_orani',
      width: 90,
      render: (v: number) => `%${v}`,
    },
    {
      title: 'Tarih',
      key: 'tarih',
      render: (_: unknown, r: Sozlesme) => {
        const start = r.baslangic_tarihi ? dayjs(r.baslangic_tarihi).format('DD.MM.YYYY') : '-'
        const end = r.bitis_tarihi ? dayjs(r.bitis_tarihi).format('DD.MM.YYYY') : '-'
        return `${start} - ${end}`
      },
    },
    {
      title: 'İşlem',
      key: 'action',
      width: 80,
      render: (_: unknown, r: Sozlesme) => (
        <Button
          icon={<FileTextOutlined />}
          type="text"
          onClick={() => navigate(`/sozlesmeler/${r.id}`)}
        />
      ),
    },
  ]

  const cariColumns = [
    {
      title: 'Tarih',
      dataIndex: 'tarih',
      key: 'tarih',
      width: 110,
      render: (d: string) => dayjs(d).format('DD.MM.YYYY'),
    },
    { title: 'Açıklama', dataIndex: 'aciklama', key: 'aciklama' },
    { title: 'Belge No', dataIndex: 'belge_no', key: 'belge_no', width: 120 },
    {
      title: 'Tip',
      dataIndex: 'hareket_tipi',
      key: 'hareket_tipi',
      width: 90,
      render: (t: string) => (
        <Tag color={t === 'borc' ? 'red' : 'green'}>
          {t === 'borc' ? 'Borç' : 'Alacak'}
        </Tag>
      ),
    },
    {
      title: 'Tutar',
      dataIndex: 'tutar',
      key: 'tutar',
      width: 130,
      render: (v: number) => <MoneyDisplay amount={v} />,
    },
    {
      title: 'Bakiye',
      dataIndex: 'bakiye',
      key: 'bakiye',
      width: 130,
      render: (v: number) => <MoneyDisplay amount={v} colored />,
    },
  ]

  return (
    <div>
      <PageHeader
        title={firma ? firma.unvan : 'Firma Detayı'}
        showBack
        backPath="/firmalar"
      />

      <Card loading={isLoading} style={{ marginBottom: 24 }}>
        {firma && (
          <Descriptions bordered column={{ xxl: 3, xl: 3, lg: 3, md: 2, sm: 1, xs: 1 }}>
            <Descriptions.Item label="Tip">
              <Tag color={firma.firma_tipi === 'yuklenici' ? 'blue' : 'purple'}>
                {firma.firma_tipi === 'yuklenici' ? 'Yüklenici' : 'Tedarikçi'}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Durum">
              <Tag color={firma.aktif ? 'green' : 'default'}>{firma.aktif ? 'Aktif' : 'Pasif'}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Vergi No">{firma.vergi_no || '-'}</Descriptions.Item>
            <Descriptions.Item label="Vergi Dairesi">{firma.vergi_dairesi || '-'}</Descriptions.Item>
            <Descriptions.Item label="Telefon">{firma.telefon || '-'}</Descriptions.Item>
            <Descriptions.Item label="E-posta">{firma.email || '-'}</Descriptions.Item>
            <Descriptions.Item label="Yetkili Kişi">{firma.yetkili_kisi || '-'}</Descriptions.Item>
            <Descriptions.Item label="IBAN">{firma.iban || '-'}</Descriptions.Item>
            <Descriptions.Item label="Adres" span={3}>{firma.adres || '-'}</Descriptions.Item>
            {firma.notlar && <Descriptions.Item label="Notlar" span={3}>{firma.notlar}</Descriptions.Item>}
          </Descriptions>
        )}
      </Card>

      <Card styles={{ body: { padding: 0 } }}>
        <Tabs
          style={{ padding: '0 24px 24px' }}
          items={[
            {
              key: 'sozlesmeler',
              label: `Sözleşmeler (${sozlesmeler?.length || 0})`,
              children: (
                <>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      onClick={() => navigate(`/sozlesmeler/yeni?firma_id=${id}`)}
                    >
                      Yeni Sözleşme
                    </Button>
                  </div>
                  <Table
                    columns={sozlesmeColumns}
                    dataSource={sozlesmeler}
                    rowKey="id"
                    loading={sozlesmeLoading}
                    pagination={false}
                    size="small"
                  />
                </>
              ),
            },
            {
              key: 'cari',
              label: `Cari Ekstre${cariData ? ` (Bakiye: ${cariData.guncel_bakiye?.toLocaleString('tr-TR')} TL)` : ''}`,
              children: (
                <Table
                  columns={cariColumns}
                  dataSource={cariData?.hareketler}
                  rowKey="id"
                  loading={cariLoading}
                  pagination={false}
                  size="small"
                />
              ),
            },
          ]}
        />
      </Card>
    </div>
  )
}
