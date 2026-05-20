import React, { useCallback, useMemo, useState } from 'react'
import {
  App,
  Card,
  Space,
  Select,
  DatePicker,
  Button,
  Tag,
  Tooltip,
  Popconfirm,
  Modal,
  Form,
  Input,
  Row,
  Col,
} from 'antd'
import { EditOutlined, DeleteOutlined, LockOutlined, ReloadOutlined } from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'

import api from '../../lib/api'
import { getErrorMessage } from '../../lib/apiError'
import { groupCariParcalari } from '../../lib/groupCariParcalari'
import { DataTable } from '../../components/common/DataTable'
import { ErrorState } from '../../components/common/ErrorState'
import { MoneyDisplay } from '../../components/common/MoneyDisplay'
import { PageHeader } from '../../components/common/PageHeader'
import { usePageSettings } from '../../contexts/LayoutContext'
import { useProject } from '../../contexts/ProjectContext'
import { usePermissions } from '../../hooks/usePermissions'
import { useIsTouchDevice } from '../../hooks/useIsTouchDevice'

const { RangePicker } = DatePicker
const { TextArea } = Input

// B1+B2+B3 (sprint 20260511-uye-tahsilat-firma-revisions):
// Tahsilat (ödeme) listesi sayfası. islem_turu_in ile gelen_odeme + iade_odeme +
// uyelik_baslangic + giden_odeme dahil edilir. Her satırda Düzenle + Sil.
// Eşleşmiş (kaynak_id NOT NULL) satırlarda Sil disabled + tooltip ("Önce kapamayı geri al").

const ISLEM_TURU_META: Record<string, { label: string; color: string }> = {
  gelen_odeme: { label: 'Tahsilat', color: 'green' },
  giden_odeme: { label: 'Ödeme (Giden)', color: 'blue' },
  iade_odeme: { label: 'İade', color: 'orange' },
  uyelik_baslangic: { label: 'Başl. Bedeli', color: 'purple' },
}

const ODEME_TURU_LABELS: Record<string, string> = {
  nakit: 'Nakit',
  banka: 'Banka',
  kredi_karti: 'Kredi Kartı',
  cek: 'Çek',
  cari: 'Cari',
}

interface TahsilatRow {
  id: string
  cari_hesap_id: string
  islem_turu: string
  odeme_turu?: string
  borc: number
  alacak: number
  tarih: string
  aciklama?: string
  belge_no?: string
  kaynak_tipi?: string | null
  kaynak_id?: string | null
  cari_hesaplar?: { cari_adi: string; cari_turu: 'uye' | 'firma' } | null
}

