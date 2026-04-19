import React, { useState } from 'react'
import { Card, Descriptions, Tabs, Tag, Row, Col, Statistic, Button, Modal, Form, Input, InputNumber, DatePicker, message, Space, Typography, Select, App } from 'antd'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { DollarOutlined, HistoryOutlined, UserOutlined, PlusOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import api from '../../lib/api'

import { PageHeader } from '../../components/common/PageHeader'
import { DataTable } from '../../components/common/DataTable'
import { MoneyDisplay } from '../../components/common/MoneyDisplay'

const { Text } = Typography

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
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [odemeModalOpen, setOdemeModalOpen] = useState(false)
  const [form] = Form.useForm()
  const { message: messageApi } = App.useApp()

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
      return data.data as AidatOdeme[]
    },
  })

  // Tüm ödemeleri getir
  const { data: odemeler, isLoading: odemeLoading } = useQuery({
    queryKey: ['uye-odemeler', id],
    queryFn: async () => {
      const allPayments: any[] = []
      const { data } = await api.get(`/aidatlar`, { params: { uye_id: id, limit: 1000 } })
      const list = data.data as any[]
      
      list.forEach(aidat => {
        if (aidat.aidat_odemeleri) {
          aidat.aidat_odemeleri.forEach((o: any) => {
            allPayments.push({
              ...o,
              donem: aidat.aidat_tanimlari ? `${aidat.aidat_tanimlari.ay}/${aidat.aidat_tanimlari.yil}` : '-'
            })
          })
        }
      })
      return allPayments.sort((a, b) => dayjs(b.odeme_tarihi).unix() - dayjs(a.odeme_tarihi).unix())
    },
  })

  const bulkOdemeMutation = useMutation({
    mutationFn: async (values: any) => {
      const payload = {
        ...values,
        odeme_tarihi: values.odeme_tarihi.format('YYYY-MM-DD')
      }
      return await api.post(`/uyeler/${id}/toplu-odeme`, payload)
    },
    onSuccess: (res) => {
      messageApi.success(`Ödeme alındı. ${res.data.kapatilan_kalemler.length} adet aidat kalemi işlendi.`)
      queryClient.invalidateQueries({ queryKey: ['uye', id] })
      queryClient.invalidateQueries({ queryKey: ['uye-aidatlar', id] })
      queryClient.invalidateQueries({ queryKey: ['uye-odemeler', id] })
      setOdemeModalOpen(false)
      form.resetFields()
    },
    onError: (err: any) => messageApi.error(err.error || err.message || 'Hata oluştu')
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
      title: 'Vade',
      dataIndex: 'son_odeme_tarihi',
      key: 'son_odeme_tarihi',
      render: (d: string) => d ? dayjs(d).format('DD.MM.YYYY') : '-',
    },
    {
      title: 'Borç',
      dataIndex: 'tutar',
      key: 'tutar',
      render: (v: number) => <MoneyDisplay amount={v} />
    },
    {
      title: 'Faiz',
      dataIndex: 'gecikme_faizi',
      key: 'gecikme_faizi',
      render: (v: number) => v > 0 ? <MoneyDisplay amount={v} colored /> : '-',
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
      render: (v: number) => v > 0 ? <MoneyDisplay amount={v} colored /> : '-',
    },
    {
      title: 'Durum',
      dataIndex: 'durum',
      key: 'durum',
      render: (d: string) => <Tag color={aidatDurumRenk[d] || 'default'}>{d.toUpperCase()}</Tag>,
    },
  ]

  const odemeColumns = [
    { title: 'Tarih', dataIndex: 'odeme_tarihi', key: 'tarih', render: (d: string) => dayjs(d).format('DD.MM.YYYY') },
    { title: 'Dönem', dataIndex: 'donem', key: 'donem' },
    { title: 'Tutar', dataIndex: 'tutar', key: 'tutar', render: (v: number) => <MoneyDisplay amount={v} colored /> },
    { title: 'Yöntem', dataIndex: 'odeme_yontemi', key: 'yontem', render: (v: string) => <Tag>{v.toUpperCase()}</Tag> },
    { title: 'Makbuz No', dataIndex: 'makbuz_no', key: 'makbuz' },
    { title: 'Açıklama', dataIndex: 'aciklama', key: 'aciklama' },
  ]

  // Finansal özet hesapla
  const toplamBorc = aidatlar?.reduce((sum, a) => sum + Number(a.tutar) + Number(a.gecikme_faizi || 0), 0) || 0
  const toplamOdenen = aidatlar?.reduce((sum, a) => sum + Number(a.odenen_tutar || 0), 0) || 0
  const kalanBakiye = toplamBorc - toplamOdenen

  const blokAdi = uye?.serefiye_tablosu?.bloklar?.blok_adi || '-'
  const daireNo = uye?.serefiye_tablosu?.daire_no || '-'

  return (
    <div>
      <PageHeader 
        title={uye ? `${uye.ad} ${uye.soyad}` : "Üye Detayı"} 
        subtitle={uye ? `Üye No: ${uye.uye_no} | ${blokAdi} Blok / Daire ${daireNo}` : ""}
        onBack={() => navigate('/uyeler')}
        extra={
          <Button type="primary" size="large" icon={<PlusOutlined />} onClick={() => setOdemeModalOpen(true)}>
            Yeni Ödeme Al
          </Button>
        }
      />

      <Row gutter={[24, 24]} style={{ marginBottom: 32 }}>
        <Col xs={24} sm={8}>
          <Card className="stat-card">
            <Statistic 
              title="Toplam Tahakkuk" 
              value={toplamBorc} 
              prefix="₺" 
              precision={2} 
              styles={{ content: { fontWeight: 700 } }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card className="stat-card">
            <Statistic 
              title="Toplam Ödeme" 
              value={toplamOdenen} 
              prefix="₺" 
              precision={2} 
              styles={{ content: { color: 'var(--success)', fontWeight: 700 } }} 
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card className="stat-card">
            <Statistic 
              title="Güncel Borç" 
              value={kalanBakiye} 
              prefix="₺" 
              precision={2} 
              styles={{ content: { 
                color: kalanBakiye > 0 ? 'var(--error)' : 'var(--success)',
                fontWeight: 700 
              } }} 
            />
          </Card>
        </Col>
      </Row>

      <Card 
        styles={{ body: { padding: 0 } }}
        style={{ overflow: 'hidden' }}
      >
        <Tabs
          defaultActiveKey="1"
          type="line"
          size="large"
          style={{ padding: '0 24px 24px' }}
          items={[
            {
              key: '1',
              label: <Space><DollarOutlined />Aidat Hesapları</Space>,
              children: (
                <div style={{ paddingTop: 16 }}>
                  <DataTable
                    columns={aidatColumns}
                    dataSource={aidatlar}
                    rowKey="id"
                    loading={aidatLoading}
                    hideCard
                    pagination={false}
                  />
                </div>
              ),
            },
            {
              key: '2',
              label: <Space><HistoryOutlined />Ödemeler / Makbuzlar</Space>,
              children: (
                <div style={{ paddingTop: 16 }}>
                  <DataTable
                    columns={odemeColumns}
                    dataSource={odemeler}
                    rowKey="id"
                    loading={odemeLoading}
                    hideCard
                  />
                </div>
              ),
            },
            {
              key: '3',
              label: <Space><UserOutlined />Profil Bilgileri</Space>,
              children: (
                <div style={{ paddingTop: 24 }}>
                  {uye && (
                    <Descriptions 
                      bordered 
                      column={{ xxl: 3, xl: 3, lg: 2, md: 2, sm: 1, xs: 1 }}
                      labelStyle={{ background: '#f8fafc', fontWeight: 600, width: '150px' }}
                    >
                      <Descriptions.Item label="Üye No">{uye.uye_no}</Descriptions.Item>
                      <Descriptions.Item label="TC Kimlik">{uye.tc_kimlik || '-'}</Descriptions.Item>
                      <Descriptions.Item label="Durum">
                        <Tag color={durumRenk[uye.durum]}>{uye.durum.toUpperCase()}</Tag>
                      </Descriptions.Item>
                      <Descriptions.Item label="Blok / Daire">
                        {blokAdi} / {daireNo}
                      </Descriptions.Item>
                      <Descriptions.Item label="Şerefiye Oranı">
                        {uye.serefiye_tablosu?.serefiye_orani || '-'}
                      </Descriptions.Item>
                      <Descriptions.Item label="Üyelik Tarihi">
                        {uye.uyelik_tarihi ? dayjs(uye.uyelik_tarihi).format('DD.MM.YYYY') : '-'}
                      </Descriptions.Item>
                      <Descriptions.Item label="Telefon">{uye.telefon || '-'}</Descriptions.Item>
                      <Descriptions.Item label="E-Posta">{uye.email || '-'}</Descriptions.Item>
                      <Descriptions.Item label="Adres" span={3}>{uye.adres || '-'}</Descriptions.Item>
                      <Descriptions.Item label="Notlar" span={3}>{uye.notlar || '-'}</Descriptions.Item>
                    </Descriptions>
                  )}
                </div>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        title="Toplu Ödeme Al"
        open={odemeModalOpen}
        onCancel={() => setOdemeModalOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={bulkOdemeMutation.isPending}
      >
        <div style={{ marginBottom: 16 }}>
          <Text type="secondary">Gireceğiniz tutar, üyenin en eski borcundan başlanarak sırasıyla kapatılacaktır.</Text>
        </div>
        <Form form={form} layout="vertical" onFinish={(v) => bulkOdemeMutation.mutate(v)} initialValues={{ odeme_tarihi: dayjs(), odeme_yontemi: 'nakit' }}>
          <Form.Item name="tutar" label="Ödeme Tutarı (TL)" rules={[{ required: true, message: 'Tutar zorunlu' }]}>
            <InputNumber min={0.01} style={{ width: '100%' }} placeholder="Örn: 5000" />
          </Form.Item>
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="odeme_tarihi" label="Ödeme Tarihi" rules={[{ required: true }]} style={{ flex: 1 }}>
              <DatePicker size="small" style={{ width: '100%' }} format="DD.MM.YYYY" />
            </Form.Item>
            <Form.Item name="odeme_yontemi" label="Yöntem" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Select>
                <Select.Option value="nakit">Nakit</Select.Option>
                <Select.Option value="havale">Havale</Select.Option>
                <Select.Option value="eft">EFT</Select.Option>
                <Select.Option value="kredi_karti">Kredi Kartı</Select.Option>
              </Select>
            </Form.Item>
          </div>
          <Form.Item name="makbuz_no" label="Makbuz No">
            <Input placeholder="İsteğe bağlı" />
          </Form.Item>
          <Form.Item name="aciklama" label="Açıklama">
            <Input.TextArea rows={2} placeholder="İsteğe bağlı" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
