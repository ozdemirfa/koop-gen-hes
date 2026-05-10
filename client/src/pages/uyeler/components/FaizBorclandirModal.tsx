import React, { useState, useMemo } from 'react'
import { Modal, Table, Button, message, Space, Typography, Tag } from 'antd'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import api from '../../../lib/api'
import { getErrorMessage } from '../../../lib/apiError'
import { MoneyDisplay } from '../../../components/common/MoneyDisplay'
import { trMoneyFormatter } from '../../../lib/format'

const { Text } = Typography

interface Aidat {
  id: string
  yil: number
  ay: number
  kalan_borc: number
  gecikme_faizi?: number
  son_odeme_tarihi: string
  durum: string
}

interface Props {
  open: boolean
  onCancel: () => void
  uyeId: string
  aidatlar: Aidat[]
}

export const FaizBorclandirModal: React.FC<Props> = ({ open, onCancel, uyeId, aidatlar }) => {
  const queryClient = useQueryClient()
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])

  // Sadece faiz hesaplanabilecek (gecikmiş veya vadesi geçmiş) aidatları filtrele
  const filteredAidatlar = useMemo(() => {
    return aidatlar.filter(a => {
      const isPastDue = dayjs(a.son_odeme_tarihi).isBefore(dayjs(), 'day')
      return a.durum === 'gecikti' || (a.durum === 'bekliyor' && isPastDue)
    })
  }, [aidatlar])

  const selectedAidatlar = useMemo(() => {
    return filteredAidatlar.filter(a => selectedRowKeys.includes(a.id))
  }, [filteredAidatlar, selectedRowKeys])

  const toplamFaiz = selectedAidatlar.reduce((sum, a) => sum + (a.gecikme_faizi || 0), 0)

  const mutation = useMutation({
    mutationFn: async (aidatIds: string[]) => {
      const { data } = await api.post('/aidatlar/bulk-charge-interest', { aidat_ids: aidatIds })
      return data
    },
    onSuccess: (res) => {
      message.success(`${res.count} adet aidat için faiz borçlandırıldı.`)
      queryClient.invalidateQueries({ queryKey: ['uye', uyeId] })
      queryClient.invalidateQueries({ queryKey: ['uye-aidatlar', uyeId] })
      queryClient.invalidateQueries({ queryKey: ['uye-odemeler', uyeId] })
      setSelectedRowKeys([])
      onCancel()
    },
    onError: (err) => message.error(getErrorMessage(err))
  })

  const columns = [
    {
      title: 'Dönem',
      key: 'donem',
      render: (_: any, r: Aidat) => `${r.ay}/${r.yil}`,
    },
    {
      title: 'Vade',
      dataIndex: 'son_odeme_tarihi',
      key: 'vade',
      render: (d: string) => dayjs(d).format('DD.MM.YYYY'),
    },
    {
      title: 'Kalan Ana Para',
      dataIndex: 'kalan_borc',
      key: 'kalan',
      render: (v: number) => <MoneyDisplay amount={v} />,
    },
    {
      title: 'Hesaplanan Faiz',
      dataIndex: 'gecikme_faizi',
      key: 'faiz',
      render: (v: number) => <MoneyDisplay amount={v} colored />,
    },
    {
      title: 'Durum',
      dataIndex: 'durum',
      key: 'durum',
      render: (d: string) => (
        <Tag color={d === 'gecikti' ? 'red' : 'orange'}>
          {d === 'gecikti' ? 'GECİKTİ' : 'VADESİ GEÇTİ'}
        </Tag>
      ),
    },
  ]

  return (
    <Modal
      title="Üye Faiz Borç İşle"
      open={open}
      onCancel={onCancel}
      width="min(800px, 95vw)"
      footer={[
        <div key="footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <Text strong>Seçilen Toplam Faiz: </Text>
            <Text type="danger" style={{ fontSize: 18 }}>{trMoneyFormatter(toplamFaiz)}</Text>
          </div>
          <Space>
            <Button onClick={onCancel}>Vazgeç</Button>
            <Button 
              type="primary" 
              danger 
              disabled={selectedRowKeys.length === 0}
              loading={mutation.isPending}
              onClick={() => mutation.mutate(selectedRowKeys as string[])}
            >
              Faizleri Borçlandır
            </Button>
          </Space>
        </div>
      ]}
    >
      <div style={{ marginBottom: 16 }}>
        <Text type="secondary">
          Aşağıda gecikmiş veya vadesi geçmiş aidatlar listelenmektedir. 
          Seçtiğiniz aidatların güncel gecikme faizleri üyenin cari hesabına borç olarak işlenecektir.
        </Text>
      </div>
      <Table
        dataSource={filteredAidatlar}
        columns={columns}
        rowKey="id"
        pagination={false}
        rowSelection={{
          selectedRowKeys,
          onChange: setSelectedRowKeys,
        }}
        scroll={{ y: 400 }}
      />
    </Modal>
  )
}
