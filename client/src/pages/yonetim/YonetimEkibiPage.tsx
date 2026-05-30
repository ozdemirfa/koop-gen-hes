import React, { useMemo, useState } from 'react'
import { Button, Modal, Form, Input, InputNumber, Space, Tooltip, App, Alert, Typography } from 'antd'
import { PlusOutlined, EditOutlined, ArrowLeftOutlined } from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../../lib/api'
import { getErrorMessage } from '../../lib/apiError'
import { usePageSettings } from '../../contexts/LayoutContext'
import { usePermissions } from '../../hooks/usePermissions'
import { DataTable } from '../../components/common/DataTable'
import { StrictConfirmDelete } from '../../components/common/StrictConfirmDelete'
import { ErrorState } from '../../components/common/ErrorState'
import { formatMoney } from '../../lib/format'

const { Text } = Typography

interface YonetimCari {
  id: string
  proje_id: string
  ad_soyad: string
  oran: number
  borc: number
  alacak: number
  bakiye: number
}

export const YonetimEkibiPage: React.FC = () => {
  const { id: projeId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { canEdit, canDelete } = usePermissions()
  const { message: messageApi } = App.useApp()

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<YonetimCari | null>(null)
  const [form] = Form.useForm()

  const { data: proje } = useQuery({
    queryKey: ['proje', projeId],
    queryFn: async () => {
      const { data } = await api.get(`/projeler/${projeId}`)
      return data.data
    },
    enabled: !!projeId,
  })

  const { data: list, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['yonetim-ekibi', projeId],
    queryFn: async () => {
      const { data } = await api.get('/yonetim-ekibi', { params: { proje_id: projeId } })
      return (data.data ?? []) as YonetimCari[]
    },
    enabled: !!projeId,
  })

  const toplamOran = useMemo(
    () => (list ?? []).reduce((acc, m) => acc + Number(m.oran || 0), 0),
    [list],
  )

  const saveMutation = useMutation({
    mutationFn: async (values: { ad_soyad: string; oran: number }) => {
      const payload = { ...values, proje_id: projeId }
      if (editing) {
        return await api.patch(`/yonetim-ekibi/${editing.id}`, payload)
      }
      return await api.post('/yonetim-ekibi', payload)
    },
    onSuccess: () => {
      messageApi.success(editing ? 'Yönetim carisi güncellendi' : 'Yönetim carisi eklendi')
      queryClient.invalidateQueries({ queryKey: ['yonetim-ekibi'] })
      setModalOpen(false)
      setEditing(null)
      form.resetFields()
    },
    onError: (err) => messageApi.error(getErrorMessage(err)),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/yonetim-ekibi/${id}`, { params: { proje_id: projeId } })
    },
    onSuccess: () => {
      messageApi.success('Yönetim carisi silindi')
      queryClient.invalidateQueries({ queryKey: ['yonetim-ekibi'] })
    },
    onError: (err) => messageApi.error(getErrorMessage(err)),
  })

  const openCreate = () => {
    setEditing(null)
    form.resetFields()
    form.setFieldsValue({ oran: 0 })
    setModalOpen(true)
  }

  const openEdit = (record: YonetimCari) => {
    setEditing(record)
    form.setFieldsValue({ ad_soyad: record.ad_soyad, oran: record.oran })
    setModalOpen(true)
  }

  const actions = useMemo(
    () => (
      <Space size="small">
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={openCreate}
          size="small"
          disabled={!canEdit}
          title={!canEdit ? 'Yetki yok (sadece görüntüleme)' : undefined}
        >
          Yeni Yönetim Carisi
        </Button>
        <Tooltip title="Geri">
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate(`/projeler/${projeId}`)}
            aria-label="Geri"
            style={{ background: 'white' }}
          />
        </Tooltip>
      </Space>
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [navigate, projeId, canEdit],
  )

  usePageSettings('Yönetim Ekibi', actions)

  const columns = [
    { title: 'Ad Soyad', dataIndex: 'ad_soyad', key: 'ad_soyad' },
    {
      title: 'Oran (%)',
      dataIndex: 'oran',
      key: 'oran',
      width: 90,
      align: 'right' as const,
      render: (v: number) => `%${v}`,
    },
    {
      title: 'Normalize (%)',
      key: 'normalize',
      width: 120,
      align: 'right' as const,
      responsive: ['md'] as ('md')[],
      render: (_: unknown, r: YonetimCari) =>
        toplamOran > 0 ? `%${((Number(r.oran || 0) / toplamOran) * 100).toFixed(2)}` : '-',
    },
    {
      title: 'Borç',
      dataIndex: 'borc',
      key: 'borc',
      width: 120,
      align: 'right' as const,
      responsive: ['sm'] as ('sm')[],
      render: (v: number) => `${formatMoney(v)} TL`,
    },
    {
      title: 'Alacak',
      dataIndex: 'alacak',
      key: 'alacak',
      width: 120,
      align: 'right' as const,
      responsive: ['sm'] as ('sm')[],
      render: (v: number) => `${formatMoney(v)} TL`,
    },
    {
      title: 'Bakiye',
      dataIndex: 'bakiye',
      key: 'bakiye',
      width: 130,
      align: 'right' as const,
      render: (_: unknown, r: YonetimCari) => {
        const bakiye = Number(r.borc || 0) - Number(r.alacak || 0)
        return (
          <Text strong type={bakiye > 0 ? 'danger' : bakiye < 0 ? 'success' : undefined}>
            {formatMoney(bakiye)} TL
          </Text>
        )
      },
    },
    {
      title: 'İşlem',
      key: 'action',
      width: 100,
      render: (_: unknown, record: YonetimCari) => (
        <Space size="small">
          <Button
            icon={<EditOutlined />}
            type="text"
            size="small"
            disabled={!canEdit}
            title={!canEdit ? 'Yetki yok' : 'Düzenle'}
            onClick={() => openEdit(record)}
          />
          {canDelete && (
            <StrictConfirmDelete
              title="Yönetim carisi silinecek, emin misiniz?"
              confirmText={record.ad_soyad}
              onConfirm={() => deleteMutation.mutate(record.id)}
              loading={deleteMutation.isPending}
            />
          )}
        </Space>
      ),
    },
  ]

  return (
    <div className="animate-in fade-in duration-500" style={{ padding: '0 4px' }}>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message={`Proje Huzur Hakkı Oranı: %${proje?.huzur_hakki_orani ?? 0}`}
        description={
          'Onaylanan her hakedişten, hakediş tutarının (KDV dahil) bu oranı kadar tutar, ' +
          'aşağıdaki yönetim carilerine girilen oranlarının toplama bölünmesiyle (normalize) ' +
          'dağıtılarak borç olarak yazılır. Yönetim carisine yapılan ödemeler Ödeme/Tahsilat ' +
          'ekranından "Yönetim" türü seçilerek kaydedilir ve alacak sütununa işlenir.' +
          (toplamOran > 0 ? ` (Girilen oranlar toplamı: %${toplamOran})` : '')
        }
      />

      {isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : (
        <DataTable
          columns={columns}
          dataSource={list}
          rowKey="id"
          loading={isLoading}
          totalItems={list?.length}
          emptyDescription="Bu projede yönetim carisi yok. Yeni Yönetim Carisi butonu ile ekleyin."
        />
      )}

      <Modal
        title={editing ? 'Yönetim Carisi Düzenle' : 'Yeni Yönetim Carisi'}
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false)
          setEditing(null)
        }}
        onOk={() => form.submit()}
        confirmLoading={saveMutation.isPending}
        okText="Kaydet"
        cancelText="İptal"
      >
        <Form form={form} layout="vertical" onFinish={(v) => saveMutation.mutate(v)} autoComplete="off">
          <Form.Item
            name="ad_soyad"
            label="Ad Soyad"
            rules={[{ required: true, message: 'Ad soyad zorunlu' }]}
          >
            <Input placeholder="Yönetici adı soyadı" autoComplete="off" />
          </Form.Item>
          <Form.Item
            name="oran"
            label="Huzur Hakkı Oranı (%)"
            tooltip="0-100 arası tam sayı. Üyelerin oranları 100'e tamamlanmak zorunda değildir; dağıtımda toplama bölünerek normalize edilir."
            rules={[{ required: true, message: 'Oran zorunlu' }]}
          >
            <InputNumber style={{ width: '100%' }} min={0} max={100} precision={0} step={1} placeholder="0" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
