import React, { useState } from 'react'
import { Button, Table, Modal, Form, Input, InputNumber, Select, Space, message, Card, Row, Col, Typography } from 'antd'
import { PlusOutlined, EditOutlined, HomeOutlined, BuildOutlined } from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../../lib/api'
import { PageHeader } from '../../components/common/PageHeader'

const { Text } = Typography

interface Serefiye {
  id: string
  proje_id: string
  blok_id: string
  daire_no: string
  daire_sira_no: number
  kat?: number
  yon?: string
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

  const { data: proje, isLoading: projeLoading } = useQuery({
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

  // Backend'e henüz eklenmemiş olabilir, proje servisine getSerefiye eklemem gerekecek.
  
  const generateSerefiyeMutation = useMutation({
    mutationFn: async () => {
      return await api.post(`/projeler/${projeId}/generate-serefiye`)
    },
    onSuccess: () => {
      message.success('Şerefiye tablosu oluşturuldu')
      queryClient.invalidateQueries({ queryKey: ['serefiye-list', projeId] })
    },
    onError: (err: any) => message.error(err.message || 'Hata oluştu')
  })

  const saveMutation = useMutation({
    mutationFn: async (values: any) => {
      return await api.put(`/projeler/serefiye/${editingSerefiye?.id}`, values)
    },
    onSuccess: () => {
      message.success('Daire bilgileri güncellendi')
      queryClient.invalidateQueries({ queryKey: ['serefiye-list', projeId] })
      setModalOpen(false)
      setEditingSerefiye(null)
    },
    onError: (err: any) => message.error(err.message || 'Hata oluştu')
  })

  const columns = [
    { title: 'Blok', dataIndex: ['bloklar', 'blok_adi'], key: 'blok' },
    { title: 'Daire No', dataIndex: 'daire_no', key: 'daire_no', sorter: (a: any, b: any) => a.daire_no.localeCompare(b.daire_no) },
    { title: 'Kat', dataIndex: 'kat', key: 'kat', sorter: (a: any, b: any) => (a.kat || 0) - (b.kat || 0) },
    { title: 'Yön', dataIndex: 'yon', key: 'yon' },
    { title: 'Şerefiye Oranı', dataIndex: 'serefiye_orani', key: 'oran', render: (v: number) => v.toFixed(3) },
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
      <PageHeader
        title={proje ? `${proje.proje_adi} - Şerefiye Tablosu` : 'Şerefiye Tablosu'}
        onBack={() => navigate(`/projeler/${projeId}`)}
        extra={
          serefiyeList?.length === 0 && (
            <Button type="primary" onClick={() => generateSerefiyeMutation.mutate()} loading={generateSerefiyeMutation.isPending}>
              Tabloyu Oluştur
            </Button>
          )
        }
      />

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
          <Form.Item name="serefiye_orani" label="Şerefiye Oranı (0.000)">
            <InputNumber style={{ width: '100%' }} step={0.001} min={0} />
          </Form.Item>
          <Form.Item name="durum" label="Durum">
            <Select>
              <Select.Option value="bos">Boş</Select.Option>
              <Select.Option value="dolu">Dolu</Select.Option>
              <Select.Option value="rezerv">Rezerv</Select.Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
