import React, { useState } from 'react'
import { Button, Input, Select, Space, Tag, App, Typography, Badge } from 'antd'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { PlusOutlined, EditOutlined, SearchOutlined, EyeOutlined } from '@ant-design/icons'
import api from '../../lib/api'
import { useDebounce } from '../../hooks/useDebounce'

import { DataTable } from '../../components/common/DataTable'
import { StrictConfirmDelete } from '../../components/common/StrictConfirmDelete'
import { ErrorState } from '../../components/common/ErrorState'
import { usePageSettings } from '../../contexts/LayoutContext'
import { useProject } from '../../contexts/ProjectContext'

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
  const [search, setSearch] = useState('')
  const [filterDurum, setFilterDurum] = useState<string | undefined>(undefined)
  const [filterBlok, setFilterBlok] = useState<string | undefined>(undefined)
  const [filterDaire, setFilterDaire] = useState<string | undefined>(undefined)
  const debouncedSearch = useDebounce(search, 300)
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
    onError: (err: any) => messageApi.error(err.message || 'Hata oluştu'),
  })

  const actions = React.useMemo(() => (
    <Space orientation="horizontal">
      <Input
        placeholder="Ad, soyad veya üye no ile ara..."
        prefix={<SearchOutlined />}
        allowClear
        onChange={(e) => setSearch(e.target.value)}
        style={{ width: 250 }}
        autoComplete="off"
      />
      <Select
        placeholder="Durum"
        value={filterDurum}
        onChange={setFilterDurum}
        allowClear
        style={{ width: 120 }}
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
        style={{ width: 120 }}
      >
        {bloklar?.map((b) => (
          <Select.Option key={b.id} value={b.id}>{b.blok_adi}</Select.Option>
        ))}
      </Select>
      <Select
        placeholder="Daire Ataması"
        value={filterDaire}
        onChange={setFilterDaire}
        allowClear
        style={{ width: 150 }}
      >
        <Select.Option value="atanmis">Daire Atanmış</Select.Option>
        <Select.Option value="atanmamis">Daire Atanmamış</Select.Option>
      </Select>
      <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/uyeler/yeni')}>
        Yeni Üye
      </Button>
    </Space>
  ), [filterDurum, filterBlok, filterDaire, bloklar, navigate])

  usePageSettings('Üye Yönetimi', actions)

  const durumRenk: Record<string, string> = {
    aktif: 'green',
    pasif: 'default',
    ihrac: 'red',
    istifa: 'orange',
  }

  const columns = [
    { title: 'Üye No', dataIndex: 'uye_no', key: 'uye_no', width: 100 },
    {
      title: 'Ad Soyad',
      key: 'ad_soyad',
      sorter: true,
      render: (_: unknown, r: Uye) => `${r.ad} ${r.soyad}`,
    },
    {
      title: 'Daire Kod',
      key: 'daire_kod',
      render: (_: unknown, r: Uye) => {
        return r.serefiye_tablosu?.daire_no || '-'
      },
    },
    { title: 'Telefon', dataIndex: 'telefon', key: 'telefon' },
    {
      title: 'Durum',
      dataIndex: 'durum',
      key: 'durum',
      render: (d: string) => <Tag color={durumRenk[d] || 'default'}>{d.toUpperCase()}</Tag>,
    },
    {
      title: 'İşlem',
      key: 'action',
      width: 150,
      render: (_: unknown, record: Uye) => (
        <Space onClick={(e) => e.stopPropagation()} orientation="horizontal">
          <Button 
            icon={<EyeOutlined />} 
            type="text" 
            onClick={(e) => { 
              e.stopPropagation(); 
              navigate(`/uyeler/${record.id}`); 
            }} 
          />
          <Button 
            icon={<EditOutlined />} 
            type="text" 
            onClick={(e) => { 
              e.stopPropagation(); 
              navigate(`/uyeler/${record.id}/duzenle`); 
            }} 
          />
          {record.durum === 'aktif' && (
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
      {!activeProject ? (
        <div style={{ padding: '24px', textAlign: 'center' }}>
          <Typography.Title level={4}>Lütfen bir proje seçin</Typography.Title>
          <Typography.Text type="secondary">Üye listesini görüntülemek için üst menüden bir proje seçmelisiniz.</Typography.Text>
        </div>
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
            emptyDescription="Kayıtlı üye bulunamadı"
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
