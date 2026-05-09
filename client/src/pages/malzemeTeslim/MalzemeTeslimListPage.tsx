import React, { useState, useMemo } from 'react'
import { Button, Modal, Form, Input, InputNumber, DatePicker, Select, Space, message, Row, Col, Divider, Typography, Tag, App } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined } from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import api from '../../lib/api'
import { getErrorMessage } from '../../lib/apiError'
import { usePageSettings } from '../../contexts/LayoutContext'
import { DataTable } from '../../components/common/DataTable'
import { ErrorState } from '../../components/common/ErrorState'
import { MoneyDisplay } from '../../components/common/MoneyDisplay'
import { ConfirmDelete } from '../../components/common/ConfirmDelete'
import { useDebounce } from '../../hooks/useDebounce'
import { trMoneyFormatter, trNumberParser } from '../../lib/format'

const { Text } = Typography

interface IrsaliyeKalemi {
  id?: string
  malzeme_adi: string
  birim: string
  miktar: number
}

interface Irsaliye {
  id: string
  firma_id: string
  proje_id?: string
  irsaliye_no?: string
  hakedis_id?: string
  teslim_tarihi: string
  teslim_alan?: string
  notlar?: string
  firmalar?: { unvan: string }
  hakedisler?: { hakedis_no: number }
  irsaliye_kalemleri: IrsaliyeKalemi[]
}

const BIRIMLER = ['Adet', 'Metre', 'Kg', 'm2', 'm3', 'Ton', 'Litre', 'Set']

