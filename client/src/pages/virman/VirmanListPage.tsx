import React, { useMemo, useState } from 'react'
import { App, Button, Card, DatePicker, Popconfirm, Space, Tag, Tooltip } from 'antd'
import { DeleteOutlined, PlusOutlined, ReloadOutlined, SwapOutlined } from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import api from '../../lib/api'
import { getErrorMessage } from '../../lib/apiError'
import { DataTable } from '../../components/common/DataTable'
import { ErrorState } from '../../components/common/ErrorState'
import { MoneyDisplay } from '../../components/common/MoneyDisplay'
import { PageHeader } from '../../components/common/PageHeader'
import { usePageSettings } from '../../contexts/LayoutContext'
import { useProject } from '../../contexts/ProjectContext'
import { usePermissions } from '../../hooks/usePermissions'
import { VirmanFormModal } from './VirmanFormModal'

const { RangePicker } = DatePicker

interface VirmanRow {
  id: string
  proje_id: string
  virman_tipi: 'banka_banka' | 'banka_nakit' | 'nakit_banka'
  kaynak_hesap_id: string | null
  hedef_hesap_id: string | null
  tutar: number
  tarih: string
  aciklama: string | null
  created_at: string
  kaynak?: { banka_adi: string } | null
  hedef?: { banka_adi: string } | null
}

const VIRMAN_TIPI_META: Record<string, { label: string; color: string }> = {
  banka_banka: { label: 'Banka → Banka', color: 'blue' },
  banka_nakit: { label: 'Banka → Nakit', color: 'orange' },
  nakit_banka: { label: 'Nakit → Banka', color: 'green' },
}

export const VirmanListPage: React.FC = () => {
  const { activeProject } = useProject()
  const { canEdit, canDelete } = usePermissions()
  const { message } = App.useApp()
  const queryClient = useQueryClient()

  const [dates, setDates] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null]>([
    dayjs().startOf('year'),
    dayjs().endOf('year'),
  ])
  const [formOpen, setFormOpen] = useState(false)

  usePageSettings('Virmanlar')

  const {
    data: virmanlar,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['virmanlar', activeProject?.id, dates],
    queryFn: async () => {
      if (!activeProject?.id) return [] as VirmanRow[]
      const params: any = { proje_id: activeProject.id }
      if (dates[0]) params.baslangic_tarihi = dates[0]!.format('YYYY-MM-DD')
      if (dates[1]) params.bitis_tarihi = dates[1]!.format('YYYY-MM-DD')
      const { data } = await api.get('/virmanlar', { params })
      return data.data as VirmanRow[]
    },
    enabled: !!activeProject?.id,
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.delete(`/virmanlar/${id}`, {
        params: { proje_id: activeProject?.id },
      })
      return data
    },
    onSuccess: () => {
      message.success('Virman silindi (ilgili banka hareketleri de iptal edildi)')
      queryClient.invalidateQueries({ queryKey: ['virmanlar'] })
      queryClient.invalidateQueries({ queryKey: ['banka-hesaplari'] })
      queryClient.invalidateQueries({ queryKey: ['banka-hareketleri'] })
    },
    onError: (err) => message.error(getErrorMessage(err, 'Silme başarısız')),
  })

  const columns = useMemo(
    () => [
      {
        title: 'Tarih',
        dataIndex: 'tarih',
        key: 'tarih',
        width: 95,
        render: (d: string) => (d ? dayjs(d).format('DD.MM.YYYY') : '-'),
        sorter: (a: VirmanRow, b: VirmanRow) =>
          dayjs(a.tarih).valueOf() - dayjs(b.tarih).valueOf(),
        defaultSortOrder: 'descend' as const,
      },
      {
        title: 'Tip',
        dataIndex: 'virman_tipi',
        key: 'virman_tipi',
        width: 120,
        render: (v: string) => {
          const meta = VIRMAN_TIPI_META[v] ?? { label: v, color: 'default' }
          return <Tag color={meta.color}>{meta.label}</Tag>
        },
        filters: Object.entries(VIRMAN_TIPI_META).map(([k, v]) => ({ text: v.label, value: k })),
        onFilter: (val: any, r: VirmanRow) => r.virman_tipi === val,
      },
      {
        title: 'Kaynak',
        key: 'kaynak',
        render: (_: unknown, r: VirmanRow) =>
          r.kaynak?.banka_adi ?? <Tag color="orange">Nakit Kasa</Tag>,
      },
      {
        title: '',
        key: 'arrow',
        width: 30,
        align: 'center' as const,
        render: () => <SwapOutlined style={{ color: '#94a3b8' }} />,
      },
      {
        title: 'Hedef',
        key: 'hedef',
        render: (_: unknown, r: VirmanRow) =>
          r.hedef?.banka_adi ?? <Tag color="orange">Nakit Kasa</Tag>,
      },
      {
        title: 'Tutar',
        dataIndex: 'tutar',
        key: 'tutar',
        width: 110,
        align: 'right' as const,
        render: (v: number) => <MoneyDisplay amount={Number(v) || 0} />,
        sorter: (a: VirmanRow, b: VirmanRow) => Number(a.tutar) - Number(b.tutar),
      },
      { title: 'Açıklama', dataIndex: 'aciklama', key: 'aciklama', ellipsis: true, render: (v?: string | null) => v || '-' },
      {
        title: 'İşlem',
        key: 'actions',
        width: 60,
        align: 'center' as const,
        render: (_: unknown, r: VirmanRow) => (
          <Popconfirm
            title="Virmanı Sil"
            description="Virman ve ilgili banka hareketleri (gider + gelir) birlikte silinir. Emin misiniz?"
            onConfirm={() => deleteMutation.mutate(r.id)}
            okText="Evet, Sil"
            cancelText="Vazgeç"
            okButtonProps={{ danger: true }}
            disabled={!canDelete}
          >
            <Tooltip title={!canDelete ? 'Yetki yok (manager+ gerekli)' : 'Virmanı sil'}>
              <Button
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined />}
                disabled={!canDelete}
                loading={deleteMutation.isPending && deleteMutation.variables === r.id}
                aria-label="Virmanı sil"
              />
            </Tooltip>
          </Popconfirm>
        ),
      },
    ],
    [deleteMutation, canDelete],
  )

  if (isError) {
    return <ErrorState error={error} title="Virmanlar yüklenemedi" onRetry={() => refetch()} />
  }

  return (
    <div>
      <PageHeader
        title="Virmanlar"
        subtitle="Banka ve nakit kasa arasındaki transferler"
        extra={
          <Space size={8}>
            <Button icon={<ReloadOutlined />} onClick={() => refetch()}>
              Yenile
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setFormOpen(true)}
              disabled={!canEdit || !activeProject}
              title={!canEdit ? 'Yetki yok' : !activeProject ? 'Önce bir proje seçin' : undefined}
            >
              Yeni Virman
            </Button>
          </Space>
        }
      />

      <Card style={{ marginBottom: 16 }}>
        <RangePicker
          value={dates as any}
          onChange={(vals) =>
            setDates([(vals?.[0] as dayjs.Dayjs) || null, (vals?.[1] as dayjs.Dayjs) || null])
          }
          format="DD.MM.YYYY"
          allowClear
        />
      </Card>

      <DataTable
        columns={columns}
        dataSource={virmanlar}
        rowKey="id"
        loading={isLoading}
        pagination={{ pageSize: 50, showSizeChanger: true }}
      />

      <VirmanFormModal open={formOpen} onClose={() => setFormOpen(false)} />
    </div>
  )
}
