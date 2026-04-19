import React, { useState, useMemo } from 'react'
import { Button, Table, Modal, Form, Input, InputNumber, Tag, Space, Card, Row, Col, message } from 'antd'
import { EditOutlined, ArrowLeftOutlined } from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../../lib/api'
import { usePageSettings } from '../../contexts/LayoutContext'

interface Serefiye {
  id: string
  proje_id: string
  blok_id: string
  daire_no: string
  daire_sira_no: number
  kat?: number
  yon?: string
  m2?: number
  oda_sayisi?: string
  serefiye_orani: number
  durum: 'bos' | 'dolu' | 'rezerv'
  bloklar?: { blok_adi: string }
}

export const SerefiyePage: React.FC = () => {
  const { id: projeId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingSerefiye, setEditingSerefiye] = useState<Serefiye | null>(null)
  const [form] = Form.useForm()
  const [messageApi, messageContextHolder] = message.useMessage()
  const [modal, modalContextHolder] = Modal.useModal()

  const { data: proje } = useQuery({
    queryKey: ['proje', projeId],
    queryFn: async () => {
      const { data } = await api.get(`/projeler/${projeId}`)
      return data.data
    },
  })

  const { data: serefiyeList, isLoading: serefiyeLoading } = useQuery({
    queryKey: ['serefiye-list', projeId],
    queryFn: async () => {
      const { data } = await api.get(`/projeler/${projeId}/serefiye`)
      return data.data as Serefiye[]
    },
  })

  const generateSerefiyeMutation = useMutation({
    mutationFn: async () => {
      return await api.post(`/projeler/${projeId}/generate-serefiye`)
    },
    onSuccess: () => {
      messageApi.success('Şerefiye tablosu oluşturuldu')
      queryClient.invalidateQueries({ queryKey: ['serefiye-list', projeId] })
    },
    onError: (err: any) => messageApi.error(err.message || 'Hata oluştu')
  })

  const resetSerefiyeMutation = useMutation({
    mutationFn: async () => {
      return await api.post(`/projeler/serefiye-yenile/${projeId}`)
    },
    onSuccess: () => {
      messageApi.success('Şerefiye tablosu yenilendi')
      queryClient.invalidateQueries({ queryKey: ['serefiye-list', projeId] })
    },
    onError: (err: any) => messageApi.error(err.message || 'Hata oluştu')
  })

  const clearSerefiyeMutation = useMutation({
    mutationFn: async () => {
      return await api.post(`/projeler/${projeId}/clear-serefiye`)
    },
    onSuccess: () => {
      messageApi.success('Şerefiye tablosu silindi')
      queryClient.invalidateQueries({ queryKey: ['serefiye-list', projeId] })
    },
    onError: (err: any) => messageApi.error(err.message || 'Hata oluştu')
  })

  const saveMutation = useMutation({
    mutationFn: async (values: any) => {
      return await api.put(`/projeler/serefiye/${editingSereviye?.id}`, values)
    },
    onSuccess: () => {
      messageApi.success('Daire bilgileri güncellendi')
      queryClient.invalidateQueries({ queryKey: ['serefiye-list', projeId] })
      setModalOpen(false)
      setEditingSerefiye(null)
    },
    onError: (err: any) => messageApi.error(err.message || 'Hata oluştu')
  })

  const handleRefresh = () => {
    modal.confirm({
      title: 'Tabloyu Yenile',
      content: 'Bu işlem mevcut TÜM şerefiye kayıtlarını silecek ve blok tanımlarına göre yeniden oluşturacaktır. Manuel girdiğiniz tüm oranlar, kat ve yön bilgileri KAYBOLACAKTIR. Emin misiniz?',
      okText: 'Evet, Yenile',
      okType: 'danger',
      cancelText: 'Vazgeç',
      onOk: () => resetSerefiyeMutation.mutate()
    })
  }

  const handleClear = () => {
    modal.confirm({
      title: 'Tabloyu Sil',
      content: 'Şerefiye tablosundaki tüm veriler silinecektir. Dolu (üye atanmış) daire varsa işlem yapılamaz. Emin misiniz?',
      okText: 'Evet, Sil',
      okType: 'danger',
      cancelText: 'Vazgeç',
      onOk: () => clearSerefiyeMutation.mutate()
    })
  }

  const actions = useMemo(() => (
    <Space>
      <Button 
        icon={<ArrowLeftOutlined />} 
        onClick={() => navigate(`/projeler/${projeId}`)}
        type="text"
      />
      <Button 
        type="primary" 
        onClick={() => generateSerefiyeMutation.mutate()} 
        loading={generateSerefiyeMutation.isPending}
        disabled={serefiyeList && serefiyeList.length > 0}
        data-testid="generate-serefiye-btn"
      >
        Tabloyu Oluştur
      </Button>
      {serefiyeList && serefiyeList.length > 0 && (
        <Button 
          danger
          onClick={handleClear} 
          loading={clearSerefiyeMutation.isPending}
          data-testid="clear-serefiye-btn"
        >
          Tabloyu Sil
        </Button>
      )}
    </Space>
  ), [navigate, projeId, serefiyeList, generateSerefiyeMutation.isPending, clearSerefiyeMutation.isPending])

  usePageSettings({
    title: 'Şerefiye Tablosu',
    actions
  })

  const columns = [
    { 
      title: 'Blok', 
      dataIndex: ['bloklar', 'blok_adi'], 
      key: 'blok',
      sorter: (a: any, b: any) => (a.bloklar?.blok_adi || '').localeCompare(b.bloklar?.blok_adi || '')
    },
    { 
      title: 'Daire Sıra No', 
      dataIndex: 'daire_sira_no', 
      key: 'daire_sira_no', 
      sorter: (a: any, b: any) => (Number(a.daire_sira_no) || 0) - (Number(b.daire_sira_no) || 0) 
    },
    { 
      title: 'Daire No', 
      dataIndex: 'daire_no', 
      key: 'daire_no',
      sorter: (a: any, b: any) => (a.daire_no || '').localeCompare(b.daire_no || '')
    },
    { title: 'Kat', dataIndex: 'kat', key: 'kat', sorter: (a: any, b: any) => (a.kat || 0) - (b.kat || 0) },
    { title: 'Yön', dataIndex: 'yon', key: 'yon' },
    { 
      title: 'm2', 
      dataIndex: 'm2', 
      key: 'm2',
      render: (v: number) => v ? `${v} m²` : '-'
    },
    { 
      title: 'Oda Sayısı', 
      dataIndex: 'oda_sayisi', 
      key: 'oda_sayisi',
      render: (v: string) => v || '-'
    },
    { title: 'Şerefiye Oranı', dataIndex: 'serefiye_orani', key: 'oran', render: (v: number) => (v || 0).toFixed(3) },
    { 
      title: 'Durum', 
      dataIndex: 'durum', 
      key: 'durum',
      render: (d: string) => {
        const colors: Record<string, string> = { bos: 'green', dolu: 'red', rezerv: 'orange' }
        return <Tag color={colors[d]}>{d.toUpperCase()}</Tag>
      }
    },
    {
      title: 'İşlem',
      key: 'action',
      width: 100,
      render: (_: any, r: Serefiye) => (
        <Button icon={<EditOutlined />} onClick={() => { setEditingSerefiye(r); form.setFieldsValue(r); setModalOpen(true) }} />
      ),
    },
  ]

  return (
    <div>
      {messageContextHolder}
      {modalContextHolder}
      <Card>
        <Table
          columns={columns}
          dataSource={serefiyeList}
          rowKey="id"
          loading={serefiyeLoading}
          pagination={{ pageSize: 50 }}
        />
      </Card>

      <Modal
        title="Daire Şerefiye Düzenle"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={saveMutation.isPending}
      >
        <Form form={form} layout="vertical" onFinish={(v) => saveMutation.mutate(v)}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="kat" label="Kat">
                <InputNumber style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="yon" label="Yön">
                <Input placeholder="Örn: Kuzey-Doğu" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="m2" label="Metrekare (m2)">
                <InputNumber style={{ width: '100%' }} step={0.01} min={0} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="oda_sayisi" label="Oda Sayısı">
                <Input placeholder="Örn: 3+1" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="serefiye_orani" label="Şerefiye Oranı (0.000)">
            <InputNumber style={{ width: '100%' }} step={0.001} min={0} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
