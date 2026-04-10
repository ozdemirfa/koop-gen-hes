import React, { useState } from 'react'
import { Button, Select, Space, Tag, Modal, Form, Input, InputNumber, DatePicker, message } from 'antd'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { PlusOutlined, DeleteOutlined, ScheduleOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import api from '../../lib/api'
import { PageHeader } from '../../components/common/PageHeader'
import { DataTable } from '../../components/common/DataTable'
import { MoneyDisplay } from '../../components/common/MoneyDisplay'
import { ConfirmDelete } from '../../components/common/ConfirmDelete'

interface Fatura {
  id: string
  fatura_no: string
  fatura_tipi: string
  fatura_tarihi: string
  vade_tarihi?: string
  ara_toplam: number
  kdv_orani: number
  kdv_tutar: number
  toplam_tutar: number
  durum: string
  firmalar?: { unvan: string }
}

const tipLabel: Record<string, string> = { gelen: 'Gelen', giden: 'Giden' }
const durumLabel: Record<string, string> = { bekliyor: 'Bekliyor', odendi: 'Ödendi', kismi_odendi: 'Kısmi Ödendi', iptal: 'İptal' }
const durumRenk: Record<string, string> = { bekliyor: 'blue', odendi: 'green', kismi_odendi: 'orange', iptal: 'red' }

export const FaturaListPage: React.FC = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [filterTip, setFilterTip] = useState<string | undefined>(undefined)
  const [filterDurum, setFilterDurum] = useState<string | undefined>(undefined)
  const [modalOpen, setModalOpen] = useState(false)
  const [form] = Form.useForm()

  const { data: firmalar } = useQuery({
    queryKey: ['firmalar-select'],
    queryFn: async () => {
      const { data } = await api.get('/firmalar', { params: { aktif: 'true', limit: 500 } })
      return data.data as { id: string; unvan: string }[]
    },
  })

  const { data: faturaData, isLoading } = useQuery({
    queryKey: ['faturalar', filterTip, filterDurum],
    queryFn: async () => {
      const params: Record<string, string> = {}
      if (filterTip) params.fatura_tipi = filterTip
      if (filterDurum) params.durum = filterDurum
      const { data } = await api.get('/faturalar', { params })
      return data
    },
  })

  const createMutation = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const payload = {
        ...values,
        fatura_tarihi: (values.fatura_tarihi as dayjs.Dayjs).format('YYYY-MM-DD'),
        vade_tarihi: values.vade_tarihi ? (values.vade_tarihi as dayjs.Dayjs).format('YYYY-MM-DD') : null,
      }
      const { data } = await api.post('/faturalar', payload)
      return data
    },
    onSuccess: () => {
      message.success('Fatura oluşturuldu')
      queryClient.invalidateQueries({ queryKey: ['faturalar'] })
      setModalOpen(false)
      form.resetFields()
    },
    onError: (err: any) => message.error(err.message || 'Hata oluştu'),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await api.delete(`/faturalar/${id}`) },
    onSuccess: () => {
      message.success('Fatura silindi')
      queryClient.invalidateQueries({ queryKey: ['faturalar'] })
    },
    onError: (err: any) => message.error(err.message || 'Hata oluştu'),
  })

  // KDV otomatik hesaplama
  const handleAraToplam = () => {
    const araToplam = form.getFieldValue('ara_toplam') || 0
    const kdvOrani = form.getFieldValue('kdv_orani') || 20
    const kdvTutar = araToplam * (kdvOrani / 100)
    form.setFieldsValue({ kdv_tutar: Math.round(kdvTutar * 100) / 100, toplam_tutar: Math.round((araToplam + kdvTutar) * 100) / 100 })
  }

  const columns = [
    { title: 'Fatura No', dataIndex: 'fatura_no', key: 'fatura_no', width: 120 },
    {
      title: 'Firma',
      key: 'firma',
      render: (_: unknown, r: Fatura) => r.firmalar?.unvan || '-',
    },
    {
      title: 'Tip',
      dataIndex: 'fatura_tipi',
      key: 'fatura_tipi',
      width: 80,
      render: (t: string) => <Tag color={t === 'gelen' ? 'red' : 'green'}>{tipLabel[t]}</Tag>,
    },
    {
      title: 'Tarih',
      dataIndex: 'fatura_tarihi',
      key: 'fatura_tarihi',
      width: 110,
      render: (d: string) => dayjs(d).format('DD.MM.YYYY'),
    },
    {
      title: 'Vade',
      dataIndex: 'vade_tarihi',
      key: 'vade_tarihi',
      width: 110,
      render: (d: string) => d ? dayjs(d).format('DD.MM.YYYY') : '-',
    },
    {
      title: 'Toplam',
      dataIndex: 'toplam_tutar',
      key: 'toplam_tutar',
      width: 130,
      render: (v: number) => <MoneyDisplay amount={v} />,
    },
    {
      title: 'Durum',
      dataIndex: 'durum',
      key: 'durum',
      width: 110,
      render: (d: string) => <Tag color={durumRenk[d]}>{durumLabel[d] || d}</Tag>,
    },
    {
      title: 'İşlem',
      key: 'action',
      width: 100,
      render: (_: unknown, r: Fatura) => (
        <Space>
          <Button 
            size="small" 
            icon={<ScheduleOutlined />} 
            onClick={() => navigate(`/faturalar/${r.id}/odeme-plani`)}
            title="Ödeme Planı"
          />
          <ConfirmDelete title="Fatura silinecek, emin misiniz?" onConfirm={() => deleteMutation.mutate(r.id)} />
        </Space>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Fatura Yönetimi"
        extra={
          <Space>
            <Select placeholder="Tip" value={filterTip} onChange={setFilterTip} allowClear style={{ width: 110 }}>
              <Select.Option value="gelen">Gelen</Select.Option>
              <Select.Option value="giden">Giden</Select.Option>
            </Select>
            <Select placeholder="Durum" value={filterDurum} onChange={setFilterDurum} allowClear style={{ width: 130 }}>
              <Select.Option value="bekliyor">Bekliyor</Select.Option>
              <Select.Option value="odendi">Ödendi</Select.Option>
              <Select.Option value="kismi_odendi">Kısmi Ödendi</Select.Option>
              <Select.Option value="iptal">İptal</Select.Option>
            </Select>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
              Yeni Fatura
            </Button>
          </Space>
        }
      />

      <DataTable
        columns={columns}
        dataSource={faturaData?.data}
        rowKey="id"
        loading={isLoading}
        totalItems={faturaData?.pagination?.total}
      />

      <Modal
        title="Yeni Fatura"
        open={modalOpen}
        onCancel={() => { setModalOpen(false); form.resetFields() }}
        onOk={() => form.submit()}
        confirmLoading={createMutation.isPending}
        width={640}
      >
        <Form form={form} layout="vertical" onFinish={(v) => createMutation.mutate(v)} initialValues={{ kdv_orani: 20 }}>
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="firma_id" label="Firma" rules={[{ required: true }]} style={{ flex: 2 }}>
              <Select showSearch placeholder="Firma seçin" optionFilterProp="children">
                {firmalar?.map(f => <Select.Option key={f.id} value={f.id}>{f.unvan}</Select.Option>)}
              </Select>
            </Form.Item>
            <Form.Item name="fatura_tipi" label="Tip" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Select>
                <Select.Option value="gelen">Gelen</Select.Option>
                <Select.Option value="giden">Giden</Select.Option>
              </Select>
            </Form.Item>
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="fatura_no" label="Fatura No" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Input />
            </Form.Item>
            <Form.Item name="fatura_tarihi" label="Fatura Tarihi" rules={[{ required: true }]} style={{ flex: 1 }}>
              <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
            </Form.Item>
            <Form.Item name="vade_tarihi" label="Vade Tarihi" style={{ flex: 1 }}>
              <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
            </Form.Item>
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="ara_toplam" label="Ara Toplam (TL)" rules={[{ required: true }]} style={{ flex: 1 }}>
              <InputNumber min={0} style={{ width: '100%' }} onChange={handleAraToplam} />
            </Form.Item>
            <Form.Item name="kdv_orani" label="KDV %" style={{ flex: 1 }}>
              <InputNumber min={0} max={100} style={{ width: '100%' }} onChange={handleAraToplam} />
            </Form.Item>
            <Form.Item name="kdv_tutar" label="KDV Tutar" style={{ flex: 1 }}>
              <InputNumber disabled style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="toplam_tutar" label="Toplam" rules={[{ required: true }]} style={{ flex: 1 }}>
              <InputNumber disabled style={{ width: '100%' }} />
            </Form.Item>
          </div>
          <Form.Item name="aciklama" label="Açıklama">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
