import React, { useState, useMemo } from 'react'
import { Button, Modal, Form, Input, InputNumber, DatePicker, Select, Space, message, Card, Row, Col, Typography, Tag } from 'antd'
import { PlusOutlined, ArrowLeftOutlined } from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import api from '../../lib/api'
import { DataTable } from '../../components/common/DataTable'
import { ErrorState } from '../../components/common/ErrorState'
import { MoneyDisplay } from '../../components/common/MoneyDisplay'
import { usePageSettings } from '../../contexts/LayoutContext'

const { Text } = Typography

interface BankaHareketi {
  id: string
  tarih: string
  tutar: number
  islem_tipi: 'gelir' | 'gider'
  aciklama?: string
  eslesti: boolean
  firma_id?: string
  banka_hesaplari?: { banka_adi: string }
  cari_hareketler?: { firmalar: { unvan: string } }
}

export const BankaHareketleriPage: React.FC = () => {
  const { id: bankaHesapId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [form] = Form.useForm()
  const islemTipi = Form.useWatch('islem_tipi', form)

  const { data: hesap } = useQuery({
    queryKey: ['banka-hesabi', bankaHesapId],
    queryFn: async () => {
      const { data } = await api.get('/banka/hesaplar')
      return data.data.find((h: any) => h.id === bankaHesapId)
    },
  })

  const { data: firmalar } = useQuery({
    queryKey: ['firmalar'],
    queryFn: async () => {
      const { data } = await api.get('/firmalar')
      return data.data
    },
  })

  const { data: hareketler, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['banka-hareketleri', bankaHesapId],
    queryFn: async () => {
      const { data } = await api.get('/banka/hareketler', { params: { banka_hesap_id: bankaHesapId } })
      return data.data as BankaHareketi[]
    },
  })

  const saveMutation = useMutation({
    mutationFn: async (values: any) => {
      const payload = {
        ...values,
        banka_hesap_id: bankaHesapId,
        tarih: values.tarih.format('YYYY-MM-DD'),
        // Eğer hesap bilgisi yüklendiyse proje_id'yi oradan al
        proje_id: hesap?.proje_id || localStorage.getItem('activeProjectId')
      }
      return await api.post('/banka/hareketler', payload)
    },
    onSuccess: () => {
      message.success('Banka hareketi eklendi')
      queryClient.invalidateQueries({ queryKey: ['banka-hareketleri', bankaHesapId] })
      setModalOpen(false)
      form.resetFields()
    },
    onError: (err: any) => message.error(err.message || 'Hata oluştu'),
  })

  const actions = useMemo(() => (
    <Space size={4}>
      <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/banka-hesaplari')} size="small" />
      <Button 
        type="primary" 
        icon={<PlusOutlined />} 
        onClick={() => setModalOpen(true)}
        size="small"
      >
        Yeni Hareket
      </Button>
    </Space>
  ), [navigate])

  usePageSettings({
    title: hesap ? `${hesap.banka_adi} - Hesap Hareketleri` : 'Banka Hareketleri',
    actions
  })

  const columns = [
    {
      title: 'Tarih',
      dataIndex: 'tarih',
      key: 'tarih',
      width: 110,
      render: (d: string) => dayjs(d).format('DD.MM.YYYY'),
    },
    { 
      title: 'İlgili Firma', 
      key: 'firma',
      render: (_: any, r: any) => {
        const cari = Array.isArray(r.cari_hareketler) ? r.cari_hareketler[0] : r.cari_hareketler;
        return cari?.firmalar?.unvan || '-'
      }
    },
    { title: 'Açıklama', dataIndex: 'aciklama', key: 'aciklama' },
    {
      title: 'Tutar',
      dataIndex: 'tutar',
      key: 'tutar',
      align: 'right' as const,
      width: 130,
      render: (v: number, r: BankaHareketi) => (
        <span style={{ color: r.islem_tipi === 'gelir' ? '#3f8600' : '#cf1322', fontWeight: 'bold' }}>
          {r.islem_tipi === 'gelir' ? '+' : '-'}<MoneyDisplay amount={v} />
        </span>
      ),
    },
    {
      title: 'Durum',
      dataIndex: 'eslesti',
      key: 'eslesti',
      width: 110,
      render: (eslesti: boolean) => (
        <Tag color={eslesti ? 'blue' : 'default'}>{eslesti ? 'Eşleşti' : 'Eşleşmemiş'}</Tag>
      ),
    },
  ]

  return (
    <div>
      {isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : (
        <DataTable
          columns={columns}
          dataSource={hareketler}
          rowKey="id"
          loading={isLoading}
          pagination={{ pageSize: 20 }}
          emptyDescription="Henüz bir hareket bulunmuyor"
          size="small"
        />
      )}

      <Modal
        title="Yeni Banka Hareketi"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={saveMutation.isPending}
        destroyOnClose
        okText="Ekle"
        cancelText="İptal"
      >
        <Form 
          form={form} 
          layout="vertical" 
          onFinish={(v) => saveMutation.mutate(v)}
          initialValues={{ tarih: dayjs(), islem_tipi: 'gider', odeme_yontemi: 'banka' }}
          style={{ marginTop: 16 }}
          size="small"
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="tarih" label="Tarih" rules={[{ required: true }]}>
                <DatePicker size="small" style={{ width: '100%' }} format="DD.MM.YYYY" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="islem_tipi" label="İşlem Tipi" rules={[{ required: true }]}>
                <Select>
                  <Select.Option value="gelir">Para Girişi (+)</Select.Option>
                  <Select.Option value="gider">Para Çıkışı (-)</Select.Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="firma_id" label="İlgili Firma (Cari Hesap)">
                <Select 
                  showSearch 
                  placeholder="Firma seçin" 
                  optionFilterProp="children"
                  allowClear
                >
                  {firmalar?.map((f: any) => (
                    <Select.Option key={f.id} value={f.id}>{f.unvan}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="odeme_yontemi" label="Ödeme Türü" rules={[{ required: true }]}>
                <Select>
                  <Select.Option value="banka">Banka</Select.Option>
                  <Select.Option value="kasa">Kasa</Select.Option>
                  <Select.Option value="cek">Çek</Select.Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="tutar" label="Tutar" rules={[{ required: true, type: 'number', min: 0.01 }]}>
            <InputNumber style={{ width: '100%' }} min={0.01} step={0.01} precision={2} />
          </Form.Item>
          <Form.Item name="aciklama" label="Açıklama" rules={[{ required: true }]}>
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
