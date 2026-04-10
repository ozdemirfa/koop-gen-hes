import React, { useState } from 'react'
import { Button, Modal, Form, Input, Space, message, Tag, DatePicker, Card, Row, Col, Select, InputNumber, Spin, Empty } from 'antd'
import { PlusOutlined, EditOutlined, ArrowRightOutlined, ProjectOutlined } from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import api from '../../lib/api'
import { PageHeader } from '../../components/common/PageHeader'

interface Proje {
  id: string
  proje_adi: string
  aciklama?: string
  baslangic_tarihi?: string
  bitis_tarihi?: string
  toplam_butce?: number
  durum: 'planli' | 'devam_ediyor' | 'tamamlandi' | 'iptal'
  blok_sayisi?: number
  daire_sayisi_per_blok?: number
  daire_kodlama_sistemi?: string
}

const durumRenkleri: Record<string, string> = {
  planli: 'blue',
  devam_ediyor: 'orange',
  tamamlandi: 'green',
  iptal: 'red',
}

const durumEtiketleri: Record<string, string> = {
  planli: 'Planlı',
  devam_ediyor: 'Devam Ediyor',
  tamamlandi: 'Tamamlandı',
  iptal: 'İptal',
}

export const ProjeListPage: React.FC = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingProje, setEditingProje] = useState<Proje | null>(null)
  const [form] = Form.useForm()

  const { data: projeler, isLoading } = useQuery({
    queryKey: ['projeler'],
    queryFn: async () => {
      const { data } = await api.get('/projeler')
      return data.data as Proje[]
    },
  })

  const saveMutation = useMutation({
    mutationFn: async (values: any) => {
      const payload = {
        ...values,
        baslangic_tarihi: values.baslangic_tarihi ? values.baslangic_tarihi.format('YYYY-MM-DD') : null,
        bitis_tarihi: values.bitis_tarihi ? values.bitis_tarihi.format('YYYY-MM-DD') : null,
      }
      if (editingProje) {
        return await api.put(`/projeler/${editingProje.id}`, payload)
      }
      return await api.post('/projeler', payload)
    },
    onSuccess: () => {
      message.success('Proje kaydedildi')
      queryClient.invalidateQueries({ queryKey: ['projeler'] })
      setModalOpen(false)
      form.resetFields()
      setEditingProje(null)
    },
    onError: (err: any) => message.error(err.message || 'Hata oluştu'),
  })

  return (
    <div>
      <PageHeader
        title="Projeler"
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditingProje(null)
              form.resetFields()
              setModalOpen(true)
            }}
          >
            Yeni Proje
          </Button>
        }
      />

      <Row gutter={[16, 16]}>
        {isLoading ? (
          <Col span={24} style={{ textAlign: 'center', padding: 50 }}><Spin size="large" /></Col>
        ) : projeler?.length === 0 ? (
          <Col span={24}><Empty description="Henüz proje eklenmemiş" /></Col>
        ) : (
          projeler?.map((p) => (
            <Col xs={24} sm={12} lg={8} key={p.id}>
              <Card
                hoverable
                actions={[
                  <EditOutlined
                    key="edit"
                    onClick={(e) => {
                      e.stopPropagation()
                      setEditingProje(p)
                      form.setFieldsValue({
                        ...p,
                        baslangic_tarihi: p.baslangic_tarihi ? dayjs(p.baslangic_tarihi) : null,
                        bitis_tarihi: p.bitis_tarihi ? dayjs(p.bitis_tarihi) : null,
                      })
                      setModalOpen(true)
                    }}
                  />,
                  <ArrowRightOutlined key="view" onClick={() => navigate(`/projeler/${p.id}`)} />,
                ]}
                title={
                  <Space>
                    <ProjectOutlined />
                    {p.proje_adi}
                  </Space>
                }
                extra={<Tag color={durumRenkleri[p.durum]}>{durumEtiketleri[p.durum]}</Tag>}
                onClick={() => navigate(`/projeler/${p.id}`)}
              >
                <p style={{ height: 40, overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.aciklama || 'Açıklama yok'}</p>
                <div style={{ marginTop: 16 }}>
                  <small>Tarih: {p.baslangic_tarihi ? dayjs(p.baslangic_tarihi).format('DD.MM.YYYY') : '?'} - {p.bitis_tarihi ? dayjs(p.bitis_tarihi).format('DD.MM.YYYY') : '?'}</small>
                </div>
              </Card>
            </Col>
          ))
        )}
      </Row>

      <Modal
        title={editingProje ? 'Proje Düzenle' : 'Yeni Proje'}
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false)
          setEditingProje(null)
        }}
        onOk={() => form.submit()}
        confirmLoading={saveMutation.isPending}
        width={600}
      >
        <Form form={form} layout="vertical" onFinish={(v) => saveMutation.mutate(v)} initialValues={{ durum: 'planli', blok_sayisi: 0, daire_sayisi_per_blok: 0 }}>
          <Form.Item name="proje_adi" label="Proje Adı" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="aciklama" label="Açıklama">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="baslangic_tarihi" label="Başlangıç Tarihi">
                <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="bitis_tarihi" label="Bitiş Tarihi">
                <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="toplam_butce" label="Toplam Bütçe">
                <InputNumber style={{ width: '100%' }} min={0} formatter={(v) => `₺ ${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="durum" label="Durum" rules={[{ required: true }]}>
                <Select>
                  <Select.Option value="planli">Planlı</Select.Option>
                  <Select.Option value="devam_ediyor">Devam Ediyor</Select.Option>
                  <Select.Option value="tamamlandi">Tamamlandı</Select.Option>
                  <Select.Option value="iptal">İptal</Select.Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="blok_sayisi" label="Blok Sayısı">
                <InputNumber style={{ width: '100%' }} min={0} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="daire_sayisi_per_blok" label="Bloktaki Daire">
                <InputNumber style={{ width: '100%' }} min={0} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="daire_kodlama_sistemi" label="Kodlama (örn: 1-20)">
                <Input />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  )
}
