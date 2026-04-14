import React, { useState, useEffect } from 'react'
import { Card, Descriptions, Table, Button, InputNumber, Tag, Row, Col, Statistic, Space, message, Popconfirm } from 'antd'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckOutlined, SaveOutlined, FilePdfOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import api from '../../lib/api'
import { PageHeader } from '../../components/common/PageHeader'
import { MoneyDisplay } from '../../components/common/MoneyDisplay'

interface HakedisKalemi {
  id: string
  is_kalemi_id: string
  onceki_miktar: number
  bu_ay_miktar: number
  toplam_miktar: number
  birim_fiyat: number
  bu_ay_tutar: number
  toplam_tutar: number
  sozlesme_is_kalemleri?: {
    poz_no?: string
    tanim: string
    birim: string
    miktar: number
  }
}

interface EditableKalem {
  is_kalemi_id: string
  onceki_miktar: number
  bu_ay_miktar: number
  birim_fiyat: number
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
  const [editableKalemler, setEditableKalemler] = useState<EditableKalem[]>([])
  const [hasChanges, setHasChanges] = useState(false)

  const { data: hakedis, isLoading } = useQuery({
    queryKey: ['hakedis', id],
    queryFn: async () => {
      const { data } = await api.get(`/hakedisler/${id}`)
      return data.data
    },
  })

  // Kalemleri editable state'e çevir
  useEffect(() => {
    if (hakedis?.hakedis_kalemleri) {
      const kalemler = hakedis.hakedis_kalemleri.map((k: HakedisKalemi) => ({
        is_kalemi_id: k.is_kalemi_id,
        onceki_miktar: Number(k.onceki_miktar),
        bu_ay_miktar: Number(k.bu_ay_miktar),
        birim_fiyat: Number(k.birim_fiyat),
        poz_no: k.sozlesme_is_kalemleri?.poz_no,
        tanim: k.sozlesme_is_kalemleri?.tanim || '',
        birim: k.sozlesme_is_kalemleri?.birim || '',
        sozlesme_miktar: Number(k.sozlesme_is_kalemleri?.miktar || 0),
      }))
      setEditableKalemler(kalemler)
      setHasChanges(false)
    }
  }, [hakedis])

  const saveMutation = useMutation({
    mutationFn: async () => {
      const kalemler = editableKalemler.map(k => ({
        is_kalemi_id: k.is_kalemi_id,
        bu_ay_miktar: k.bu_ay_miktar,
        birim_fiyat: k.birim_fiyat,
      }))
      const { data } = await api.post(`/hakedisler/${id}/kalemler`, { kalemler })
      return data
    },
    onSuccess: () => {
      message.success('Hakediş kalemleri kaydedildi')
      queryClient.invalidateQueries({ queryKey: ['hakedis', id] })
      setHasChanges(false)
    },
    onError: (err: any) => message.error(err.message || 'Hata oluştu'),
  })

