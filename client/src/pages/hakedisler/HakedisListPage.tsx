import React, { useState } from 'react'
import { Button, Select, Space, Tag, Modal, Form, DatePicker, Input, Popconfirm, Tooltip, App } from 'antd'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { PlusOutlined, EyeOutlined, RollbackOutlined, DeleteOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import api from '../../lib/api'
import { getErrorMessage } from '../../lib/apiError'
import { DataTable } from '../../components/common/DataTable'
import { ErrorState } from '../../components/common/ErrorState'
import { MoneyDisplay } from '../../components/common/MoneyDisplay'
import { HeaderActionsToolbar } from '../../components/common/HeaderActionsToolbar'
import { usePageSettings } from '../../contexts/LayoutContext'
import { useProject } from '../../contexts/ProjectContext'
import { usePermissions } from '../../hooks/usePermissions'


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
  const { activeProject } = useProject()
  const { canEdit, canDelete } = usePermissions()
  const [filterDurum, setFilterDurum] = useState<string | undefined>(undefined)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [selectedFirmaId, setSelectedFirmaId] = useState<string | null>(null)
  const [createForm] = Form.useForm()

  // OC-02 (sprint 20260511-ui-responsive-sprint extension):
  // HeaderActionsToolbar — primary=Yeni Hakediş, secondary=Durum Select
  const activeFilterCount = filterDurum ? 1 : 0

  const primaryAction = React.useMemo(() => (
    <Button
      size="small"
      type="primary"
      icon={<PlusOutlined />}
      onClick={() => setCreateModalOpen(true)}
      disabled={!canEdit}
      title={!canEdit ? 'Yetki yok' : undefined}
    >
      Yeni Hakediş
    </Button>
  ), [canEdit])

  const secondaryActions = React.useMemo(() => (
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
  ), [filterDurum])

  const headerActions = React.useMemo(() => (
    <HeaderActionsToolbar
      primary={primaryAction}
      secondary={secondaryActions}
      filterCount={activeFilterCount}
      drawerTitle="Hakediş Filtreleri"
    />
  ), [primaryAction, secondaryActions, activeFilterCount])

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
      // REV-HAK-01 (2026-05-12): proje_id payload'a eklenmeli. Aksi halde
      // DB'ye proje_id=NULL hakediş kaydı düşer ve onay akışında cari_hareketler
      // INSERT'i 23502 NOT NULL violation ile reddedilir ("Zorunlu alan eksik: proje_id").
      if (!activeProject?.id) {
        throw new Error('Hakediş oluşturmak için önce aktif bir proje seçmelisiniz.')
      }
      const payload = {
        ...values,
        proje_id: activeProject.id,
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

  const deleteMutation = useMutation({
    // proje_id, api.ts interceptor tarafından DELETE query'sine eklenir.
    mutationFn: async (id: string) => api.delete(`/hakedisler/${id}`),
    onSuccess: () => {
      message.success('Hakediş silindi')
      queryClient.invalidateQueries({ queryKey: ['hakedisler'] })
    },
    onError: (err) => message.error(getErrorMessage(err, 'Silme başarısız')),
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
      width: 130,
      render: (_: unknown, r: Hakedis) => {
        // Onaylı/ödenmiş hakediş silinemez (cari hareket + huzur hakkı dağıtımı içerir).
        const silinebilir = r.durum !== 'onaylandi' && r.durum !== 'odendi'
        return (
          <Space>
            <Button icon={<EyeOutlined />} type="text" onClick={() => navigate(`/hakedisler/${r.id}`)} />
            {r.durum === 'onaylandi' && canDelete && (
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
            {canDelete && (
              silinebilir ? (
                <Popconfirm
                  title="Hakediş kalıcı olarak silinecek. Emin misiniz?"
                  onConfirm={() => deleteMutation.mutate(r.id)}
                  okText="Evet, sil"
                  cancelText="Hayır"
                  okButtonProps={{ danger: true }}
                >
                  <Tooltip title="Sil">
                    <Button
                      icon={<DeleteOutlined />}
                      type="text"
                      danger
                      loading={deleteMutation.isPending}
                    />
                  </Tooltip>
                </Popconfirm>
              ) : (
                <Tooltip title="Onaylı/ödenmiş hakediş silinemez — önce onayı iptal edin">
                  <Button icon={<DeleteOutlined />} type="text" danger disabled />
                </Tooltip>
              )
            )}
          </Space>
        )
      },
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
          validateTrigger={["onBlur", "onChange"]}
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
