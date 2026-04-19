import React, { useState, useMemo } from 'react'
import { Card, Space, Button, Table, Modal, Tag, message, Select, Input, Row, Col, Divider, Typography, Statistic, Alert } from 'antd'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircleOutlined, SearchOutlined, SwapOutlined, SyncOutlined, InfoCircleOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import api from '../../lib/api'
import { MoneyDisplay } from '../../components/common/MoneyDisplay'
import { usePageSettings } from '../../contexts/LayoutContext'

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

  const { data: bankaHareketleri, isLoading: bankaLoading, refetch: refetchBanka } = useQuery({
    queryKey: ['banka-hareketleri-uzlastirma'],
    queryFn: async () => {
      const { data } = await api.get('/banka/hareketler', { params: { eslesti: 'false', limit: 1000 } })
      return data.data as BankaHareketi[]
    },
  })

  const { data: cariHareketler, isLoading: cariLoading, refetch: refetchCari } = useQuery({
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

  const actions = useMemo(() => (
    <Space size="small">
      <Button 
        size="small" 
        icon={<SyncOutlined />} 
        onClick={() => { refetchBanka(); refetchCari() }}
      >
        Yenile
      </Button>
      <Button 
        type="primary" 
        size="small" 
        icon={<CheckCircleOutlined />} 
        disabled={!selectedBankaId || !selectedCariId}
        loading={esleMutation.isPending}
        onClick={() => esleMutation.mutate({ bankaId: selectedBankaId!, cariId: selectedCariId! })}
      >
        Eşleştirmeyi Onayla
      </Button>
    </Space>
  ), [selectedBankaId, selectedCariId, esleMutation.isPending, refetchBanka, refetchCari])

  usePageSettings({
    title: 'Banka Uzlaştırma',
    actions
  })

  const bankaColumns = [
    {
      title: 'Tarih',
      dataIndex: 'tarih',
      key: 'tarih',
      width: 90,
      render: (d: string) => dayjs(d).format('DD.MM.YYYY'),
    },
    {
      title: 'Açıklama / Banka',
      key: 'info',
      render: (_: any, r: BankaHareketi) => (
        <div style={{ lineHeight: '1.2' }}>
          <div style={{ fontWeight: 500, fontSize: '12px' }}>{r.aciklama}</div>
          <Text type="secondary" style={{ fontSize: '11px' }}>{r.banka_hesaplari?.banka_adi}</Text>
        </div>
      )
    },
    {
      title: 'Tutar',
      dataIndex: 'tutar',
      key: 'tutar',
      align: 'right' as const,
      width: 110,
      render: (v: number, r: BankaHareketi) => (
        <span style={{ color: r.islem_tipi === 'gelir' ? '#3f8600' : '#cf1322', fontWeight: 600, fontSize: '12px' }}>
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
      width: 90,
      render: (d: string) => dayjs(d).format('DD.MM.YYYY'),
    },
    {
      title: 'Firma / Açıklama',
      key: 'info',
      render: (_: any, r: CariHareket) => (
        <div style={{ lineHeight: '1.2' }}>
          <div style={{ fontWeight: 500, fontSize: '12px' }}>{r.firmalar?.unvan || '-'}</div>
          <Text type="secondary" style={{ fontSize: '11px' }}>{r.aciklama}</Text>
        </div>
      )
    },
    {
      title: 'Tutar',
      dataIndex: 'tutar',
      key: 'tutar',
      align: 'right' as const,
      width: 110,
      render: (v: number, r: CariHareket) => (
        <span style={{ color: r.hareket_tipi === 'alacak' ? '#3f8600' : '#cf1322', fontWeight: 600, fontSize: '12px' }}>
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
      <Alert
        message="Açıklama / Amaç"
        description="Bu sayfa, banka hesap hareketleri ile firma cari işlemlerini (ödemeler, hakedişler vb.) eşleştirerek banka mutabakatı yapmanızı sağlar."
        type="info"
        showIcon
        icon={<InfoCircleOutlined />}
        style={{ marginBottom: 16 }}
        closable
      />

      <Row gutter={12} style={{ marginBottom: 12 }}>
        <Col span={24}>
          <Card size="small">
            <Row align="middle" justify="center" gutter={24}>
              <Col>
                <Statistic 
                  title="Seçili Banka" 
                  value={selectedBanka?.tutar || 0} 
                  prefix="₺" 
                  precision={2} 
                  valueStyle={{ fontSize: '16px', fontWeight: 600 }}
                />
              </Col>
              <Col>
                <div style={{ fontSize: 20, color: '#1890ff' }}><SwapOutlined /></div>
              </Col>
              <Col>
                <Statistic 
                  title="Seçili Cari" 
                  value={selectedCari?.tutar || 0} 
                  prefix="₺" 
                  precision={2} 
                  valueStyle={{ fontSize: '16px', fontWeight: 600 }}
                />
              </Col>
            </Row>
          </Card>
        </Col>
      </Row>

      <Row gutter={12}>
        <Col span={12}>
          <Card 
            title={<span style={{ fontSize: '14px' }}>Eşleşmemiş Banka Hareketleri</span>}
            size="small"
            extra={<Input size="small" style={{ width: 150 }} placeholder="Ara..." prefix={<SearchOutlined />} onChange={e => setBankaSearch(e.target.value)} />}
          >
            <Table
              columns={bankaColumns}
              dataSource={filteredBanka}
              rowKey="id"
              loading={bankaLoading}
              size="small"
              pagination={{ pageSize: 12, size: 'small' }}
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
            title={<span style={{ fontSize: '14px' }}>Eşleşmemiş Cari Hareketler</span>}
            size="small"
            extra={<Input size="small" style={{ width: 150 }} placeholder="Ara..." prefix={<SearchOutlined />} onChange={e => setCariSearch(e.target.value)} />}
          >
            <Table
              columns={cariColumns}
              dataSource={filteredCari}
              rowKey="id"
              loading={cariLoading}
              size="small"
              pagination={{ pageSize: 12, size: 'small' }}
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
