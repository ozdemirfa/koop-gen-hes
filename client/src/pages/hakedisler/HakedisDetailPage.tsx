import React, { useState, useEffect, useMemo } from 'react'
import { Card, Descriptions, Table, Button, InputNumber, Tag, Row, Col, Statistic, Space, Popconfirm, Select, Modal, Typography, App } from 'antd'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckOutlined, SaveOutlined, FilePdfOutlined, ArrowLeftOutlined, PlusOutlined, DeleteOutlined, RollbackOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import api from '../../lib/api'
import { getErrorMessage } from '../../lib/apiError'
import { MoneyDisplay } from '../../components/common/MoneyDisplay'
import { usePageSettings } from '../../contexts/LayoutContext'
import { trNumberFormatter, trNumberParser, trMoneyFormatter } from '../../lib/format'

const { Text } = Typography

interface HakedisKalemi {
  id: string
  is_kalemi_id: string
  onceki_miktar: number
  bu_ay_miktar: number
  toplam_miktar: number
  birim_fiyat: number
  kdv_orani: number
  bu_ay_tutar: number
  toplam_tutar: number
  sozlesme_is_kalemleri?: {
    poz_no?: string
    tanim: string
    birim: string
    miktar: number
    kdv_orani: number
  }
}

interface EditableKalem {
  is_kalemi_id: string
  onceki_miktar: number
  bu_ay_miktar: number
  birim_fiyat: number
  kdv_orani: number
  poz_no?: string
  tanim: string
  birim: string
  sozlesme_miktar: number
}

const durumRenk: Record<string, string> = {
  taslak: 'default',
  onaylandi: 'blue',
  odendi: 'green',
  iptal: 'red',
}

const durumLabel: Record<string, string> = {
  taslak: 'Taslak',
  onaylandi: 'Onaylandı',
  odendi: 'Ödendi',
  iptal: 'İptal',
}

