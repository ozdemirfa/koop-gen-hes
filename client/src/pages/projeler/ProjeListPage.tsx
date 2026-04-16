import React, { useState } from 'react'
import { Button, Modal, Form, Input, Space, message, Tag, DatePicker, Card, Row, Col, Select, InputNumber, Divider, Typography } from 'antd'
import { PlusOutlined, EditOutlined, ArrowRightOutlined, ProjectOutlined, DeleteOutlined } from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import api from '../../lib/api'
import { LoadingState } from '../../components/common/LoadingState'
import { EmptyState } from '../../components/common/EmptyState'
import { ErrorState } from '../../components/common/ErrorState'
import { trNumberFormatter, trNumberParser } from '../../lib/format'
import { usePageSettings } from '../../contexts/LayoutContext'

const { Text } = Typography

interface Blok {
  id?: string
  blok_adi: string
  toplam_daire: number
  daire_baslangic_no?: number
  aciklama?: string
}

interface Proje {
  id: string
  proje_adi: string
  aciklama?: string
  baslangic_tarihi?: string
  bitis_tarihi?: string
  toplam_butce?: number
  durum: 'planli' | 'devam_ediyor' | 'tamamlandi' | 'iptal'
  bloklar?: Blok[]
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

  const { data: projeler, isLoading, isError, error, refetch } = useQuery({
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
    onError: (err: any) => {
      if (err.details && Array.isArray(err.details)) {
        form.setFields(err.details.map((detail: any) => ({
          name: detail.field.includes('.') ? detail.field.split('.') : detail.field,
          errors: [detail.message]
        })))
      } else {
        message.error(err.error || err.message || 'Hata oluştu')
      }
    },
  })

  usePageSettings({
    title: 'İnşaat Projeleri',
    actions: (
      <Button
        type="primary"
        icon={<PlusOutlined />}
        onClick={() => {
          setEditingProje(null)
          form.resetFields()
          form.setFieldsValue({ bloklar: [{ blok_adi: '', toplam_daire: 0, daire_baslangic_no: 1 }] })
          setModalOpen(true)
        }}
        size="middle"
      >
        Yeni Proje
      </Button>
    )
  })

  const openEditModal = async (proje: Proje) => {
    try {
      const { data } = await api.get(`/projeler/${proje.id}`)
      const fullProje = data.data as Proje
      setEditingProje(fullProje)
      form.setFieldsValue({
        ...fullProje,
        baslangic_tarihi: fullProje.baslangic_tarihi ? dayjs(fullProje.baslangic_tarihi) : null,
        bitis_tarihi: fullProje.bitis_tarihi ? dayjs(fullProje.bitis_tarihi) : null,
      })
      setModalOpen(true)
    } catch (err) {
      message.error('Proje detayları yüklenemedi')
    }
  }