export const MalzemeTeslimListPage: React.FC = () => {
  const queryClient = useQueryClient()
  const { message: messageApi } = App.useApp()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingIrsaliye, setEditingIrsaliye] = useState<Irsaliye | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterHakedis, setFilterHakedis] = useState<string | undefined>(undefined)
  const [selectedFirmaId, setSelectedFirmaId] = useState<string | null>(null)
  const debouncedSearch = useDebounce(searchTerm, 500)
  const [form] = Form.useForm()

  const activeProjectId = localStorage.getItem('activeProjectId')

  const { data: firmalar } = useQuery({
    queryKey: ['firmalar-select'],
    queryFn: async () => {
      const { data } = await api.get('/firmalar', { params: { aktif: 'true', limit: 500 } })
      return data.data as { id: string; unvan: string }[]
    },
  })

  // Firma hakedişlerini getir
  const { data: hakedisler } = useQuery({
    queryKey: ['firma-hakedisler', selectedFirmaId],
    queryFn: async () => {
      if (!selectedFirmaId) return []
      const { data } = await api.get('/hakedisler', { params: { firma_id: selectedFirmaId, limit: 100 } })
      return data.data as { id: string, hakedis_no: number }[]
    },
    enabled: !!selectedFirmaId
  })

  const { data: irsaliyeData, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['irsaliyeler', debouncedSearch, filterHakedis, activeProjectId],
    queryFn: async () => {
      const params: any = { search: debouncedSearch, proje_id: activeProjectId }
      if (filterHakedis === 'yapildi') params.has_hakedis = 'true'
      if (filterHakedis === 'yapilmadi') params.has_hakedis = 'false'
      
      const { data } = await api.get('/malzeme-teslimleri', { params })
      return data
    },
    enabled: !!activeProjectId
  })

  const saveMutation = useMutation({
    mutationFn: async (values: any) => {
      const payload = {
        ...values,
        proje_id: activeProjectId,
        teslim_tarihi: values.teslim_tarihi.format('YYYY-MM-DD'),
        hakedis_id: values.hakedis_id || null,
        sozlesme_id: values.sozlesme_id || null,
        irsaliye_no: values.irsaliye_no || null,
      }
      if (editingIrsaliye) {
        return await api.put(`/malzeme-teslimleri/${editingIrsaliye.id}`, payload)
      }
      return await api.post('/malzeme-teslimleri', payload)
    },
    onSuccess: () => {
      messageApi.success('İrsaliye kaydedildi')
      queryClient.invalidateQueries({ queryKey: ['irsaliyeler'] })
      setModalOpen(false)
      form.resetFields()
      setEditingIrsaliye(null)
      setSelectedFirmaId(null)
    },
    onError: (err) => messageApi.error(getErrorMessage(err)),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await api.delete(`/malzeme-teslimleri/${id}`) },
    onSuccess: () => {
      message.success('İrsaliye silindi')
      queryClient.invalidateQueries({ queryKey: ['irsaliyeler'] })
    },
    onError: (err) => message.error(getErrorMessage(err)),
  })

  const actions = useMemo(() => (
    <Space size="small">
      <Input
        placeholder="İrsaliye No Ara..."
        prefix={<SearchOutlined style={{ color: 'var(--text-tertiary)' }} />}
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        allowClear
        style={{ width: 180 }}
        className="header-search-input"
      />
      <Select
        placeholder="Hakediş Durumu"
        allowClear
        style={{ width: 150 }}
        value={filterHakedis}
        onChange={setFilterHakedis}
      >
        <Select.Option value="yapildi">Yapıldı</Select.Option>
        <Select.Option value="yapilmadi">Yapılmadı</Select.Option>
      </Select>
      <Button
        type="primary"
        icon={<PlusOutlined />}
        onClick={() => {
          setEditingIrsaliye(null)
          form.resetFields()
          form.setFieldsValue({ kalemler: [{ malzeme_adi: '', birim: 'Adet', miktar: 1 }] })
          setModalOpen(true)
        }}
      >
        Yeni İrsaliye
      </Button>
    </Space>
  ), [searchTerm, filterHakedis, form])

  usePageSettings('Malzeme Teslimatı ve İrsaliye', actions)

  const columns = [
    {
      title: 'Tarih',
      dataIndex: 'teslim_tarihi',
      key: 'teslim_tarihi',
      width: 100,
      render: (d: string) => dayjs(d).format('DD.MM.YYYY'),
    },
    { 
      title: 'İrsaliye No', 
      dataIndex: 'irsaliye_no', 
      key: 'no',
      render: (v: string) => <Text strong style={{ color: 'var(--brand-primary)' }}>{v || '-'}</Text>
    },
    { title: 'Firma', key: 'firma', render: (_: any, r: Irsaliye) => r.firmalar?.unvan || '-' },
    {
      title: 'Hakediş No',
      key: 'hakedis',
      render: (_: any, r: Irsaliye) => r.hakedisler ? <Tag color="blue">#{r.hakedisler.hakedis_no}</Tag> : <Tag color="default">Bekliyor</Tag>,
    },
    {
      title: 'Kalem Sayısı',
      key: 'kalemler',
      width: 100,
      render: (_: any, r: Irsaliye) => r.irsaliye_kalemleri?.length || 0,
    },
    {
      title: 'İşlem',
      key: 'action',
      fixed: 'right' as const,
      width: 90,
      render: (_: any, r: Irsaliye) => (
        <Space size="small">
          <Button
            icon={<EditOutlined />}
            size="small"
            className="action-btn-edit"
            onClick={() => {
              setEditingIrsaliye(r)
              setSelectedFirmaId(r.firma_id)
              form.setFieldsValue({ 
                ...r, 
                teslim_tarihi: dayjs(r.teslim_tarihi),
                kalemler: r.irsaliye_kalemleri 
              })
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
      {isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : (
        <DataTable
          columns={columns}
          dataSource={irsaliyeData?.data}
          rowKey="id"
          loading={isLoading}
          size="small"
          totalItems={irsaliyeData?.pagination?.totalCount}
          emptyDescription="Kayıtlı teslim/irsaliye bulunamadı"
        />
      )}

      <Modal
        title={editingIrsaliye ? 'İrsaliye Düzenle' : 'Yeni İrsaliye Girişi'}
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false)
          setEditingIrsaliye(null)
          setSelectedFirmaId(null)
        }}
        onOk={() => form.submit()}
        confirmLoading={saveMutation.isPending}
        width={800}
        destroyOnHidden
        okText="Kaydet"
        cancelText="İptal"
        styles={{ body: { paddingTop: 16 } }}
      >
        <Form 
          form={form} 
          layout="vertical" 
          onFinish={(v) => saveMutation.mutate(v)}
          size="small"
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="firma_id" label="Firma" rules={[{ required: true }]}>
                <Select 
                  showSearch 
                  placeholder="Firma seçin" 
                  optionFilterProp="children"
                  onChange={(val) => {
                    setSelectedFirmaId(val)
                    form.setFieldsValue({ hakedis_id: undefined })
                  }}
                >
                  {firmalar?.map(f => <Select.Option key={f.id} value={f.id}>{f.unvan}</Select.Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="teslim_tarihi" label="Teslim Tarihi" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="irsaliye_no" label="İrsaliye No">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="hakedis_id" label="Hakediş (Opsiyonel)">
                <Select 
                  showSearch 
                  placeholder={selectedFirmaId ? "Hakediş bağla" : "Önce firma seçin"}
                  optionFilterProp="children"
                  allowClear
                  disabled={!selectedFirmaId}
                >
                  {hakedisler?.map(h => <Select.Option key={h.id} value={h.id}>Hakediş #{h.hakedis_no}</Select.Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="teslim_alan" label="Teslim Alan">
                <Input />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="notlar" label="Notlar">
            <Input />
          </Form.Item>

          <Divider titlePlacement="left" style={{ margin: '12px 0' }}>Malzemeler</Divider>
          
          <Form.List name="kalemler">
            {(fields, { add, remove }) => (
              <>
                {fields.map(({ key, name, ...restField }) => (
                  <Row key={key} gutter={8} align="middle" style={{ marginBottom: 4 }}>
                    <Col span={14}>
                      <Form.Item
                        {...restField}
                        name={[name, 'malzeme_adi']}
                        rules={[{ required: true, message: 'Zorunlu' }]}
                        noStyle
                      >
                        <Input placeholder="Malzeme Adı" />
                      </Form.Item>
                    </Col>
                    <Col span={4}>
                      <Form.Item
                        {...restField}
                        name={[name, 'birim']}
                        rules={[{ required: true }]}
                        noStyle
                      >
                        <Select placeholder="Birim">
                          {BIRIMLER.map(b => <Select.Option key={b} value={b}>{b}</Select.Option>)}
                        </Select>
                      </Form.Item>
                    </Col>
                    <Col span={4}>
                      <Form.Item
                        {...restField}
                        name={[name, 'miktar']}
                        rules={[{ required: true }]}
                        noStyle
                      >
                        <InputNumber placeholder="Miktar" style={{ width: '100%' }} min={0.001} />
                      </Form.Item>
                    </Col>
                    <Col span={2}>
                      <Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(name)} size="small" />
                    </Col>
                  </Row>
                ))}
                <Form.Item style={{ marginTop: 12 }}>
                  <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                    Malzeme Ekle
                  </Button>
                </Form.Item>
              </>
            )}
          </Form.List>
        </Form>
      </Modal>
    </div>
  )
}

