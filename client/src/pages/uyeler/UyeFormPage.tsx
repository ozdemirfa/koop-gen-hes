import React, { useState, useEffect } from 'react'
import { Form, Input, InputNumber, Select, Button, message, Card, Space } from 'antd'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../lib/api'
import { PageHeader } from '../../components/common/PageHeader'

interface SerefiyeDaire {
  id: string
  daire_no: string
  serefiye_orani?: number
}

export const UyeFormPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [form] = Form.useForm()
  const isEditing = !!id
  const [selectedBlokId, setSelectedBlokId] = useState<string | undefined>(undefined)

  // Aktif projenin bloklarını getir
  const { data: aktifProje } = useQuery({
    queryKey: ['aktif-proje-bloklar'],
    queryFn: async () => {
      const { data } = await api.get('/projeler/aktif/bloklar')
      return data.data
    },
  })

  // Seçilen bloğa ait müsait daireleri getir
  const { data: musaitDaireler, isLoading: daireLoading } = useQuery({
    queryKey: ['musait-daireler', selectedBlokId],
    queryFn: async () => {
      if (!selectedBlokId) return []
      const { data } = await api.get(`/projeler/bloklar/${selectedBlokId}/musait-daireler`)
      return data.data as SerefiyeDaire[]
    },
    enabled: !!selectedBlokId,
  })

  // Eğer düzenleme modundaysa üye bilgilerini getir ve formu doldur
  const { isLoading: uyeLoading } = useQuery({
    queryKey: ['uye', id],
    queryFn: async () => {
      const { data } = await api.get(`/uyeler/${id}`)
      form.setFieldsValue(data.data)
      if (data.data.blok_id) setSelectedBlokId(data.data.blok_id)
      return data.data
    },
    enabled: isEditing,
  })

  const setServerErrors = (err: any) => {
    if (err.details && Array.isArray(err.details)) {
      const fields = err.details.map((d: { field: string; message: string }) => ({
        name: d.field,
        errors: [d.message],
      }))
      form.setFields(fields)
    } else {
      message.error(err.error || err.message || 'Hata oluştu')
    }
  }

  const mutation = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      if (isEditing) {
        const { data } = await api.put(`/uyeler/${id}`, values)
        return data
      } else {
        const { data } = await api.post('/uyeler', values)
        return data
      }
    },
    onSuccess: () => {
      message.success(isEditing ? 'Üye güncellendi' : 'Üye eklendi')
      queryClient.invalidateQueries({ queryKey: ['uyeler'] })
      navigate('/uyeler')
    },
    onError: setServerErrors,
  })

  const handleDaireChange = (serefiyeId: string) => {
    const daire = musaitDaireler?.find(d => d.id === serefiyeId)
    if (daire) {
      form.setFieldsValue({
        daire_no: daire.daire_no,
        serefiye_orani: daire.serefiye_orani || 1.000
      })
    }
  }

  return (
    <div>
      <PageHeader 
        title={isEditing ? "Üye Düzenle" : "Yeni Üye Ekle"} 
        onBack={() => navigate('/uyeler')}
      />

      <Card loading={(isEditing && uyeLoading)}>
        <Form 
          form={form} 
          layout="vertical" 
          onFinish={(values) => mutation.mutate(values)}
          style={{ maxWidth: 800 }}
        >
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="uye_no" label="Üye No" style={{ flex: 1 }}>
              <Input disabled placeholder="Otomatik Oluşturulacak" />
            </Form.Item>
            <Form.Item name="tc_kimlik" label="TC Kimlik" rules={[{ len: 11, message: 'TC Kimlik 11 haneli olmalı' }]} style={{ flex: 1 }}>
              <Input maxLength={11} />
            </Form.Item>
          </div>

          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="ad" label="Ad" rules={[{ required: true, message: 'Ad zorunlu' }]} style={{ flex: 1 }}>
              <Input />
            </Form.Item>
            <Form.Item name="soyad" label="Soyad" rules={[{ required: true, message: 'Soyad zorunlu' }]} style={{ flex: 1 }}>
              <Input />
            </Form.Item>
          </div>

          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="telefon" label="Telefon" style={{ flex: 1 }}>
              <Input />
            </Form.Item>
            <Form.Item name="email" label="E-posta" rules={[{ type: 'email', message: 'Geçerli bir e-posta girin' }]} style={{ flex: 1 }}>
              <Input />
            </Form.Item>
          </div>

          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="blok_id" label="Blok" style={{ flex: 1 }}>
              <Select 
                allowClear 
                placeholder="Blok seçin" 
                onChange={(val) => {
                  setSelectedBlokId(val)
                  form.setFieldsValue({ serefiye_id: undefined, daire_no: undefined })
                }}
              >
                {aktifProje?.bloklar?.map((b: any) => (
                  <Select.Option key={b.id} value={b.id}>{b.blok_adi}</Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item name="serefiye_id" label="Daire No" style={{ flex: 1 }} rules={[{ required: true, message: 'Daire no seçilmeli' }]}>
              <Select 
                placeholder="Önce blok seçin" 
                loading={daireLoading}
                disabled={!selectedBlokId}
                onChange={handleDaireChange}
              >
                {/* Mevcut daire */}
                {isEditing && form.getFieldValue('serefiye_id') && !musaitDaireler?.find(d => d.id === form.getFieldValue('serefiye_id')) && (
                  <Select.Option value={form.getFieldValue('serefiye_id')}>{form.getFieldValue('daire_no')}</Select.Option>
                )}
                {musaitDaireler?.map((d) => (
                  <Select.Option key={d.id} value={d.id}>{d.daire_no}</Select.Option>
                ))}
              </Select>
            </Form.Item>
            {/* Gizli alan: daire_no (Backend'e daire no string olarak da lazım olabilir) */}
            <Form.Item name="daire_no" hidden><Input /></Form.Item>
          </div>

          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="cinsiyet" label="Cinsiyet" style={{ flex: 1 }}>
              <Select allowClear placeholder="Cinsiyet seçin">
                <Select.Option value="erkek">Erkek</Select.Option>
                <Select.Option value="kadin">Kadın</Select.Option>
              </Select>
            </Form.Item>
            <Form.Item name="serefiye_orani" label="Şerefiye Oranı" initialValue={1} style={{ flex: 1 }}>
              <InputNumber min={0} step={0.001} style={{ width: '100%' }} precision={3} />
            </Form.Item>
            <Form.Item name="durum" label="Durum" initialValue="aktif" style={{ flex: 1 }}>
              <Select>
                <Select.Option value="aktif">Aktif</Select.Option>
                <Select.Option value="pasif">Pasif</Select.Option>
                <Select.Option value="ihrac">İhraç</Select.Option>
                <Select.Option value="istifa">İstifa</Select.Option>
              </Select>
            </Form.Item>
          </div>

          <Form.Item name="adres" label="Adres">
            <Input.TextArea rows={2} />
          </Form.Item>

          <Form.Item name="notlar" label="Notlar">
            <Input.TextArea rows={2} />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={mutation.isPending}>
                {isEditing ? 'Güncelle' : 'Kaydet'}
              </Button>
              <Button onClick={() => navigate('/uyeler')}>
                İptal
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
    </div>
  )
}
