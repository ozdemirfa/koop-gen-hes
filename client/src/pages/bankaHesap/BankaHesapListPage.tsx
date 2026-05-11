import React, { useState, useMemo } from 'react'
import { Button, Modal, Form, Input, Space, message, Tag, Switch, Tooltip, Typography } from 'antd'
import { PlusOutlined, EditOutlined, TransactionOutlined } from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import api from '../../lib/api'
import { getErrorMessage } from '../../lib/apiError'
import { usePageSettings } from '../../contexts/LayoutContext'
import { useProject } from '../../contexts/ProjectContext'
import { DataTable } from '../../components/common/DataTable'
import { ErrorState } from '../../components/common/ErrorState'
import { formatIBAN, formatIBANInput, getIBANRaw, formatMoney } from '../../lib/format'

interface BankaHesap {
  id: string
  banka_adi: string
  sube?: string
  hesap_no?: string
  iban?: string
  aktif: boolean
  bakiye?: number
}

export const BankaHesapListPage: React.FC = () => {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingHesap, setEditingHesap] = useState<BankaHesap | null>(null)
  const [form] = Form.useForm()

  const { activeProject } = useProject()
  const { data: hesaplar, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['banka-hesaplari', activeProject?.id],
    queryFn: async () => {
      if (!activeProject?.id) return []
      const { data } = await api.get('/banka/hesaplar', { params: { proje_id: activeProject.id } })
      return data.data as BankaHesap[]
    },
    enabled: !!activeProject?.id
  })

  const saveMutation = useMutation({
    mutationFn: async (values: any) => {
      if (editingHesap) {
        return await api.put(`/banka/hesaplar/${editingHesap.id}`, values)
      }
      const payload = {
        ...values,
        proje_id: activeProject?.id
      }
      return await api.post('/banka/hesaplar', payload)
    },
    onSuccess: () => {
      message.success('Banka hesabı kaydedildi')
      queryClient.invalidateQueries({ queryKey: ['banka-hesaplari'] })
      setModalOpen(false)
      form.resetFields()
      setEditingHesap(null)
    },
    onError: (err: any) => {
      if (err?.details && Array.isArray(err.details)) {
        form.setFields(err.details.map((detail: { field: string; message: string }) => ({
          name: detail.field,
          errors: [detail.message]
        })))
      } else {
        message.error(getErrorMessage(err))
      }
    },
  })

  const actions = useMemo(() => (
    <Button
      type="primary"
      icon={<PlusOutlined />}
      disabled={!activeProject}
      onClick={() => {
        setEditingHesap(null)
        form.resetFields()
        form.setFieldsValue({ aktif: true })
        setModalOpen(true)
      }}
    >
      Yeni Hesap
    </Button>
  ), [form, activeProject])

  usePageSettings('Banka Hesapları', actions)

  const columns = [
    { title: 'Banka Adı', dataIndex: 'banka_adi', key: 'banka_adi' },
    { title: 'Şube', dataIndex: 'sube', key: 'sube' },
    { title: 'Hesap No', dataIndex: 'hesap_no', key: 'hesap_no' },
    { 
      title: 'IBAN', 
      dataIndex: 'iban', 
      key: 'iban',
      render: (v: string) => v ? (
        <Typography.Text copyable={{ text: getIBANRaw(v), tooltips: ['Kopyala (Sadece Rakamlar)', 'Kopyalandı!'] }}>
          {formatIBAN(v)}
        </Typography.Text>
      ) : '-'
    },
    {
      title: 'Durum',
      dataIndex: 'aktif',
      key: 'aktif',
      render: (aktif: boolean) => (
        <Tag color={aktif ? 'green' : 'red'}>{aktif ? 'Aktif' : 'Pasif'}</Tag>
      ),
    },
    {
      title: 'Hesap Bakiyesi',
      dataIndex: 'bakiye',
      key: 'bakiye',
      align: 'right' as const,
      render: (bakiye: number) => (
        <Typography.Text strong type={(bakiye || 0) < 0 ? 'danger' : undefined}>
          {formatMoney(bakiye)} TL
        </Typography.Text>
      ),
    },
    {
      title: 'İşlem',
      key: 'action',
      width: 120,
      render: (_: any, r: BankaHesap) => (
        <Space size="middle">
          <Tooltip title="Hareketler">
            <Button
              icon={<TransactionOutlined />}
              onClick={(e) => {
                e.stopPropagation()
                navigate(`/banka-hesaplari/${r.id}/hareketler`)
              }}
              size="small"
            />
          </Tooltip>
          <Tooltip title="Düzenle">
            <Button
              icon={<EditOutlined />}
              onClick={(e) => {
                e.stopPropagation()
                setEditingHesap(r)
                form.setFieldsValue(r)
                setModalOpen(true)
              }}
              size="small"
            />
          </Tooltip>
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
          dataSource={hesaplar}
          rowKey="id"
          loading={isLoading}
          pagination={false}
          size="small"
          emptyDescription="Banka hesabı eklenmemiş"
        />
      )}

      <Modal
        title={editingHesap ? 'Hesap Düzenle' : 'Yeni Banka Hesabı'}
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false)
          setEditingHesap(null)
        }}
        onOk={() => form.submit()}
        confirmLoading={saveMutation.isPending}
        destroyOnHidden
        width="min(520px, 95vw)"
        okText="Kaydet"
        cancelText="İptal"
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(v) => saveMutation.mutate(v)}
          style={{ marginTop: 16 }}
          initialValues={{ aktif: true }}
          validateTrigger={["onBlur", "onChange"]}
        >
          <Form.Item name="banka_adi" label="Banka Adı" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="sube" label="Şube">
            <Input />
          </Form.Item>
          <Form.Item name="hesap_no" label="Hesap No">
            <Input
              inputMode="numeric"
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, '')
                if (digits !== e.target.value) {
                  form.setFieldsValue({ hesap_no: digits })
                }
              }}
            />
          </Form.Item>
          <Form.Item 
            name="iban" 
            label="IBAN"
            rules={[
              {
                validator: (_, value) => {
                  if (!value) return Promise.resolve()
                  // Boşlukları ve TR'yi temizle, sadece karakter sayısını kontrol et
                  const clean = value.replace(/\s/g, '')
                  if (clean.length !== 26) {
                    return Promise.reject('IBAN TR dahil 26 karakter olmalıdır')
                  }
                  return Promise.resolve()
                }
              }
            ]}
          >
            <Input 
              placeholder="TR..." 
              onChange={(e) => {
                const formatted = formatIBANInput(e.target.value)
                form.setFieldsValue({ iban: formatted })
              }}
            />
          </Form.Item>
          <Form.Item name="aktif" label="Durum" valuePropName="checked">
            <Switch checkedChildren="Aktif" unCheckedChildren="Pasif" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
