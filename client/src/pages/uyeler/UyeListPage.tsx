import React, { useMemo, useState } from 'react'
import { Button, Input, Select, Space, Tag, App, Grid } from 'antd'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { PlusOutlined, EditOutlined, SearchOutlined, EyeOutlined } from '@ant-design/icons'

const { useBreakpoint } = Grid
import api from '../../lib/api'
import { getErrorMessage } from '../../lib/apiError'
import { useDebounce } from '../../hooks/useDebounce'

import { DataTable } from '../../components/common/DataTable'
import { StrictConfirmDelete } from '../../components/common/StrictConfirmDelete'
import { ErrorState } from '../../components/common/ErrorState'
import { EmptyState } from '../../components/common/EmptyState'
import { HeaderActionsToolbar } from '../../components/common/HeaderActionsToolbar'
import { HeaderSearchPortal } from '../../components/common/HeaderSearchPortal'
import { usePageSettings } from '../../contexts/LayoutContext'
import { useProject } from '../../contexts/ProjectContext'
import { usePermissions } from '../../hooks/usePermissions'

interface Uye {
  id: string
  uye_no: string
  ad: string
  soyad: string
  telefon?: string
  serefiye_id?: string
  durum: string
  serefiye_tablosu?: {
    daire_no: string
    bloklar?: { blok_adi: string }
  }
}

