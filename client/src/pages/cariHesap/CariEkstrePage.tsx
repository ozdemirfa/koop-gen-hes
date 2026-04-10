import React, { useState } from 'react'
import { Card, Space, Select, DatePicker, Statistic, Row, Col, Tag } from 'antd'
import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import api from '../../lib/api'
import { PageHeader } from '../../components/common/PageHeader'
import { DataTable } from '../../components/common/DataTable'
import { MoneyDisplay } from '../../components/common/MoneyDisplay'

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

  const { data: hareketler, isLoading } = useQuery({
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
      width: 110,
      render: (d: string) => dayjs(d).format('DD.MM.YYYY'),
    },
    {
      title: 'Firma',
      key: 'firma',
      render: (_: any, r: CariHareket) => r.firmalar?.unvan || '-',
    },
    { title: 'Açıklama', dataIndex: 'aciklama', key: 'aciklama' },
    { title: 'Belge No', dataIndex: 'belge_no', key: 'belge_no', width: 120 },
    {
      title: 'Tip',
      dataIndex: 'hareket_tipi',
      key: 'hareket_tipi',
      width: 90,
      render: (t: string) => (
        <Tag color={t === 'borc' ? 'red' : 'green'}>{t === 'borc' ? 'Borç' : 'Alacak'}</Tag>
      ),
    },
    {
      title: 'Tutar',
      dataIndex: 'tutar',
      key: 'tutar',
      width: 130,
      align: 'right' as const,
      render: (v: number) => <MoneyDisplay amount={v} />,
    },
  ]

  return (
    <div>
      <PageHeader
        title="Genel Cari Ekstre"
        extra={
          <Space>
            <Select
              showSearch
              placeholder="Firma Filtresi"
              value={firmaId}
              onChange={setFirmaId}
              allowClear
              style={{ width: 250 }}
              optionFilterProp="children"
            >
              {firmalar?.map((f) => (
                <Select.Option key={f.id} value={f.id}>
                  {f.unvan}
                </Select.Option>
              ))}
            </Select>
            <RangePicker
              value={dates}
              onChange={(vals) => setDates(vals as any)}
              format="DD.MM.YYYY"
            />
          </Space>
        }
      />

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={8}>
          <Card bordered={false}>
            <Statistic
              title="Toplam Borç"
              value={totals.borc}
              precision={2}
              valueStyle={{ color: '#cf1322' }}
              suffix="TL"
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card bordered={false}>
            <Statistic
              title="Toplam Alacak"
              value={totals.alacak}
              precision={2}
              valueStyle={{ color: '#3f8600' }}
              suffix="TL"
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card bordered={false}>
            <Statistic
              title="Net Bakiye"
              value={totals.alacak - totals.borc}
              precision={2}
              valueStyle={{ color: totals.alacak - totals.borc >= 0 ? '#3f8600' : '#cf1322' }}
              suffix="TL"
            />
          </Card>
        </Col>
      </Row>

      <DataTable
        columns={columns}
        dataSource={hareketler}
        rowKey="id"
        loading={isLoading}
        pagination={false}
      />
    </div>
  )
}
