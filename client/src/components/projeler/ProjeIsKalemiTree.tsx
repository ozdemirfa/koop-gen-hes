import React, { useState, useEffect } from 'react'
import { Table, Button, Modal, Form, Input, InputNumber, Select, Space, App, Popconfirm, Card, Typography } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import api from '../../lib/api'
import { getErrorMessage } from '../../lib/apiError'
import { trNumberFormatter, trNumberParser, trMoneyFormatter } from '../../lib/format'

const { Text } = Typography

interface ProjeIsKalemi {
  id: string
  proje_id: string
  sira_no: number
  kalem_kodu?: string
  tanim: string
  birim?: string
  miktar?: number
  birim_fiyat?: number
  butce_tutari: number
  durum: 'planli' | 'devam_ediyor' | 'tamamlandi' | 'iptal'
  notlar?: string
  yillik_plan_toplami?: number
}

interface Props {
  projeId: string
  data: ProjeIsKalemi[]
  yil?: number
}

const BIRIMLER = ['m2', 'm3', 'mt', 'adet', 'ton', 'kg', 'litre', 'set', 'gun', 'saat', 'ls']

export const ProjeIsKalemiTree: React.FC<Props> = ({ projeId, data, yil }) => {
  const queryClient = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingKalem, setEditingKalem] = useState<ProjeIsKalemi | null>(null)
  const [isBudgetManual, setIsBudgetManual] = useState(false)
  const [form] = Form.useForm()
  const { message: messageApi } = App.useApp()

  // Pozlar listesini getir
  const { data: pozlar } = useQuery({
    queryKey: ['settings-pozlar'],
    queryFn: async () => {
      const { data } = await api.get('/settings/pozlar')
      return data.data as any[]
    },
  })

  // Data prop zaten düz liste (ust_kalem_id kalktığı için)
  const flatList = [...(data || [])].sort((a, b) => (a.sira_no || 0) - (b.sira_no || 0))

  // Modal her açıldığında veya editingKalem değiştiğinde form değerlerini kontrol et
  useEffect(() => {
    if (modalOpen) {
      if (editingKalem) {
        form.setFieldsValue(editingKalem)
        // Eğer bütçe tutarı 0 geliyorsa ama miktar/fiyat varsa hesapla
        if (!editingKalem.butce_tutari && editingKalem.miktar && editingKalem.birim_fiyat) {
          const m = Number(editingKalem.miktar) || 0
          const f = Number(editingKalem.birim_fiyat) || 0
          form.setFieldsValue({ butce_tutari: Math.round(m * f * 100) / 100 })
        }
      } else {
        form.resetFields()
        form.setFieldsValue({ sira_no: flatList.length + 1, durum: 'planli' })
      }
    }
  }, [modalOpen, editingKalem, form, flatList.length])

  const handlePozSelect = (pozId: string) => {
    const selectedPoz = pozlar?.find(p => p.id === pozId)
    if (selectedPoz) {
      form.setFieldsValue({
        kalem_kodu: selectedPoz.poz_no,
        tanim: selectedPoz.tanim,
        birim: selectedPoz.birimler?.ad || selectedPoz.birim
      })
    }
  }

  const saveMutation = useMutation({
    mutationFn: async (values: any) => {
      const cleanValues = { ...values }
      if (cleanValues.kalem_kodu === '') delete cleanValues.kalem_kodu
      if (cleanValues.notlar === '') delete cleanValues.notlar

      if (editingKalem) {
        return await api.put(`/projeler/is-kalemleri/${editingKalem.id}`, cleanValues)
      }
      return await api.post(`/projeler/${projeId}/is-kalemleri`, cleanValues)
    },
    onSuccess: () => {
      messageApi.success('İş kalemi kaydedildi')
      queryClient.invalidateQueries({ queryKey: ['proje', projeId] })
      setModalOpen(false)
      form.resetFields()
      setEditingKalem(null)
      setIsBudgetManual(false)
    },
    onError: (err) => messageApi.error(getErrorMessage(err))
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await api.delete(`/projeler/is-kalemleri/${id}`)
    },
    onSuccess: () => {
      messageApi.success('İş kalemi silindi')
      queryClient.invalidateQueries({ queryKey: ['proje', projeId] })
    },
    onError: (err) => messageApi.error(getErrorMessage(err))
  })

  const columns = [
    { title: 'Sıra No', dataIndex: 'sira_no', key: 'sira_no', width: 80, sorter: (a: any, b: any) => a.sira_no - b.sira_no },
    { 
      title: 'Poz / Tanım', 
      key: 'tanim', 
      render: (_: any, r: any) => (
        <Space orientation="vertical" size={0}>
          <Text strong style={{ fontSize: '12px' }}>{r.kalem_kodu}</Text>
          <Text>{r.tanim}</Text>
        </Space>
      )
    },
    { title: 'Birim', dataIndex: 'birim', key: 'birim', width: 80 },
    { title: 'Miktar', dataIndex: 'miktar', key: 'miktar', width: 100, align: 'right' as const, render: (v: number) => trNumberFormatter(v) },
    {
      title: 'Bütçe Tutarı',
      dataIndex: 'butce_tutari',
      key: 'butce',
      width: 130,
      align: 'right' as const,
      render: (v: number) => trMoneyFormatter(v)
    },
    {
      title: yil ? `${yil} Yıllık Plan (₺)` : 'Yıllık Plan (₺)',
      dataIndex: 'yillik_plan_toplami',
      key: 'yillik_plan_toplami',
      width: 140,
      align: 'right' as const,
      render: (v: number | undefined) => (v != null ? trMoneyFormatter(v) : '-'),
    },
    {
      title: 'İşlem',
      key: 'action',
      width: 80,
      render: (_: any, r: any) => (
        <Space orientation="horizontal">
          <Button 
            type="text" 
            size="small" 
            icon={<EditOutlined />} 
            onClick={() => {
              setEditingKalem(r)
              setIsBudgetManual(false)
              setModalOpen(true)
            }} 
          />
          <Popconfirm title="Bu kalemi silmek istediğinize emin misiniz?" onConfirm={() => deleteMutation.mutate(r.id)}>
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      )
    }
  ]

  const handleValuesChange = (changedValues: any, allValues: any) => {
    // Değerleri sayıya çevir (null/undefined ise 0 kabul et)
    const miktar = Number(allValues.miktar) || 0
    const birimFiyat = Number(allValues.birim_fiyat) || 0
    const butceTutari = Number(allValues.butce_tutari) || 0
    
    if (!isBudgetManual) {
      // Otomatik mod: Miktar veya birim fiyat değişince bütçeyi güncelle
      if (changedValues.miktar !== undefined || changedValues.birim_fiyat !== undefined) {
        const calculatedBudget = Math.round(miktar * birimFiyat * 100) / 100
        form.setFieldsValue({ butce_tutari: calculatedBudget })
      }
    } else {
      // Manuel mod: Bütçe tutarı değişince (miktar > 0 ise) birim fiyatı güncelle
      if (changedValues.butce_tutari !== undefined && miktar > 0) {
        const calculatedPrice = Math.round((butceTutari / miktar) * 100) / 100
        form.setFieldsValue({ birim_fiyat: calculatedPrice })
      }
      // Manuel modda miktar değişirse bütçeyi sabit tutup birim fiyatı güncelle
      if (changedValues.miktar !== undefined && miktar > 0) {
        const calculatedPrice = Math.round((butceTutari / miktar) * 100) / 100
        form.setFieldsValue({ birim_fiyat: calculatedPrice })
      }
    }
  }

  const toggleBudgetMode = () => {
    const newMode = !isBudgetManual
    setIsBudgetManual(newMode)
    
    // Otomatik moda geçerken mevcut değerlerle bütçeyi hemen eşitle
    if (!newMode) {
      const values = form.getFieldsValue()
      const miktar = Number(values.miktar) || 0
      const birimFiyat = Number(values.birim_fiyat) || 0
      form.setFieldsValue({ butce_tutari: Math.round(miktar * birimFiyat * 100) / 100 })
    }
  }

  return (
    <Card 
      title="İş Kalemleri"
      variant="borderless"
      styles={{ body: { padding: 0 } }}
      extra={
        <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => {
          setEditingKalem(null)
          setIsBudgetManual(false)
          setModalOpen(true)
        }}>
          İş Kalemi Ekle
        </Button>
      }
    >
      <Table
        dataSource={flatList}
        columns={columns}
        rowKey="id"
        size="small"
        pagination={false}
        loading={deleteMutation.isPending}
      />

      <Modal
        title={editingKalem ? 'İş Kalemi Düzenle' : 'Yeni İş Kalemi'}
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false)
          setEditingKalem(null)
        }}
        onOk={() => form.submit()}
        confirmLoading={saveMutation.isPending}
        width="min(600px, 95vw)"
      >
        <Form 
          form={form} 
          layout="vertical" 
          onFinish={(v) => saveMutation.mutate(v)} 
          onValuesChange={handleValuesChange}
          autoComplete="off"
          size="small"
        >
          {!editingKalem && (
            <Form.Item label="Pozlar Tablosundan Seç">
              <Select
                showSearch
                placeholder="Poz no veya tanım ile ara..."
                optionFilterProp="label"
                onChange={handlePozSelect}
                allowClear
                options={pozlar?.map(p => ({
                  value: p.id,
                  label: `${p.poz_no} - ${p.tanim}`
                }))}
              />
            </Form.Item>
          )}

          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="kalem_kodu" label="Poz No / Kalem Kodu" style={{ flex: 1 }} rules={[{ required: true }]}>
              <Input placeholder="Örn: 15.120.1001" autoComplete="off" />
            </Form.Item>
            <Form.Item name="sira_no" label="Sıra No" style={{ flex: 1 }} rules={[{ required: true }]}>
              <InputNumber style={{ width: '100%' }} />
            </Form.Item>
          </div>
          <Form.Item name="tanim" label="Tanım" rules={[{ required: true }]}>
            <Input autoComplete="off" />
          </Form.Item>
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="birim" label="Birim" style={{ flex: 1 }}>
              <Select placeholder="Seçiniz..." showSearch>
                {BIRIMLER.map(b => <Select.Option key={b} value={b}>{b}</Select.Option>)}
              </Select>
            </Form.Item>
            <Form.Item name="miktar" label="Miktar" style={{ flex: 1 }}>
              <InputNumber 
                style={{ width: '100%' }} 
                formatter={trNumberFormatter} 
                parser={trNumberParser} 
                decimalSeparator=","
                precision={2}
                autoComplete="off"
              />
            </Form.Item>
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="birim_fiyat" label="Birim Fiyat" style={{ flex: 1 }}>
              <InputNumber 
                style={{ width: '100%' }} 
                formatter={trMoneyFormatter} 
                parser={trNumberParser} 
                decimalSeparator=","
                precision={2}
                autoComplete="off"
              />
            </Form.Item>
            <Form.Item label="Bütçe Tutarı" style={{ flex: 1 }}>
              <Space.Compact style={{ width: '100%' }}>
                <Form.Item name="butce_tutari" noStyle>
                  <InputNumber 
                    style={{ width: 'calc(100% - 32px)' }} 
                    formatter={trMoneyFormatter} 
                    parser={trNumberParser} 
                    readOnly={!isBudgetManual}
                    decimalSeparator=","
                    precision={2}
                    autoComplete="off"
                  />
                </Form.Item>
                <Button 
                  type={isBudgetManual ? "primary" : "default"} 
                  icon={<EditOutlined />} 
                  onClick={toggleBudgetMode}
                  title="Bütçeyi manuel düzenle / Otomatik hesapla"
                />
              </Space.Compact>
            </Form.Item>
          </div>
          <Form.Item name="durum" label="Durum" rules={[{ required: true }]}>
            <Select>
              <Select.Option value="planli">Planlı</Select.Option>
              <Select.Option value="devam_ediyor">Devam Ediyor</Select.Option>
              <Select.Option value="tamamlandi">Tamamlandı</Select.Option>
              <Select.Option value="iptal">İptal</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="notlar" label="Notlar">
            <Input.TextArea rows={2} autoComplete="off" />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  )
}
