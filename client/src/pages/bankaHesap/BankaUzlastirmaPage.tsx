import React, { useState } from 'react'
import { Card, Space, Button, Table, Modal, Tag, message, Select, Input } from 'antd'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircleOutlined, SearchOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import api from '../../lib/api'
import { PageHeader } from '../../components/common/PageHeader'
import { MoneyDisplay } from '../../components/common/MoneyDisplay'
import { DataTable } from '../../components/common/DataTable'

interface BankaHareketi {
  id: string
  tarih: string
  tutar: number
  islem_tipi: 'gelir' | 'gider'
  aciklama?: string
  banka_hesaplari?: { banka_adi: string }
  eslesti: boolean
}

interface CariHareket {
  id: string
  tarih: string
  tutar: number
  hareket_tipi: 'borc' | 'alacak'
  aciklama?: string
  firmalar?: { unvan: string }
}

export const BankaUzlastirmaPage: React.FC = () => {
  const queryClient = useQueryClient()
  const [selectedBankaHareket, setSelectedBankaHareket] = useState<BankaHareketi | null>(null)
  const [matchModalOpen, setMatchModalOpen] = useState(false)
  const [cariFilter, setCariFilter] = useState('')

  const { data: bankaHareketleri, isLoading: bankaLoading } = useQuery({
    queryKey: ['banka-hareketleri-uzlastirma'],
    queryFn: async () => {
      const { data } = await api.get('/banka-hesaplari/hareketler', { params: { eslesti: 'false' } })
      return data.data as BankaHareketi[]
    },
  })

  const { data: cariHareketler, isLoading: cariLoading } = useQuery({
    queryKey: ['cari-hareketler-match', cariFilter],
    queryFn: async () => {
      const { data } = await api.get('/cari-hareketler', { params: { search: cariFilter } })
      return data.data as CariHareket[]
    },
    enabled: matchModalOpen,
  })

  const esleMutation = useMutation({
    mutationFn: async ({ bankaId, cariId }: { bankaId: string; cariId: string }) => {
      await api.put(`/banka-hesaplari/hareketler/${bankaId}/esle`, { eslesen_cari_hareket_id: cariId })
    },
    onSuccess: () => {
      message.success('Eşleştirme yapıldı')
      queryClient.invalidateQueries({ queryKey: ['banka-hareketleri-uzlastirma'] })
      setMatchModalOpen(false)
      setSelectedBankaHareket(null)
    },
    onError: (err: any) => message.error(err.message || 'Hata oluştu'),
  })

  const bankaColumns = [
    {
      title: 'Tarih',
      dataIndex: 'tarih',
      key: 'tarih',
      width: 110,
      render: (d: string) => dayjs(d).format('DD.MM.YYYY'),
    },
    {
      title: 'Banka',
      key: 'banka',
      render: (_: any, r: BankaHareketi) => r.banka_hesaplari?.banka_adi || '-',
    },
    { title: 'Açıklama', dataIndex: 'aciklama', key: 'aciklama' },
    {
      title: 'Tutar',
      dataIndex: 'tutar',
      key: 'tutar',
      width: 130,
      render: (v: number, r: BankaHareketi) => (
        <span style={{ color: r.islem_tipi === 'gelir' ? '#3f8600' : '#cf1322' }}>
          <MoneyDisplay amount={v} />
        </span>
      ),
    },
    {
      title: 'İşlem',
      key: 'action',
      width: 100,
      render: (_: any, r: BankaHareketi) => (
        <Button
          type="primary"
          icon={<CheckCircleOutlined />}
          onClick={() => {
            setSelectedBankaHareket(r)
            setMatchModalOpen(true)
          }}
        >
          Eşleştir
        </Button>
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
    {
      title: 'Firma',
      key: 'firma',
      render: (_: any, r: CariHareket) => r.firmalar?.unvan || '-',
    },
    { title: 'Açıklama', dataIndex: 'aciklama', key: 'aciklama' },
    {
      title: 'Tutar',
      dataIndex: 'tutar',
      key: 'tutar',
      width: 130,
      render: (v: number) => <MoneyDisplay amount={v} />,
    },
    {
      title: 'İşlem',
      key: 'action',
      width: 80,
      render: (_: any, r: CariHareket) => (
        <Button
          type="link"
          onClick={() => {
            if (selectedBankaHareket) {
              esleMutation.mutate({ bankaId: selectedBankaHareket.id, cariId: r.id })
            }
          }}
        >
          Seç
        </Button>
      ),
    },
  ]

  return (
    <div>
      <PageHeader title="Banka Uzlaştırma" subtitle="Eşleşmemiş banka hareketlerini cari hareketlerle eşleştirin" />

      <Card title="Eşleşmemiş Banka Hareketleri" styles={{ body: { padding: 0 } }}>
        <DataTable
          columns={bankaColumns}
          dataSource={bankaHareketleri}
          rowKey="id"
          loading={bankaLoading}
          pagination={false}
        />
      </Card>

      <Modal
        title="Cari Hareket Eşleştir"
        open={matchModalOpen}
        onCancel={() => setMatchModalOpen(false)}
        footer={null}
        width={800}
      >
        <div style={{ marginBottom: 16 }}>
          <p>
            <b>Seçilen Banka Hareketi:</b> {selectedBankaHareket?.aciklama} (
            <MoneyDisplay amount={selectedBankaHareket?.tutar || 0} />)
          </p>
          <Input
            placeholder="Firma veya açıklama ile ara..."
            prefix={<SearchOutlined />}
            value={cariFilter}
            onChange={(e) => setCariFilter(e.target.value)}
          />
        </div>
        <Table
          columns={cariColumns}
          dataSource={cariHareketler}
          rowKey="id"
          loading={cariLoading}
          size="small"
          pagination={{ pageSize: 5 }}
        />
      </Modal>
    </div>
  )
}