  return (
    <div style={{ zoom: '0.9', fontSize: '13px' }}>
      <Row gutter={[12, 12]}>
        {isLoading ? (
          <Col span={24}><LoadingState fullHeight /></Col>
        ) : isError ? (
          <Col span={24}><ErrorState error={error} onRetry={() => refetch()} /></Col>
        ) : projeler?.length === 0 ? (
          <Col span={24}><EmptyState description="Henüz proje eklenmemiş" /></Col>
        ) : (
          projeler?.map((p) => (
            <Col xs={24} sm={12} lg={8} key={p.id}>
              <Card
                hoverable
                size="small"
                actions={[
                  <EditOutlined
                    key="edit"
                    onClick={(e) => {
                      e.stopPropagation()
                      openEditModal(p)
                    }}
                  />,
                  <ArrowRightOutlined key="view" onClick={() => navigate(`/projeler/${p.id}`)} />,
                ]}
                title={
                  <Space size={4}>
                    <ProjectOutlined style={{ fontSize: '14px' }} />
                    <span style={{ fontSize: '14px', fontWeight: 600 }}>{p.proje_adi}</span>
                  </Space>
                }
                extra={<Tag color={durumRenkleri[p.durum]} style={{ marginRight: 0, fontSize: '11px' }}>{durumEtiketleri[p.durum]}</Tag>}
                onClick={() => navigate(`/projeler/${p.id}`)}
                styles={{ body: { padding: '12px' } }}
              >
                <div style={{ height: 36, overflow: 'hidden', textOverflow: 'ellipsis', color: '#64748b', fontSize: '12px', lineHeight: '1.4' }}>
                  {p.aciklama || 'Açıklama yok'}
                </div>
                <div style={{ marginTop: 12, borderTop: '1px solid #f1f5f9', paddingTop: 8 }}>
                  <Text type="secondary" style={{ fontSize: '11px' }}>
                    Tarih: {p.baslangic_tarihi ? dayjs(p.baslangic_tarihi).format('DD.MM.YYYY') : '?'} - {p.bitis_tarihi ? dayjs(p.bitis_tarihi).format('DD.MM.YYYY') : '?'}
                  </Text>
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
        width={700}
        destroyOnClose
        okText="Kaydet"
        cancelText="İptal"
        styles={{ body: { paddingTop: 8 } }}
        centered
      >
        <Form 
          form={form} 
          layout="vertical" 
          onFinish={(v) => saveMutation.mutate(v)} 
          initialValues={{ durum: 'planli' }}
          size="small"
          requiredMark="optional"
        >
          <Row gutter={12}>
            <Col span={16}>
              <Form.Item 
                name="proje_adi" 
                label={<span style={{ fontWeight: 500 }}>Proje Adı</span>} 
                rules={[{ required: true }]}
                style={{ marginBottom: 12 }}
              >
                <Input placeholder="Proje ismini giriniz" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item 
                name="durum" 
                label={<span style={{ fontWeight: 500 }}>Durum</span>} 
                rules={[{ required: true }]}
                style={{ marginBottom: 12 }}
              >
                <Select>
                  <Select.Option value="planli">Planlı</Select.Option>
                  <Select.Option value="devam_ediyor">Devam Ediyor</Select.Option>
                  <Select.Option value="tamamlandi">Tamamlandı</Select.Option>
                  <Select.Option value="iptal">İptal</Select.Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          
          <Form.Item 
            name="aciklama" 
            label={<span style={{ fontWeight: 500 }}>Açıklama</span>}
            style={{ marginBottom: 12 }}
          >
            <Input.TextArea rows={2} placeholder="Proje hakkında kısa bilgi..." />
          </Form.Item>
          
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item 
                name="baslangic_tarihi" 
                label={<span style={{ fontWeight: 500 }}>Başlangıç</span>}
                style={{ marginBottom: 12 }}
              >
                <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item 
                name="bitis_tarihi" 
                label={<span style={{ fontWeight: 500 }}>Bitiş</span>}
                style={{ marginBottom: 12 }}
              >
                <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item 
                name="toplam_butce" 
                label={<span style={{ fontWeight: 500 }}>Toplam Bütçe</span>}
                style={{ marginBottom: 12 }}
              >
                <InputNumber 
                  style={{ width: '100%' }} 
                  min={0} 
                  formatter={trNumberFormatter}
                  parser={trNumberParser}
                  placeholder="0,00"
                />
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation="left" style={{ margin: '12px 0', fontSize: '13px' }}>Bloklar</Divider>
          
          <Form.List name="bloklar">
            {(fields, { add, remove }) => (
              <div style={{ maxHeight: '300px', overflowY: 'auto', paddingRight: '4px' }}>
                {fields.map(({ key, name, ...restField }) => (
                  <Card 
                    size="small" 
                    key={key} 
                    style={{ marginBottom: 8, backgroundColor: '#fafafa' }} 
                    styles={{ body: { padding: '8px 12px' } }}
                    extra={
                      fields.length > 1 && (
                        <Button 
                          type="text" 
                          danger 
                          icon={<DeleteOutlined />} 
                          onClick={() => remove(name)} 
                          size="small"
                        />
                      )
                    }
                  >
                    <Row gutter={8}>
                      <Col span={5}>
                        <Form.Item
                          {...restField}
                          name={[name, 'blok_adi']}
                          label={<span style={{ fontSize: '11px' }}>Blok Adı</span>}
                          rules={[{ required: true, message: '!' }]}
                          style={{ marginBottom: 0 }}
                        >
                          <Input placeholder="Örn: A" />
                        </Form.Item>
                      </Col>
                      <Col span={4}>
                        <Form.Item
                          {...restField}
                          name={[name, 'toplam_daire']}
                          label={<span style={{ fontSize: '11px' }}>Daire</span>}
                          rules={[{ required: true, message: '!' }]}
                          style={{ marginBottom: 0 }}
                        >
                          <InputNumber min={1} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col span={4}>
                        <Form.Item
                          {...restField}
                          name={[name, 'daire_baslangic_no']}
                          label={<span style={{ fontSize: '11px' }}>Baş. No</span>}
                          style={{ marginBottom: 0 }}
                        >
                          <InputNumber min={0} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col span={11}>
                        <Form.Item
                          {...restField}
                          name={[name, 'aciklama']}
                          label={<span style={{ fontSize: '11px' }}>Blok Açıklaması</span>}
                          style={{ marginBottom: 0 }}
                        >
                          <Input placeholder="İsteğe bağlı" />
                        </Form.Item>
                      </Col>
                    </Row>
                  </Card>
                ))}
                <Form.Item style={{ marginTop: 8, marginBottom: 0 }}>
                  <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />} size="small">
                    Blok Ekle
                  </Button>
                </Form.Item>
              </div>
            )}
          </Form.List>
        </Form>
      </Modal>
    </div>
  )
}