export const HakedisDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { message } = App.useApp()
  const [editableKalemler, setEditableKalemler] = useState<EditableKalem[]>([])
  const [hasChanges, setHasChanges] = useState(false)
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [selectedKalemId, setSelectedKalemId] = useState<string | undefined>()

  const { data: hakedis, isLoading } = useQuery({
    queryKey: ['hakedis', id],
    queryFn: async () => {
      const { data } = await api.get(`/hakedisler/${id}`)
      return data.data
    },
  })

  const isTaslak = hakedis?.durum === 'taslak'

  // Kalemleri editable state'e çevir
  useEffect(() => {
    if (hakedis?.hakedis_kalemleri) {
      const kalemler = hakedis.hakedis_kalemleri.map((k: HakedisKalemi) => ({
        is_kalemi_id: k.is_kalemi_id,
        onceki_miktar: Number(k.onceki_miktar),
        bu_ay_miktar: Number(k.bu_ay_miktar),
        birim_fiyat: Number(k.birim_fiyat),
        kdv_orani: Number(k.kdv_orani || k.sozlesme_is_kalemleri?.kdv_orani || 20),
        poz_no: k.sozlesme_is_kalemleri?.poz_no,
        tanim: k.sozlesme_is_kalemleri?.tanim || '',
        birim: k.sozlesme_is_kalemleri?.birim || '',
        sozlesme_miktar: Number(k.sozlesme_is_kalemleri?.miktar || 0),
      }))
      setEditableKalemler(kalemler)
      setHasChanges(false)
    }
  }, [hakedis])

  // Sözleşme iş kalemlerini getir (Ekleme için)
  const { data: sozlesmeIsKalemleri } = useQuery({
    queryKey: ['sozlesme-kalemleri', hakedis?.sozlesme_id],
    queryFn: async () => {
      const { data } = await api.get(`/sozlesmeler/${hakedis.sozlesme_id}`)
      return data.data.sozlesme_is_kalemleri as any[]
    },
    enabled: !!hakedis?.sozlesme_id && isTaslak
  })

  const saveMutation = useMutation({
    mutationFn: async () => {
      const kalemler = editableKalemler.map(k => ({
        is_kalemi_id: k.is_kalemi_id,
        bu_ay_miktar: k.bu_ay_miktar,
        birim_fiyat: k.birim_fiyat,
        kdv_orani: k.kdv_orani,
        onceki_miktar: k.onceki_miktar
      }))
      const { data } = await api.post(`/hakedisler/${id}/kalemler`, { kalemler })
      return data
    },
    onSuccess: () => {
      message.success('Hakediş kalemleri kaydedildi')
      queryClient.invalidateQueries({ queryKey: ['hakedis', id] })
      setHasChanges(false)
    },
    onError: (err) => message.error(getErrorMessage(err)),
  })

  const approveMutation = useMutation({
    mutationFn: async () => {
      // Eğer değişiklik varsa önce kaydet
      if (hasChanges) {
        await saveMutation.mutateAsync()
      }
      const { data } = await api.put(`/hakedisler/${id}/onayla`)
      return data
    },
    onSuccess: () => {
      message.success('Hakediş onaylandı')
      queryClient.invalidateQueries({ queryKey: ['hakedis', id] })
      queryClient.invalidateQueries({ queryKey: ['hakedisler'] })
    },
    onError: (err) => message.error(getErrorMessage(err)),
  })

  const unapproveMutation = useMutation({
    mutationFn: async () => {
      return api.put(`/hakedisler/${id}/onay-iptal`)
    },
    onSuccess: () => {
      message.success('Hakediş onayı iptal edildi, tekrar düzenlenebilir.')
      queryClient.invalidateQueries({ queryKey: ['hakedis', id] })
      queryClient.invalidateQueries({ queryKey: ['hakedisler'] })
    },
    onError: (err) => message.error(getErrorMessage(err, 'İşlem başarısız')),
  })

  const handleMiktarChange = (index: number, value: number | null) => {
    const updated = [...editableKalemler]
    updated[index] = { ...updated[index], bu_ay_miktar: value || 0 }
    setEditableKalemler(updated)
    setHasChanges(true)
  }

  const handleFiyatChange = (index: number, value: number | null) => {
    const updated = [...editableKalemler]
    updated[index] = { ...updated[index], birim_fiyat: value || 0 }
    setEditableKalemler(updated)
    setHasChanges(true)
  }

  const handleKdvChange = (index: number, value: number | null) => {
    const updated = [...editableKalemler]
    updated[index] = { ...updated[index], kdv_orani: value || 0 }
    setEditableKalemler(updated)
    setHasChanges(true)
  }

  const handleAddItem = () => {
    const kalem = sozlesmeIsKalemleri?.find(k => k.id === selectedKalemId)
    if (kalem) {
      const alreadyExists = editableKalemler.find(ek => ek.is_kalemi_id === kalem.id)
      if (alreadyExists) {
        message.warning('Bu kalem zaten hakedişe eklenmiş')
        return
      }

      const newKalem: EditableKalem = {
        is_kalemi_id: kalem.id,
        onceki_miktar: 0,
        bu_ay_miktar: 0,
        birim_fiyat: Number(kalem.birim_fiyat),
        kdv_orani: Number(kalem.kdv_orani || 20),
        poz_no: kalem.poz_no,
        tanim: kalem.tanim,
        birim: kalem.birim,
        sozlesme_miktar: Number(kalem.miktar)
      }
      setEditableKalemler([...editableKalemler, newKalem])
      setHasChanges(true)
      setAddModalOpen(false)
      setSelectedKalemId(undefined)
    }
  }

  const handleRemoveItem = (index: number) => {
    const updated = [...editableKalemler]
    updated.splice(index, 1)
    setEditableKalemler(updated)
    setHasChanges(true)
  }

  // Hesaplamalar
  const araToplam = editableKalemler.reduce((sum, k) => sum + k.bu_ay_miktar * k.birim_fiyat, 0)
  const kdvToplam = editableKalemler.reduce((sum, k) => sum + (k.bu_ay_miktar * k.birim_fiyat * k.kdv_orani / 100), 0)
  const hakedisToplam = araToplam + kdvToplam

  const teminatOrani = Number(hakedis?.sozlesmeler?.teminat_orani || 0)
  const stopajOrani = Number(hakedis?.sozlesmeler?.stopaj_orani || 0)
  
  const teminatKesintisi = araToplam * (teminatOrani / 100)
  const stopajKesintisi = araToplam * (stopajOrani / 100)
  const digerKesintiler = Number(hakedis?.diger_kesintiler || 0)
  const netTutar = hakedisToplam - teminatKesintisi - stopajKesintisi - digerKesintiler

  const handlePdfDownload = React.useCallback(async () => {
    try {
      const { data } = await api.get(`/hakedisler/${id}/pdf`, { responseType: 'blob' })
      const blob = new Blob([data], { type: 'application/pdf' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `hakedis_${hakedis?.hakedis_no || id}.pdf`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch {
      message.error('PDF indirilirken hata oluştu')
    }
  }, [id, hakedis?.hakedis_no])

  const actions = useMemo(() => (
    <Space>
      <Button 
        icon={<ArrowLeftOutlined />} 
        onClick={() => navigate('/hakedisler')}
        type="text"
      />
      <Button
        icon={<FilePdfOutlined />}
        onClick={handlePdfDownload}
      >
        PDF İndir
      </Button>
      {isTaslak && (
        <Space>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={() => saveMutation.mutate()}
            loading={saveMutation.isPending}
            disabled={editableKalemler.length === 0}
          >
            Kaydet
          </Button>
          <Popconfirm
            title="Hakediş onayla"
            description={hasChanges ? "Hakediş önce kaydedilecek, sonra onaylanacaktır. Onaylıyor musunuz?" : "Hakediş onaylanacak ve cari hareket oluşturulacak. Onaylıyor musunuz?"}
            onConfirm={() => approveMutation.mutate()}
            okText="Onayla"
            cancelText="Vazgeç"
          >
            <Button
              icon={<CheckOutlined />}
              loading={approveMutation.isPending || saveMutation.isPending}
              style={{ backgroundColor: '#52c41a', borderColor: '#52c41a', color: '#fff' }}
            >
              Onayla
            </Button>
          </Popconfirm>
        </Space>
      )}
      {hakedis?.durum === 'onaylandi' && (
        <Popconfirm
          title="Hakediş onayı iptal edilecek ve cari hareketi silinecek. Emin misiniz?"
          onConfirm={() => unapproveMutation.mutate()}
          okText="Evet"
          cancelText="Hayır"
        >
          <Button
            icon={<RollbackOutlined />}
            loading={unapproveMutation.isPending}
            danger
          >
            Onaydan Geri Al
          </Button>
        </Popconfirm>
      )}
    </Space>
  ), [navigate, handlePdfDownload, isTaslak, hakedis?.durum, hasChanges, editableKalemler.length, saveMutation.isPending, approveMutation.isPending, unapproveMutation.isPending])

  usePageSettings(hakedis ? `Hakediş #${hakedis.hakedis_no}` : 'Hakediş Detayı', actions)

  const columns = [
    { title: 'Poz No', dataIndex: 'poz_no', key: 'poz_no', width: 80 },
    { title: 'Tanım', dataIndex: 'tanim', key: 'tanim' },
    { title: 'Birim', dataIndex: 'birim', key: 'birim', width: 70 },
    {
      title: 'Sözleşme Mik.',
      dataIndex: 'sozlesme_miktar',
      key: 'sozlesme_miktar',
      align: 'right' as const,
      width: 100,
      render: (v: number) => trNumberFormatter(v),
    },
    {
      title: 'Önceki Toplam',
      dataIndex: 'onceki_miktar',
      key: 'onceki_miktar',
      align: 'right' as const,
      width: 110,
      render: (v: number) => trNumberFormatter(v),
    },
    {
      title: 'Bu Ay Miktar',
      key: 'bu_ay_miktar',
      align: 'right' as const,
      width: 120,
      render: (_: unknown, _r: EditableKalem, index: number) => {
        const kalem = editableKalemler[index]
        if (!kalem) return null
        return isTaslak ? (
          <InputNumber
            value={kalem.bu_ay_miktar}
            min={0}
            step={0.001}
            onChange={(v) => handleMiktarChange(index, v as number | null)}
            size="small"
            style={{ width: '100%' }}
            formatter={trNumberFormatter}
            parser={trNumberParser}
          />
        ) : (
          trNumberFormatter(kalem.bu_ay_miktar)
        )
      },
    },
    {
      title: 'Birim Fiyat',
      key: 'birim_fiyat',
      align: 'right' as const,
      width: 120,
      render: (_: unknown, _r: EditableKalem, index: number) => {
        const kalem = editableKalemler[index]
        if (!kalem) return null
        return isTaslak ? (
          <InputNumber
            value={kalem.birim_fiyat}
            min={0}
            step={0.01}
            onChange={(v) => handleFiyatChange(index, v as number | null)}
            size="small"
            style={{ width: '100%' }}
            formatter={trMoneyFormatter}
            parser={trNumberParser}
          />
        ) : (
          <MoneyDisplay amount={kalem.birim_fiyat} />
        )
      },
    },
    {
      title: 'Matrah',
      key: 'matrah',
      align: 'right' as const,
      width: 110,
      render: (_: unknown, _r: EditableKalem, index: number) => {
        const kalem = editableKalemler[index]
        if (!kalem) return null
        return <MoneyDisplay amount={kalem.bu_ay_miktar * kalem.birim_fiyat} />
      },
    },
    {
      title: 'KDV (%)',
      key: 'kdv_orani',
      align: 'right' as const,
      width: 80,
      render: (_: unknown, _r: EditableKalem, index: number) => {
        const kalem = editableKalemler[index]
        if (!kalem) return null
        return isTaslak ? (
          <InputNumber
            value={kalem.kdv_orani}
            min={0}
            max={100}
            onChange={(v) => handleKdvChange(index, v as number | null)}
            size="small"
            style={{ width: '100%' }}
          />
        ) : (
          `%${kalem.kdv_orani}`
        )
      },
    },
    {
      title: 'KDVli Tutar',
      key: 'kdvli_tutar',
      align: 'right' as const,
      width: 120,
      render: (_: unknown, _r: EditableKalem, index: number) => {
        const kalem = editableKalemler[index]
        if (!kalem) return null
        const tutar = kalem.bu_ay_miktar * kalem.birim_fiyat
        return <MoneyDisplay amount={tutar * (1 + kalem.kdv_orani / 100)} />
      },
    },
    {
      title: '',
      key: 'delete',
      width: 40,
      render: (_: any, __: any, index: number) => isTaslak && (
        <Button 
          type="text" 
          danger 
          icon={<DeleteOutlined />} 
          size="small" 
          onClick={() => handleRemoveItem(index)} 
        />
      )
    }
  ]

  return (
    <div>
      <Card loading={isLoading} variant="borderless" style={{ marginBottom: 24 }}>
        {hakedis && (
          <Descriptions bordered column={{ xxl: 3, xl: 3, lg: 3, md: 2, sm: 1, xs: 1 }} size="small">
            <Descriptions.Item label="Firma">{hakedis.sozlesmeler?.firmalar?.unvan}</Descriptions.Item>
            <Descriptions.Item label="Sözleşme">{hakedis.sozlesmeler?.konu}</Descriptions.Item>
            <Descriptions.Item label="Durum">
              <Tag color={durumRenk[hakedis.durum]}>{durumLabel[hakedis.durum]}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Dönem">
              {hakedis.donem_baslangic ? dayjs(hakedis.donem_baslangic).format('MM/YYYY') : '-'}
            </Descriptions.Item>
            <Descriptions.Item label="Onay Tarihi">
              {hakedis.onay_tarihi ? dayjs(hakedis.onay_tarihi).format('DD.MM.YYYY') : '-'}
            </Descriptions.Item>
            <Descriptions.Item label="Açıklama" span={2}>
              {hakedis.aciklama || '-'}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Card>

      {/* Kesinti Özet Kartları */}
      <Row gutter={[12, 12]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={4}>
          <Card variant="borderless" size="small" className="shadow-sm">
            <Statistic title="Hakediş Toplam" value={hakedisToplam} suffix="TL" formatter={(v) => trMoneyFormatter(v as number)} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={4}>
          <Card variant="borderless" size="small" className="shadow-sm">
            <Statistic
              title={`Teminat (%${teminatOrani})`}
              value={teminatKesintisi}
              suffix="TL"
              formatter={(v) => trMoneyFormatter(v as number)}
              styles={{ content: { color: '#cf1322' } }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={4}>
          <Card variant="borderless" size="small" className="shadow-sm">
            <Statistic
              title={`Stopaj (%${stopajOrani})`}
              value={stopajKesintisi}
              suffix="TL"
              formatter={(v) => trMoneyFormatter(v as number)}
              styles={{ content: { color: '#cf1322' } }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={4}>
          <Card variant="borderless" size="small" className="shadow-sm">
            <Statistic
              title="Diğer Kesintiler"
              value={digerKesintiler}
              suffix="TL"
              formatter={(v) => trMoneyFormatter(v as number)}
              styles={{ content: { color: '#cf1322' } }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Card variant="borderless" size="small" className="shadow-sm" style={{ background: '#f6ffed' }}>
            <Statistic
              title="Net Ödenecek"
              value={netTutar}
              suffix="TL"
              formatter={(v) => trMoneyFormatter(v as number)}
              styles={{ content: { color: '#3f8600', fontWeight: 'bold' } }}
            />
          </Card>
        </Col>
      </Row>

      {/* İş Kalemleri Tablosu */}
      <Card 
        title="İş Kalemleri" 
        variant="borderless" 
        styles={{ body: { padding: 0 } }}
        className="shadow-sm"
        extra={isTaslak && (
          <Button 
            type="dashed" 
            icon={<PlusOutlined />} 
            onClick={() => setAddModalOpen(true)}
          >
            İş Kalemi Ekle
          </Button>
        )}
      >
        <Table
          columns={columns}
          dataSource={editableKalemler}
          rowKey="is_kalemi_id"
          loading={isLoading}
          pagination={false}
          size="small"
          scroll={{ x: 1100 }}
          summary={() => (
            <Table.Summary fixed>
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={7} align="right">
                  <strong>Matrah Toplamı:</strong>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={7}>
                  <strong><MoneyDisplay amount={araToplam} /></strong>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={8} align="right">
                  <strong>KDVli Toplam:</strong>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={9}>
                  <strong><MoneyDisplay amount={hakedisToplam} /></strong>
                </Table.Summary.Cell>
                {isTaslak && <Table.Summary.Cell index={10} />}
              </Table.Summary.Row>
            </Table.Summary>
          )}
        />
      </Card>

      <Modal
        title="Sözleşmeden İş Kalemi Ekle"
        open={addModalOpen}
        onCancel={() => setAddModalOpen(false)}
        onOk={handleAddItem}
        okText="Ekle"
        cancelText="İptal"
        destroyOnHidden
        width="min(520px, 95vw)"
      >
        <div style={{ marginTop: 16 }}>
          <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
            Sözleşmede tanımlı olan iş kalemlerinden birini seçin:
          </Text>
          <Select
            style={{ width: '100%' }}
            placeholder="İş kalemi seçin"
            value={selectedKalemId}
            onChange={setSelectedKalemId}
            showSearch
            optionFilterProp="children"
          >
            {sozlesmeIsKalemleri?.filter(k => !editableKalemler.some(ek => ek.is_kalemi_id === k.id)).map(k => (
              <Select.Option key={k.id} value={k.id}>
                {k.poz_no ? `[${k.poz_no}] ` : ''}{k.tanim}
              </Select.Option>
            ))}
          </Select>
        </div>
      </Modal>
    </div>
  )
}
