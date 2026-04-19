import React, { useState, useEffect } from 'react'
import { Form, Input, InputNumber, Select, Button, message, Card, Space, Typography, App } from 'antd'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../lib/api'
import { PageHeader } from '../../components/common/PageHeader'

const { Text } = Typography

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
  const currentDurum = Form.useWatch('durum', form)
  const { message: messageApi } = App.useApp()

  const activeProjectId = localStorage.getItem('activeProjectId')

  // Aktif projenin bloklarını getir
  const { data: aktifProje } = useQuery({
    queryKey: ['proje', activeProjectId],
    queryFn: async () => {
      if (!activeProjectId) return null
      const { data } = await api.get(`/projeler/${activeProjectId}`)
      return data.data
    },
    enabled: !!activeProjectId
  })

  // Seçilen bloğa ait müsait daireleri getir
  const { data: musaitDaireler, isLoading: daireLoading } = useQuery({
    queryKey: ['musait-daireler', selectedBlokId],
    queryFn: async () => {
      if (!selectedBlokId) return []
      const { data } = await api.get(`/projeler/bloklar/${selectedBlokId}/musait-daireler`)
      return data.data as SerefiyeDaire[]
    },
    enabled: !!selectedBlokId && currentDurum === 'aktif',
  })

  // Eğer düzenleme modundaysa üye bilgilerini getir ve formu doldur
  const { data: uye, isLoading: uyeLoading } = useQuery({
    queryKey: ['uye', id],
    queryFn: async () => {
      const { data } = await api.get(`/uyeler/${id}`)
      return data.data
    },
    enabled: isEditing,
  })

  // Veri yüklendiğinde formu doldur
  useEffect(() => {
    if (uye) {
      form.setFieldsValue({
        ...uye,
        daire_no: uye.serefiye_tablosu?.daire_no,
        serefiye_orani: uye.serefiye_tablosu?.serefiye_orani,
        blok_id_virtual: uye.serefiye_tablosu?.blok_id
      })
      if (uye.serefiye_tablosu?.blok_id) {
        setSelectedBlokId(uye.serefiye_tablosu.blok_id)
      }
    }
  }, [uye, form])

  const formatPhoneNumber = (value: string) => {
    if (!value) return value;
    const phoneNumber = value.replace(/[^\d]/g, '');
    const phoneNumberLength = phoneNumber.length;
    if (phoneNumberLength <= 3) return phoneNumber;
    if (phoneNumberLength <= 6) {
      return `${phoneNumber.slice(0, 3)} ${phoneNumber.slice(3)}`;
    }
    if (phoneNumberLength <= 8) {
      return `${phoneNumber.slice(0, 3)} ${phoneNumber.slice(3, 6)} ${phoneNumber.slice(6)}`;
    }
    return `${phoneNumber.slice(0, 3)} ${phoneNumber.slice(3, 6)} ${phoneNumber.slice(6, 8)} ${phoneNumber.slice(8, 10)}`;
  }

  const onPhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhoneNumber(e.target.value);
    form.setFieldsValue({ telefon: formatted });
  }

  const setServerErrors = (err: any) => {
    if (err.details && Array.isArray(err.details)) {
      const fields = err.details.map((d: { field: string; message: string }) => ({
        name: d.field,
        errors: [d.message],
      }))
      form.setFields(fields)
    } else {
      messageApi.error(err.error || err.message || 'Hata oluştu')
    }
  }

  const mutation = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      if (isEditing) {
        const { data } = await api.put(`/uyeler/${id}`, values)
        return data
      } else {
        const { data } = await api.post('/uyeler', { ...values, proje_id: activeProjectId })
        return data
      }
    },
    onSuccess: () => {
      messageApi.success(isEditing ? 'Üye güncellendi' : 'Üye eklendi')
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
          initialValues={{ durum: 'aktif' }}
        >
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="uye_no" label="Üye No" style={{ flex: 1 }}>
              <Input disabled placeholder="Otomatik Oluşturulacak" />
            </Form.Item>
            <Form.Item
              name="tc_kimlik"
              label="TC Kimlik"
              rules={[
                { pattern: /^[1-9][0-9]{10}$/, message: 'TC Kimlik 11 haneli sayısal olmalı' },
              ]}
              style={{ flex: 1 }}
            >
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
            <Form.Item
              name="telefon"
              label="Telefon"
              rules={[
                { pattern: /^[0-9 ]{13}$/, message: 'Telefon 10 haneli olmalı (örn: 5xx xxx xx xx)' },
              ]}
              style={{ flex: 1 }}
            >
              <Input placeholder="5xx xxx xx xx" onChange={onPhoneChange} maxLength={13} />
            </Form.Item>
            <Form.Item name="email" label="E-posta" rules={[{ type: 'email', message: 'Geçerli bir e-posta girin' }]} style={{ flex: 1 }}>
              <Input />
            </Form.Item>
          </div>

          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="durum" label="Üyelik Durumu" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Select onChange={(val) => {
                if (val !== 'aktif') {
                  form.setFieldsValue({ serefiye_id: undefined, daire_no: undefined, serefiye_orani: undefined, blok_id_virtual: undefined })
                  setSelectedBlokId(undefined)
                }
              }}>
                <Select.Option value="aktif">Aktif</Select.Option>
                <Select.Option value="pasif">Pasif</Select.Option>
                <Select.Option value="ihrac">İhraç</Select.Option>
                <Select.Option value="istifa">İstifa</Select.Option>
              </Select>
            </Form.Item>
            <Form.Item name="cinsiyet" label="Cinsiyet" style={{ flex: 1 }}>
              <Select allowClear placeholder="Cinsiyet seçin">
                <Select.Option value="erkek">Erkek</Select.Option>
                <Select.Option value="kadin">Kadın</Select.Option>
              </Select>
            </Form.Item>
          </div>

          {isEditing && (
            <>
              {currentDurum === 'aktif' ? (
                <div style={{ display: 'flex', gap: 16 }}>
                  <Form.Item name="blok_id_virtual" label="Blok" style={{ flex: 1 }}>
                    <Select 
                      allowClear 
                      placeholder="Blok seçin" 
                      value={selectedBlokId}
                      onChange={(val) => {
                        setSelectedBlokId(val)
                        form.setFieldsValue({ serefiye_id: undefined, daire_no: undefined, serefiye_orani: undefined })
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
                      {isEditing && form.getFieldValue('serefiye_id') && !musaitDaireler?.find(d => d.id === form.getFieldValue('serefiye_id')) && (
                        <Select.Option value={form.getFieldValue('serefiye_id')}>{form.getFieldValue('daire_no')}</Select.Option>
                      )}
                      {musaitDaireler?.map((d) => (
                        <Select.Option key={d.id} value={d.id}>{d.daire_no}</Select.Option>
                      ))}
                    </Select>
                  </Form.Item>
                  <Form.Item name="serefiye_orani" label="Şerefiye Oranı" style={{ flex: 1 }}>
                    <InputNumber disabled min={0} step={0.001} style={{ width: '100%' }} precision={3} />
                  </Form.Item>
                  <Form.Item name="daire_no" hidden><Input /></Form.Item>
                </div>
              ) : (
                <Card size="small" style={{ marginBottom: 24, background: '#fff7e6', border: '1px solid #ffe58f' }}>
                  <Text type="warning">Sadece <strong>AKTİF</strong> üyeler için daire ataması yapılabilir.</Text>
                </Card>
              )}
            </>
          )}

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
