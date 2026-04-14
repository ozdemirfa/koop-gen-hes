import React, { useState } from 'react'
import { Button, Modal, Form, Input, Space, message, Tag, DatePicker, Card, Row, Col, Select, InputNumber, Divider, Typography } from 'antd'
import { PlusOutlined, EditOutlined, ArrowRightOutlined, ProjectOutlined, DeleteOutlined } from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import api from '../../lib/api'
import { PageHeader } from '../../components/common/PageHeader'
import { LoadingState } from '../../components/common/LoadingState'
import { EmptyState } from '../../components/common/EmptyState'
import { ErrorState } from '../../components/common/ErrorState'
import { trNumberFormatter, trNumberParser } from '../../lib/format'

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

  const openEditModal = async (proje: Proje) => {
    // Proje detayını bloklarla birlikte çek
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
    <div>
      <PageHeader
        title="İnşaat Projeleri"
        subtitle="Kooperatif bünyesindeki tüm inşaat projeleri, blok yapıları ve bütçe planları"
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditingProje(null)
              form.resetFields()
              form.setFieldsValue({ bloklar: [{ blok_adi: '', toplam_daire: 0, daire_baslangic_no: 1 }] })
              setModalOpen(true)
            }}
          >
            Yeni Proje
          </Button>
        }
      />

      <Row gutter={[16, 16]}>
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
        width={800}
        destroyOnClose
        okText="Kaydet"
        cancelText="İptal"
      >
        <Form 
          form={form} 
          layout="vertical" 
          onFinish={(v) => saveMutation.mutate(v)} 
          initialValues={{ durum: 'planli' }}
          style={{ marginTop: 16 }}
        >
          <Row gutter={16}>
            <Col span={16}>
              <Form.Item name="proje_adi" label="Proje Adı" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={8}>
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
          
          <Form.Item name="aciklama" label="Açıklama">
            <Input.TextArea rows={2} />
          </Form.Item>
          
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="baslangic_tarihi" label="Başlangıç Tarihi">
                <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="bitis_tarihi" label="Bitiş Tarihi">
                <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="toplam_butce" label="Toplam Bütçe">
                <InputNumber 
                  style={{ width: '100%' }} 
                  min={0} 
                  formatter={trNumberFormatter}
                  parser={trNumberParser}
                />
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation={"left" as any}>Bloklar</Divider>
          
          <Form.List name="bloklar">
            {(fields, { add, remove }) => (
              <>
                {fields.map(({ key, name, ...restField }) => (
                  <Card size="small" key={key} style={{ marginBottom: 16 }} extra={
                    fields.length > 1 && <Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(name)} />
                  }>
                    <Row gutter={12}>
                      <Col span={5}>
                        <Form.Item
                          {...restField}
                          name={[name, 'blok_adi']}
                          label="Blok Adı"
                          rules={[{ required: true, message: 'Zorunlu' }]}
                        >
                          <Input placeholder="Örn: A Blok" />
                        </Form.Item>
                      </Col>
                      <Col span={4}>
                        <Form.Item
                          {...restField}
                          name={[name, 'toplam_daire']}
                          label="Daire"
                          rules={[{ required: true, message: 'Zorunlu' }]}
                        >
                          <InputNumber min={1} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col span={4}>
                        <Form.Item
                          {...restField}
                          name={[name, 'daire_baslangic_no']}
                          label="Baş. No"
                        >
                          <InputNumber min={0} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col span={11}>
                        <Form.Item
                          {...restField}
                          name={[name, 'aciklama']}
                          label="Blok Açıklaması"
                        >
                          <Input />
                        </Form.Item>
                      </Col>
                    </Row>
                  </Card>
                ))}
                <Form.Item>
                  <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                    Yeni Blok Ekle
                  </Button>
                </Form.Item>
              </>
            )}
          </Form.List>
        </Form>
      </Modal>
    </div>
  )
}

