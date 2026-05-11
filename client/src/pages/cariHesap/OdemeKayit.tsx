import React, { useEffect, useMemo, useState } from 'react'
import { App, Card, Form, Select, InputNumber, DatePicker, Input, Button, Space, Row, Col, Divider, Typography, Badge, Checkbox, Radio, Alert } from 'antd'
import { SaveOutlined, ClearOutlined, BankOutlined, MoneyCollectOutlined, AuditOutlined, RollbackOutlined, UserAddOutlined } from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import api from '../../lib/api'
import { getErrorMessage } from '../../lib/apiError'
import { usePageSettings } from '../../contexts/LayoutContext'
import { useProject } from '../../contexts/ProjectContext'
import { trMoneyFormatter, trNumberParser, formatMoney } from '../../lib/format'
import { EmptyState } from '../../components/common/EmptyState'

const { Option } = Select
const { TextArea } = Input

export const OdemeKayit: React.FC = () => {
  const [form] = Form.useForm()
  const { activeProject } = useProject()
  const queryClient = useQueryClient()
  const { message } = App.useApp()
  const [filterCariTuru, setFilterCariTuru] = useState<'uye' | 'firma'>('uye')

  // Form değerlerini izle — useWatch reaktif, Ant Design Form internal'ı ile sync.
  const islemTuru = Form.useWatch('islem_turu', form)
  const odemeTuru = Form.useWatch('odeme_turu', form)

  usePageSettings('Cari Ödeme/Tahsilat Kaydı')

  // REV-PAY-05 (2026-05-12): uyelik_baslangic hibrit semantik kazandı (cari=tahakkuk,
  // banka/nakit=tahsilat). Banka alanları artık temizlenmez — kullanıcı seçer.
  useEffect(() => {
    if (islemTuru === 'iade_odeme' || islemTuru === 'uyelik_baslangic') {
      setFilterCariTuru('uye')
      // cari_hesap'i sıfırla (filter degisince cari listesi farklilasir)
      form.setFieldValue('cari_hesap_id', undefined)
    }
    if (islemTuru === 'iade_odeme') {
      // iade_odeme icin 'cari' YASAK. Mevcut secili 'cari' ise varsayilan 'banka'ya cevir.
      const current = form.getFieldValue('odeme_turu')
      if (!current || current === 'cari') {
        form.setFieldValue('odeme_turu', 'banka')
      }
    }
  }, [islemTuru, form])

  // Cari Hesaplar (Üyeler + Firmalar) Fetch
  const { data: accounts, isLoading: accountsLoading } = useQuery({
    queryKey: ['cari-accounts', activeProject?.id],
    queryFn: async () => {
      if (!activeProject?.id) return []
      const { data } = await api.get('/cari-hareketler/accounts', {
        params: { proje_id: activeProject.id }
      })
      return data.data as {
        id: string
        cari_adi: string
        cari_turu: 'uye' | 'firma'
        uyeler?: { uye_no?: string } | null
      }[]
    },
    enabled: !!activeProject?.id
  })

  // Filtrelenmiş hesaplar
  const filteredAccounts = useMemo(() => {
    if (!accounts) return []
    return accounts.filter(acc => acc.cari_turu === filterCariTuru)
  }, [accounts, filterCariTuru])

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
      // A1 (2026-05-12): üye/firma detay sayfalarındaki kart ve listelerin yansıması için
      // ilgili tüm query'leri invalidate et. Belirli bir üye ID bilinmediği için sweep yap;
      // tanstack/react-query queryKey prefix match ile aynı namespace altındaki tüm
      // entry'leri stale işaretler.
      queryClient.invalidateQueries({ queryKey: ['uye'] })
      queryClient.invalidateQueries({ queryKey: ['uye-aidatlar'] })
      queryClient.invalidateQueries({ queryKey: ['uye-odemeler'] })
      queryClient.invalidateQueries({ queryKey: ['aidatlar'] })
      queryClient.invalidateQueries({ queryKey: ['aidat-ozet'] })
      queryClient.invalidateQueries({ queryKey: ['cari-accounts'] })
      queryClient.invalidateQueries({ queryKey: ['cari-ekstre'] })
      queryClient.invalidateQueries({ queryKey: ['cari-hareketler'] })
      queryClient.invalidateQueries({ queryKey: ['banka-hareketleri'] })
      queryClient.invalidateQueries({ queryKey: ['banka-hesaplari'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-ozet'] })
      form.resetFields()
      setFilterCariTuru('uye')
    },
    onError: (err) => {
      message.error(getErrorMessage(err, 'İşlem kaydedilirken bir hata oluştu'))
    }
  })

  const onFinish = (values: any) => {
    if (!activeProject) {
      message.warning('Lütfen önce bir proje seçin')
      return
    }
    saveMutation.mutate(values)
  }

  if (!activeProject) {
    return <EmptyState description="Lütfen önce yukarıdan bir proje seçin" />
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 16px' }}>
      <Card
        variant="borderless"
        className="shadow-md rounded-xl"
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
        >
          {/* REV-PAY-13 (2026-05-12): Cari Türü filter Form.Item label'ından çıkarıldı
              — label içindeki span wrapper'ın preventDefault'u Radio click'lerini
              de bloke ediyor, toggle çalışmıyordu. Filter şimdi tüm Row'un üstünde
              kendi satırında; aşağıdaki iki Form.Item (Cari Hesap, İşlem Türü)
              aynı hizada başlar. */}
          <div style={{ marginBottom: 8 }}>
            <Typography.Text type="secondary" style={{ fontSize: 12, marginRight: 8 }}>
              Cari Türü Filtre:
            </Typography.Text>
            <Radio.Group
              value={filterCariTuru}
              onChange={(e) => {
                setFilterCariTuru(e.target.value)
                form.setFieldValue('cari_hesap_id', undefined)
              }}
              buttonStyle="solid"
              size="small"
              disabled={islemTuru === 'iade_odeme' || islemTuru === 'uyelik_baslangic'}
            >
              <Radio.Button value="uye">Üyeler</Radio.Button>
              <Radio.Button value="firma">Firmalar</Radio.Button>
            </Radio.Group>
          </div>

          <Row gutter={24}>
            <Col xs={24} md={12}>
              <Form.Item
                name="cari_hesap_id"
                label="Cari Hesap"
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
                  // REV-PAY-04 (2026-05-12): Üye için "U-No - Ad Soyad", Firma için
                  // sadece unvan (cari_adi). Badge görsel ayrımı korur, label string
                  // search/filter için unique kalır.
                  options={filteredAccounts?.map(acc => {
                    const uyeNo = acc.uyeler?.uye_no
                    const display = acc.cari_turu === 'uye' && uyeNo
                      ? `${uyeNo} - ${acc.cari_adi}`
                      : acc.cari_adi
                    return {
                      value: acc.id,
                      label: display,
                      cariTuru: acc.cari_turu,
                      display,
                    }
                  })}
                  optionRender={({ data }) => (
                    <Space>
                      <Badge
                        status={data.cariTuru === 'uye' ? 'processing' : 'warning'}
                        text={data.cariTuru === 'uye' ? 'Üye' : 'Firma'}
                      />
                      <span>{data.display}</span>
                    </Space>
                  )}
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
                    <Space><MoneyCollectOutlined className="text-red-500" /> Giden Ödeme (Ödeme Yapıldı)</Space>
                  </Option>
                  <Option value="gelen_odeme">
                    <Space><MoneyCollectOutlined className="text-green-500" /> Gelen Ödeme (Tahsilat Yapıldı)</Space>
                  </Option>
                  <Option value="iade_odeme">
                    <Space><RollbackOutlined className="text-blue-500" /> Üyelik Bedeli İadesi</Space>
                  </Option>
                  <Option value="uyelik_baslangic">
                    <Space><UserAddOutlined className="text-orange-500" /> Üyelik Başlangıç Bedeli</Space>
                  </Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          {/* REV-PAY-07 (2026-05-12): uyelik_baslangic için Ödeme Aracı görünür olur.
              odeme_turu='cari' tahakkuk, banka/nakit/kredi_karti tahsilat semantiği. */}
          <Row gutter={24}>
            <Col xs={24} md={12}>
              <Form.Item
                name="odeme_turu"
                label="Ödeme Aracı"
                rules={[{ required: true }]}
              >
                <Select className="w-full">
                  <Option value="nakit">Nakit</Option>
                  <Option value="banka">Banka (EFT/Havale)</Option>
                  <Option value="kredi_karti">Kredi Kartı</Option>
                  <Option value="cek">Çek</Option>
                  {islemTuru === 'uyelik_baslangic' && (
                    <Option value="cari">Cari (Tahakkuk — para hareketi yok)</Option>
                  )}
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

          {/* REV-PAY-08: Üyelik başlangıç bedeli için kullanıcıya semantik uyarı. */}
          {islemTuru === 'uyelik_baslangic' && odemeTuru === 'cari' && (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              message="Tahakkuk kaydı"
              description="Bu işlem üyenin cari hesabına alacak kaydı (tahakkuk) açar; herhangi bir para hareketi yaratmaz."
            />
          )}
          {islemTuru === 'uyelik_baslangic' && odemeTuru && odemeTuru !== 'cari' && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
              message="Tahsilat kaydı"
              description="Bu işlem gerçek bir para tahsilatı olarak kaydedilir. Üye için önceden başlangıç bedeli tahakkuku yapılmış olmalıdır (Üye Detay sayfasından)."
            />
          )}

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

          {/* Dinamik Alanlar: Banka (REV-PAY-09: uyelik_baslangic + banka da geçerli) */}
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
                  name="banka"
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
                      setFilterCariTuru('uye')
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
