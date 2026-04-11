import React, { useState } from 'react'
import { Card, Space, Button, Table, Modal, Tag, message, Select, Input, Row, Col, Divider, Typography, Statistic } from 'antd'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircleOutlined, SearchOutlined, SwapOutlined, SyncOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import api from '../../lib/api'
import { PageHeader } from '../../components/common/PageHeader'
import { MoneyDisplay } from '../../components/common/MoneyDisplay'

const { Text, Title } = Typography

interface BankaHareketi {
  id: string
  tarih: string
  tutar: number
  islem_tipi: 'gelir' | 'gider'
  aciklama?: string
  banka_hesaplari?: { banka_adi: string }
  eslesti: boolean
  eslesen_cari_hareket_id?: string
}

interface CariHareket {
  id: string
  tarih: string
  tutar: number
  hareket_tipi: 'borc' | 'alacak'
  aciklama?: string
  firmalar?: { unvan: string }
  banka_hareketleri?: any[]
}

export const BankaUzlastirmaPage: React.FC = () => {
  const queryClient = useQueryClient()
  const [selectedBankaId, setSelectedBankaId] = useState<string | null>(null)
  const [selectedCariId, setSelectedCariId] = useState<string | null>(null)
  
  const [bankaSearch, setBankaSearch] = useState('')
  const [cariSearch, setCariSearch] = useState('')

  const { data: bankaHareketleri, isLoading: bankaLoading } = useQuery({
    queryKey: ['banka-hareketleri-uzlastirma'],
    queryFn: async () => {
      const { data } = await api.get('/banka/hareketler', { params: { eslesti: 'false', limit: 1000 } })
      return data.data as BankaHareketi[]
    },
  })

  const { data: cariHareketler, isLoading: cariLoading } = useQuery({
    queryKey: ['cari-hareketler-match-all'],
    queryFn: async () => {
      const { data } = await api.get('/cari-hareketler', { params: { eslesmemis: 'true' } })
      return data.data as CariHareket[]
    },
  })

  const esleMutation = useMutation({
    mutationFn: async ({ bankaId, cariId }: { bankaId: string; cariId: string }) => {
      await api.put(`/banka/hareketler/${bankaId}/esle`, { eslesen_cari_hareket_id: cariId })
    },
    onSuccess: () => {
      message.success('Eşleştirme yapıldı')
      queryClient.invalidateQueries({ queryKey: ['banka-hareketleri-uzlastirma'] })
      queryClient.invalidateQueries({ queryKey: ['cari-hareketler-match-all'] })
      setSelectedBankaId(null)
      setSelectedCariId(null)
    },
    onError: (err: any) => message.error(err.message || 'Hata oluştu'),
  })

  const selectedBanka = bankaHareketleri?.find(b => b.id === selectedBankaId)
  const selectedCari = cariHareketler?.find(c => c.id === selectedCariId)

  const bankaColumns = [
    {
      title: 'Tarih',
      dataIndex: 'tarih',
      key: 'tarih',
      width: 100,
      render: (d: string) => dayjs(d).format('DD.MM.YYYY'),
    },
    {
      title: 'Açıklama / Banka',
      key: 'info',
      render: (_: any, r: BankaHareketi) => (
        <div>
          <div style={{ fontWeight: 'bold' }}>{r.aciklama}</div>
          <small>{r.banka_hesaplari?.banka_adi}</small>
        </div>
      )
    },
    {
      title: 'Tutar',
      dataIndex: 'tutar',
      key: 'tutar',
      align: 'right' as const,
      width: 120,
      render: (v: number, r: BankaHareketi) => (
        <span style={{ color: r.islem_tipi === 'gelir' ? '#3f8600' : '#cf1322', fontWeight: 'bold' }}>
          <MoneyDisplay amount={v} />
        </span>
      ),
    },
  ]

  const cariColumns = [
    {
      title: 'Tarih',
      dataIndex: 'tarih',
      key: 'tarih',
      width: 100,
      render: (d: string) => dayjs(d).format('DD.MM.YYYY'),
    },
    {
      title: 'Firma / Açıklama',
      key: 'info',
      render: (_: any, r: CariHareket) => (
        <div>
          <div style={{ fontWeight: 'bold' }}>{r.firmalar?.unvan || '-'}</div>
          <small>{r.aciklama}</small>
        </div>
      )
    },
    {
      title: 'Tutar',
      dataIndex: 'tutar',
      key: 'tutar',
      align: 'right' as const,
      width: 120,
      render: (v: number, r: CariHareket) => (
        <span style={{ color: r.hareket_tipi === 'alacak' ? '#3f8600' : '#cf1322', fontWeight: 'bold' }}>
          <MoneyDisplay amount={v} />
        </span>
      ),
    },
  ]

  const filteredBanka = bankaHareketleri?.filter(b => 
    b.aciklama?.toLowerCase().includes(bankaSearch.toLowerCase()) || 
    b.banka_hesaplari?.banka_adi?.toLowerCase().includes(bankaSearch.toLowerCase())
  )

  const filteredCari = cariHareketler?.filter(c => 
    c.aciklama?.toLowerCase().includes(cariSearch.toLowerCase()) || 
    c.firmalar?.unvan?.toLowerCase().includes(cariSearch.toLowerCase())
  )

  return (
    <div>
      <PageHeader title="Banka Uzlaştırma" subtitle="Banka hareketlerini firma ödemeleriyle eşleştirin" />

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={24}>
          <Card size="small">
            <Row align="middle" justify="center" gutter={32}>
              <Col>
                <Statistic title="Seçili Banka" value={selectedBanka?.tutar || 0} prefix="₺" precision={2} />
              </Col>
              <Col>
                <div style={{ fontSize: 24, color: '#1890ff' }}><SwapOutlined /></div>
              </Col>
              <Col>
                <Statistic title="Seçili Cari" value={selectedCari?.tutar || 0} prefix="₺" precision={2} />
              </Col>
              <Col style={{ marginLeft: 32 }}>
                <Button 
                  type="primary" 
                  size="large" 
                  icon={<CheckCircleOutlined />} 
                  disabled={!selectedBankaId || !selectedCariId}
                  loading={esleMutation.isPending}
                  onClick={() => esleMutation.mutate({ bankaId: selectedBankaId!, cariId: selectedCariId! })}
                >
                  Eşleştirmeyi Onayla
                </Button>
              </Col>
            </Row>
          </Card>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={12}>
          <Card 
            title="Eşleşmemiş Banka Hareketleri" 
            size="small"
            extra={<Input size="small" placeholder="Ara..." prefix={<SearchOutlined />} onChange={e => setBankaSearch(e.target.value)} />}
          >
            <Table
              columns={bankaColumns}
              dataSource={filteredBanka}
              rowKey="id"
              loading={bankaLoading}
              size="small"
              pagination={{ pageSize: 10 }}
              rowSelection={{
                type: 'radio',
                selectedRowKeys: selectedBankaId ? [selectedBankaId] : [],
                onChange: (keys) => setSelectedBankaId(keys[0] as string)
              }}
              onRow={(record) => ({
                onClick: () => setSelectedBankaId(record.id),
                style: { cursor: 'pointer', backgroundColor: selectedCari && Math.abs(selectedCari.tutar - record.tutar) < 0.01 ? '#f6ffed' : 'inherit' }
              })}
            />
          </Card>
        </Col>
        
        <Col span={12}>
          <Card 
            title="Eşleşmemiş Cari Hareketler" 
            size="small"
            extra={<Input size="small" placeholder="Ara..." prefix={<SearchOutlined />} onChange={e => setCariSearch(e.target.value)} />}
          >
            <Table
              columns={cariColumns}
              dataSource={filteredCari}
              rowKey="id"
              loading={cariLoading}
              size="small"
              pagination={{ pageSize: 10 }}
              rowSelection={{
                type: 'radio',
                selectedRowKeys: selectedCariId ? [selectedCariId] : [],
                onChange: (keys) => setSelectedCariId(keys[0] as string)
              }}
              onRow={(record) => ({
                onClick: () => setSelectedCariId(record.id),
                style: { cursor: 'pointer', backgroundColor: selectedBanka && Math.abs(selectedBanka.tutar - record.tutar) < 0.01 ? '#f6ffed' : 'inherit' }
              })}
            />
          </Card>
        </Col>
      </Row>
    </div>
  )
}

