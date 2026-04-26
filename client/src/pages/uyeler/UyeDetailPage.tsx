import React, { useState } from 'react'
import { Card, Descriptions, Tabs, Tag, Row, Col, Statistic, Button, Modal, Form, Input, InputNumber, DatePicker, message, Space, Typography, Select, App, Popconfirm } from 'antd'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { DollarOutlined, HistoryOutlined, UserOutlined, PlusOutlined, AuditOutlined, RollbackOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import api from '../../lib/api'

import { PageHeader } from '../../components/common/PageHeader'
import { DataTable } from '../../components/common/DataTable'
import { MoneyDisplay } from '../../components/common/MoneyDisplay'

import { trNumberFormatter, trNumberParser, trMoneyFormatter } from '../../lib/format'

const { Text } = Typography

interface AidatOdeme {
  id: string
  yil: number
  ay: number
  baz_tutar: number
  toplam_faiz: number
  toplam_tahakkuk: number
  toplam_odenen: number
  kalan_borc: number
  son_odeme_tarihi: string
  durum: string
  toplam_borc?: number
  toplam_tutar?: number
  gecikme_faizi?: number
  dinamik_odenen_tutar?: number
  odenen_tutar?: number
}

export const UyeDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [odemeModalOpen, setOdemeModalOpen] = useState(false)
  const [form] = Form.useForm()
  const { message: messageApi } = App.useApp()

  // Undo Match Mutation
  const undoMatchMutation = useMutation({
    mutationFn: async (movementId: string) => {
      const { data } = await api.post(`/cari-hareketler/${movementId}/undo-closure`)
      return data
    },
    onSuccess: () => {
      messageApi.success('Eşleşme başarıyla kaldırıldı')
      queryClient.invalidateQueries({ queryKey: ['uye', id] })
      queryClient.invalidateQueries({ queryKey: ['uye-aidatlar', id] })
      queryClient.invalidateQueries({ queryKey: ['uye-odemeler', id] })
    },
    onError: (err: any) => messageApi.error(err.message || 'Hata oluştu')
  })

  // Üye detaylarını getir
  const { data: uye, isLoading: uyeLoading } = useQuery({
    queryKey: ['uye', id],
    queryFn: async () => {
      const { data } = await api.get(`/uyeler/${id}`)
      return data.data
    },
  })

  // FIFO Eşleştirme Mutation
  const matchMutation = useMutation({
    mutationFn: async () => {
      return await api.post(`/uyeler/${id}/match-payments`, null, { 
        params: { proje_id: uye?.proje_id } 
      })
    },
    onSuccess: (res: any) => {
      const count = res.data?.matched_count || 0
      messageApi.success(`${count} adet borç-ödeme kaydı FIFO kuralı ile eşleştirildi.`)
      queryClient.invalidateQueries({ queryKey: ['uye', id] })
      queryClient.invalidateQueries({ queryKey: ['uye-aidatlar', id] })
      queryClient.invalidateQueries({ queryKey: ['uye-odemeler', id] })
    },
    onError: (err: any) => messageApi.error(err.error || err.message || 'Eşleştirme hatası')
  })

  // Aidatları getir
  const { data: aidatlar, isLoading: aidatLoading } = useQuery({
    queryKey: ['uye-aidatlar', id],
    queryFn: async () => {
      const { data } = await api.get(`/aidatlar`, { params: { uye_id: id } })
      return data.data as AidatOdeme[]
    },
  })

  // Tüm ödemeleri getir
  const { data: odemeler, isLoading: odemeLoading } = useQuery({
    queryKey: ['uye-odemeler', id],
    queryFn: async () => {
      const { data } = await api.get(`/cari-hareketler`, { 
        params: { 
          uye_id: id, 
          islem_turu: 'gelen_odeme',
          limit: 1000 
        } 
      })
      return (data.data as any[]).map(o => ({
        ...o,
        odeme_tarihi: o.tarih,
        tutar: o.borc, // Proje perspektifi: Gelen ödeme BORC kolonundadır
        odeme_yontemi: o.odeme_yontemi || o.odeme_turu || 'nakit',
      }))
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
      render: (_: unknown, r: AidatOdeme) => `${r.ay}/${r.yil}`,
    },
    {
      title: 'Vade',
      dataIndex: 'son_odeme_tarihi',
      key: 'son_odeme_tarihi',
      render: (d: string) => d ? dayjs(d).format('DD.MM.YYYY') : '-',
    },
    {
      title: 'Aidat',
      dataIndex: 'baz_tutar',
      key: 'baz_tutar',
      render: (v: number) => <MoneyDisplay amount={v} />
    },
    {
      title: 'Faiz',
      dataIndex: 'toplam_faiz',
      key: 'toplam_faiz',
      render: (v: number) => v > 0 ? <MoneyDisplay amount={v} colored /> : '-',
    },
    {
      title: 'Tahakkuk',
      dataIndex: 'toplam_tahakkuk',
      key: 'toplam_tahakkuk',
      render: (v: number) => <MoneyDisplay amount={v} />
    },
    {
      title: 'Ödenen',
      dataIndex: 'toplam_odenen',
      key: 'toplam_odenen',
      render: (v: number) => v > 0 ? <MoneyDisplay amount={v} colored /> : '-',
    },
    {
      title: 'Kalan',
      dataIndex: 'kalan_borc',
      key: 'kalan_borc',
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
    { title: 'Açıklama', dataIndex: 'aciklama', key: 'aciklama' },
    { title: 'Tutar', dataIndex: 'tutar', key: 'tutar', render: (v: number) => <MoneyDisplay amount={v} colored /> },
    { title: 'Yöntem', dataIndex: 'odeme_yontemi', key: 'yontem', render: (v: string) => <Tag>{v.toUpperCase()}</Tag> },
    { title: 'Makbuz No', dataIndex: 'makbuz_no', key: 'makbuz' },
    {
      title: 'İşlem',
      key: 'action',
      width: 80,
      render: (_: any, r: any) => {
        const isMatched = !!r.kaynak_id;
        if (!isMatched) return null;

        return (
          <Popconfirm
            title="Eşleşmeyi Kaldır"
            description="Bu ödemenin aidat ile olan eşleşmesi kaldırılacaktır. Emin misiniz?"
            onConfirm={() => undoMatchMutation.mutate(r.id)}
            okText="Evet, Kaldır"
            cancelText="Vazgeç"
          >
            <Button 
              type="text" 
              size="small" 
              danger 
              icon={<RollbackOutlined />} 
              loading={undoMatchMutation.isPending && undoMatchMutation.variables === r.id}
              title="Eşleşmeyi Geri Al"
            />
          </Popconfirm>
        );
      }
    }
  ]

  // Finansal özet hesapla
  const toplamTahakkuk = aidatlar?.reduce((sum, a) => sum + Number(a.toplam_tahakkuk || a.toplam_borc || a.toplam_tutar || 0), 0) || 0
  const toplamGecikmeFaizi = aidatlar?.reduce((sum, a) => sum + Number(a.toplam_faiz || a.gecikme_faizi || 0), 0) || 0
  const toplamOdenen = aidatlar?.reduce((sum, a) => sum + Number(a.toplam_odenen || a.dinamik_odenen_tutar || a.odenen_tutar || 0), 0) || 0
  
  // Geciken Borç: Tüm kalemlerdeki kalan bakiye
  const toplamKalan = aidatlar?.reduce((sum, a) => sum + Number(a.kalan_borc || (Number(a.toplam_tahakkuk || a.toplam_borc || 0) - Number(a.toplam_odenen || a.dinamik_odenen_tutar || 0))), 0) || 0

  const blokAdi = uye?.serefiye_tablosu?.bloklar?.blok_adi || '-'
  const daireNo = uye?.serefiye_tablosu?.daire_no || '-'

  return (
    <div>
      <PageHeader 
        title={uye ? `${uye.ad} ${uye.soyad}` : "Üye Detayı"} 
        subtitle={uye ? `Üye No: ${uye.uye_no} | Daire Kod: ${daireNo}` : ""}
        onBack={() => navigate('/uyeler')}
        extra={
          <Space>
            <Button 
              icon={<AuditOutlined />} 
              onClick={() => matchMutation.mutate()} 
              loading={matchMutation.isPending}
              title="Mevcut eşleşmemiş ödemeleri borçlarla FIFO kuralına göre kapatır"
            >
              Hesap Kapatma (FIFO)
            </Button>
            <Button type="primary" size="large" icon={<PlusOutlined />} onClick={() => setOdemeModalOpen(true)}>
              Yeni Ödeme Al
            </Button>
          </Space>
        }
      />

      <Row gutter={[24, 24]} style={{ marginBottom: 32 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stat-card">
            <Statistic 
              title="Toplam Tahakkuk" 
              value={toplamTahakkuk} 
              prefix="₺" 
              formatter={(v) => trMoneyFormatter(v as number)} 
              styles={{ content: { fontWeight: 700 } }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stat-card">
            <Statistic 
              title="Toplam Ödeme" 
              value={toplamOdenen} 
              prefix="₺" 
              formatter={(v) => trMoneyFormatter(v as number)} 
              styles={{ content: { color: 'var(--success)', fontWeight: 700 } }} 
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stat-card">
            <Statistic 
              title="Geciken Borç" 
              value={toplamKalan} 
              prefix="₺" 
              formatter={(v) => trMoneyFormatter(v as number)} 
              styles={{ content: { 
                color: toplamKalan > 0 ? 'var(--error)' : 'var(--success)',
                fontWeight: 700 
              } }} 
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stat-card">
            <Statistic 
              title="Gecikme Faizi" 
              value={toplamGecikmeFaizi} 
              prefix="₺" 
              formatter={(v) => trMoneyFormatter(v as number)} 
              styles={{ content: { color: '#fa8c16', fontWeight: 700 } }} 
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
                      styles={{ label: { background: '#f8fafc', fontWeight: 600, width: '150px' } }}
                    >
                      <Descriptions.Item label="Üye No">{uye.uye_no}</Descriptions.Item>
                      <Descriptions.Item label="TC Kimlik">{uye.tc_kimlik || '-'}</Descriptions.Item>
                      <Descriptions.Item label="Durum">
                        <Tag color={durumRenk[uye.durum]}>{uye.durum.toUpperCase()}</Tag>
                      </Descriptions.Item>
                      <Descriptions.Item label="Daire Kod">
                        {daireNo}
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
            <InputNumber 
              min={0.01} 
              style={{ width: '100%' }} 
              placeholder="Örn: 5000" 
              formatter={trMoneyFormatter}
              parser={trNumberParser}
            />
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
