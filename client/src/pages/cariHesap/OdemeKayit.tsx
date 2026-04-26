import React, { useState } from 'react'
import { Card, Form, Select, InputNumber, DatePicker, Input, Button, Space, message, Row, Col, Divider, Typography, Alert, Badge, Checkbox } from 'antd'
import { SaveOutlined, ClearOutlined, BankOutlined, MoneyCollectOutlined, AuditOutlined } from '@ant-design/icons'
import { useQuery, useMutation } from '@tanstack/react-query'
import dayjs from 'dayjs'
import api from '../../lib/api'
import { usePageSettings } from '../../contexts/LayoutContext'
import { useProject } from '../../contexts/ProjectContext'
import { trMoneyFormatter, trNumberParser, formatMoney } from '../../lib/format'

const { Option } = Select
const { TextArea } = Input

export const OdemeKayit: React.FC = () => {
  const [form] = Form.useForm()
  const { activeProject } = useProject()
  const [odemeTuru, setOdemeTuru] = useState<string | null>('banka')
  
  // Form değerlerini izle
  const islemTuru = Form.useWatch('islem_turu', form)

  usePageSettings('Cari Ödeme/Tahsilat Kaydı')

  // Cari Hesaplar (Üyeler + Firmalar) Fetch
  const { data: accounts, isLoading: accountsLoading } = useQuery({
    queryKey: ['cari-accounts', activeProject?.id],
    queryFn: async () => {
      if (!activeProject?.id) return []
      // Proje ID interceptor tarafından otomatik ekleniyor
      const { data } = await api.get('/cari-hareketler/accounts')
      return data.data as { id: string; cari_adi: string; cari_turu: 'uye' | 'firma' }[]
    },
    enabled: !!activeProject?.id
  })

  // Banka Hesapları Fetch
  const { data: bankaHesaplari, isLoading: bankalarLoading } = useQuery({
    queryKey: ['banka-hesaplari'],
    queryFn: async () => {
      const { data } = await api.get('/banka/hesaplar')
      return data.data as { id: string; banka_adi: string; hesap_no?: string; bakiye?: number }[]
    },
  })

  // Ödeme Kaydı Mutation
  const saveMutation = useMutation({
    mutationFn: async (values: any) => {
      const payload = {
        ...values,
        proje_id: activeProject?.id,
        tarih: values.tarih.format('YYYY-MM-DD'),
        vade_tarihi: values.vade_tarihi ? values.vade_tarihi.format('YYYY-MM-DD') : undefined,
        kaynak_tipi: values.is_teminat ? 'teminat' : undefined
      }
      return await api.post('/cari-hareketler/payment', payload)
    },
    onSuccess: () => {
      message.success('Cari işlem başarıyla kaydedildi')
      form.resetFields()
      setOdemeTuru('banka')
    },
    onError: (err: any) => {
      message.error(err.response?.data?.error || err.message || 'İşlem kaydedilirken bir hata oluştu')
    }
  })

  const onFinish = (values: any) => {
    if (!activeProject) {
      message.warning('Lütfen önce bir proje seçin')
      return
    }
    saveMutation.mutate(values)
  }

  const handleOdemeTuruChange = (value: string) => {
    setOdemeTuru(value)
  }

  if (!activeProject) {
    return (
      <div style={{ padding: '24px' }}>
        <Alert
          message="Proje Seçimi Gerekli"
          description="Cari işlem kaydı yapabilmek için lütfen üst menüden bir proje seçiniz."
          type="warning"
          showIcon
        />
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 16px' }}>
      <Card 
        variant="borderless"
        className="shadow-md rounded-xl"
        title={<Typography.Title level={4} className="m-0">Cari Ödeme/Tahsilat Kaydı</Typography.Title>}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={onFinish}
          initialValues={{
            tarih: dayjs(),
            islem_turu: 'giden_odeme',
            odeme_turu: 'banka',
            is_teminat: false
          }}
          onValuesChange={(changedValues) => {
            if (changedValues.odeme_turu) {
              setOdemeTuru(changedValues.odeme_turu)
            }
          }}
        >
          <Row gutter={24}>
            <Col xs={24} md={12}>
              <Form.Item
                name="cari_hesap_id"
                label="Cari Hesap (Üye / Firma)"
                rules={[{ required: true, message: 'Lütfen bir cari hesap seçin' }]}
              >
                <Select
                  showSearch
                  placeholder="İsim veya unvan ile arayın..."
                  loading={accountsLoading}
                  optionFilterProp="label"
                  allowClear
                  className="w-full"
                  suffixIcon={<AuditOutlined />}
                  options={accounts?.map(acc => ({
                    value: acc.id,
                    label: `${acc.cari_adi} (${acc.cari_turu === 'uye' ? 'Üye' : 'Firma'})`,
                    render: (
                      <Space>
                        <Badge status={acc.cari_turu === 'uye' ? 'processing' : 'warning'} text={acc.cari_turu === 'uye' ? 'Üye' : 'Firma'} />
                        <span>{acc.cari_adi}</span>
                      </Space>
                    )
                  }))}
                  optionRender={(option) => option.data.render}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                name="islem_turu"
                label="İşlem Türü"
                rules={[{ required: true }]}
              >
                <Select className="w-full">
                  <Option value="giden_odeme">
                    <Space orientation="horizontal"><MoneyCollectOutlined className="text-red-500" /> Giden Ödeme (Ödeme Yapıldı)</Space>
                  </Option>
                  <Option value="gelen_odeme">
                    <Space orientation="horizontal"><MoneyCollectOutlined className="text-green-500" /> Gelen Ödeme (Tahsilat Yapıldı)</Space>
                  </Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={24}>
            <Col xs={24} md={12}>
              <Form.Item
                name="odeme_turu"
                label="Ödeme Aracı"
                rules={[{ required: true }]}
              >
                <Select onChange={handleOdemeTuruChange} className="w-full">
                  <Option value="nakit">Nakit</Option>
                  <Option value="banka">Banka (EFT/Havale)</Option>
                  <Option value="kredi_karti">Kredi Kartı</Option>
                  <Option value="cek">Çek</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                name="tarih"
                label="İşlem Tarihi"
                rules={[{ required: true }]}
              >
                <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
              </Form.Item>
            </Col>
          </Row>

          <Divider dashed />

          {/* Teminat Seçeneği (Sadece Giden Ödeme için) */}
          {islemTuru === 'giden_odeme' && (
            <Row gutter={24} style={{ marginBottom: 16 }}>
              <Col span={24}>
                <Form.Item name="is_teminat" valuePropName="checked" noStyle>
                  <Checkbox>
                    <Typography.Text strong>Teminat Ödemesi</Typography.Text>
                  </Checkbox>
                </Form.Item>
              </Col>
            </Row>
          )}

          {/* Dinamik Alanlar: Banka */}
          {odemeTuru === 'banka' && (
            <Row gutter={24}>
              <Col span={24}>
                <Form.Item
                  name="banka_hesap_id"
                  label="Şirket Banka Hesabı"
                  rules={[{ required: true, message: 'Lütfen işlem yapılan banka hesabını seçin' }]}
                >
                  <Select
                    placeholder="İşlemin yapıldığı banka hesabını seçin"
                    loading={bankalarLoading}
                    className="w-full"
                    suffixIcon={<BankOutlined />}
                  >
                    {bankaHesaplari?.map(b => (
                      <Option key={b.id} value={b.id}>
                        {b.banka_adi} {b.hesap_no ? `(${b.hesap_no})` : ''} - {formatMoney(b.bakiye)} TL
                      </Option>
                    ))}
                  </Select>
                </Form.Item>
              </Col>
            </Row>
          )}

          {/* Dinamik Alanlar: Çek */}
          {odemeTuru === 'cek' && (
            <Row gutter={24}>
              <Col xs={24} md={12}>
                <Form.Item
                  name="vade_tarihi"
                  label="Çek Vade Tarihi"
                  rules={[{ required: true, message: 'Vade tarihi zorunludur' }]}
                >
                  <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" className="w-full" />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item
                  name="banka_adi"
                  label="Çekin Bankası"
                  rules={[{ required: true, message: 'Banka adı zorunludur' }]}
                >
                  <Input placeholder="Örn: Garanti BBVA" suffix={<BankOutlined />} />
                </Form.Item>
              </Col>
            </Row>
          )}

          <Row gutter={24}>
            <Col xs={24} md={24}>
              <Form.Item
                name="tutar"
                label="İşlem Tutarı (TL)"
                rules={[{ required: true, message: 'Lütfen tutar girin' }]}
              >
                <InputNumber
                  className="w-full"
                  size="large"
                  style={{ width: '100%', fontSize: '24px', height: 'auto' }}
                  formatter={trMoneyFormatter}
                  parser={trNumberParser}
                  decimalSeparator=","
                  min={0.01}
                  placeholder="0,00"
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="aciklama"
            label="Açıklama / Not"
          >
            <TextArea rows={3} placeholder="İşlem ile ilgili detaylı notlar..." />
          </Form.Item>

          <Divider />

          <Form.Item className="mb-0">
            <Row justify="end">
              <Col>
                <Space size="middle">
                  <Button 
                    size="large"
                    icon={<ClearOutlined />} 
                    onClick={() => {
                      form.resetFields()
                      setOdemeTuru('banka')
                    }}
                  >
                    Temizle
                  </Button>
                  <Button 
                    type="primary" 
                    size="large"
                    icon={<SaveOutlined />} 
                    loading={saveMutation.isPending}
                    htmlType="submit"
                    className="bg-blue-600"
                  >
                    İşlemi Kaydet
                  </Button>
                </Space>
              </Col>
            </Row>
          </Form.Item>
        </Form>
      </Card>
    </div>
  )
}
