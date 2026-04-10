import React, { useState } from 'react'
import { Button, Modal, Form, Input, InputNumber, DatePicker, Select, Space, message, Tag } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import api from '../../lib/api'
import { PageHeader } from '../../components/common/PageHeader'
import { DataTable } from '../../components/common/DataTable'
import { MoneyDisplay } from '../../components/common/MoneyDisplay'
import { ConfirmDelete } from '../../components/common/ConfirmDelete'

interface MalzemeTeslim {
  id: string
  malzeme_adi: string
  malzeme_tipi?: string
  birim: string
  miktar: number
  birim_fiyat: number
  toplam_tutar: number
  teslim_tarihi: string
  irsaliye_no?: string
  firmalar?: { unvan: string }
  sozlesmeler?: { konu: string }
}

export const MalzemeTeslimListPage: React.FC = () => {
  const queryClient = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingTeslim, setEditingTeslim] = useState<MalzemeTeslim | null>(null)
  const [form] = Form.useForm()

  const { data: firmalar } = useQuery({
    queryKey: ['firmalar-select'],
    queryFn: async () => {
      const { data } = await api.get('/firmalar', { params: { aktif: 'true', limit: 500 } })
      return data.data as { id: string; unvan: string }[]
    },
  })

  const { data: teslimData, isLoading } = useQuery({
    queryKey: ['malzeme-teslimleri'],
    queryFn: async () => {
      const { data } = await api.get('/malzeme-teslimleri')
      return data
    },
  })

  const saveMutation = useMutation({
    mutationFn: async (values: any) => {
      const payload = {
        ...values,
        teslim_tarihi: (values.teslim_tarihi as dayjs.Dayjs).format('YYYY-MM-DD'),
      }
      if (editingTeslim) {
        return await api.put(`/malzeme-teslimleri/${editingTeslim.id}`, payload)
      }
      return await api.post('/malzeme-teslimleri', payload)
    },
    onSuccess: () => {
      message.success('Teslim kaydı kaydedildi')
      queryClient.invalidateQueries({ queryKey: ['malzeme-teslimleri'] })
      setModalOpen(false)
      form.resetFields()
      setEditingTeslim(null)
    },
    onError: (err: any) => message.error(err.message || 'Hata oluştu'),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await api.delete(`/malzeme-teslimleri/${id}`) },
    onSuccess: () => {
      message.success('Teslim kaydı silindi')
      queryClient.invalidateQueries({ queryKey: ['malzeme-teslimleri'] })
    },
    onError: (err: any) => message.error(err.message || 'Hata oluştu'),
  })

  const columns = [
    {
      title: 'Tarih',
      dataIndex: 'teslim_tarihi',
      key: 'teslim_tarihi',
      width: 110,
      render: (d: string) => dayjs(d).format('DD.MM.YYYY'),
    },
    { title: 'Malzeme Adı', dataIndex: 'malzeme_adi', key: 'malzeme_adi' },
    { title: 'Firma', key: 'firma', render: (_: any, r: MalzemeTeslim) => r.firmalar?.unvan || '-' },
    {
      title: 'Miktar',
      key: 'miktar',
      width: 120,
      render: (_: any, r: MalzemeTeslim) => (
        <span>{r.miktar} {r.birim}</span>
      ),
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
      render: (_: any, r: MalzemeTeslim) => (
        <Space>
          <Button
            icon={<EditOutlined />}
            size="small"
            onClick={() => {
              setEditingTeslim(r)
              form.setFieldsValue({ ...r, teslim_tarihi: dayjs(r.teslim_tarihi) })
              setModalOpen(true)
            }}
          />
          <ConfirmDelete onConfirm={() => deleteMutation.mutate(r.id)} />
        </Space>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Malzeme Teslimatları"
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditingTeslim(null)
              form.resetFields()
              setModalOpen(true)
            }}
          >
            Yeni Teslimat
          </Button>
        }
      />

      <DataTable
        columns={columns}
        dataSource={teslimData?.data}
        rowKey="id"
        loading={isLoading}
        totalItems={teslimData?.pagination?.total}
      />

      <Modal
        title={editingTeslim ? 'Teslimat Düzenle' : 'Yeni Malzeme Teslimatı'}
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false)
          setEditingTeslim(null)
        }}
        onOk={() => form.submit()}
        confirmLoading={saveMutation.isPending}
        width={640}
      >
        <Form form={form} layout="vertical" onFinish={(v) => saveMutation.mutate(v)}>
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="firma_id" label="Firma" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Select showSearch placeholder="Firma seçin" optionFilterProp="children">
                {firmalar?.map(f => <Select.Option key={f.id} value={f.id}>{f.unvan}</Select.Option>)}
              </Select>
            </Form.Item>
            <Form.Item name="teslim_tarihi" label="Teslim Tarihi" rules={[{ required: true }]} style={{ flex: 1 }}>
              <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
            </Form.Item>
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="malzeme_adi" label="Malzeme Adı" rules={[{ required: true }]} style={{ flex: 2 }}>
              <Input />
            </Form.Item>
            <Form.Item name="malzeme_tipi" label="Tip" style={{ flex: 1 }}>
              <Input />
            </Form.Item>
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="miktar" label="Miktar" rules={[{ required: true }]} style={{ flex: 1 }}>
              <InputNumber style={{ width: '100%' }} min={0} />
            </Form.Item>
            <Form.Item name="birim" label="Birim" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Select>
                <Select.Option value="Adet">Adet</Select.Option>
                <Select.Option value="Metre">Metre</Select.Option>
                <Select.Option value="Kg">Kg</Select.Option>
                <Select.Option value="m2">m2</Select.Option>
                <Select.Option value="m3">m3</Select.Option>
                <Select.Option value="Ton">Ton</Select.Option>
              </Select>
            </Form.Item>
            <Form.Item name="birim_fiyat" label="Birim Fiyat (TL)" rules={[{ required: true }]} style={{ flex: 1 }}>
              <InputNumber style={{ width: '100%' }} min={0} />
            </Form.Item>
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="irsaliye_no" label="İrsaliye No" style={{ flex: 1 }}>
              <Input />
            </Form.Item>
            <Form.Item name="teslim_alan" label="Teslim Alan" style={{ flex: 1 }}>
              <Input />
            </Form.Item>
          </div>
          <Form.Item name="notlar" label="Notlar">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