export const TahsilatListPage: React.FC = () => {
  const { activeProject } = useProject()
  const { canEdit, canDelete } = usePermissions()
  const { message: messageApi } = App.useApp()
  const queryClient = useQueryClient()
  const isTouchDevice = useIsTouchDevice()

  usePageSettings('Para Hareketleri')

  const [dates, setDates] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null]>([
    dayjs().startOf('year'),
    dayjs().endOf('year'),
  ])
  const [islemFilter, setIslemFilter] = useState<string | undefined>(undefined)
  const [editOpen, setEditOpen] = useState(false)
  const [editRow, setEditRow] = useState<TahsilatRow | null>(null)
  const [form] = Form.useForm()

  // Liste sorgusu — islem_turu_in CSV ile birden fazla tip
  const {
    data: rawRows,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['tahsilat-list', activeProject?.id, dates, islemFilter],
    queryFn: async () => {
      if (!activeProject?.id) return [] as TahsilatRow[]
      const params: any = {
        proje_id: activeProject.id,
        // Filter listesi: tahsilat + ödeme + iade + başlangıç (cari hareketin "ödeme" tarafı)
        islem_turu_in: islemFilter || 'gelen_odeme,giden_odeme,iade_odeme,uyelik_baslangic',
        // Sprint 20260519-para-hareketleri-improvements / US-1: üyelik başlangıç
        // tahakkuk satırlarını (`islem_turu='uyelik_baslangic' AND alacak > 0`) gizle.
        // Para hareketleri görünümünde yalnızca borc>0 (tahsilat) tarafı görünmeli.
        exclude_tahakkuk: 'true',
      }
      if (dates[0]) params.baslangic_tarihi = dates[0]!.format('YYYY-MM-DD')
      if (dates[1]) params.bitis_tarihi = dates[1]!.format('YYYY-MM-DD')
      const { data } = await api.get('/cari-hareketler', { params })
      return data.data as TahsilatRow[]
    },
    enabled: !!activeProject?.id,
  })

  // Sprint 20260519-para-hareketleri-improvements / US-3: FIFO ile parçalanmış
  // tahsilatları (aynı tarih/odeme_turu/banka_hesap_id/belge_no/aciklama/islem_turu)
  // tek satıra konsolide et. UyeDetailPage Ödemeler tab REV-PAY-14 pattern'iyle aynı.
  const rows = useMemo(() => groupCariParcalari(rawRows ?? []), [rawRows])

  // B1 + B3: silme mutasyonu
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.delete(`/cari-hareketler/${id}`)
      return data
    },
    onSuccess: () => {
      messageApi.success('Tahsilat kaydı silindi')
      queryClient.invalidateQueries({ queryKey: ['tahsilat-list'] })
      queryClient.invalidateQueries({ queryKey: ['cari-ekstre'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-ozet'] })
    },
    onError: (err) => messageApi.error(getErrorMessage(err, 'Silme başarısız')),
  })

  // B2: düzenleme mutasyonu (whitelist alanlar)
  const updateMutation = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Record<string, any> }) => {
      const { data } = await api.patch(`/cari-hareketler/${id}`, body)
      return data
    },
    onSuccess: () => {
      messageApi.success('Tahsilat kaydı güncellendi')
      setEditOpen(false)
      setEditRow(null)
      queryClient.invalidateQueries({ queryKey: ['tahsilat-list'] })
      queryClient.invalidateQueries({ queryKey: ['cari-ekstre'] })
    },
    onError: (err) => messageApi.error(getErrorMessage(err, 'Güncelleme başarısız')),
  })

  const openEdit = useCallback(
    (row: TahsilatRow) => {
      setEditRow(row)
      form.setFieldsValue({
        tarih: row.tarih ? dayjs(row.tarih) : null,
        belge_no: row.belge_no || '',
        aciklama: row.aciklama || '',
      })
      setEditOpen(true)
    },
    [form],
  )

  const handleEditSubmit = async () => {
    if (!editRow) return
    const values = await form.validateFields()
    const body: Record<string, any> = {
      tarih: values.tarih ? dayjs(values.tarih).format('YYYY-MM-DD') : undefined,
      belge_no: values.belge_no ?? null,
      aciklama: values.aciklama ?? null,
    }
    updateMutation.mutate({ id: editRow.id, body })
  }

  const columns = useMemo(
    () => [
      {
        title: 'Tarih',
        dataIndex: 'tarih',
        key: 'tarih',
        width: 110,
        render: (d: string) => (d ? dayjs(d).format('DD.MM.YYYY') : '-'),
        sorter: (a: TahsilatRow, b: TahsilatRow) =>
          dayjs(a.tarih).valueOf() - dayjs(b.tarih).valueOf(),
      },
      {
        title: 'Cari',
        key: 'cari',
        render: (_: unknown, r: TahsilatRow) => r.cari_hesaplar?.cari_adi || '-',
      },
      {
        title: 'İşlem Türü',
        dataIndex: 'islem_turu',
        key: 'islem_turu',
        width: 140,
        filters: Object.entries(ISLEM_TURU_META).map(([k, v]) => ({ text: v.label, value: k })),
        onFilter: (val: any, r: TahsilatRow) => r.islem_turu === val,
        render: (v: string) => {
          const m = ISLEM_TURU_META[v] ?? { label: v, color: 'default' }
          return <Tag color={m.color}>{m.label}</Tag>
        },
      },
      {
        title: 'Tutar',
        key: 'tutar',
        align: 'right' as const,
        render: (_: unknown, r: TahsilatRow) => {
          const tutar = Math.max(Number(r.borc) || 0, Number(r.alacak) || 0)
          return <MoneyDisplay amount={tutar} />
        },
      },
      {
        title: 'Yöntem',
        dataIndex: 'odeme_turu',
        key: 'odeme_turu',
        width: 110,
        render: (v?: string) => (v ? <Tag>{ODEME_TURU_LABELS[v] ?? v.toUpperCase()}</Tag> : '-'),
      },
      {
        title: 'Belge No',
        dataIndex: 'belge_no',
        key: 'belge_no',
        width: 130,
        render: (v?: string) => v || '-',
      },
      { title: 'Açıklama', dataIndex: 'aciklama', key: 'aciklama' },
      {
        title: 'Kilit',
        key: 'lock',
        width: 70,
        align: 'center' as const,
        render: (_: unknown, r: TahsilatRow) => {
          if (r.kaynak_id) {
            return (
              <Tooltip
                trigger={isTouchDevice ? ['click', 'hover'] : ['hover']}
                title="Bu kayıt bir aidat/hakediş ile eşleştirilmiş ve kilitli. Önce hesap kapamayı geri alın."
              >
                <LockOutlined style={{ color: '#fa8c16' }} aria-label="Kilitli (kapama bağlı)" />
              </Tooltip>
            )
          }
          return null
        },
      },
      {
        title: 'İşlem',
        key: 'actions',
        width: 110,
        render: (_: unknown, r: TahsilatRow) => {
          const locked = !!r.kaynak_id
          return (
            <Space size={4}>
              <Tooltip
                title={
                  locked
                    ? 'Kilitli — Önce hesap kapamayı geri alın'
                    : 'Düzenle (tarih, belge no, açıklama)'
                }
              >
                <Button
                  type="text"
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => openEdit(r)}
                  disabled={!canEdit}
                  aria-label="Tahsilatı düzenle"
                  // B3: kilitli satırlarda tutar/yöntem alanları zaten backend tarafında
                  // bloklanır; düzenle ile sadece metadata değişebilir.
                />
              </Tooltip>
              <Popconfirm
                title="Tahsilatı Sil"
                description="Bu tahsilat kalıcı olarak silinecek. Emin misiniz?"
                onConfirm={() => deleteMutation.mutate(r.id)}
                okText="Evet, Sil"
                cancelText="Vazgeç"
                okButtonProps={{ danger: true }}
                disabled={locked || !canDelete}
              >
                <Tooltip
                  title={
                    !canDelete
                      ? 'Yetki yok (manager+ gerekli)'
                      : locked
                      ? 'Önce hesap kapamayı geri alın'
                      : 'Sil'
                  }
                >
                  <Button
                    type="text"
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    disabled={locked || !canDelete}
                    loading={deleteMutation.isPending && deleteMutation.variables === r.id}
                    aria-label="Tahsilatı sil"
                  />
                </Tooltip>
              </Popconfirm>
            </Space>
          )
        },
      },
    ],
    [deleteMutation, isTouchDevice, openEdit, canEdit, canDelete],
  )

  if (isError) {
    return <ErrorState error={error} title="Tahsilatlar yüklenemedi" onRetry={() => refetch()} />
  }

  return (
    <div>
      <PageHeader
        title="Tahsilat / Ödeme Kayıtları"
        subtitle="Cari hareketler arasından ödeme ve tahsilat kalemleri"
        extra={
          <Button icon={<ReloadOutlined />} onClick={() => refetch()}>
            Yenile
          </Button>
        }
      />

      <Card style={{ marginBottom: 16 }}>
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} sm={12} md={10}>
            <RangePicker
              value={dates as any}
              onChange={(vals) =>
                setDates([(vals?.[0] as dayjs.Dayjs) || null, (vals?.[1] as dayjs.Dayjs) || null])
              }
              format="DD.MM.YYYY"
              allowClear
              style={{ width: '100%' }}
            />
          </Col>
          <Col xs={24} sm={12} md={8}>
            <Select
              allowClear
              placeholder="İşlem türü filtrele"
              value={islemFilter}
              onChange={(v) => setIslemFilter(v)}
              style={{ width: '100%' }}
              options={Object.entries(ISLEM_TURU_META).map(([k, v]) => ({
                value: k,
                label: v.label,
              }))}
            />
          </Col>
        </Row>
      </Card>

      <DataTable
        columns={columns}
        dataSource={rows}
        rowKey="id"
        loading={isLoading}
        pagination={{ pageSize: 50, showSizeChanger: true }}
      />

      <Modal
        title="Tahsilat / Ödeme Düzenle"
        open={editOpen}
        onCancel={() => {
          setEditOpen(false)
          setEditRow(null)
        }}
        onOk={handleEditSubmit}
        confirmLoading={updateMutation.isPending}
        okText="Kaydet"
        cancelText="Vazgeç"
        destroyOnClose
      >
        {editRow?.kaynak_id && (
          <div style={{ marginBottom: 12 }}>
            <Tag icon={<LockOutlined />} color="orange">
              Kilitli kayıt — Sadece açıklama, belge no ve tarih düzenlenebilir
            </Tag>
          </div>
        )}
        <Form form={form} layout="vertical" autoComplete="off">
          <Form.Item label="Tarih" name="tarih" rules={[{ required: true, message: 'Tarih zorunludur' }]}>
            <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
          </Form.Item>
          <Form.Item label="Belge No" name="belge_no">
            <Input maxLength={50} autoComplete="off" />
          </Form.Item>
          <Form.Item label="Açıklama" name="aciklama">
            <TextArea rows={3} maxLength={500} autoComplete="off" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
