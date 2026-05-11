import React, { useEffect } from 'react'
import { Modal, Form, InputNumber, DatePicker, Input, Alert, App } from 'antd'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import api from '../../../lib/api'
import { getErrorMessage } from '../../../lib/apiError'
import { trMoneyFormatter, trNumberParser } from '../../../lib/format'

const { TextArea } = Input

interface Props {
  open: boolean
  onCancel: () => void
  uyeId: string
  projeId: string
  uyeAd?: string
}

/**
 * REV-MEM-02 (2026-05-12): Üye Detay sayfasında "Başlangıç Bedeli Tahakkuk Et" modalı.
 * Üyenin cari hesabına `islem_turu='uyelik_baslangic' + odeme_turu='cari'` ile saf tahakkuk
 * (alacak kaydı) açar — para hareketi yaratmaz. Tahsilat girişi OdemeKayit sayfasından
 * (banka/nakit ödeme aracı ile) yapılır.
 */
export const BaslangicBedeliTahakkukModal: React.FC<Props> = ({
  open,
  onCancel,
  uyeId,
  projeId,
  uyeAd,
}) => {
  const [form] = Form.useForm()
  const queryClient = useQueryClient()
  const { message: messageApi } = App.useApp()

  // Üye'nin cari hesap id'sini bul. listAccounts proje_id + cari_turu filter veriyor;
  // sonra uye_id eşleşmesi ile spesifik hesap bulunur.
  const { data: cariHesapId, isLoading: cariLoading, isError: cariError } = useQuery({
    queryKey: ['uye-cari-hesap-id', uyeId, projeId],
    queryFn: async () => {
      const { data } = await api.get('/cari-hareketler/accounts', {
        params: { proje_id: projeId, cari_turu: 'uye' },
      })
      const accounts = data.data as Array<{ id: string; uye_id?: string | null }>
      const match = accounts.find(a => a.uye_id === uyeId)
      return match?.id ?? null
    },
    enabled: open && !!uyeId && !!projeId,
  })

  useEffect(() => {
    if (open) {
      form.resetFields()
      form.setFieldsValue({ tarih: dayjs() })
    }
  }, [open, form])

  const mutation = useMutation({
    mutationFn: async (values: { tutar: number; tarih: any; aciklama?: string }) => {
      if (!cariHesapId) {
        throw new Error('Bu üye için cari hesap bulunamadı. Önce üye atanmış bir daire/serefiye girişi olmalı.')
      }
      const payload = {
        proje_id: projeId,
        cari_hesap_id: cariHesapId,
        islem_turu: 'uyelik_baslangic' as const,
        odeme_turu: 'cari' as const,
        tutar: values.tutar,
        tarih: values.tarih.format('YYYY-MM-DD'),
        aciklama: values.aciklama || 'Üyelik başlangıç bedeli tahakkuku',
      }
      const { data } = await api.post('/cari-hareketler/payment', payload)
      return data
    },
    onSuccess: () => {
      messageApi.success('Başlangıç bedeli tahakkuku kaydedildi')
      queryClient.invalidateQueries({ queryKey: ['uye', uyeId] })
      queryClient.invalidateQueries({ queryKey: ['uye-aidatlar', uyeId] })
      queryClient.invalidateQueries({ queryKey: ['uye-odemeler', uyeId] })
      onCancel()
    },
    onError: (err) => messageApi.error(getErrorMessage(err)),
  })

  return (
    <Modal
      title={`Üyelik Başlangıç Bedeli Tahakkuku${uyeAd ? ` — ${uyeAd}` : ''}`}
      open={open}
      onCancel={onCancel}
      onOk={() => form.submit()}
      okText="Tahakkuk Et"
      cancelText="İptal"
      confirmLoading={mutation.isPending}
      okButtonProps={{ disabled: !cariHesapId || cariLoading }}
      destroyOnHidden
      width="min(520px, 95vw)"
    >
      <Alert
        type="info"
        showIcon
        message="Tahakkuk işlemi"
        description="Bu işlem üyenin cari hesabına alacak kaydı (borç tahakkuku) açar; para hareketi yaratmaz. Tahsilat için 'Ödeme/Tahsilat Kaydı' sayfasından banka/nakit ödeme girilir."
        style={{ marginBottom: 16 }}
      />

      {cariError && (
        <Alert
          type="error"
          showIcon
          message="Cari hesap bulunamadı"
          description="Bu üye için cari hesap kaydı yüklenemedi."
          style={{ marginBottom: 16 }}
        />
      )}

      <Form form={form} layout="vertical" onFinish={(values) => mutation.mutate(values as any)}>
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
