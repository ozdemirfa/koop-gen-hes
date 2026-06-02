import React, { useEffect } from 'react'
import { Form, Input, Select, Button, Card, Space, App, Alert } from 'antd'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../lib/api'
import { getErrorMessage } from '../../lib/apiError'
import { PageHeader } from '../../components/common/PageHeader'
import { useProject } from '../../contexts/ProjectContext'

export const UyeFormPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { activeProject } = useProject()
  const [form] = Form.useForm()
  const isEditing = !!id
  const { message: messageApi } = App.useApp()

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
        ...uye
      })
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
    if (err?.details && Array.isArray(err.details)) {
      const fields = err.details.map((d: { field: string; message: string }) => ({
        name: d.field,
        errors: [d.message],
      }))
      form.setFields(fields)
    } else {
      messageApi.error(getErrorMessage(err))
    }
  }

  const mutation = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      if (isEditing) {
        const { data } = await api.put(`/uyeler/${id}`, values)
        return data
      } else {
        if (!activeProject?.id) throw new Error('Üye eklemek için önce aktif bir proje seçmelisiniz.')
        const { data } = await api.post('/uyeler', { ...values, proje_id: activeProject.id })
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

  if (!activeProject?.id && !isEditing) {
    return (
      <div style={{ padding: '24px' }}>
        <Alert
          message="Aktif Proje Gerekli"
          description="Yeni üye ekleyebilmek için lütfen önce bir proje oluşturun ve aktif hale getirin."
          type="warning"
          showIcon
        />
        <Button onClick={() => navigate('/uyeler')} style={{ marginTop: 16 }}>Geri Dön</Button>
      </div>
    )
  }

  return (
    <div className="animate-in fade-in duration-500">
      <PageHeader 
        title={isEditing ? "Üye Düzenle" : "Yeni Üye Ekle"} 
        onBack={() => navigate('/uyeler')}
      />

      <Card loading={(isEditing && uyeLoading)} variant="borderless" className="shadow-sm">
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) => mutation.mutate(values)}
          style={{ maxWidth: 800 }}
          initialValues={{ durum: 'aktif' }}
          autoComplete="off"
          validateTrigger={["onBlur", "onChange"]}
        >
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="uye_no" label="Üye No" style={{ flex: 1 }}>
              <Input disabled placeholder="Otomatik Oluşturulacak" autoComplete="off" />
            </Form.Item>
            <Form.Item
              name="tc_kimlik"
              label="TC Kimlik"
              rules={[
                { pattern: /^[1-9][0-9]{10}$/, message: 'TC Kimlik 11 haneli sayısal olmalı' },
              ]}
              style={{ flex: 1 }}
            >
              <Input maxLength={11} autoComplete="off" />
            </Form.Item>
          </div>

          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="ad" label="Ad" rules={[{ required: true, message: 'Ad zorunlu' }]} style={{ flex: 1 }}>
              <Input autoComplete="off" />
            </Form.Item>
            <Form.Item name="soyad" label="Soyad" rules={[{ required: true, message: 'Soyad zorunlu' }]} style={{ flex: 1 }}>
              <Input autoComplete="off" />
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
              <Input placeholder="5xx xxx xx xx" onChange={onPhoneChange} maxLength={13} autoComplete="off" />
            </Form.Item>
            <Form.Item name="email" label="E-posta" rules={[{ type: 'email', message: 'Geçerli bir e-posta girin' }]} style={{ flex: 1 }}>
              <Input autoComplete="off" />
            </Form.Item>
          </div>

          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="durum" label="Üyelik Durumu" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Select>
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

          <Form.Item name="adres" label="Adres">
            <Input.TextArea rows={2} autoComplete="off" />
          </Form.Item>

          <Form.Item name="notlar" label="Notlar">
            <Input.TextArea rows={2} autoComplete="off" />
          </Form.Item>

          <Form.Item>
            <Space orientation="horizontal">
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