  const approveMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.put(`/hakedisler/${id}/onayla`)
      return data
    },
    onSuccess: () => {
      message.success('Hakediş onaylandı')
      queryClient.invalidateQueries({ queryKey: ['hakedis', id] })
      queryClient.invalidateQueries({ queryKey: ['hakedisler'] })
    },
    onError: (err: any) => message.error(err.message || 'Hata oluştu'),
  })

  const handleMiktarChange = (index: number, value: number | null) => {
    const updated = [...editableKalemler]
    updated[index] = { ...updated[index], bu_ay_miktar: value || 0 }
    setEditableKalemler(updated)
    setHasChanges(true)
  }

  // Hesaplamalar
  const toplamTutar = editableKalemler.reduce((sum, k) => sum + k.bu_ay_miktar * k.birim_fiyat, 0)
  const teminatOrani = Number(hakedis?.sozlesmeler?.teminat_orani || 0)
  const stopajOrani = Number(hakedis?.sozlesmeler?.stopaj_orani || 0)
  const teminatKesintisi = toplamTutar * (teminatOrani / 100)
  const stopajKesintisi = toplamTutar * (stopajOrani / 100)
  const digerKesintiler = Number(hakedis?.diger_kesintiler || 0)
  const netTutar = toplamTutar - teminatKesintisi - stopajKesintisi - digerKesintiler

  const isTaslak = hakedis?.durum === 'taslak'

  const columns = [
    { title: 'Poz No', dataIndex: 'poz_no', key: 'poz_no', width: 80 },
    { title: 'Tanım', dataIndex: 'tanim', key: 'tanim' },
    { title: 'Birim', dataIndex: 'birim', key: 'birim', width: 70 },
    {
      title: 'Sözleşme Miktarı',
      dataIndex: 'sozlesme_miktar',
      key: 'sozlesme_miktar',
      width: 120,
      render: (v: number) => v?.toLocaleString('tr-TR'),
    },
    {
      title: 'Önceki Toplam',
      dataIndex: 'onceki_miktar',
      key: 'onceki_miktar',
      width: 110,
      render: (v: number) => v?.toLocaleString('tr-TR'),
    },
    {
      title: 'Bu Ay Miktar',
      key: 'bu_ay_miktar',
      width: 130,
      render: (_: unknown, _r: EditableKalem, index: number) => {
        const kalem = editableKalemler[index]
        if (!kalem) return null
        return isTaslak ? (
          <InputNumber
            value={kalem.bu_ay_miktar}
            min={0}
            step={0.001}
            onChange={(v) => handleMiktarChange(index, v)}
            size="small"
            style={{ width: '100%' }}
          />
        ) : (
          kalem.bu_ay_miktar?.toLocaleString('tr-TR')
        )
      },
    },
    {
      title: 'Toplam Miktar',
      key: 'toplam_miktar',
      width: 110,
      render: (_: unknown, _r: EditableKalem, index: number) => {
        const kalem = editableKalemler[index]
        if (!kalem) return null
        return (kalem.onceki_miktar + kalem.bu_ay_miktar).toLocaleString('tr-TR')
      },
    },
    {
      title: 'Birim Fiyat',
      dataIndex: 'birim_fiyat',
      key: 'birim_fiyat',
      width: 110,
      render: (v: number) => <MoneyDisplay amount={v} />,
    },
    {
      title: 'Bu Ay Tutar',
      key: 'bu_ay_tutar',
      width: 120,
      render: (_: unknown, _r: EditableKalem, index: number) => {
        const kalem = editableKalemler[index]
        if (!kalem) return null
        return <MoneyDisplay amount={kalem.bu_ay_miktar * kalem.birim_fiyat} />
      },
    },
    {
      title: 'Kümülatif Tutar',
      key: 'kumulatif_tutar',
      width: 130,
      render: (_: unknown, _r: EditableKalem, index: number) => {
        const kalem = editableKalemler[index]
        if (!kalem) return null
        return <MoneyDisplay amount={(kalem.onceki_miktar + kalem.bu_ay_miktar) * kalem.birim_fiyat} />
      },
    },
  ]

  return (
    <div>
      <PageHeader
        title={hakedis ? `Hakediş #${hakedis.hakedis_no}` : 'Hakediş Detayı'}
        showBack
        backPath="/hakedisler"
        extra={
          <Space>
            <Button
              icon={<FilePdfOutlined />}
              onClick={() => window.open(`${import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1'}/hakedisler/${id}/pdf`, '_blank')}
            >
              PDF İndir
            </Button>
            {isTaslak && (
              <>
                <Button
                  type="primary"
                  icon={<SaveOutlined />}
                  onClick={() => saveMutation.mutate()}
                  loading={saveMutation.isPending}
                  disabled={!hasChanges}
                >
                  Kaydet
                </Button>
                <Popconfirm
                  title="Hakediş onaylanacak ve cari hareket oluşturulacak. Onaylıyor musunuz?"
                  onConfirm={() => approveMutation.mutate()}
                  okText="Onayla"
                  cancelText="Vazgeç"
                >
                  <Button
                    icon={<CheckOutlined />}
                    loading={approveMutation.isPending}
                  >
                    Onayla
                  </Button>
                </Popconfirm>
              </>
            )}
          </Space>
        }
      />

      <Card loading={isLoading} style={{ marginBottom: 24 }}>
        {hakedis && (
          <Descriptions bordered column={{ xxl: 3, xl: 3, lg: 3, md: 2, sm: 1, xs: 1 }} size="small">
            <Descriptions.Item label="Firma">{hakedis.sozlesmeler?.firmalar?.unvan}</Descriptions.Item>
            <Descriptions.Item label="Sözleşme">{hakedis.sozlesmeler?.konu}</Descriptions.Item>
            <Descriptions.Item label="Durum">
              <Tag color={durumRenk[hakedis.durum]}>{durumLabel[hakedis.durum]}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Dönem">
              {hakedis.donem_baslangic ? dayjs(hakedis.donem_baslangic).format('DD.MM.YYYY') : '-'}
              {' - '}
              {hakedis.donem_bitis ? dayjs(hakedis.donem_bitis).format('DD.MM.YYYY') : '-'}
            </Descriptions.Item>
            {hakedis.onay_tarihi && (
              <Descriptions.Item label="Onay Tarihi">
                {dayjs(hakedis.onay_tarihi).format('DD.MM.YYYY')}
              </Descriptions.Item>
            )}
            {hakedis.aciklama && (
              <Descriptions.Item label="Açıklama" span={3}>{hakedis.aciklama}</Descriptions.Item>
            )}
          </Descriptions>
        )}
      </Card>

      {/* Kesinti Özet Kartları */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={4}>
          <Card size="small">
            <Statistic title="Bu Ay Toplam" value={toplamTutar} suffix="TL" precision={2} />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic
              title={`Teminat (%${teminatOrani})`}
              value={teminatKesintisi}
              suffix="TL"
              precision={2}
              valueStyle={{ color: '#cf1322' }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic
              title={`Stopaj (%${stopajOrani})`}
              value={stopajKesintisi}
              suffix="TL"
              precision={2}
              valueStyle={{ color: '#cf1322' }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic
              title="Diğer Kesintiler"
              value={digerKesintiler}
              suffix="TL"
              precision={2}
              valueStyle={{ color: '#cf1322' }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small">
            <Statistic
              title="Net Tutar"
              value={netTutar}
              suffix="TL"
              precision={2}
              valueStyle={{ color: '#3f8600', fontWeight: 'bold' }}
            />
          </Card>
        </Col>
      </Row>

      {/* İş Kalemleri Tablosu */}
      <Card title="İş Kalemleri" styles={{ body: { padding: 0 } }}>
        <Table
          columns={columns}
          dataSource={editableKalemler}
          rowKey="is_kalemi_id"
          loading={isLoading}
          pagination={false}
          size="small"
          scroll={{ x: 1200 }}
          summary={() => (
            <Table.Summary fixed>
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={8} align="right">
                  <strong>Bu Ay Toplam:</strong>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={8}>
                  <strong><MoneyDisplay amount={toplamTutar} /></strong>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={9} />
              </Table.Summary.Row>
            </Table.Summary>
          )}
        />
      </Card>
    </div>
  )
}
