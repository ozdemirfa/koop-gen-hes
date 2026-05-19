import React, { useEffect, useMemo } from 'react'
import { Modal, Form, Select, InputNumber, DatePicker, Input, App } from 'antd'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import api from '../../lib/api'
import { getErrorMessage } from '../../lib/apiError'
import { useProject } from '../../contexts/ProjectContext'
import { trMoneyFormatter, trNumberParser } from '../../lib/format'

const { TextArea } = Input

// Sprint 20260520-virman-feature:
// Virman create formu. Tipi seçince kaynak/hedef alanlarının NULL kuralı uygulanır
// (banka_banka → her ikisi; banka_nakit → kaynak banka, hedef nakit; nakit_banka → tersi).
// Submit `POST /api/virmanlar` — backend `fn_create_virman_atomic` RPC ile virman +
// 2 banka_hareketleri kaydı tek transaction'da oluşturur.

type VirmanTipi = 'banka_banka' | 'banka_nakit' | 'nakit_banka'

interface VirmanFormModalProps {
  open: boolean
  onClose: () => void
}

interface BankaHesabi {
  id: string
  banka_adi: string
  bakiye?: number
}

export const VirmanFormModal: React.FC<VirmanFormModalProps> = ({ open, onClose }) => {
  const [form] = Form.useForm()
  const { activeProject } = useProject()
  const queryClient = useQueryClient()
  const { message } = App.useApp()

  const virmanTipi = Form.useWatch('virman_tipi', form) as VirmanTipi | undefined

  const { data: bankaHesaplari, isLoading: bankalarLoading } = useQuery({
    queryKey: ['banka-hesaplari', activeProject?.id],
    queryFn: async () => {
      const { data } = await api.get('/banka/hesaplar', {
        params: { proje_id: activeProject?.id },
      })
      return data.data as BankaHesabi[]
    },
    enabled: !!activeProject?.id && open,
  })

  useEffect(() => {
    if (!open) return
    form.setFieldsValue({
      virman_tipi: 'banka_banka',
      tarih: dayjs(),
    })
  }, [open, form])

  // Tip değişince diğer-uçtaki alanı NULL'la (UI tutarlılığı)
  useEffect(() => {
    if (!virmanTipi) return
    if (virmanTipi === 'banka_nakit') {
      form.setFieldValue('hedef_hesap_id', undefined)
    } else if (virmanTipi === 'nakit_banka') {
      form.setFieldValue('kaynak_hesap_id', undefined)
    }
  }, [virmanTipi, form])

  const createMutation = useMutation({
    mutationFn: async (values: any) => {
      const payload = {
        proje_id: activeProject?.id,
        virman_tipi: values.virman_tipi as VirmanTipi,
        kaynak_hesap_id: values.virman_tipi === 'nakit_banka' ? null : values.kaynak_hesap_id,
        hedef_hesap_id: values.virman_tipi === 'banka_nakit' ? null : values.hedef_hesap_id,
        tutar: Number(values.tutar),
        tarih: dayjs(values.tarih).format('YYYY-MM-DD'),
        aciklama: values.aciklama || null,
      }
      const { data } = await api.post('/virmanlar', payload)
      return data
    },
    onSuccess: () => {
      message.success('Virman başarıyla oluşturuldu')
      queryClient.invalidateQueries({ queryKey: ['virmanlar'] })
      queryClient.invalidateQueries({ queryKey: ['banka-hesaplari'] })
      queryClient.invalidateQueries({ queryKey: ['banka-hareketleri'] })
      form.resetFields()
      onClose()
    },
    onError: (err) => message.error(getErrorMessage(err, 'Virman oluşturulamadı')),
  })

  const handleOk = async () => {
    const values = await form.validateFields()
    if (!activeProject?.id) {
      message.error('Önce bir proje seçin')
      return
    }
    if (values.virman_tipi === 'banka_banka' && values.kaynak_hesap_id === values.hedef_hesap_id) {
      message.error('Kaynak ve hedef hesap aynı olamaz')
      return
    }
    createMutation.mutate(values)
  }

  const bankaOptions = useMemo(
    () =>
      (bankaHesaplari ?? []).map((h) => ({
        value: h.id,
        label: h.banka_adi + (typeof h.bakiye === 'number' ? ` — ${trMoneyFormatter(h.bakiye)}` : ''),
      })),
    [bankaHesaplari],
  )

  const showKaynak = virmanTipi !== 'nakit_banka'
  const showHedef = virmanTipi !== 'banka_nakit'

  return (
    <Modal
      title="Yeni Virman"
      open={open}
      onCancel={() => {
        form.resetFields()
        onClose()
      }}
      onOk={handleOk}
      okText="Kaydet"
      cancelText="Vazgeç"
      confirmLoading={createMutation.isPending}
      destroyOnClose
    >
      <Form form={form} layout="vertical" autoComplete="off" preserve={false}>
        <Form.Item
          label="Virman Tipi"
          name="virman_tipi"
          rules={[{ required: true, message: 'Tip seçimi zorunludur' }]}
        >
          <Select
            options={[
              { value: 'banka_banka', label: 'Banka → Banka' },
              { value: 'banka_nakit', label: 'Banka → Nakit Kasa' },
              { value: 'nakit_banka', label: 'Nakit Kasa → Banka' },
            ]}
          />
        </Form.Item>

        {showKaynak && (
          <Form.Item
            label="Kaynak Banka Hesabı"
            name="kaynak_hesap_id"
            rules={[{ required: true, message: 'Kaynak hesap zorunludur' }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="Banka hesabı seçin"
              options={bankaOptions}
              loading={bankalarLoading}
            />
          </Form.Item>
        )}

        {showHedef && (
          <Form.Item
            label="Hedef Banka Hesabı"
            name="hedef_hesap_id"
            rules={[{ required: true, message: 'Hedef hesap zorunludur' }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="Banka hesabı seçin"
              options={bankaOptions}
              loading={bankalarLoading}
            />
          </Form.Item>
        )}

        <Form.Item
          label="Tutar"
          name="tutar"
          rules={[
            { required: true, message: 'Tutar zorunludur' },
            {
              validator: (_, v) =>
                v && Number(v) > 0 ? Promise.resolve() : Promise.reject(new Error('Tutar pozitif olmalı')),
            },
          ]}
        >
          <InputNumber
            style={{ width: '100%' }}
            min={0.01}
            step={100}
            formatter={trMoneyFormatter as any}
            parser={trNumberParser as any}
            placeholder="0,00 ₺"
          />
        </Form.Item>

        <Form.Item
          label="Tarih"
          name="tarih"
          rules={[{ required: true, message: 'Tarih zorunludur' }]}
        >
          <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
        </Form.Item>

        <Form.Item label="Açıklama" name="aciklama">
          <TextArea rows={2} maxLength={500} autoComplete="off" placeholder="(opsiyonel)" />
        </Form.Item>
      </Form>
    </Modal>
  )
}
