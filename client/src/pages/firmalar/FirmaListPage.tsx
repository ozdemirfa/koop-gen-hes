import React, { useState } from 'react'
import { Button, Form, Input, Select, Space, Switch, Tag, Modal, message } from 'antd'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { PlusOutlined, EditOutlined, EyeOutlined, SearchOutlined } from '@ant-design/icons'
import api from '../../lib/api'
import { useDebounce } from '../../hooks/useDebounce'
import { PageHeader } from '../../components/common/PageHeader'
import { DataTable } from '../../components/common/DataTable'
import { MoneyDisplay } from '../../components/common/MoneyDisplay'

interface Firma {
  id: string
  firma_tipi: 'yuklenici' | 'tedarikci'
  unvan: string
  vergi_no?: string
  vergi_dairesi?: string
  telefon?: string
  email?: string
  adres?: string
  iban?: string
  yetkili_kisi?: string
  notlar?: string
  aktif: boolean
  guncel_bakiye?: number
  toplam_teminat?: number
}

export const FirmaListPage: React.FC = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [filterTip, setFilterTip] = useState<string | undefined>(undefined)
  const [filterAktif, setFilterAktif] = useState<string | undefined>('true')
  const debouncedSearch = useDebounce(search, 300)

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editing, setEditing] = useState<Firma | null>(null)
  const [form] = Form.useForm()

  const { data: firmaData, isLoading } = useQuery({
    queryKey: ['firmalar', debouncedSearch, filterTip, filterAktif],
    queryFn: async () => {
      const params: Record<string, string> = {}
      if (debouncedSearch) params.search = debouncedSearch
      if (filterTip) params.firma_tipi = filterTip
      if (filterAktif) params.aktif = filterAktif
      const { data } = await api.get('/firmalar', { params })
      return data
    },
  })

  const saveMutation = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      if (editing) {
        const { data } = await api.put(`/firmalar/${editing.id}`, values)
        return data
      }
      const { data } = await api.post('/firmalar', values)
      return data
    },
    onSuccess: () => {
      message.success(editing ? 'Firma güncellendi' : 'Firma eklendi')
      queryClient.invalidateQueries({ queryKey: ['firmalar'] })
      closeModal()
    },
    onError: (err: any) => message.error(err.message || 'Hata oluştu'),
  })

  const closeModal = () => {
    setIsModalOpen(false)
    setEditing(null)
    form.resetFields()
  }

  const openEdit = (firma: Firma) => {
    setEditing(firma)
    form.setFieldsValue(firma)
    setIsModalOpen(true)
  }

  const columns = [
    { title: 'Ünvan', dataIndex: 'unvan', key: 'unvan' },
    {
      title: 'Tip',
      dataIndex: 'firma_tipi',
      key: 'firma_tipi',
      width: 100,
      render: (t: string) => (
        <Tag color={t === 'yuklenici' ? 'blue' : 'purple'}>
          {t === 'yuklenici' ? 'Yüklenici' : 'Tedarikçi'}
        </Tag>
      ),
    },
    {
      title: 'Cari Bakiye',
      dataIndex: 'guncel_bakiye',
      key: 'bakiye',
      align: 'right' as const,
      width: 130,
      render: (v: number) => <MoneyDisplay amount={v} colored />
    },
    {
      title: 'Birikmiş Teminat',
      dataIndex: 'toplam_teminat',
      key: 'teminat',
      align: 'right' as const,
      width: 140,
      render: (v: number) => <MoneyDisplay amount={v} />
    },
    { title: 'Telefon', dataIndex: 'telefon', key: 'telefon', width: 130 },
    {
      title: 'Durum',
      dataIndex: 'aktif',
      key: 'aktif',
      width: 80,
      render: (v: boolean) => <Tag color={v ? 'green' : 'default'}>{v ? 'Aktif' : 'Pasif'}</Tag>,
    },
    {
      title: 'İşlem',
      key: 'action',
      width: 100,
      render: (_: unknown, record: Firma) => (
        <Space>
          <Button icon={<EyeOutlined />} type="text" onClick={() => navigate(`/firmalar/${record.id}`)} />
          <Button icon={<EditOutlined />} type="text" onClick={() => openEdit(record)} />
        </Space>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Firma Yönetimi"
        extra={
          <Space wrap>
            <Input
              placeholder="Firma ara..."
              prefix={<SearchOutlined />}
              allowClear
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: 220 }}
            />
            <Select
              placeholder="Tip"
              value={filterTip}
              onChange={setFilterTip}
              allowClear
              style={{ width: 130 }}
            >
              <Select.Option value="yuklenici">Yüklenici</Select.Option>
              <Select.Option value="tedarikci">Tedarikçi</Select.Option>
            </Select>
            <Select
              placeholder="Durum"
              value={filterAktif}
              onChange={setFilterAktif}
              allowClear
              style={{ width: 110 }}
            >
              <Select.Option value="true">Aktif</Select.Option>
              <Select.Option value="false">Pasif</Select.Option>
            </Select>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsModalOpen(true)}>
              Yeni Firma
            </Button>
          </Space>
        }
      />

      <DataTable
        columns={columns}
        dataSource={firmaData?.data}
        rowKey="id"
        loading={isLoading}
        totalItems={firmaData?.pagination?.total}
      />

      <Modal
        title={editing ? 'Firma Düzenle' : 'Yeni Firma'}
        open={isModalOpen}
        onCancel={closeModal}
        onOk={() => form.submit()}
        confirmLoading={saveMutation.isPending}
        width={640}
      >
        <Form form={form} layout="vertical" onFinish={(v) => saveMutation.mutate(v)}>
          <Form.Item name="firma_tipi" label="Firma Tipi" rules={[{ required: true, message: 'Tip seçin' }]}>
            <Select>
              <Select.Option value="yuklenici">Yüklenici</Select.Option>
              <Select.Option value="tedarikci">Tedarikçi</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="unvan" label="Ünvan" rules={[{ required: true, message: 'Ünvan zorunlu' }]}>
            <Input />
          </Form.Item>
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="vergi_no" label="Vergi No" style={{ flex: 1 }}>
              <Input maxLength={11} />
            </Form.Item>
            <Form.Item name="vergi_dairesi" label="Vergi Dairesi" style={{ flex: 1 }}>
              <Input />
            </Form.Item>
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="telefon" label="Telefon" style={{ flex: 1 }}>
              <Input />
            </Form.Item>
            <Form.Item name="email" label="E-posta" rules={[{ type: 'email', message: 'Geçerli e-posta girin' }]} style={{ flex: 1 }}>
              <Input />
            </Form.Item>
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="yetkili_kisi" label="Yetkili Kişi" style={{ flex: 1 }}>
              <Input />
            </Form.Item>
            <Form.Item name="iban" label="IBAN" style={{ flex: 1 }}>
              <Input maxLength={34} />
            </Form.Item>
          </div>
          <Form.Item name="adres" label="Adres">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="notlar" label="Notlar">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="aktif" label="Aktif" valuePropName="checked" initialValue={true}>
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
