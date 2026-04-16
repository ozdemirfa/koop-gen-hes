import React, { useState } from 'react'
import { Card, Space, Select, DatePicker, Statistic, Row, Col, Tag, Button, message } from 'antd'
import { DownloadOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import api from '../../lib/api'
import { DataTable } from '../../components/common/DataTable'
import { ErrorState } from '../../components/common/ErrorState'
import { MoneyDisplay } from '../../components/common/MoneyDisplay'
import { formatMoney } from '../../lib/format'
import { usePageSettings } from '../../contexts/LayoutContext'

const { RangePicker } = DatePicker

interface CariHareket {
  id: string
  firma_id: string
  hareket_tipi: 'borc' | 'alacak'
  tutar: number
  tarih: string
  aciklama?: string
  belge_no?: string
  firmalar?: { unvan: string }
}

export const CariEkstrePage: React.FC = () => {
  const [dates, setDates] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null]>([
    dayjs().startOf('year'),
    dayjs().endOf('year'),
  ])
  const [firmaId, setFirmaId] = useState<string | undefined>(undefined)

  const { data: firmalar } = useQuery({
    queryKey: ['firmalar-select'],
    queryFn: async () => {
      const { data } = await api.get('/firmalar', { params: { aktif: 'true', limit: 500 } })
      return data.data as { id: string; unvan: string }[]
    },
  })

  const { data: hareketler, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['cari-ekstre-genel', dates, firmaId],
    queryFn: async () => {
      const params: any = {}
      if (dates?.[0]) params.baslangic_tarihi = dates[0].format('YYYY-MM-DD')
      if (dates?.[1]) params.bitis_tarihi = dates[1].format('YYYY-MM-DD')
      if (firmaId) params.firma_id = firmaId
      const { data } = await api.get('/cari-hareketler', { params })
      return data.data as CariHareket[]
    },
  })

  // Birikmiş Teminat Sorgusu
  const { data: teminatData } = useQuery({
    queryKey: ['birikmis-teminat', firmaId],
    queryFn: async () => {
      if (!firmaId) return 0
      const { data } = await api.get('/hakedisler', { params: { firma_id: firmaId, durum: 'onaylandi', limit: 1000 } })
      const list = data.data as any[]
      return list.reduce((sum, h) => sum + Number(h.teminat_kesintisi || 0), 0)
    },
    enabled: !!firmaId
  })

  const exportToCSV = () => {
    if (!hareketler || hareketler.length === 0) {
      message.warning('Dışa aktarılacak veri bulunamadı')
      return
    }
    
    const headers = ['Tarih', 'Firma', 'Açıklama', 'Belge No', 'Tip', 'Tutar']
    const rows = hareketler.map(h => [
      dayjs(h.tarih).format('DD.MM.YYYY'),
      h.firmalar?.unvan || '',
      h.aciklama || '',
      h.belge_no || '',
      h.hareket_tipi === 'borc' ? 'Borç' : 'Alacak',
      formatMoney(h.tutar).replace(/\./g, '')
    ])

    const csvContent = "\uFEFF" + [headers, ...rows].map(e => e.join(";")).join("\n")
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.setAttribute("href", url)
    link.setAttribute("download", `cari_ekstre_${dayjs().format('YYYYMMDD')}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  usePageSettings({
    title: 'Cari Ekstre',
    actions: (
      <Space size="small">
        <Button size="small" icon={<DownloadOutlined />} onClick={exportToCSV}>CSV İndir</Button>
        <Select
          size="small"
          showSearch
          placeholder="Firma Filtresi"
          value={firmaId}
          onChange={setFirmaId}
          allowClear
          style={{ width: 220 }}
          optionFilterProp="children"
        >
          {firmalar?.map((f) => (
            <Select.Option key={f.id} value={f.id}>
              {f.unvan}
            </Select.Option>
          ))}
        </Select>
        <RangePicker
          size="small"
          value={dates}
          onChange={(vals) => setDates(vals as any)}
          format="DD.MM.YYYY"
          style={{ width: 240 }}
        />
      </Space>
    )
  })

  const totals = hareketler?.reduce(
    (acc, curr) => {
      if (curr.hareket_tipi === 'borc') acc.borc += Number(curr.tutar)
      else acc.alacak += Number(curr.tutar)
      return acc
    },
    { borc: 0, alacak: 0 }
  ) || { borc: 0, alacak: 0 }

  const columns = [
    {
      title: 'Tarih',
      dataIndex: 'tarih',
      key: 'tarih',
      width: 100,
      render: (d: string) => dayjs(d).format('DD.MM.YYYY'),
    },
    {
      title: 'Firma',
      key: 'firma',
      render: (_: any, r: CariHareket) => r.firmalar?.unvan || '-',
    },
    { title: 'Açıklama', dataIndex: 'aciklama', key: 'aciklama' },
    { title: 'Belge No', dataIndex: 'belge_no', key: 'belge_no', width: 110 },
    {
      title: 'Tip',
      dataIndex: 'hareket_tipi',
      key: 'hareket_tipi',
      width: 80,
      render: (t: string) => (
        <Tag color={t === 'borc' ? 'red' : 'green'} style={{ fontSize: '11px' }}>{t === 'borc' ? 'Borç' : 'Alacak'}</Tag>
      ),
    },
    {
      title: 'Tutar',
      dataIndex: 'tutar',
      key: 'tutar',
      width: 120,
      align: 'right' as const,
      render: (v: number) => <MoneyDisplay amount={v} />,
    },
  ]

  return (
    <div>
      <Row gutter={12} style={{ marginBottom: 12 }}>
        <Col span={6}>
          <Card bordered={false} className="stat-card" size="small">
            <Statistic
              title="Toplam Borç"
              value={totals.borc}
              precision={2}
              valueStyle={{ color: '#cf1322', fontSize: '18px' }}
              suffix="TL"
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card bordered={false} className="stat-card" size="small">
            <Statistic
              title="Toplam Alacak"
              value={totals.alacak}
              precision={2}
              valueStyle={{ color: '#3f8600', fontSize: '18px' }}
              suffix="TL"
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card bordered={false} className="stat-card" size="small">
            <Statistic
              title="Net Bakiye"
              value={Math.abs(totals.alacak - totals.borc)}
              precision={2}
              valueStyle={{ color: totals.alacak - totals.borc >= 0 ? '#3f8600' : '#cf1322', fontSize: '18px' }}
              suffix={totals.alacak - totals.borc >= 0 ? 'TL (A)' : 'TL (B)'}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card bordered={false} className="stat-card" size="small">
            <Statistic
              title="Birikmiş Teminat"
              value={teminatData || 0}
              precision={2}
              valueStyle={{ color: '#1890ff', fontSize: '18px' }}
              suffix="TL"
            />
          </Card>
        </Col>
      </Row>

      {isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : (
        <DataTable
          columns={columns}
          dataSource={hareketler}
          rowKey="id"
          loading={isLoading}
          pagination={false}
          size="small"
          emptyDescription="Seçilen dönem için cari hareket bulunamadı"
        />
      )}
    </div>
  )
}
