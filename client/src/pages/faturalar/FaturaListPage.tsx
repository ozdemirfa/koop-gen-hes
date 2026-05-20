import React, { useState, useMemo, useEffect } from 'react'
import { Button, Select, Space, Tag, Modal, Form, Input, InputNumber, DatePicker, App, Row, Col, Divider, Typography } from 'antd'

const { RangePicker } = DatePicker
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { PlusOutlined, DeleteOutlined, ScheduleOutlined, EditOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import api from '../../lib/api'
import { getErrorMessage } from '../../lib/apiError'
import { DataTable } from '../../components/common/DataTable'
import { ErrorState } from '../../components/common/ErrorState'
import { MoneyDisplay } from '../../components/common/MoneyDisplay'
import { ConfirmDelete } from '../../components/common/ConfirmDelete'
import { HeaderActionsToolbar } from '../../components/common/HeaderActionsToolbar'
import { usePageSettings } from '../../contexts/LayoutContext'
import { useProject } from '../../contexts/ProjectContext'
import { usePermissions } from '../../hooks/usePermissions'
import { trMoneyFormatter, trNumberParser } from '../../lib/format'

const { Text } = Typography

interface FaturaKalemi {
  id?: string
  kalem_adi: string
  birim: string
  miktar: number
  birim_fiyat: number
  kdv_orani: number
  ara_toplam: number
  kdv_tutar: number
  toplam_tutar: number
}

interface Fatura {
  id: string
  fatura_no: string
  fatura_tipi: string
  fatura_tarihi: string
  vade_tarihi?: string
  ara_toplam: number
  kdv_tutar: number
  toplam_tutar: number
  firmalar?: { unvan: string }
  fatura_kalemleri: FaturaKalemi[]
}

const tipLabel: Record<string, string> = { gelen: 'Gelen', giden: 'Giden' }

export const FaturaListPage: React.FC = () => {
  const { message } = App.useApp()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { activeProject } = useProject()
  const { canEdit, canDelete } = usePermissions()
  const [filterTip, setFilterTip] = useState<string | undefined>(undefined)
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingFatura, setEditingFatura] = useState<Fatura | null>(null)
  const [form] = Form.useForm()

  // Project değiştiğinde verileri tazele
  useEffect(() => {
    if (activeProject?.id) {
      queryClient.invalidateQueries({ queryKey: ['faturalar'] })
    }
  }, [activeProject?.id, queryClient])

  const { data: birimler } = useQuery({
    queryKey: ['birimler-select'],
    queryFn: async () => {
      const { data } = await api.get('/settings/birimler')
      return data.data as { id: string; ad: string }[]
    },
  })

  // OC-03 (sprint 20260511-ui-responsive-sprint extension):
  // HeaderActionsToolbar — primary=Yeni Fatura, secondary=Tip+Durum Select
  const activeFilterCount = useMemo(() => {
    let count = 0
    if (filterTip) count++
    if (dateRange?.[0] || dateRange?.[1]) count++
    return count
  }, [filterTip, dateRange])

  const primaryAction = useMemo(() => (
    <Button
      size="small"
      type="primary"
      icon={<PlusOutlined />}
      disabled={!activeProject || !canEdit}
      title={!canEdit ? 'Yetki yok' : undefined}
      onClick={() => {
        setEditingFatura(null);
        form.resetFields();
        form.setFieldsValue({
          kalemler: [{ kalem_adi: '', birim: 'Adet', miktar: 1, birim_fiyat: 0, kdv_orani: 20 }]
        });
        setModalOpen(true)
      }}
    >
      Yeni Fatura
    </Button>
  ), [form, activeProject, canEdit])

  const secondaryActions = useMemo(() => (
    <>
      <Select
        size="small"
        placeholder="Tip"
        value={filterTip}
        onChange={setFilterTip}
        allowClear
        style={{ width: 110 }}
      >
        <Select.Option value="gelen">Gelen</Select.Option>
        <Select.Option value="giden">Giden</Select.Option>
      </Select>
      <RangePicker
        size="small"
        value={dateRange}
        onChange={(vals) => setDateRange(vals as [dayjs.Dayjs | null, dayjs.Dayjs | null] | null)}
        format="DD.MM.YYYY"
        placeholder={['Başlangıç', 'Bitiş']}
        style={{ width: 240 }}
        allowEmpty={[true, true]}
      />
    </>
  ), [filterTip, dateRange])

  const actions = useMemo(() => {
    // LayoutContext.setHeaderActionsStable shallow (type+key) check yapıyor; date range
    // veya tip değişimi tek başına header'a yansımıyor. Fingerprint key ile state
    // değişimlerini yakala (PR #16/19/30 ile aynı pattern).
    const stateKey = [
      filterTip || 'all',
      dateRange?.[0]?.format('YYYYMMDD') || '',
      dateRange?.[1]?.format('YYYYMMDD') || '',
      `f${activeFilterCount}`,
    ].join('|')
    return (
      <HeaderActionsToolbar
        key={`fatura-list-${stateKey}`}
        primary={primaryAction}
        secondary={secondaryActions}
        filterCount={activeFilterCount}
        drawerTitle="Fatura Filtreleri"
      />
    )
  }, [primaryAction, secondaryActions, activeFilterCount, filterTip, dateRange])

  usePageSettings('Fatura Yönetimi', actions)

  const { data: firmalar } = useQuery({
    queryKey: ['firmalar-select'],
    queryFn: async () => {
      const { data } = await api.get('/firmalar', { params: { aktif: 'true', limit: 500 } })
      return data.data as { id: string; unvan: string }[]
    },
  })

  const { data: faturaData, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['faturalar', activeProject?.id, filterTip, dateRange?.[0]?.format('YYYY-MM-DD'), dateRange?.[1]?.format('YYYY-MM-DD')],
    queryFn: async () => {
      const params: Record<string, string> = {}
      if (activeProject) params.proje_id = activeProject.id
      if (filterTip) params.fatura_tipi = filterTip
      if (dateRange?.[0]) params.baslangic_tarihi = dateRange[0].format('YYYY-MM-DD')
      if (dateRange?.[1]) params.bitis_tarihi = dateRange[1].format('YYYY-MM-DD')
      const { data } = await api.get('/faturalar', { params })
      return data
    },
    enabled: !!activeProject
  })

  const saveMutation = useMutation({
    mutationFn: async (values: any) => {
      const payload = {
        ...values,
        proje_id: activeProject?.id,
        fatura_tarihi: values.fatura_tarihi.format('YYYY-MM-DD'),
        vade_tarihi: values.vade_tarihi ? values.vade_tarihi.format('YYYY-MM-DD') : null,
      }
      if (editingFatura) {
        return await api.put(`/faturalar/${editingFatura.id}`, payload)
      }
      return await api.post('/faturalar', payload)
    },
    onSuccess: () => {
      message.success('Fatura kaydedildi')
      queryClient.invalidateQueries({ queryKey: ['faturalar'] })
      setModalOpen(false)
      form.resetFields()
      setEditingFatura(null)
    },
    onError: (err: any) => {
      if (err?.details && Array.isArray(err.details)) {
        form.setFields(err.details.map((d: { field: string; message: string }) => ({ name: d.field, errors: [d.message] })))
      } else if (err?.error?.includes?.('unique') || err?.message?.includes?.('unique')) {
        form.setFields([{ name: 'fatura_no', errors: ['Bu fatura no zaten kullanılmış'] }])
      } else {
        message.error(getErrorMessage(err))
      }
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await api.delete(`/faturalar/${id}`) },
    onSuccess: () => {
      message.success('Fatura silindi')
      queryClient.invalidateQueries({ queryKey: ['faturalar'] })
    },
    onError: (err) => message.error(getErrorMessage(err)),
  })

  // Toplamları kalemlerden hesapla
  const calculateTotals = () => {
    const kalemler = form.getFieldValue('kalemler') || []
    let araToplam = 0
    let kdvTutar = 0
    
    kalemler.forEach((k: any) => {
      const lineAra = (k.miktar || 0) * (k.birim_fiyat || 0)
      const lineKdv = lineAra * ((k.kdv_orani || 0) / 100)
      araToplam += lineAra
      kdvTutar += lineKdv
    })

    form.setFieldsValue({
      ara_toplam: Math.round(araToplam * 100) / 100,
      kdv_tutar: Math.round(kdvTutar * 100) / 100,
      toplam_tutar: Math.round((araToplam + kdvTutar) * 100) / 100
    })
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
      title: 'Toplam',
      dataIndex: 'toplam_tutar',
      key: 'toplam_tutar',
      align: 'right' as const,
      width: 130,
      render: (v: number) => <MoneyDisplay amount={v} />,
    },
    {
      title: 'İşlem',
      key: 'action',
      width: 120,
      render: (_: unknown, r: Fatura) => (
        <Space>
          <Button
            size="small"
            icon={<EditOutlined />}
            disabled={!canEdit}
            title={!canEdit ? 'Yetki yok' : 'Düzenle'}
            onClick={() => {
              setEditingFatura(r)
              form.setFieldsValue({
                ...r,
                fatura_tarihi: dayjs(r.fatura_tarihi),
                vade_tarihi: r.vade_tarihi ? dayjs(r.vade_tarihi) : null,
                kalemler: r.fatura_kalemleri
              })
              setModalOpen(true)
            }}
          />
          {canDelete && <ConfirmDelete size="small" onConfirm={() => deleteMutation.mutate(r.id)} />}
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
          dataSource={faturaData?.data}
          rowKey="id"
          loading={isLoading}
          totalItems={faturaData?.pagination?.total}
          emptyDescription="Kayıtlı fatura bulunamadı"
        />
      )}

      <Modal
        title={editingFatura ? 'Fatura Düzenle' : 'Yeni Fatura'}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); setEditingFatura(null); form.resetFields() }}
        onOk={() => form.submit()}
        confirmLoading={saveMutation.isPending}
        width="min(900px, 95vw)"
        forceRender={true}
        okText="Kaydet"
        cancelText="İptal"
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(v) => saveMutation.mutate(v)}
          onValuesChange={calculateTotals}
          style={{ marginTop: 8 }}
          autoComplete="off"
          validateTrigger={["onBlur", "onChange"]}
        >          <Row gutter={16}>
            <Col span={10}>
              <Form.Item name="firma_id" label="Firma" rules={[{ required: true }]} style={{ marginBottom: 12 }}>
                <Select size="small" showSearch placeholder="Firma seçin" optionFilterProp="children">
                  {firmalar?.map(f => <Select.Option key={f.id} value={f.id}>{f.unvan}</Select.Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={4}>
              <Form.Item name="fatura_tipi" label="Tip" rules={[{ required: true }]} style={{ marginBottom: 12 }}>
                <Select size="small">
                  <Select.Option value="gelen">Gelen</Select.Option>
                  <Select.Option value="giden">Giden</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={5}>
              <Form.Item name="fatura_no" label="Fatura No" rules={[{ required: true }]} style={{ marginBottom: 12 }}>
                <Input size="small" />
              </Form.Item>
            </Col>
            <Col span={5}>
              <Form.Item name="fatura_tarihi" label="Fatura Tarihi" rules={[{ required: true }]} style={{ marginBottom: 12 }}>
                <DatePicker size="small" style={{ width: '100%' }} format="DD.MM.YYYY" />
              </Form.Item>
            </Col>
          </Row>

          <Divider titlePlacement="left" style={{ margin: '8px 0 16px 0' }}>Fatura Kalemleri</Divider>
          
          <Row gutter={8} style={{ marginBottom: 4, paddingLeft: 4 }}>
            <Col span={8}><Text type="secondary" style={{ fontSize: '11px' }}>Ürün/Hizmet Tanımı</Text></Col>
            <Col span={4}><Text type="secondary" style={{ fontSize: '11px' }}>Birim</Text></Col>
            <Col span={3}><Text type="secondary" style={{ fontSize: '11px' }}>Adet</Text></Col>
            <Col span={4}><Text type="secondary" style={{ fontSize: '11px' }}>Birim Fiyat</Text></Col>
            <Col span={3}><Text type="secondary" style={{ fontSize: '11px' }}>KDV%</Text></Col>
            <Col span={2} style={{ textAlign: 'center' }}><Text type="secondary" style={{ fontSize: '11px' }}>İşlem</Text></Col>
          </Row>

          <Form.List name="kalemler">
            {(fields, { add, remove }) => (
              <>
                {fields.map(({ key, name, ...restField }) => (
                  <Row key={key} gutter={8} align="middle" style={{ marginBottom: 4 }}>
                    <Col span={8}>
                      <Form.Item {...restField} name={[name, 'kalem_adi']} rules={[{ required: true }]} noStyle>
                        <Input size="small" placeholder="Ürün/Hizmet Adı" />
                      </Form.Item>
                    </Col>
                    <Col span={4}>
                      <Form.Item {...restField} name={[name, 'birim']} rules={[{ required: true }]} noStyle>
                        <Select size="small" placeholder="Birim">
                          {birimler?.map(b => <Select.Option key={b.id} value={b.ad}>{b.ad}</Select.Option>)}
                        </Select>
                      </Form.Item>
                    </Col>
                    <Col span={3}>
                      <Form.Item {...restField} name={[name, 'miktar']} rules={[{ required: true }]} noStyle>
                        <InputNumber size="small" placeholder="Miktar" style={{ width: '100%' }} min={0.001} />
                      </Form.Item>
                    </Col>
                    <Col span={4}>
                      <Form.Item {...restField} name={[name, 'birim_fiyat']} rules={[{ required: true }]} noStyle>
                        <InputNumber 
                          size="small" 
                          placeholder="B.Fiyat" 
                          style={{ width: '100%' }} 
                          min={0} 
                          formatter={trMoneyFormatter}
                          parser={trNumberParser}
                        />
                      </Form.Item>
                    </Col>
                    <Col span={3}>
                      <Form.Item {...restField} name={[name, 'kdv_orani']} rules={[{ required: true }]} noStyle>
                        <InputNumber size="small" placeholder="KDV%" style={{ width: '100%' }} min={0} max={100} />
                      </Form.Item>
                    </Col>
                    <Col span={2} style={{ textAlign: 'center' }}>
                      <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => remove(name)} />
                    </Col>
                  </Row>
                ))}
                <Form.Item style={{ marginTop: 8 }}>
                  <Button 
                    size="small" 
                    type="dashed" 
                    onClick={() => add({ birim: 'Adet', miktar: 1, birim_fiyat: 0, kdv_orani: 20 })} 
                    block 
                    icon={<PlusOutlined />}
                  >
                    Kalem Ekle
                  </Button>
                </Form.Item>
              </>
            )}
          </Form.List>

          <Row gutter={16} justify="end">
            <Col span={6}>
              <Form.Item name="ara_toplam" label="Ara Toplam" style={{ marginBottom: 8 }}>
                <InputNumber size="small" disabled style={{ width: '100%' }} formatter={trMoneyFormatter} parser={trNumberParser} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="kdv_tutar" label="KDV Toplam" style={{ marginBottom: 8 }}>
                <InputNumber size="small" disabled style={{ width: '100%' }} formatter={trMoneyFormatter} parser={trNumberParser} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="toplam_tutar" label="Genel Toplam" style={{ marginBottom: 8 }}>
                <InputNumber size="small" disabled style={{ width: '100%', fontWeight: 'bold' }} formatter={trMoneyFormatter} parser={trNumberParser} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="vade_tarihi" label="Vade Tarihi" style={{ marginBottom: 8 }}>
                <DatePicker size="small" style={{ width: '100%' }} format="DD.MM.YYYY" />
              </Form.Item>
            </Col>
            <Col span={16}>
              <Form.Item name="aciklama" label="Açıklama" style={{ marginBottom: 8 }}>
                <Input size="small" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  )
}
