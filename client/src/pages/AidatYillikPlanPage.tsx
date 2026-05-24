import React from 'react'
import { Form, InputNumber, Select, Button, Space, Card, Typography, Row, Col, App } from 'antd'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { SaveOutlined, PlusOutlined } from '@ant-design/icons'
import api from '../lib/api'
import { getErrorMessage } from '../lib/apiError'
import dayjs from 'dayjs'
import { PageHeader } from '../components/common/PageHeader'
import { useProject } from '../contexts/ProjectContext'
import { trNumberFormatter, trNumberParser, trMoneyFormatter } from '../lib/format'

import { usePageSettings } from '../contexts/LayoutContext'

const { Text } = Typography

const aylar = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']

export const AidatYillikPlanPage: React.FC = () => {
  const [form] = Form.useForm()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { activeProject } = useProject()
  const { message: messageApi } = App.useApp()
  const kalemler = Form.useWatch('kalemler', form)

  usePageSettings('Yeni Yıllık Aidat Planı')

  // Toplam yıllık ödemeyi hesapla
  const toplamYillikOdeme = React.useMemo(() => {
    return (kalemler || []).reduce((sum: number, k: any) => sum + (Number(k.katsayi_tutari) || 0), 0)
  }, [kalemler])

  const initialKalemler = React.useMemo(() => {
    const saved = localStorage.getItem('system_parameters')
    const params = saved ? JSON.parse(saved) : {
      default_gecikme_faizi: 5,
      default_son_odeme_gunu: 15
    }

    return Array.from({ length: 12 }, (_, i) => ({
      ay: i + 1,
      tur: 'normal',
      katsayi_tutari: 0,
      son_odeme_gunu: params.default_son_odeme_gunu,
      gecikme_faiz_orani: params.default_gecikme_faizi
    }))
  }, [])

  const createTanimMutation = useMutation({
    mutationFn: async (values: any) => {
      const { data } = await api.post('/aidatlar/yillik-plan', {
        ...values,
        proje_id: activeProject?.id
      })
      return data
    },
    onSuccess: () => {
      messageApi.success(`Aidat planı kaydedildi. Borçlandırma her ayın 1'inde otomatik yapılacaktır.`)
      queryClient.invalidateQueries({ queryKey: ['aidat-tanimlari'] })
      navigate('/aidatlar/tanimlar')
    },
    onError: (err) => messageApi.error(getErrorMessage(err)),
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
    <div>
      <PageHeader
        title="Yeni Yıllık Aidat Planı"
        subtitle="Seçilen yıl için aylık aidat ve ara ödeme planı hazırlayın (Sadece taslak olarak kaydedilir)"
        showBack
        backPath="/aidatlar/tanimlar"
        extra={
          <Button type="primary" icon={<SaveOutlined />} onClick={() => form.submit()} loading={createTanimMutation.isPending}>
            Yıllık Planı Kaydet
          </Button>
        }
      />

      <Card>
        <Form
          form={form}
          layout="vertical"
          onFinish={(v) => createTanimMutation.mutate(v)}
          initialValues={{ yil: dayjs().year(), kalemler: initialKalemler }}
          autoComplete="off"
          validateTrigger={["onBlur", "onChange"]}
        >
          <Row gutter={[16, 8]} align="middle">
            <Col xs={12} sm={8} md={6}>
              <Form.Item name="yil" label="Hangi Yıl İçin Planlanıyor?" rules={[{ required: true }]}>
                 <InputNumber style={{ width: '100%' }} placeholder="Örn: 2026" autoComplete="off" />
              </Form.Item>
            </Col>
            <Col xs={12} sm={8} md={6}>
              <div style={{ padding: '0 8px' }}>
                <Text type="secondary" style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>Yıllık Toplam Ödeme (1 Pay)</Text>
                <Text strong style={{ fontSize: '20px', color: '#1890ff' }}>
                  ₺ {trMoneyFormatter(toplamYillikOdeme)}
                </Text>
              </div>
            </Col>
          </Row>

          <Row style={{ marginBottom: 20 }}>
            <Col span={24}>
              <Text type="secondary" style={{ fontStyle: 'italic', fontSize: '13px' }}>
                * Katsayı tutarı veya gecikme oranı değiştiğinde, sonraki satırlar otomatik güncellenir.
              </Text>
            </Col>
          </Row>

          {/*
           * 2026-05-24 (kullanıcı isteği): satır artık responsive grid.
           * Desktop'ta yatay (Row gutter), mobilde wrap'lı (Col xs={12}/{24}).
           * Üst başlık satırı kaldırıldı; her input kendi label'ını taşıyor →
           * mobilde dar ekranda da label görünür. Outer .yillik-plan-rows
           * container'i xs (<576) için gerekirse yatay scroll açar.
           */}
          <div className="yillik-plan-rows" style={{ marginTop: 10 }}>
            <Form.List name="kalemler">
              {(fields, { add, remove }) => (
                <>
                  <div style={{ marginBottom: 16, display: 'flex' }}>
                    <Button
                      type="primary"
                      onClick={() => add()}
                      icon={<PlusOutlined />}
                    >
                      Yeni Ay Ekle
                    </Button>
                  </div>

                  {fields.map(({ key, name, ...restField }) => (
                    <Card size="small" style={{ marginBottom: 8 }} key={key} styles={{ body: { padding: '10px 12px' } }}>
                      <Row gutter={[8, 8]} align="bottom">
                        <Col xs={12} sm={8} md={4}>
                          <Form.Item
                            {...restField}
                            name={[name, 'ay']}
                            label="Ay"
                            rules={[{ required: true }]}
                            style={{ marginBottom: 0 }}
                          >
                            <Select style={{ width: '100%' }} size="small">
                              {aylar.map((a, i) => <Select.Option key={i + 1} value={i + 1}>{a}</Select.Option>)}
                            </Select>
                          </Form.Item>
                        </Col>

                        <Col xs={12} sm={8} md={4}>
                          <Form.Item
                            {...restField}
                            name={[name, 'tur']}
                            label="Tür"
                            rules={[{ required: true }]}
                            style={{ marginBottom: 0 }}
                          >
                            <Select style={{ width: '100%' }} size="small">
                              <Select.Option value="normal">Normal</Select.Option>
                              <Select.Option value="ara_odeme">Ara Ödeme</Select.Option>
                            </Select>
                          </Form.Item>
                        </Col>

                        <Col xs={12} sm={8} md={5}>
                          <Form.Item
                            {...restField}
                            name={[name, 'katsayi_tutari']}
                            label="Katsayı (₺)"
                            rules={[{ required: true, message: 'Zorunlu' }]}
                            style={{ marginBottom: 0 }}
                          >
                            <InputNumber
                              placeholder="Tutar"
                              min={0}
                              step={0.01}
                              size="small"
                              style={{ width: '100%' }}
                              onChange={(val) => handleKatsayiChange(val as number | null, name)}
                              formatter={trMoneyFormatter}
                              parser={trNumberParser}
                              decimalSeparator=","
                              autoComplete="off"
                            />
                          </Form.Item>
                        </Col>

                        <Col xs={6} sm={4} md={3}>
                          <Form.Item
                            {...restField}
                            name={[name, 'son_odeme_gunu']}
                            label="Son Gün"
                            style={{ marginBottom: 0 }}
                          >
                            <InputNumber placeholder="Gün" min={1} max={31} size="small" style={{ width: '100%' }} autoComplete="off" />
                          </Form.Item>
                        </Col>

                        <Col xs={6} sm={4} md={3}>
                          <Form.Item
                            {...restField}
                            name={[name, 'gecikme_faiz_orani']}
                            label="Gecikme %"
                            style={{ marginBottom: 0 }}
                          >
                            <InputNumber
                              placeholder="%"
                              min={0}
                              max={100}
                              step={0.1}
                              size="small"
                              style={{ width: '100%' }}
                              onChange={(val) => handleGecikmeChange(val as number | null, name)}
                              formatter={trNumberFormatter}
                              parser={trNumberParser}
                              decimalSeparator=","
                              autoComplete="off"
                            />
                          </Form.Item>
                        </Col>

                        <Col xs={12} sm={24} md={5}>
                          <Space size={4} wrap>
                            <Button
                              type="dashed"
                              size="small"
                              onClick={() => add({ ay: form.getFieldValue(['kalemler', name, 'ay']), tur: 'ara_odeme', katsayi_tutari: 0, son_odeme_gunu: 15, gecikme_faiz_orani: 0 }, name + 1)}
                            >
                              + Ara Ödeme
                            </Button>
                            <Button type="text" danger size="small" onClick={() => remove(name)}>Sil</Button>
                          </Space>
                        </Col>
                      </Row>
                    </Card>
                  ))}
                </>
              )}
            </Form.List>
          </div>
        </Form>
      </Card>
    </div>
  )
}

