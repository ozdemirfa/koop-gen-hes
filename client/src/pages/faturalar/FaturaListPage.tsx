import React, { useState } from 'react'
import { Button, Select, Space, Tag, Modal, Form, Input, InputNumber, DatePicker, message, Row, Col, Divider, Typography } from 'antd'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { PlusOutlined, DeleteOutlined, ScheduleOutlined, EditOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import api from '../../lib/api'
import { PageHeader } from '../../components/common/PageHeader'
import { DataTable } from '../../components/common/DataTable'
import { ErrorState } from '../../components/common/ErrorState'
import { MoneyDisplay } from '../../components/common/MoneyDisplay'
import { ConfirmDelete } from '../../components/common/ConfirmDelete'

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
  durum: string
  firmalar?: { unvan: string }
  fatura_kalemleri: FaturaKalemi[]
}

const tipLabel: Record<string, string> = { gelen: 'Gelen', giden: 'Giden' }
const durumLabel: Record<string, string> = { bekliyor: 'Bekliyor', odendi: 'Ödendi', kismi_odendi: 'Kısmi Ödendi', iptal: 'İptal' }
const durumRenk: Record<string, string> = { bekliyor: 'blue', odendi: 'green', kismi_odendi: 'orange', iptal: 'red' }
const BIRIMLER = ['Adet', 'Metre', 'Kg', 'm2', 'm3', 'Ton', 'Litre', 'Set', 'Hizmet']

export const FaturaListPage: React.FC = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [filterTip, setFilterTip] = useState<string | undefined>(undefined)
  const [filterDurum, setFilterDurum] = useState<string | undefined>(undefined)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingFatura, setEditingFatura] = useState<Fatura | null>(null)
  const [form] = Form.useForm()

  const { data: firmalar } = useQuery({
    queryKey: ['firmalar-select'],
    queryFn: async () => {
      const { data } = await api.get('/firmalar', { params: { aktif: 'true', limit: 500 } })
      return data.data as { id: string; unvan: string }[]
    },
  })

  const { data: faturaData, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['faturalar', filterTip, filterDurum],
    queryFn: async () => {
      const params: Record<string, string> = {}
      if (filterTip) params.fatura_tipi = filterTip
      if (filterDurum) params.durum = filterDurum
      const { data } = await api.get('/faturalar', { params })
      return data
    },
  })

  const saveMutation = useMutation({
    mutationFn: async (values: any) => {
      const payload = {
        ...values,
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
        form.setFields(err.details.map((d: any) => ({ name: d.field, errors: [d.message] })))
      } else if (err?.error?.includes?.('unique') || err?.message?.includes?.('unique')) {
        form.setFields([{ name: 'fatura_no', errors: ['Bu fatura no zaten kullanılmış'] }])
      } else {
        message.error(err?.error || err?.message || 'Hata oluştu')
      }
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await api.delete(`/faturalar/${id}`) },
    onSuccess: () => {
      message.success('Fatura silindi')
      queryClient.invalidateQueries({ queryKey: ['faturalar'] })
    },
    onError: (err: any) => message.error(err?.error || err?.message || 'Hata oluştu'),
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
      width: 120,
      render: (_: unknown, r: Fatura) => (
        <Space>
          <Button 
            size="small" 
            icon={<EditOutlined />} 
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
          <Button 
            size="small" 
            icon={<ScheduleOutlined />} 
            onClick={() => navigate(`/faturalar/${r.id}/odeme-plani`)}
            title="Ödeme Planı"
          />
          <ConfirmDelete onConfirm={() => deleteMutation.mutate(r.id)} />
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
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingFatura(null); form.resetFields(); form.setFieldsValue({ kalemler: [{ kalem_adi: '', birim: 'Adet', miktar: 1, birim_fiyat: 0, kdv_orani: 20 }] }); setModalOpen(true) }}>
              Yeni Fatura
            </Button>
          </Space>
        }
      />

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
        width={900}
      >
        <Form form={form} layout="vertical" onFinish={(v) => saveMutation.mutate(v)} onValuesChange={calculateTotals}>
          <Row gutter={16}>
            <Col span={10}>
              <Form.Item name="firma_id" label="Firma" rules={[{ required: true }]}>
                <Select showSearch placeholder="Firma seçin" optionFilterProp="children">
                  {firmalar?.map(f => <Select.Option key={f.id} value={f.id}>{f.unvan}</Select.Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={4}>
              <Form.Item name="fatura_tipi" label="Tip" rules={[{ required: true }]}>
                <Select>
                  <Select.Option value="gelen">Gelen</Select.Option>
                  <Select.Option value="giden">Giden</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={5}>
              <Form.Item name="fatura_no" label="Fatura No" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={5}>
              <Form.Item name="fatura_tarihi" label="Fatura Tarihi" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation={"left" as any}>Fatura Kalemleri</Divider>
          
          <Form.List name="kalemler">
            {(fields, { add, remove }) => (
              <>
                {fields.map(({ key, name, ...restField }) => (
                  <Row key={key} gutter={8} align="middle" style={{ marginBottom: 8 }}>
                    <Col span={8}>
                      <Form.Item {...restField} name={[name, 'kalem_adi']} rules={[{ required: true }]} noStyle>
                        <Input placeholder="Ürün/Hizmet Adı" />
                      </Form.Item>
                    </Col>
                    <Col span={3}>
                      <Form.Item {...restField} name={[name, 'birim']} rules={[{ required: true }]} noStyle>
                        <Select placeholder="Birim">
                          {BIRIMLER.map(b => <Select.Option key={b} value={b}>{b}</Select.Option>)}
                        </Select>
                      </Form.Item>
                    </Col>
                    <Col span={3}>
                      <Form.Item {...restField} name={[name, 'miktar']} rules={[{ required: true }]} noStyle>
                        <InputNumber placeholder="Miktar" style={{ width: '100%' }} min={0.001} />
                      </Form.Item>
                    </Col>
                    <Col span={4}>
                      <Form.Item {...restField} name={[name, 'birim_fiyat']} rules={[{ required: true }]} noStyle>
                        <InputNumber placeholder="B.Fiyat" style={{ width: '100%' }} min={0} />
                      </Form.Item>
                    </Col>
                    <Col span={3}>
                      <Form.Item {...restField} name={[name, 'kdv_orani']} rules={[{ required: true }]} noStyle>
                        <InputNumber placeholder="KDV%" style={{ width: '100%' }} min={0} max={100} />
                      </Form.Item>
                    </Col>
                    <Col span={2}>
                      <Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(name)} />
                    </Col>
                  </Row>
                ))}
                <Form.Item>
                  <Button type="dashed" onClick={() => add({ birim: 'Adet', miktar: 1, birim_fiyat: 0, kdv_orani: 20 })} block icon={<PlusOutlined />}>
                    Kalem Ekle
                  </Button>
                </Form.Item>
              </>
            )}
          </Form.List>

          <Row gutter={16} justify="end">
            <Col span={6}>
              <Form.Item name="ara_toplam" label="Ara Toplam">
                <InputNumber disabled style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="kdv_tutar" label="KDV Toplam">
                <InputNumber disabled style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="toplam_tutar" label="Genel Toplam">
                <InputNumber disabled style={{ width: '100%', fontWeight: 'bold' }} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="vade_tarihi" label="Vade Tarihi">
                <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
              </Form.Item>
            </Col>
            <Col span={16}>
              <Form.Item name="aciklama" label="Açıklama">
                <Input />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  )
}
