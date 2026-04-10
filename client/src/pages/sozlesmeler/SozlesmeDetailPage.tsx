import React, { useState } from 'react'
import { Card, Descriptions, Table, Button, Modal, Form, Input, InputNumber, Space, Tag, message } from 'antd'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import api from '../../lib/api'
import { PageHeader } from '../../components/common/PageHeader'
import { MoneyDisplay } from '../../components/common/MoneyDisplay'
import { ConfirmDelete } from '../../components/common/ConfirmDelete'

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
      const { data } = await api.get(`/sozlesmeler/${id}`)
      return data.data
    },
  })

  const { data: isKalemleri, isLoading: kalemLoading } = useQuery({
    queryKey: ['is-kalemleri', id],
    queryFn: async () => {
      const { data } = await api.get(`/sozlesmeler/${id}/is-kalemleri`)
      return data.data as IsKalemi[]
    },
  })

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
    onError: (err: any) => message.error(err.message || 'Hata oluştu'),
  })

  const deleteKalemMutation = useMutation({
    mutationFn: async (kalemId: string) => {
      await api.delete(`/sozlesmeler/is-kalemleri/${kalemId}`)
    },
    onSuccess: () => {
      message.success('İş kalemi silindi')
      queryClient.invalidateQueries({ queryKey: ['is-kalemleri', id] })
    },
    onError: (err: any) => message.error(err.message || 'Hata oluştu'),
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
      width: 100,
      render: (v: number) => v?.toLocaleString('tr-TR'),
    },
    {
      title: 'Birim Fiyat',
      dataIndex: 'birim_fiyat',
      key: 'birim_fiyat',
      width: 120,
      render: (v: number) => <MoneyDisplay amount={v} />,
    },
    {
      title: 'Toplam',
      dataIndex: 'toplam_tutar',
      key: 'toplam_tutar',
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
        showBack
        backPath={sozlesme ? `/firmalar/${sozlesme.firma_id}` : '/firmalar'}
        extra={
          <Button onClick={() => navigate(`/sozlesmeler/${id}/duzenle`)}>
            Sözleşmeyi Düzenle
          </Button>
        }
      />

      <Card loading={isLoading} style={{ marginBottom: 24 }}>
        {sozlesme && (
          <Descriptions bordered column={{ xxl: 3, xl: 3, lg: 3, md: 2, sm: 1, xs: 1 }}>
            <Descriptions.Item label="Firma">
              <a onClick={() => navigate(`/firmalar/${sozlesme.firma_id}`)}>
                {sozlesme.firmalar?.unvan}
              </a>
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
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsKalemiModalOpen(true)}>
            İş Kalemi Ekle
          </Button>
        }
        styles={{ body: { padding: 0 } }}
      >
        <Table
          columns={isKalemiColumns}
          dataSource={isKalemleri}
          rowKey="id"
          loading={kalemLoading}
          pagination={false}
          size="small"
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
        width={600}
      >
        <Form form={kalemForm} layout="vertical" onFinish={(v) => saveKalemMutation.mutate(v)}>
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="sira_no" label="Sıra No" style={{ flex: 1 }}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="poz_no" label="Poz No" style={{ flex: 1 }}>
              <Input />
            </Form.Item>
          </div>
          <Form.Item name="tanim" label="Tanım" rules={[{ required: true, message: 'Tanım zorunlu' }]}>
            <Input.TextArea rows={2} />
          </Form.Item>
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="birim" label="Birim" rules={[{ required: true, message: 'Birim zorunlu' }]} style={{ flex: 1 }}>
              <Input placeholder="m2, m3, kg, adet..." />
            </Form.Item>
            <Form.Item name="miktar" label="Miktar" rules={[{ required: true, message: 'Miktar zorunlu' }]} style={{ flex: 1 }}>
              <InputNumber min={0} step={0.001} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="birim_fiyat" label="Birim Fiyat (TL)" rules={[{ required: true, message: 'Fiyat zorunlu' }]} style={{ flex: 1 }}>
              <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
            </Form.Item>
          </div>
        </Form>
      </Modal>
    </div>
  )
}