export const UyeListPage: React.FC = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { activeProject } = useProject()
  const { canEdit, canDelete } = usePermissions()
  const screens = useBreakpoint()
  // SSR-safe: ilk render screens={} → !md false değil undefined; desktop varsay.
  // Header'da gear ile çakışmaması için search Input mobile'da Drawer'a taşınır.
  const isMobile = screens.md === false
  const [search, setSearch] = useState('')
  const [filterDurum, setFilterDurum] = useState<string | undefined>(undefined)
  const [filterBlok, setFilterBlok] = useState<string | undefined>(undefined)
  const [filterDaire, setFilterDaire] = useState<string | undefined>(undefined)
  // 2026-05-15 UX: 300ms çok agresif — her harfte query tetikleyip loading state
  // kullanıcının yazımını "duraklatma" hissi veriyordu. 1000ms ile yazma akışı bitince
  // bir kez arama yapılır (FirmaListPage ile tutarlı — PR #33).
  const debouncedSearch = useDebounce(search, 1000)
  const { message: messageApi } = App.useApp()

  const { data: bloklar } = useQuery({
    queryKey: ['bloklar', activeProject?.id],
    queryFn: async () => {
      if (!activeProject?.id) return []
      const { data } = await api.get('/bloklar', { params: { proje_id: activeProject.id } })
      return data.data as { id: string; blok_adi: string }[]
    },
    enabled: !!activeProject?.id
  })

  const { data: uyeData, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['uyeler', debouncedSearch, filterDurum, filterBlok, filterDaire, activeProject?.id],
    queryFn: async () => {
      if (!activeProject?.id) return { data: [], pagination: { totalCount: 0 } }
      const params: Record<string, string> = { proje_id: activeProject.id }
      if (debouncedSearch) params.search = debouncedSearch
      if (filterDurum) params.durum = filterDurum
      if (filterBlok) params.blok_id = filterBlok
      if (filterDaire === 'atanmis') params.has_daire = 'true'
      if (filterDaire === 'atanmamis') params.has_daire = 'false'

      const { data } = await api.get('/uyeler', { params })
      return data
    },
    enabled: !!activeProject?.id
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/uyeler/${id}`)
    },
    onSuccess: () => {
      messageApi.success('Üye pasif yapıldı')
      queryClient.invalidateQueries({ queryKey: ['uyeler'] })
    },
    onError: (err) => messageApi.error(getErrorMessage(err)),
  })

  // OC-01 (sprint 20260511-ui-responsive-sprint extension):
  // Header action'lar HeaderActionsToolbar ile sarmalandı.
  // Mobile (<768px): "Yeni Üye" inline + Drawer içinde Search+3 Select.
  // Desktop (>=768px): hepsi inline (mevcut davranış).
  //
  // Sprint 20260515-uye-list-search-keystroke-remount (FirmaListPage PR #30/#33/#35 paritesi):
  //   Search Input artık <HeaderSearchPortal> ile sayfa-sahipli (page-owned) bir
  //   subtree'de render ediliyor — LayoutContext'in shallow (type + key) eşitlik
  //   bailout zincirinin dışında. Aynı zincir nedeniyle header'a secondary olarak
  //   konulan controlled Input'lar (a) ya donuk kalır (stateKey'de search yoksa),
  //   (b) ya da her keystroke'ta toolbar'ı unmount edip Input'u remount eder
  //   (stateKey'de search varsa → focus kaybı, ilk karakterden sonra yazılamama).
  //   Portal yaklaşımı her iki sorunu da çözer: search state'i sayfa subtree'sinde
  //   reconcile edilir, header re-mount zincirine girmez.
  const activeFilterCount = useMemo(() => {
    let count = 0
    if (search) count++
    if (filterDurum) count++
    if (filterBlok) count++
    if (filterDaire) count++
    return count
  }, [search, filterDurum, filterBlok, filterDaire])

  const primaryAction = useMemo(() => (
    <Button
      type="primary"
      icon={<PlusOutlined />}
      onClick={() => navigate('/uyeler/yeni')}
      size="small"
      disabled={!canEdit}
      title={!canEdit ? 'Yetki yok (sadece görüntüleme)' : undefined}
    >
      Yeni Üye
    </Button>
  ), [navigate, canEdit])

  // secondaryActions — search HARİÇ (search portal ile page-owned subtree'de).
  const secondaryActions = useMemo(() => (
    <>
      <Select
        placeholder="Durum"
        value={filterDurum}
        onChange={setFilterDurum}
        allowClear
        style={{ width: 90 }}
        size="small"
      >
        <Select.Option value="aktif">Aktif</Select.Option>
        <Select.Option value="pasif">Pasif</Select.Option>
        <Select.Option value="ihrac">İhraç</Select.Option>
        <Select.Option value="istifa">İstifa</Select.Option>
      </Select>
      <Select
        placeholder="Blok"
        value={filterBlok}
        onChange={setFilterBlok}
        allowClear
        style={{ width: 85 }}
        size="small"
      >
        {bloklar?.map((b) => (
          <Select.Option key={b.id} value={b.id}>{b.blok_adi}</Select.Option>
        ))}
      </Select>
      <Select
        placeholder="Daire"
        value={filterDaire}
        onChange={setFilterDaire}
        allowClear
        style={{ width: 100 }}
        size="small"
      >
        <Select.Option value="atanmis">Atanmış</Select.Option>
        <Select.Option value="atanmamis">Atanmamış</Select.Option>
      </Select>
    </>
  ), [filterDurum, filterBlok, filterDaire, bloklar])

  // Mobile Drawer içeriği — search Input dahil, vertical layout.
  // Header'daki search slot mobile'da render edilmiyor (gear ile çakışmasın);
  // search aynı state'e bağlı bir ikinci Input olarak Drawer'da sunulur.
  const secondaryMobileActions = useMemo(() => (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Input
        placeholder="Üye ara..."
        prefix={<SearchOutlined />}
        allowClear
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        autoComplete="off"
      />
      <Select
        placeholder="Durum"
        value={filterDurum}
        onChange={setFilterDurum}
        allowClear
        style={{ width: '100%' }}
      >
        <Select.Option value="aktif">Aktif</Select.Option>
        <Select.Option value="pasif">Pasif</Select.Option>
        <Select.Option value="ihrac">İhraç</Select.Option>
        <Select.Option value="istifa">İstifa</Select.Option>
      </Select>
      <Select
        placeholder="Blok"
        value={filterBlok}
        onChange={setFilterBlok}
        allowClear
        style={{ width: '100%' }}
      >
        {bloklar?.map((b) => (
          <Select.Option key={b.id} value={b.id}>{b.blok_adi}</Select.Option>
        ))}
      </Select>
      <Select
        placeholder="Daire"
        value={filterDaire}
        onChange={setFilterDaire}
        allowClear
        style={{ width: '100%' }}
      >
        <Select.Option value="atanmis">Atanmış</Select.Option>
        <Select.Option value="atanmamis">Atanmamış</Select.Option>
      </Select>
      {activeFilterCount > 0 && (
        <Button
          block
          onClick={() => {
            setSearch('')
            setFilterDurum(undefined)
            setFilterBlok(undefined)
            setFilterDaire(undefined)
          }}
        >
          Filtreleri Temizle
        </Button>
      )}
    </Space>
  ), [search, filterDurum, filterBlok, filterDaire, bloklar, activeFilterCount])

  const actions = useMemo(() => {
    // stateKey SADECE discrete (Select) state'ler + filterCount'u içerir.
    // search ham metni key zincirinden ÇIKARILDI — keystroke'ta toolbar
    // remount olmaz. Search'ın badge count'a etkisi `activeFilterCount`
    // üzerinden zaten yansıyor (search var/yok → count 0↔1 değişimi).
    // Pattern: FirmaListPage (PR #35).
    const stateKey = [filterDurum || 'none', filterBlok || 'none', filterDaire || 'none', `f${activeFilterCount}`].join('|')
    return (
      <HeaderActionsToolbar
        key={`uye-list-${stateKey}`}
        primary={primaryAction}
        secondary={secondaryActions}
        secondaryMobile={secondaryMobileActions}
        filterCount={activeFilterCount}
        drawerTitle="Üye Filtreleri"
      />
    )
  }, [primaryAction, secondaryActions, secondaryMobileActions, activeFilterCount, filterDurum, filterBlok, filterDaire])

  usePageSettings('Üye Yönetimi', actions)

  const durumRenk: Record<string, string> = {
    aktif: 'green',
    pasif: 'default',
    ihrac: 'red',
    istifa: 'orange',
  }

  const columns = [
    { title: 'No', dataIndex: 'uye_no', key: 'uye_no', width: 50 },
    {
      title: 'Ad Soyad',
      key: 'ad_soyad',
      sorter: true,
      render: (_: unknown, r: Uye) => `${r.ad} ${r.soyad}`,
    },
    {
      title: 'Daire',
      key: 'daire_kod',
      width: 60,
      render: (_: unknown, r: Uye) => {
        return r.serefiye_tablosu?.daire_no || '-'
      },
    },
    { title: 'Telefon', dataIndex: 'telefon', key: 'telefon', responsive: ['md'] as ('md')[] },
    {
      title: 'Durum',
      dataIndex: 'durum',
      key: 'durum',
      responsive: ['sm'] as ('sm')[],
      render: (d: string) => <Tag color={durumRenk[d] || 'default'}>{d.toUpperCase()}</Tag>,
    },
    {
      title: 'İşlem',
      key: 'action',
      width: 120,
      render: (_: unknown, record: Uye) => (
        <Space onClick={(e) => e.stopPropagation()} orientation="horizontal" size="small">
          <Button
            icon={<EyeOutlined />}
            type="text"
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/uyeler/${record.id}`);
            }}
          />
          <Button
            icon={<EditOutlined />}
            type="text"
            size="small"
            disabled={!canEdit}
            title={!canEdit ? 'Yetki yok' : 'Düzenle'}
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/uyeler/${record.id}/duzenle`);
            }}
          />
          {record.durum === 'aktif' && canDelete && (
            <StrictConfirmDelete
              title="Üye pasif yapılacak, emin misiniz?"
              confirmText={`${record.ad} ${record.soyad}`}
              onConfirm={() => deleteMutation.mutate(record.id)}
              loading={deleteMutation.isPending}
            />
          )}
        </Space>
      ),
    },
  ]

  return (
    <div className="animate-in fade-in duration-500">
      {/*
        Desktop: Header'a portal'lanan search input — bkz. HeaderSearchPortal jsdoc.
        Mobile (<768px): Portal hiç render edilmez; search Input HeaderActionsToolbar
        Drawer'ı (secondaryMobile) içinde sunulur. Gerekçe: 200px header search slot
        mobile'da sağdaki settings gear (40x40) ile çakışıyordu (admin-header sticky,
        flex layout). Portal'ı koşullu render ederek slot boş kalır, gear tek başına
        sağda durur. Aynı `search` state'ine bağlı Drawer içindeki Input keystroke
        davranışında portal'a ihtiyaç duymaz; HeaderActionsToolbar key sabit kalır.
      */}
      {!isMobile && (
        <HeaderSearchPortal>
          <Input
            placeholder="Üye ara..."
            prefix={<SearchOutlined />}
            allowClear
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 200 }}
            autoComplete="off"
            size="small"
          />
        </HeaderSearchPortal>
      )}
      {!activeProject ? (
        <EmptyState description="Lütfen önce yukarıdan bir proje seçin" />
      ) : (
        isError ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : (
          <DataTable
            columns={columns}
            dataSource={uyeData?.data}
            rowKey="id"
            loading={isLoading}
            totalItems={uyeData?.pagination?.totalCount}
            emptyDescription="Bu projede kayıtlı üye yok. Yeni Üye butonu ile başlayın."
            stickyFirstColumn /* A2-03: üye no/adı kolonu sticky */
            onRow={(record: Uye) => ({
              onClick: () => navigate(`/uyeler/${record.id}`),
              style: { cursor: 'pointer' }
            })}
          />
        )
      )}
    </div>
  )
}
