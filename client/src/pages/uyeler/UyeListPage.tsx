import React, { useState } from 'react'
import { Button, Input, Select, Space, Tag, message } from 'antd'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { PlusOutlined, EditOutlined, SearchOutlined, EyeOutlined } from '@ant-design/icons'
import api from '../../lib/api'
import { useDebounce } from '../../hooks/useDebounce'

import { PageHeader } from '../../components/common/PageHeader'
import { DataTable } from '../../components/common/DataTable'
import { ConfirmDelete } from '../../components/common/ConfirmDelete'
import { ErrorState } from '../../components/common/ErrorState'

interface Uye {
  id: string
  uye_no: string
  ad: string
  soyad: string
  telefon?: string
  blok_id?: string
  daire_no?: string
  durum: string
  bloklar?: { blok_adi: string }
}

export const UyeListPage: React.FC = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [filterDurum, setFilterDurum] = useState<string | undefined>(undefined)
  const [filterBlok, setFilterBlok] = useState<string | undefined>(undefined)
  const debouncedSearch = useDebounce(search, 300)

  const { data: bloklar } = useQuery({
    queryKey: ['bloklar'],
    queryFn: async () => {
      const { data } = await api.get('/bloklar')
      return data.data as { id: string; blok_adi: string }[]
    },
  })

  const { data: uyeData, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['uyeler', debouncedSearch, filterDurum, filterBlok],
    queryFn: async () => {
      const params: Record<string, string> = {}
      if (debouncedSearch) params.search = debouncedSearch
      if (filterDurum) params.durum = filterDurum
      if (filterBlok) params.blok_id = filterBlok
      const { data } = await api.get('/uyeler', { params })
      return data
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/uyeler/${id}`)
    },
    onSuccess: () => {
      message.success('Üye pasif yapıldı')
      queryClient.invalidateQueries({ queryKey: ['uyeler'] })
    },
    onError: (err: any) => message.error(err.message || 'Hata oluştu'),
  })

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
      render: (_: unknown, r: Uye) => `${r.ad} ${r.soyad}`,
    },
    {
      title: 'Blok / Daire',
      key: 'blok_daire',
      render: (_: unknown, r: Uye) => {
        const blok = r.bloklar?.blok_adi || '-'
        return `${blok} / ${r.daire_no || '-'}`
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
        <Space>
          <Button icon={<EyeOutlined />} type="text" onClick={() => navigate(`/uyeler/${record.id}`)} />
          <Button icon={<EditOutlined />} type="text" onClick={() => navigate(`/uyeler/${record.id}/duzenle`)} />
          {record.durum === 'aktif' && (
             <ConfirmDelete 
               title="Üye pasif yapılacak, emin misiniz?" 
               onConfirm={() => deleteMutation.mutate(record.id)} 
             />
          )}
        </Space>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Üye Yönetimi"
        subtitle="Kooperatif üyelerini listeleyin, arayın ve yeni kayıt oluşturun."
        extra={
          <Space wrap size="middle">
            <Input
              placeholder="Ad, soyad veya üye no ile ara..."
              prefix={<SearchOutlined />}
              allowClear
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: 250 }}
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
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/uyeler/yeni')}>
              Yeni Üye
            </Button>
          </Space>
        }
      />

      {isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : (
        <DataTable
          columns={columns}
          dataSource={uyeData?.data}
          rowKey="id"
          loading={isLoading}
          totalItems={uyeData?.pagination?.total}
          emptyDescription="Kayıtlı üye bulunamadı"
          onRow={(record: Uye) => ({
            onClick: () => navigate(`/uyeler/${record.id}`),
            style: { cursor: 'pointer' }
          })}
        />
      )}
    </div>
  )
}
