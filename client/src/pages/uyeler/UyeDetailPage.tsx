import React from 'react'
import { Card, Descriptions, Tabs, Tag } from 'antd'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import api from '../../lib/api'

import { PageHeader } from '../../components/common/PageHeader'
import { DataTable } from '../../components/common/DataTable'
import { MoneyDisplay } from '../../components/common/MoneyDisplay'

interface AidatOdeme {
  id: string
  aidat_tanimlari?: { yil: number; ay: number }
  tutar: number
  gecikme_faizi: number
  toplam_tutar: number
  odenen_tutar: number
  son_odeme_tarihi: string
  durum: string
}

export const UyeDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()

  // Üye detaylarını getir
  const { data: uye, isLoading: uyeLoading } = useQuery({
    queryKey: ['uye', id],
    queryFn: async () => {
      const { data } = await api.get(`/uyeler/${id}`)
      return data.data
    },
  })

  // Aidatları getir
  const { data: aidatlar, isLoading: aidatLoading } = useQuery({
    queryKey: ['uye-aidatlar', id],
    queryFn: async () => {
      const { data } = await api.get(`/uyeler/${id}/aidatlar`)
      return data.data
    },
  })

  const durumRenk: Record<string, string> = {
    aktif: 'green',
    pasif: 'default',
    ihrac: 'red',
    istifa: 'orange',
  }
  
  const aidatDurumRenk: Record<string, string> = {
    bekliyor: 'blue',
    odendi: 'green',
    gecikti: 'red',
    iptal: 'default',
  }

  const aidatColumns = [
    {
      title: 'Dönem',
      key: 'donem',
      render: (_: unknown, r: AidatOdeme) => 
        r.aidat_tanimlari ? `${r.aidat_tanimlari.ay}/${r.aidat_tanimlari.yil}` : '-',
    },
    {
      title: 'Son Ödeme Tarihi',
      dataIndex: 'son_odeme_tarihi',
      key: 'son_odeme_tarihi',
      render: (d: string) => d ? dayjs(d).format('DD.MM.YYYY') : '-',
    },
    {
      title: 'Tutar',
      dataIndex: 'tutar',
      key: 'tutar',
      render: (v: number) => <MoneyDisplay amount={v} />
    },
    {
      title: 'Faiz',
      dataIndex: 'gecikme_faizi',
      key: 'gecikme_faizi',
      render: (v: number) => <MoneyDisplay amount={v} colored />
    },
    {
      title: 'Toplam',
      dataIndex: 'toplam_tutar',
      key: 'toplam_tutar',
      render: (v: number) => <MoneyDisplay amount={v} />
    },
    {
      title: 'Ödenen',
      dataIndex: 'odenen_tutar',
      key: 'odenen_tutar',
      render: (v: number) => <MoneyDisplay amount={v} colored />
    },
    {
      title: 'Durum',
      dataIndex: 'durum',
      key: 'durum',
      render: (d: string) => <Tag color={aidatDurumRenk[d] || 'default'}>{d.toUpperCase()}</Tag>,
    },
  ]

  return (
    <div>
      <PageHeader 
        title={uye ? `${uye.ad} ${uye.soyad} Detayları` : "Üye Detayı"} 
        showBack 
        backPath="/uyeler"
      />

      <Card loading={uyeLoading} style={{ marginBottom: 24 }}>
        {uye && (
          <Descriptions bordered column={{ xxl: 3, xl: 3, lg: 3, md: 2, sm: 1, xs: 1 }}>
            <Descriptions.Item label="Üye No">{uye.uye_no}</Descriptions.Item>
            <Descriptions.Item label="TC Kimlik">{uye.tc_kimlik || '-'}</Descriptions.Item>
            <Descriptions.Item label="Durum">
              <Tag color={durumRenk[uye.durum]}>{uye.durum.toUpperCase()}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Blok / Daire">
              {uye.bloklar?.blok_adi || '-'} / {uye.daire_no || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="Hisse Oranı">{uye.hisse_orani}</Descriptions.Item>
            <Descriptions.Item label="Üyelik Tarihi">
              {uye.uyelik_tarihi ? dayjs(uye.uyelik_tarihi).format('DD.MM.YYYY') : '-'}
            </Descriptions.Item>
            <Descriptions.Item label="Telefon">{uye.telefon || '-'}</Descriptions.Item>
            <Descriptions.Item label="E-Posta">{uye.email || '-'}</Descriptions.Item>
            <Descriptions.Item label="Adres" span={3}>{uye.adres || '-'}</Descriptions.Item>
            <Descriptions.Item label="Notlar" span={3}>{uye.notlar || '-'}</Descriptions.Item>
          </Descriptions>
        )}
      </Card>

      <Card title="Üye Geçmişi ve Kayıtlar" styles={{ body: { padding: 0 } }}>
        <Tabs
          defaultActiveKey="1"
          style={{ padding: '0 24px 24px' }}
          items={[
            {
              key: '1',
              label: 'Aidat Hesapları',
              children: (
                <DataTable
                  columns={aidatColumns}
                  dataSource={aidatlar}
                  rowKey="id"
                  loading={aidatLoading}
                  hideCard
                  size="small"
                />
              ),
            },
            {
              key: '2',
              label: 'Ödemeler / Makbuzlar',
              children: <p>Bu modül henüz geliştirilmemiştir.</p>, // İleride eklenebilir
            },
          ]}
        />
      </Card>
    </div>
  )
}
