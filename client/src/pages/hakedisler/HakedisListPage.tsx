import React, { useState } from 'react'
import { Button, Select, Space, Tag, Modal, Form, DatePicker, Input, Popconfirm, Tooltip, App } from 'antd'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { PlusOutlined, EyeOutlined, RollbackOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import api from '../../lib/api'
import { getErrorMessage } from '../../lib/apiError'
import { DataTable } from '../../components/common/DataTable'
import { ErrorState } from '../../components/common/ErrorState'
import { MoneyDisplay } from '../../components/common/MoneyDisplay'
import { usePageSettings } from '../../contexts/LayoutContext'
import { trNumberFormatter, trNumberParser } from '../../lib/format'

interface Hakedis {
  id: string
  hakedis_no: number
  durum: string
  ara_toplam: number
  hakedis_toplam: number
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
  const { message } = App.useApp()
  const [filterDurum, setFilterDurum] = useState<string | undefined>(undefined)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [selectedFirmaId, setSelectedFirmaId] = useState<string | null>(null)
  const [createForm] = Form.useForm()

  const headerActions = React.useMemo(() => (
    <Space>
      <Select
        placeholder="Durum"
        size="small"
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
      <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalOpen(true)}>
        Yeni Hakediş
      </Button>
    </Space>
  ), [filterDurum])

  usePageSettings('Hakedişler', headerActions)

  const { data: firmalar } = useQuery({
    queryKey: ['firmalar-select'],
    queryFn: async () => {
      const { data } = await api.get('/firmalar', { params: { aktif: 'true', limit: 500 } })
      return data.data as { id: string; unvan: string }[]
    },
    enabled: createModalOpen
  })

  const { data: sozlesmeler } = useQuery({
    queryKey: ['sozlesmeler-select', selectedFirmaId],
    queryFn: async () => {
      const params: any = { limit: 500 }
      if (selectedFirmaId) params.firma_id = selectedFirmaId
      const { data } = await api.get('/sozlesmeler', { params })
      return data.data as { id: string; sozlesme_no?: string; konu: string; firmalar?: { unvan: string } }[]
    },
    enabled: createModalOpen && !!selectedFirmaId
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
      setSelectedFirmaId(null)
      if (data.data?.id) navigate(`/hakedisler/${data.data.id}`)
    },
    onError: (err) => message.error(getErrorMessage(err)),
  })

  const unapproveMutation = useMutation({
    mutationFn: async (id: string) => {
      return api.put(`/hakedisler/${id}/onay-iptal`)
    },
    onSuccess: () => {
      message.success('Hakediş onayı iptal edildi, tekrar düzenlenebilir.')
      queryClient.invalidateQueries({ queryKey: ['hakedisler'] })
    },
    onError: (err) => message.error(getErrorMessage(err, 'İşlem başarısız')),
  })

  const handleFirmaChange = (val: string) => {
    setSelectedFirmaId(val)
    createForm.setFieldsValue({ sozlesme_id: undefined })
  }

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
      title: 'Matrah',
      dataIndex: 'ara_toplam',
      key: 'ara_toplam',
      align: 'right' as const,
      width: 120,
      render: (v: number) => <MoneyDisplay amount={v} />,
    },
    {
      title: 'Hakediş Toplamı (KDVli)',
      dataIndex: 'hakedis_toplam',
      key: 'hakedis_toplam',
      align: 'right' as const,
      width: 150,
      render: (v: number) => <MoneyDisplay amount={v} />,
    },
    {
      title: 'Net Tutar',
      dataIndex: 'net_tutar',
      key: 'net_tutar',
      align: 'right' as const,
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
      width: 100,
      render: (_: unknown, r: Hakedis) => (
        <Space>
          <Button icon={<EyeOutlined />} type="text" onClick={() => navigate(`/hakedisler/${r.id}`)} />
          {r.durum === 'onaylandi' && (
            <Popconfirm
              title="Hakediş onayı iptal edilecek ve cari hareketi silinecek. Emin misiniz?"
              onConfirm={() => unapproveMutation.mutate(r.id)}
              okText="Evet"
              cancelText="Hayır"
            >
              <Tooltip title="Onay İptal (Revizyona Aç)">
                <Button 
                  icon={<RollbackOutlined />} 
                  type="text" 
                  danger 
                  loading={unapproveMutation.isPending}
                />
              </Tooltip>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ]

  return (
    <div>
      {isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : (
        <DataTable
          columns={columns}
          dataSource={hakedisData?.data}
          rowKey="id"
          loading={isLoading}
          totalItems={hakedisData?.pagination?.totalCount}
          emptyDescription="Kayıtlı hakediş bulunamadı"
        />
      )}

      <Modal
        title="Yeni Hakediş Oluştur"
        open={createModalOpen}
        onCancel={() => { 
          setCreateModalOpen(false)
          createForm.resetFields()
          setSelectedFirmaId(null)
        }}
        onOk={() => createForm.submit()}
        confirmLoading={createMutation.isPending}
        destroyOnHidden
        width="min(520px, 95vw)"
        okText="Oluştur"
        cancelText="İptal"
      >
        <Form 
          form={createForm} 
          layout="vertical" 
          onFinish={(v) => createMutation.mutate(v)}
          style={{ marginTop: 16 }}
        >
          <Form.Item name="firma_id_virtual" label="Firma" rules={[{ required: true, message: 'Firma seçin' }]}>
            <Select
              showSearch
              placeholder="Firma seçin"
              optionFilterProp="label"
              onChange={handleFirmaChange}
              options={firmalar?.map(f => ({ value: f.id, label: f.unvan }))}
            />
          </Form.Item>
          <Form.Item name="sozlesme_id" label="Sözleşme" rules={[{ required: true, message: 'Sözleşme seçin' }]}>
            <Select
              showSearch
              placeholder={selectedFirmaId ? "Sözleşme seçin" : "Önce firma seçin"}
              optionFilterProp="label"
              disabled={!selectedFirmaId}
              options={sozlesmeler?.map(s => ({ 
                value: s.id, 
                label: `${s.konu} ${s.sozlesme_no ? `(${s.sozlesme_no})` : ''}` 
              }))}
            />
          </Form.Item>
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="donem_baslangic" label="Dönem Başlangıç" style={{ flex: 1 }}>
              <DatePicker size="small" style={{ width: '100%' }} format="DD.MM.YYYY" />
            </Form.Item>
            <Form.Item name="donem_bitis" label="Dönem Bitiş" style={{ flex: 1 }}>
              <DatePicker size="small" style={{ width: '100%' }} format="DD.MM.YYYY" />
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
