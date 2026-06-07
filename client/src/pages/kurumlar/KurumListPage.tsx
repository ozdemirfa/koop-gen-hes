import React, { useState } from 'react'
import {
  App,
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Tag,
  type TableColumnsType,
} from 'antd'
import { PlusOutlined, EditOutlined, DollarOutlined, BankOutlined } from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import api from '../../lib/api'
import { getErrorMessage } from '../../lib/apiError'
import { useProject } from '../../contexts/ProjectContext'
import { usePermissions } from '../../hooks/usePermissions'
import { PageHeader } from '../../components/common/PageHeader'
import { DataTable } from '../../components/common/DataTable'
import { ConfirmDelete } from '../../components/common/ConfirmDelete'
import { EmptyState } from '../../components/common/EmptyState'
import { trMoneyFormatter, trNumberParser, formatMoney } from '../../lib/format'
import { MoneyDisplay } from '../../components/common/MoneyDisplay'

interface Kurum {
  id: string
  kurum_adi: string
  kurum_turu?: string | null
  vergi_no?: string | null
  telefon?: string | null
  aciklama?: string | null
  aktif: boolean
  toplam_odeme?: number
}

export const KurumListPage: React.FC = () => {
  const { activeProject } = useProject()
  const { canEdit, canDelete } = usePermissions()
  const { message } = App.useApp()
  const queryClient = useQueryClient()

  const [kurumModalOpen, setKurumModalOpen] = useState(false)
  const [editingKurum, setEditingKurum] = useState<Kurum | null>(null)
  const [odemeModalOpen, setOdemeModalOpen] = useState(false)
  const [odemeKurum, setOdemeKurum] = useState<Kurum | null>(null)
  const [kurumForm] = Form.useForm()
  const [odemeForm] = Form.useForm()
  const odemeTuru = Form.useWatch('odeme_turu', odemeForm)

  const { data: kurumlar, isLoading } = useQuery({
    queryKey: ['kurumlar', activeProject?.id],
    queryFn: async () => {
      const { data } = await api.get('/kurumlar', { params: { proje_id: activeProject?.id } })
      return (data.data ?? []) as Kurum[]
    },
    enabled: !!activeProject?.id,
  })

  const { data: bankaHesaplari, isLoading: bankalarLoading } = useQuery({
    queryKey: ['banka-hesaplari'],
    queryFn: async () => {
      const { data } = await api.get('/banka/hesaplar')
      return data.data as { id: string; banka_adi: string; hesap_no?: string; bakiye?: number }[]
    },
  })
  const noBankAccounts = !bankalarLoading && (bankaHesaplari?.length ?? 0) === 0

  const saveKurumMutation = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const payload = { ...values, proje_id: activeProject?.id }
      if (editingKurum) {
        const { data } = await api.put(`/kurumlar/${editingKurum.id}`, payload)
        return data
      }
      const { data } = await api.post('/kurumlar', payload)
      return data
    },
    onSuccess: () => {
      message.success(editingKurum ? 'Kurum güncellendi' : 'Kurum eklendi')
      queryClient.invalidateQueries({ queryKey: ['kurumlar'] })
      closeKurumModal()
    },
    onError: (err) => message.error(getErrorMessage(err)),
  })

  const deleteKurumMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/kurumlar/${id}`, { params: { proje_id: activeProject?.id } })
    },
    onSuccess: () => {
      message.success('Kurum silindi')
      queryClient.invalidateQueries({ queryKey: ['kurumlar'] })
    },
    onError: (err) => message.error(getErrorMessage(err)),
  })

  const odemeMutation = useMutation({
    mutationFn: async (values: any) => {
      const payload = {
        proje_id: activeProject?.id,
        kurum_id: odemeKurum?.id,
        tutar: values.tutar,
        odeme_turu: values.odeme_turu,
        banka_hesap_id: values.odeme_turu === 'banka' ? values.banka_hesap_id : null,
        tarih: values.tarih.format('YYYY-MM-DD'),
        aciklama: values.aciklama ?? null,
      }
      const { data } = await api.post('/kurumlar/odeme', payload)
      return data
    },
    onSuccess: () => {
      message.success('Kurum ödemesi kaydedildi')
      // Net-sıfır cari + gider + pano + banka yansıması için ilgili query'leri tazele.
      queryClient.invalidateQueries({ queryKey: ['kurumlar'] })
      queryClient.invalidateQueries({ queryKey: ['cari-hareketler'] })
      queryClient.invalidateQueries({ queryKey: ['banka-hareketleri'] })
      queryClient.invalidateQueries({ queryKey: ['banka-hesaplari'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-ozet'] })
      queryClient.invalidateQueries({ queryKey: ['mizan'] })
      queryClient.invalidateQueries({ queryKey: ['yonetim-ekibi'] })
      closeOdemeModal()
    },
    onError: (err) => message.error(getErrorMessage(err)),
  })

  const openAddKurum = () => {
    setEditingKurum(null)
    kurumForm.resetFields()
    setKurumModalOpen(true)
  }
  const openEditKurum = (k: Kurum) => {
    setEditingKurum(k)
    kurumForm.setFieldsValue(k)
    setKurumModalOpen(true)
  }
  const closeKurumModal = () => {
    setKurumModalOpen(false)
    setEditingKurum(null)
    kurumForm.resetFields()
  }
  const openOdeme = (k: Kurum) => {
    setOdemeKurum(k)
    odemeForm.resetFields()
    odemeForm.setFieldsValue({ tarih: dayjs(), odeme_turu: 'banka' })
    setOdemeModalOpen(true)
  }
  const closeOdemeModal = () => {
    setOdemeModalOpen(false)
    setOdemeKurum(null)
    odemeForm.resetFields()
  }

  const columns: TableColumnsType<Kurum> = [
    { title: 'Kurum Adı', dataIndex: 'kurum_adi', key: 'kurum_adi' },
    {
      title: 'Tür',
      dataIndex: 'kurum_turu',
      key: 'kurum_turu',
      render: (v: string) => (v ? <Tag>{v}</Tag> : '-'),
      responsive: ['sm'],
    },
    {
      title: 'Toplam Ödeme',
      dataIndex: 'toplam_odeme',
      key: 'toplam_odeme',
      align: 'right',
      width: 140,
      render: (v: number) => <MoneyDisplay amount={Number(v || 0)} />,
    },
    { title: 'Telefon', dataIndex: 'telefon', key: 'telefon', responsive: ['lg'], render: (v: string) => v || '-' },
    {
      title: 'İşlem',
      key: 'action',
      width: 220,
      render: (_: unknown, record: Kurum) => (
        <Space>
          <Button
            type="primary"
            size="small"
            icon={<DollarOutlined />}
            onClick={() => openOdeme(record)}
            disabled={!canEdit}
            title="Ödeme Yap"
            aria-label="Ödeme Yap"
          />
          <Button icon={<EditOutlined />} type="text" onClick={() => openEditKurum(record)} disabled={!canEdit} />
          <ConfirmDelete
            title="Kurum silinecek, emin misiniz?"
            onConfirm={() => deleteKurumMutation.mutate(record.id)}
            disabled={!canDelete}
          />
        </Space>
      ),
    },
  ]

  if (!activeProject) {
    return <EmptyState description="Lütfen önce yukarıdan bir proje seçin" />
  }

  return (
    <div>
      <PageHeader
        title="Kurum Ödemeleri"
        subtitle="SGK, Elektrik, Belediye gibi kurumlara yapılan giden ödemeler (anında hesap kapama)"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openAddKurum} disabled={!canEdit}>
            Yeni Kurum Ekle
          </Button>
        }
      />

      <Card styles={{ body: { padding: 0 } }}>
        <DataTable
          hideCard
          columns={columns}
          dataSource={kurumlar}
          rowKey="id"
          loading={isLoading}
          size="small"
          emptyDescription="Henüz kurum tanımlanmamış"
          emptyAction={
            <Button type="primary" icon={<PlusOutlined />} onClick={openAddKurum} disabled={!canEdit}>
              Yeni Kurum Ekle
            </Button>
          }
        />
      </Card>

      {/* Yeni / Düzenle Kurum Modalı */}
      <Modal
        title={editingKurum ? 'Kurum Düzenle' : 'Yeni Kurum Ekle'}
        open={kurumModalOpen}
        onCancel={closeKurumModal}
        onOk={() => kurumForm.submit()}
        confirmLoading={saveKurumMutation.isPending}
        width="min(560px, 95vw)"
      >
        <Form form={kurumForm} layout="vertical" onFinish={(v) => saveKurumMutation.mutate(v)} autoComplete="off">
          <Form.Item name="kurum_adi" label="Kurum Adı" rules={[{ required: true, message: 'Kurum adı zorunlu' }]}>
            <Input placeholder="Örn: SGK İl Müdürlüğü" autoComplete="off" />
          </Form.Item>
          <Form.Item name="kurum_turu" label="Tür" tooltip="Serbest etiket (SGK, Elektrik, Belediye, ...)">
            <Input placeholder="Örn: SGK / Elektrik / Belediye" autoComplete="off" />
          </Form.Item>
          <Form.Item
            name="vergi_no"
            label="Vergi No"
            rules={[{ pattern: /^\d{10}$/, message: 'Vergi No 10 haneli rakam olmalı', warningOnly: false }]}
          >
            <Input placeholder="10 haneli (opsiyonel)" autoComplete="off" maxLength={10} />
          </Form.Item>
          <Form.Item name="telefon" label="Telefon">
            <Input autoComplete="off" />
          </Form.Item>
          <Form.Item name="aciklama" label="Açıklama">
            <Input.TextArea rows={2} autoComplete="off" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Kurum Ödeme Modalı */}
      <Modal
        title={odemeKurum ? `Kurum Ödemesi — ${odemeKurum.kurum_adi}` : 'Kurum Ödemesi'}
        open={odemeModalOpen}
        onCancel={closeOdemeModal}
        onOk={() => odemeForm.submit()}
        confirmLoading={odemeMutation.isPending}
        okButtonProps={{ disabled: !canEdit }}
        width="min(560px, 95vw)"
      >
        <Form form={odemeForm} layout="vertical" onFinish={(v) => odemeMutation.mutate(v)} autoComplete="off">
          <Form.Item name="odeme_turu" label="Ödeme Aracı" rules={[{ required: true }]}>
            <Select>
              <Select.Option value="nakit">Nakit</Select.Option>
              <Select.Option value="banka" disabled={noBankAccounts}>
                Banka (EFT/Havale){noBankAccounts ? ' — banka hesabı tanımsız' : ''}
              </Select.Option>
              <Select.Option value="kredi_karti">Kredi Kartı</Select.Option>
            </Select>
          </Form.Item>

          {odemeTuru === 'banka' && (
            <Form.Item
              name="banka_hesap_id"
              label="Şirket Banka Hesabı"
              rules={[{ required: true, message: 'Banka hesabı seçin' }]}
            >
              <Select placeholder="İşlemin yapıldığı banka hesabı" loading={bankalarLoading} suffixIcon={<BankOutlined />}>
                {bankaHesaplari?.map((b) => (
                  <Select.Option key={b.id} value={b.id}>
                    {b.banka_adi} {b.hesap_no ? `(${b.hesap_no})` : ''} - {formatMoney(b.bakiye)} TL
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
          )}

          <Form.Item name="tarih" label="Ödeme Tarihi" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
          </Form.Item>

          <Form.Item name="tutar" label="Tutar (TL)" rules={[{ required: true, message: 'Tutar girin' }]}>
            <InputNumber
              style={{ width: '100%' }}
              formatter={trMoneyFormatter}
              parser={trNumberParser}
              decimalSeparator=","
              min={0.01}
              placeholder="0,00"
            />
          </Form.Item>

          <Form.Item name="aciklama" label="Açıklama">
            <Input.TextArea rows={2} placeholder="Örn: 2026/05 SGK primi" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
