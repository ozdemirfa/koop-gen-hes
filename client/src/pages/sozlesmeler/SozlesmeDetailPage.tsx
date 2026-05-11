import React, { useState } from 'react'
import { Card, Descriptions, Table, Button, Modal, Form, Input, InputNumber, Space, Tag, message, Row, Col, Select } from 'antd'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import api from '../../lib/api'
import { getErrorMessage } from '../../lib/apiError'
import { PageHeader } from '../../components/common/PageHeader'
import { MoneyDisplay } from '../../components/common/MoneyDisplay'
import { ConfirmDelete } from '../../components/common/ConfirmDelete'
import { DataTable } from '../../components/common/DataTable'
import { trNumberFormatter, trNumberParser, trMoneyFormatter } from '../../lib/format'

interface IsKalemi {
  id: string
  poz_no?: string
  tanim: string
  birim: string
  miktar: number
  birim_fiyat: number
  toplam_tutar: number
  sira_no: number
}

export const SozlesmeDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [isKalemiModalOpen, setIsKalemiModalOpen] = useState(false)
  const [editingKalem, setEditingKalem] = useState<IsKalemi | null>(null)
  const [kalemForm] = Form.useForm()

  const { data: sozlesme, isLoading } = useQuery({
    queryKey: ['sozlesme', id],
    queryFn: async () => {
      const response = await api.get(`/sozlesmeler/${id}`)
      return response.data.data
    },
  })

  const { data: isKalemleri, isLoading: kalemLoading } = useQuery({
    queryKey: ['is-kalemleri', id],
    queryFn: async () => {
      const response = await api.get(`/sozlesmeler/${id}/is-kalemleri`)
      return response.data.data as IsKalemi[]
    },
  })

  const { data: birimler } = useQuery({
    queryKey: ['settings-birimler'],
    queryFn: async () => {
      const { data } = await api.get('/settings/birimler')
      return data.data as { id: string, ad: string }[]
    }
  })

  const { data: pozlar } = useQuery({
    queryKey: ['settings-pozlar'],
    queryFn: async () => {
      const { data } = await api.get('/settings/pozlar')
      return data.data as { id: string, poz_no: string, tanim: string, birimler?: { ad: string } }[]
    }
  })

  const handleAddKalem = () => {
    setEditingKalem(null)
    kalemForm.resetFields()
    const nextSira = isKalemleri && isKalemleri.length > 0 
      ? Math.max(...isKalemleri.map(k => k.sira_no)) + 1 
      : 1
    kalemForm.setFieldsValue({ sira_no: nextSira })
    setIsKalemiModalOpen(true)
  }

  const handlePozSelect = (pozId: string) => {
    const selectedPoz = pozlar?.find(p => p.id === pozId)
    if (selectedPoz) {
      kalemForm.setFieldsValue({
        poz_no: selectedPoz.poz_no,
        tanim: selectedPoz.tanim,
        birim: selectedPoz.birimler?.ad
      })
    }
  }

  const saveKalemMutation = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      if (editingKalem) {
        const { data } = await api.put(`/sozlesmeler/is-kalemleri/${editingKalem.id}`, values)
        return data
      }
      const { data } = await api.post(`/sozlesmeler/${id}/is-kalemleri`, values)
      return data
    },
    onSuccess: () => {
      message.success(editingKalem ? 'İş kalemi güncellendi' : 'İş kalemi eklendi')
      queryClient.invalidateQueries({ queryKey: ['is-kalemleri', id] })
      closeKalemModal()
    },
    onError: (err) => message.error(getErrorMessage(err)),
  })

  const deleteKalemMutation = useMutation({
    mutationFn: async (kalemId: string) => {
      await api.delete(`/sozlesmeler/is-kalemleri/${kalemId}`)
    },
    onSuccess: () => {
      message.success('İş kalemi silindi')
      queryClient.invalidateQueries({ queryKey: ['is-kalemleri', id] })
    },
    onError: (err) => message.error(getErrorMessage(err)),
  })

  const deleteSozlesmeMutation = useMutation({
    mutationFn: async () => {
      await api.delete(`/sozlesmeler/${id}`)
    },
    onSuccess: () => {
      message.success('Sözleşme silindi')
      queryClient.invalidateQueries({ queryKey: ['sozlesmeler'] })
      if (sozlesme) navigate(`/firmalar/${sozlesme.firma_id}`)
      else navigate('/firmalar')
    },
    onError: (err) => message.error(getErrorMessage(err)),
  })

  const closeKalemModal = () => {
    setIsKalemiModalOpen(false)
    setEditingKalem(null)
    kalemForm.resetFields()
  }

  const openEditKalem = (kalem: IsKalemi) => {
    setEditingKalem(kalem)
    kalemForm.setFieldsValue(kalem)
    setIsKalemiModalOpen(true)
  }

  const isKalemiColumns = [
    { title: 'Sıra', dataIndex: 'sira_no', key: 'sira_no', width: 60 },
    { title: 'Poz No', dataIndex: 'poz_no', key: 'poz_no', width: 100 },
    { title: 'Tanım', dataIndex: 'tanim', key: 'tanim' },
    { title: 'Birim', dataIndex: 'birim', key: 'birim', width: 80 },
    {
      title: 'Miktar',
      dataIndex: 'miktar',
      key: 'miktar',
      align: 'right' as const,
      width: 100,
      render: (v: number) => trNumberFormatter(v),
    },
    {
      title: 'Birim Fiyat',
      dataIndex: 'birim_fiyat',
      key: 'birim_fiyat',
      align: 'right' as const,
      width: 120,
      render: (v: number) => <MoneyDisplay amount={v} />,
    },
    {
      title: 'Toplam',
      dataIndex: 'toplam_tutar',
      key: 'toplam_tutar',
      align: 'right' as const,
      width: 130,
      render: (v: number) => <MoneyDisplay amount={v} />,
    },
    {
      title: 'İşlem',
      key: 'action',
      width: 100,
      render: (_: unknown, record: IsKalemi) => (
        <Space>
          <Button icon={<EditOutlined />} type="text" onClick={() => openEditKalem(record)} />
          <ConfirmDelete
            title="İş kalemi silinecek, emin misiniz?"
            onConfirm={() => deleteKalemMutation.mutate(record.id)}
          />
        </Space>
      ),
    },
  ]

  const toplamTutar = isKalemleri?.reduce((sum, k) => sum + Number(k.toplam_tutar), 0) || 0

  return (
    <div>
      <PageHeader
        title={sozlesme ? `Sözleşme: ${sozlesme.konu}` : 'Sözleşme Detayı'}
        subtitle="Sözleşme kapsamındaki iş kalemlerini ve mali detayları yönetin"
        showBack
        backPath={sozlesme ? `/firmalar/${sozlesme.firma_id}` : '/firmalar'}
        extra={
          <Space>
            <Button onClick={() => navigate(`/sozlesmeler/${id}/duzenle`)}>
              Sözleşmeyi Düzenle
            </Button>
            <ConfirmDelete
              title="Sözleşme TAMAMEN silinecek. Emin misiniz?"
              onConfirm={() => deleteSozlesmeMutation.mutate()}
            >
              <Button danger>Sözleşmeyi Sil</Button>
            </ConfirmDelete>
          </Space>
        }
      />

      <Card loading={isLoading} style={{ marginBottom: 24 }}>
        {sozlesme && (
          <Descriptions bordered column={{ xxl: 3, xl: 3, lg: 3, md: 2, sm: 1, xs: 1 }}>
            <Descriptions.Item label="Firma">
              <Button type="link" onClick={() => navigate(`/firmalar/${sozlesme.firma_id}`)} style={{ padding: 0, height: 'auto' }}>
                {sozlesme.firmalar?.unvan}
              </Button>
            </Descriptions.Item>
            <Descriptions.Item label="Sözleşme No">{sozlesme.sozlesme_no || '-'}</Descriptions.Item>
            <Descriptions.Item label="Toplam Tutar">
              <MoneyDisplay amount={sozlesme.toplam_tutar} />
            </Descriptions.Item>
            <Descriptions.Item label="Başlangıç">
              {sozlesme.baslangic_tarihi ? dayjs(sozlesme.baslangic_tarihi).format('DD.MM.YYYY') : '-'}
            </Descriptions.Item>
            <Descriptions.Item label="Bitiş">
              {sozlesme.bitis_tarihi ? dayjs(sozlesme.bitis_tarihi).format('DD.MM.YYYY') : '-'}
            </Descriptions.Item>
            <Descriptions.Item label="Teminat / Stopaj">
              %{sozlesme.teminat_orani} / %{sozlesme.stopaj_orani}
            </Descriptions.Item>
            {sozlesme.notlar && (
              <Descriptions.Item label="Notlar" span={3}>{sozlesme.notlar}</Descriptions.Item>
            )}
          </Descriptions>
        )}
      </Card>

      <Card
        title={`İş Kalemleri (${isKalemleri?.length || 0})`}
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAddKalem}>
            İş Kalemi Ekle
          </Button>
        }
        styles={{ body: { padding: 0 } }}
      >
        <DataTable
          hideCard
          columns={isKalemiColumns}
          dataSource={isKalemleri}
          rowKey="id"
          loading={kalemLoading}
          pagination={false}
          size="small"
          emptyDescription="Sözleşmede iş kalemi yok"
          emptyAction={
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAddKalem}>
              İş Kalemi Ekle
            </Button>
          }
          summary={() => (
            <Table.Summary fixed>
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={6} align="right">
                  <strong>Toplam:</strong>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={6}>
                  <strong><MoneyDisplay amount={toplamTutar} /></strong>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={7} />
              </Table.Summary.Row>
            </Table.Summary>
          )}
        />
      </Card>

      <Modal
        title={editingKalem ? 'İş Kalemi Düzenle' : 'Yeni İş Kalemi'}
        open={isKalemiModalOpen}
        onCancel={closeKalemModal}
        onOk={() => kalemForm.submit()}
        confirmLoading={saveKalemMutation.isPending}
        width="min(650px, 95vw)"
      >
        <Form form={kalemForm} layout="vertical" onFinish={(v) => saveKalemMutation.mutate(v)} validateTrigger={["onBlur", "onChange"]}>
          {!editingKalem && (
            <Form.Item label="Hazır Pozlardan Seç" help="Ön tanımlı bir poz seçerek alanları otomatik doldurabilirsiniz.">
              <Select 
                showSearch
                placeholder="Poz seçin" 
                optionFilterProp="children"
                onChange={handlePozSelect}
                allowClear
              >
                {pozlar?.map(p => (
                  <Select.Option key={p.id} value={p.id}>{p.poz_no} - {p.tanim}</Select.Option>
                ))}
              </Select>
            </Form.Item>
          )}
          
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="sira_no" label="Sıra No">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="poz_no" label="Poz No">
                <Input autoComplete="off" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="tanim" label="Tanım" rules={[{ required: true, message: 'Tanım zorunlu' }]}>
            <Input.TextArea rows={2} />
          </Form.Item>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="birim" label="Birim" rules={[{ required: true, message: 'Birim zorunlu' }]}>
                <Select placeholder="Birim seçin">
                  {birimler?.map(b => <Select.Option key={b.ad} value={b.ad}>{b.ad}</Select.Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="miktar" label="Miktar" rules={[{ required: true, message: 'Miktar zorunlu' }]}>
                <InputNumber 
                  min={0} 
                  step={0.001} 
                  style={{ width: '100%' }}
                  formatter={trNumberFormatter}
                  parser={trNumberParser}
                  decimalSeparator=","
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="birim_fiyat" label="Birim Fiyat (TL)" rules={[{ required: true, message: 'Fiyat zorunlu' }]}>
                <InputNumber 
                  min={0} 
                  step={0.01} 
                  style={{ width: '100%' }}
                  formatter={trMoneyFormatter}
                  parser={trNumberParser}
                  decimalSeparator=","
                />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  )
}
