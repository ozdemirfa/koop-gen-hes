import React, { useState } from 'react'
import { Button, Select, Space, Tag, Modal, Form, DatePicker, Input, message } from 'antd'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { PlusOutlined, EyeOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import api from '../../lib/api'
import { PageHeader } from '../../components/common/PageHeader'
import { DataTable } from '../../components/common/DataTable'
import { ErrorState } from '../../components/common/ErrorState'
import { MoneyDisplay } from '../../components/common/MoneyDisplay'

interface Hakedis {
  id: string
  hakedis_no: number
  durum: string
  toplam_tutar: number
  net_tutar: number
  donem_baslangic?: string
  donem_bitis?: string
  sozlesmeler?: {
    sozlesme_no?: string
    konu: string
    firmalar?: { unvan: string }
  }
}

const durumRenk: Record<string, string> = {
  taslak: 'default',
  onaylandi: 'blue',
  odendi: 'green',
  iptal: 'red',
}

const durumLabel: Record<string, string> = {
  taslak: 'Taslak',
  onaylandi: 'Onaylandı',
  odendi: 'Ödendi',
  iptal: 'İptal',
}

export const HakedisListPage: React.FC = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [filterDurum, setFilterDurum] = useState<string | undefined>(undefined)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [createForm] = Form.useForm()

  const { data: sozlesmeler } = useQuery({
    queryKey: ['sozlesmeler-select'],
    queryFn: async () => {
      const { data } = await api.get('/sozlesmeler', { params: { limit: 500 } })
      return data.data as { id: string; sozlesme_no?: string; konu: string; firmalar?: { unvan: string } }[]
    },
  })

  const { data: hakedisData, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['hakedisler', filterDurum],
    queryFn: async () => {
      const params: Record<string, string> = {}
      if (filterDurum) params.durum = filterDurum
      const { data } = await api.get('/hakedisler', { params })
      return data
    },
  })

  const createMutation = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const payload = {
        ...values,
        donem_baslangic: values.donem_baslangic
          ? (values.donem_baslangic as dayjs.Dayjs).format('YYYY-MM-DD')
          : null,
        donem_bitis: values.donem_bitis
          ? (values.donem_bitis as dayjs.Dayjs).format('YYYY-MM-DD')
          : null,
      }
      const { data } = await api.post('/hakedisler', payload)
      return data
    },
    onSuccess: (data) => {
      message.success('Hakediş oluşturuldu')
      queryClient.invalidateQueries({ queryKey: ['hakedisler'] })
      setCreateModalOpen(false)
      createForm.resetFields()
      if (data.data?.id) navigate(`/hakedisler/${data.data.id}`)
    },
    onError: (err: any) => message.error(err.message || 'Hata oluştu'),
  })

  const columns = [
    {
      title: 'Firma',
      key: 'firma',
      render: (_: unknown, r: Hakedis) => r.sozlesmeler?.firmalar?.unvan || '-',
    },
    {
      title: 'Sözleşme',
      key: 'sozlesme',
      render: (_: unknown, r: Hakedis) => r.sozlesmeler?.konu || '-',
    },
    {
      title: 'Hakediş No',
      dataIndex: 'hakedis_no',
      key: 'hakedis_no',
      width: 100,
      render: (v: number) => `#${v}`,
    },
    {
      title: 'Dönem',
      key: 'donem',
      width: 200,
      render: (_: unknown, r: Hakedis) => {
        const start = r.donem_baslangic ? dayjs(r.donem_baslangic).format('DD.MM.YYYY') : '-'
        const end = r.donem_bitis ? dayjs(r.donem_bitis).format('DD.MM.YYYY') : '-'
        return `${start} - ${end}`
      },
    },
    {
      title: 'Toplam',
      dataIndex: 'toplam_tutar',
      key: 'toplam_tutar',
      width: 130,
      render: (v: number) => <MoneyDisplay amount={v} />,
    },
    {
      title: 'Net Tutar',
      dataIndex: 'net_tutar',
      key: 'net_tutar',
      width: 130,
      render: (v: number) => <MoneyDisplay amount={v} />,
    },
    {
      title: 'Durum',
      dataIndex: 'durum',
      key: 'durum',
      width: 100,
      render: (d: string) => <Tag color={durumRenk[d]}>{durumLabel[d] || d}</Tag>,
    },
    {
      title: 'İşlem',
      key: 'action',
      width: 60,
      render: (_: unknown, r: Hakedis) => (
        <Button icon={<EyeOutlined />} type="text" onClick={() => navigate(`/hakedisler/${r.id}`)} />
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Hakediş Yönetimi"
        extra={
          <Space>
            <Select
              placeholder="Durum"
              value={filterDurum}
              onChange={setFilterDurum}
              allowClear
              style={{ width: 130 }}
            >
              <Select.Option value="taslak">Taslak</Select.Option>
              <Select.Option value="onaylandi">Onaylandı</Select.Option>
              <Select.Option value="odendi">Ödendi</Select.Option>
              <Select.Option value="iptal">İptal</Select.Option>
            </Select>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalOpen(true)}>
              Yeni Hakediş
            </Button>
          </Space>
        }
      />

      {isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : (
        <DataTable
          columns={columns}
          dataSource={hakedisData?.data}
          rowKey="id"
          loading={isLoading}
          totalItems={hakedisData?.pagination?.total}
          emptyDescription="Kayıtlı hakediş bulunamadı"
        />
      )}

      <Modal
        title="Yeni Hakediş Oluştur"
        open={createModalOpen}
        onCancel={() => { setCreateModalOpen(false); createForm.resetFields() }}
        onOk={() => createForm.submit()}
        confirmLoading={createMutation.isPending}
      >
        <Form form={createForm} layout="vertical" onFinish={(v) => createMutation.mutate(v)}>
          <Form.Item name="sozlesme_id" label="Sözleşme" rules={[{ required: true, message: 'Sözleşme seçin' }]}>
            <Select
              showSearch
              placeholder="Sözleşme seçin"
              optionFilterProp="children"
            >
              {sozlesmeler?.map((s) => (
                <Select.Option key={s.id} value={s.id}>
                  {s.firmalar?.unvan} - {s.konu} {s.sozlesme_no ? `(${s.sozlesme_no})` : ''}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="donem_baslangic" label="Dönem Başlangıç" style={{ flex: 1 }}>
              <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
            </Form.Item>
            <Form.Item name="donem_bitis" label="Dönem Bitiş" style={{ flex: 1 }}>
              <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
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
