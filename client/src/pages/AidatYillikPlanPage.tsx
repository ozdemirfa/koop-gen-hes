import React from 'react'
import { Form, InputNumber, Select, Button, Space, Card, Typography, message, Row, Col } from 'antd'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { SaveOutlined } from '@ant-design/icons'
import api from '../lib/api'
import dayjs from 'dayjs'
import { PageHeader } from '../components/common/PageHeader'
import { useProject } from '../contexts/ProjectContext'
import { trNumberFormatter, trNumberParser } from '../lib/format'

const { Text } = Typography

const aylar = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']

export const AidatYillikPlanPage: React.FC = () => {
  const [form] = Form.useForm()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { activeProject } = useProject()

  const initialKalemler = Array.from({ length: 12 }, (_, i) => ({
    ay: i + 1,
    tur: 'normal',
    katsayi_tutari: 0,
    son_odeme_gunu: 15,
    gecikme_faiz_orani: 0
  }))

  const createTanimMutation = useMutation({
    mutationFn: async (values: any) => {
      const { data } = await api.post('/aidatlar/yillik-plan', {
        ...values,
        proje_id: activeProject?.id
      })
      return data
    },
    onSuccess: (data) => {
      message.success(`Aidat planı oluşturuldu. ${data.data.olusturulan_aidat_sayisi} üyeye borç kaydı açıldı.`)
      queryClient.invalidateQueries({ queryKey: ['aidat-tanimlari'] })
      queryClient.invalidateQueries({ queryKey: ['aidatlar'] })
      navigate('/aidatlar')
    },
    onError: (err: any) => message.error(err.message || 'Hata oluştu'),
  })

  const handleKatsayiChange = (value: number | null, index: number) => {
    if (value === null) return
    const currentKalemler = form.getFieldValue('kalemler') || []
    const updatedKalemler = [...currentKalemler]
    
    // Sadece 'normal' türdeki sonraki ayları güncelle
    if (updatedKalemler[index]?.tur !== 'normal') return
    
    for (let i = index; i < updatedKalemler.length; i++) {
      if (updatedKalemler[i]?.tur === 'normal') {
        updatedKalemler[i] = { ...updatedKalemler[i], katsayi_tutari: value }
      }
    }
    
    form.setFieldsValue({ kalemler: updatedKalemler })
  }

  const handleGecikmeChange = (value: number | null, index: number) => {
    if (value === null) return
    const currentKalemler = form.getFieldValue('kalemler') || []
    const updatedKalemler = [...currentKalemler]
    
    // Gecikme oranı girilince altındaki tüm kutulara aynı oranı uygula
    for (let i = index; i < updatedKalemler.length; i++) {
      updatedKalemler[i] = { ...updatedKalemler[i], gecikme_faiz_orani: value }
    }
    
    form.setFieldsValue({ kalemler: updatedKalemler })
  }

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <PageHeader
        title="Yeni Yıllık Aidat Planı"
        subtitle="Seçilen yıl için aylık aidat ve ara ödeme planı oluşturun"
        showBack
        backPath="/aidatlar"
        extra={
          <Button type="primary" icon={<SaveOutlined />} onClick={() => form.submit()} loading={createTanimMutation.isPending}>
            Planı Kaydet ve Borçlandır
          </Button>
        }
      />

      <Card>
        <Form 
          form={form} 
          layout="vertical" 
          onFinish={(v) => createTanimMutation.mutate(v)}
          initialValues={{ yil: dayjs().year(), kalemler: initialKalemler }}
        >
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="yil" label="Hangi Yıl İçin Planlanıyor?" rules={[{ required: true }]}>
                 <InputNumber style={{ width: '100%' }} placeholder="Örn: 2026" />
              </Form.Item>
            </Col>
            <Col span={16}>
              <div style={{ marginTop: 30, color: '#666' }}>
                <Text type="secondary">Not: Katsayı tutarı veya gecikme oranı değiştiğinde, sonraki satırlar otomatik güncellenir.</Text>
              </div>
            </Col>
          </Row>

          <div style={{ marginTop: 20 }}>
            <div style={{ display: 'flex', fontWeight: 'bold', marginBottom: 8, padding: '0 8px' }}>
              <div style={{ width: 130 }}>Ay</div>
              <div style={{ width: 130 }}>Tür</div>
              <div style={{ width: 160 }}>Katsayı Tutarı (TL)</div>
              <div style={{ width: 110 }}>Son Gün</div>
              <div style={{ width: 110 }}>Gecikme %</div>
              <div style={{ flex: 1 }}>İşlemler</div>
            </div>

            <Form.List name="kalemler">
              {(fields, { add, remove }) => (
                <>
                  {fields.map(({ key, name, ...restField }) => (
                    <Card size="small" style={{ marginBottom: 8 }} key={key} styles={{ body: { padding: '12px 8px' } }}>
                      <Space style={{ display: 'flex' }} align="baseline">
                        <Form.Item
                          {...restField}
                          name={[name, 'ay']}
                          rules={[{ required: true }]}
                          style={{ marginBottom: 0 }}
                        >
                          <Select style={{ width: 120 }}>
                            {aylar.map((a, i) => <Select.Option key={i + 1} value={i + 1}>{a}</Select.Option>)}
                          </Select>
                        </Form.Item>

                        <Form.Item
                          {...restField}
                          name={[name, 'tur']}
                          rules={[{ required: true }]}
                          style={{ marginBottom: 0 }}
                        >
                          <Select style={{ width: 120 }}>
                            <Select.Option value="normal">Normal</Select.Option>
                            <Select.Option value="ara_odeme">Ara Ödeme</Select.Option>
                          </Select>
                        </Form.Item>

                        <Form.Item
                          {...restField}
                          name={[name, 'katsayi_tutari']}
                          rules={[{ required: true, message: 'Zorunlu' }]}
                          style={{ marginBottom: 0 }}
                        >
                          <InputNumber 
                            placeholder="Tutar" 
                            min={0} 
                            style={{ width: 150 }} 
                            onChange={(val) => handleKatsayiChange(val, name)}
                            formatter={trNumberFormatter}
                            parser={trNumberParser}
                            decimalSeparator=","
                          />
                        </Form.Item>

                        <Form.Item
                          {...restField}
                          name={[name, 'son_odeme_gunu']}
                          style={{ marginBottom: 0 }}
                        >
                          <InputNumber placeholder="Gün" min={1} max={31} style={{ width: 100 }} />
                        </Form.Item>

                        <Form.Item
                          {...restField}
                          name={[name, 'gecikme_faiz_orani']}
                          style={{ marginBottom: 0 }}
                        >
                          <InputNumber 
                            placeholder="%" 
                            min={0} 
                            max={100} 
                            step={0.1} 
                            style={{ width: 100 }} 
                            onChange={(val) => handleGecikmeChange(val, name)}
                            formatter={trNumberFormatter}
                            parser={trNumberParser}
                            decimalSeparator=","
                          />
                        </Form.Item>

                        <Space>
                          <Button 
                            type="dashed" 
                            size="small"
                            onClick={() => add({ ay: form.getFieldValue(['kalemler', name, 'ay']), tur: 'ara_odeme', katsayi_tutari: 0, son_odeme_gunu: 15, gecikme_faiz_orani: 0 }, name + 1)}
                          >
                            + Ara Ödeme
                          </Button>
                          <Button type="text" danger size="small" onClick={() => remove(name)}>Sil</Button>
                        </Space>
                      </Space>
                    </Card>
                  ))}
                  <Button type="dashed" onClick={() => add()} block style={{ marginTop: 8 }}>
                    + Yeni Ay Ekle
                  </Button>
                </>
              )}
            </Form.List>
          </div>
        </Form>
      </Card>
    </div>
  )
}
