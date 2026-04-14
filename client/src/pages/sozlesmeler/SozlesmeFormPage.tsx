import React from 'react'
import { Form, Input, InputNumber, Select, Button, DatePicker, Card, message, Row, Col, Space } from 'antd'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import api from '../../lib/api'
import { PageHeader } from '../../components/common/PageHeader'

export const SozlesmeFormPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const firmaIdFromUrl = searchParams.get('firma_id')
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [form] = Form.useForm()
  const isEditing = !!id

  const { data: firmalar } = useQuery({
    queryKey: ['firmalar-select'],
    queryFn: async () => {
      const { data } = await api.get('/firmalar', { params: { aktif: 'true', limit: 500 } })
      return data.data as { id: string; unvan: string }[]
    },
  })

  const { isLoading: sozlesmeLoading } = useQuery({
    queryKey: ['sozlesme', id],
    queryFn: async () => {
      const { data } = await api.get(`/sozlesmeler/${id}`)
      const s = data.data
      form.setFieldsValue({
        ...s,
        baslangic_tarihi: s.baslangic_tarihi ? dayjs(s.baslangic_tarihi) : undefined,
        bitis_tarihi: s.bitis_tarihi ? dayjs(s.bitis_tarihi) : undefined,
      })
      return s
    },
    enabled: isEditing,
  })

  // firma_id URL'den geliyorsa formu önceden doldur
  React.useEffect(() => {
    if (firmaIdFromUrl && !isEditing) {
      form.setFieldsValue({ firma_id: firmaIdFromUrl })
    }
  }, [firmaIdFromUrl, isEditing, form])

  const mutation = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const payload = {
        ...values,
        baslangic_tarihi: values.baslangic_tarihi
          ? (values.baslangic_tarihi as dayjs.Dayjs).format('YYYY-MM-DD')
          : null,
        bitis_tarihi: values.bitis_tarihi
          ? (values.bitis_tarihi as dayjs.Dayjs).format('YYYY-MM-DD')
          : null,
      }
      if (isEditing) {
        const { data } = await api.put(`/sozlesmeler/${id}`, payload)
        return data
      }
      const { data } = await api.post('/sozlesmeler', payload)
      return data
    },
    onSuccess: (data) => {
      message.success(isEditing ? 'Sözleşme güncellendi' : 'Sözleşme oluşturuldu')
      queryClient.invalidateQueries({ queryKey: ['sozlesmeler'] })
      const targetId = isEditing ? id : data.data?.id
      navigate(targetId ? `/sozlesmeler/${targetId}` : '/firmalar')
    },
    onError: (err: any) => message.error(err.message || 'Hata oluştu'),
  })

  return (
    <div>
      <PageHeader
        title={isEditing ? 'Sözleşme Düzenle' : 'Yeni Sözleşme'}
        subtitle={isEditing ? 'Sözleşme bilgilerini güncelleyin' : 'Yeni bir yüklenici sözleşmesi oluşturun'}
        showBack
        backPath={firmaIdFromUrl ? `/firmalar/${firmaIdFromUrl}` : '/firmalar'}
      />

      <Card loading={isEditing && sozlesmeLoading}>
        <Form
          form={form}
          layout="vertical"
          onFinish={(v) => mutation.mutate(v)}
          style={{ maxWidth: 800 }}
        >
          <Form.Item name="firma_id" label="Firma" rules={[{ required: true, message: 'Firma seçin' }]}>
            <Select
              showSearch
              placeholder="Firma seçin"
              optionFilterProp="children"
              filterOption={(input, option) =>
                (option?.children as unknown as string)?.toLowerCase().includes(input.toLowerCase())
              }
            >
              {firmalar?.map((f) => (
                <Select.Option key={f.id} value={f.id}>{f.unvan}</Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="sozlesme_no" label="Sözleşme No">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="toplam_tutar"
                label="Toplam Tutar (TL)"
                rules={[
                  { required: true, message: 'Tutar zorunlu' },
                  { type: 'number', min: 0.01, message: 'Tutar sıfırdan büyük olmalı' },
                ]}
              >
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="konu" label="Konu" rules={[{ required: true, message: 'Konu zorunlu' }]}>
            <Input.TextArea rows={2} />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="baslangic_tarihi"
                label="Başlangıç Tarihi"
                rules={[{ required: true, message: 'Başlangıç tarihi zorunlu' }]}
              >
                <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="bitis_tarihi"
                label="Bitiş Tarihi"
                dependencies={['baslangic_tarihi']}
                rules={[
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      const bas = getFieldValue('baslangic_tarihi') as dayjs.Dayjs | undefined
                      if (!value || !bas) return Promise.resolve()
                      if ((value as dayjs.Dayjs).isBefore(bas)) {
                        return Promise.reject(new Error('Bitiş tarihi başlangıçtan önce olamaz'))
                      }
                      return Promise.resolve()
                    },
                  }),
                ]}
              >
                <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="teminat_orani" label="Teminat Oranı (%)" initialValue={0}>
                <InputNumber min={0} max={100} step={0.5} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="stopaj_orani" label="Stopaj Oranı (%)" initialValue={0}>
                <InputNumber min={0} max={100} step={0.5} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="notlar" label="Notlar">
            <Input.TextArea rows={2} />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0 }}>
            <Space>
              <Button type="primary" htmlType="submit" loading={mutation.isPending}>
                {isEditing ? 'Güncelle' : 'Kaydet'}
              </Button>
              <Button onClick={() => navigate(-1)}>
                İptal
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
    </div>
  )
}
