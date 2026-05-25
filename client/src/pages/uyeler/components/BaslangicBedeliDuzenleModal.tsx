import React, { useEffect } from 'react'
import { Modal, Form, InputNumber, DatePicker, Input, Alert, App } from 'antd'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import api from '../../../lib/api'
import { getErrorMessage } from '../../../lib/apiError'
import { trMoneyFormatter, trNumberParser } from '../../../lib/format'

const { TextArea } = Input

interface Props {
  open: boolean
  onCancel: () => void
  tahakkukId: string
  uyeId: string
  initialValues?: {
    tutar?: number
    tarih?: string
    aciklama?: string | null
  }
  uyeAd?: string
}

/**
 * Sprint uyelik-baslangic-iptal-duzenle (2026-05-25):
 * Üyelik başlangıç bedeli tahakkukunu düzenle modalı. PATCH
 * /cari-hareketler/baslangic-bedeli/:tahakkukId endpoint'ine gider.
 *
 * Backend tahsilat bağı varsa 409 conflict + Türkçe mesaj döndürür; caller
 * mesajı `getErrorMessage` ile alıp messageApi.error ile gösterir.
 *
 * Sadece tutar/tarih/aciklama değiştirilebilir; uye_id/islem_turu/cari_hesap_id
 * sabit (transfer yok).
 */
export const BaslangicBedeliDuzenleModal: React.FC<Props> = ({
  open,
  onCancel,
  tahakkukId,
  uyeId,
  initialValues,
  uyeAd,
}) => {
  const [form] = Form.useForm()
  const queryClient = useQueryClient()
  const { message: messageApi } = App.useApp()

  useEffect(() => {
    if (open) {
      form.setFieldsValue({
        tutar: initialValues?.tutar ?? undefined,
        tarih: initialValues?.tarih ? dayjs(initialValues.tarih) : dayjs(),
        aciklama: initialValues?.aciklama ?? '',
      })
    }
  }, [open, form, initialValues])

  // Tahakkuk değişikliği aylık/yıllık rapor + dashboard'a yansır (20260525160000
  // sonrası `toplam_tahakkuk` formülünde `uyelik_baslangic` alacak var).
  const invalidateAllPaymentCaches = () => {
    queryClient.invalidateQueries({ queryKey: ['uye', uyeId] })
    queryClient.invalidateQueries({ queryKey: ['uye-aidatlar', uyeId] })
    queryClient.invalidateQueries({ queryKey: ['uye-odemeler', uyeId] })
    queryClient.invalidateQueries({ queryKey: ['aidatlar'] })
    queryClient.invalidateQueries({ queryKey: ['aidat-ozet'] })
    queryClient.invalidateQueries({ queryKey: ['cari-ekstre'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard-ozet'] })
    queryClient.invalidateQueries({ queryKey: ['aylik-rapor'] })
    queryClient.invalidateQueries({ queryKey: ['yillik-rapor'] })
  }

  const mutation = useMutation({
    mutationFn: async (values: { tutar: number; tarih: any; aciklama?: string }) => {
      const payload = {
        tutar: values.tutar,
        tarih: values.tarih.format('YYYY-MM-DD'),
        aciklama: values.aciklama || null,
      }
      const { data } = await api.patch(
        `/cari-hareketler/baslangic-bedeli/${tahakkukId}`,
        payload,
      )
      return data
    },
    onSuccess: () => {
      messageApi.success('Başlangıç bedeli tahakkuku güncellendi')
      invalidateAllPaymentCaches()
      onCancel()
    },
    onError: (err) => messageApi.error(getErrorMessage(err)),
  })

  return (
    <Modal
      title={`Başlangıç Bedeli Tahakkukunu Düzenle${uyeAd ? ` — ${uyeAd}` : ''}`}
      open={open}
      onCancel={onCancel}
      onOk={() => form.submit()}
      okText="Güncelle"
      cancelText="Vazgeç"
      confirmLoading={mutation.isPending}
      destroyOnHidden
      width="min(520px, 95vw)"
    >
      <Alert
        type="info"
        showIcon
        message="Düzenleme kuralı"
        description="Tahakkuka bağlı bir tahsilat varsa düzenleme reddedilir (409). Önce 'Kapama Geri Al' işlemini çalıştırın, sonra tutar/tarih/açıklama güncelleyin."
        style={{ marginBottom: 16 }}
      />

      <Form
        form={form}
        layout="vertical"
        onFinish={(values) => mutation.mutate(values as any)}
      >
        <Form.Item
          name="tutar"
          label="Tahakkuk Tutarı (TL)"
          rules={[{ required: true, message: 'Tutar zorunludur' }]}
        >
          <InputNumber
            className="w-full"
            size="large"
            style={{ width: '100%' }}
            formatter={trMoneyFormatter}
            parser={trNumberParser}
            decimalSeparator=","
            min={0.01}
            placeholder="0,00"
          />
        </Form.Item>

        <Form.Item
          name="tarih"
          label="Tahakkuk Tarihi"
          rules={[{ required: true, message: 'Tarih zorunludur' }]}
        >
          <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
        </Form.Item>

        <Form.Item name="aciklama" label="Açıklama (opsiyonel)">
          <TextArea rows={2} placeholder="Üyelik başlangıç bedeli tahakkuku" />
        </Form.Item>
      </Form>
    </Modal>
  )
}
