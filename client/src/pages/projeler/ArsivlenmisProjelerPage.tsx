import React, { useState, useMemo } from 'react'
import { Button, Modal, Form, Input, Space, Tag, Card, Row, Col, Typography, Alert, Descriptions, App } from 'antd'
import { ArrowLeftOutlined, DeleteOutlined, RollbackOutlined, WarningOutlined, InboxOutlined } from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import api from '../../lib/api'
import { getErrorMessage } from '../../lib/apiError'
import { LoadingState } from '../../components/common/LoadingState'
import { EmptyState } from '../../components/common/EmptyState'
import { ErrorState } from '../../components/common/ErrorState'
import { usePageSettings } from '../../contexts/LayoutContext'
import { useProject } from '../../contexts/ProjectContext'
import { usePermissions } from '../../hooks/usePermissions'

const { Text, Paragraph } = Typography

// Sprint proje-silme-akisi (2026-05-24):
// Arşivlenmiş projeler sayfası — iki aksiyon:
//   1) Geri Al   → POST /projeler/:id/geri-al — silindi_mi=false. Reversible.
//   2) Kalıcı Sil → DELETE /projeler/:id      — CASCADE. Geri alınamaz.
//      Yetki kuralı: veri varsa SADECE global admin; boşsa owner da silebilir.
//      Onay guard: kullanıcı proje adını tam yazmalı (typo savunması).

interface ArsivProje {
  id: string
  proje_adi: string
  aciklama?: string
  silindi_mi: boolean
  silinme_tarihi?: string
  silinme_sebebi?: string
  silen_kullanici_id?: string
  durum?: string
  current_user_role?: 'owner' | 'manager' | 'user' | 'admin' | 'staff' | 'viewer' | null
}

export const ArsivlenmisProjelerPage: React.FC = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { refreshProjects, activeProject, setActiveProject } = useProject()
  const { isLegacyGlobalAdmin } = usePermissions()
  const { message: messageApi } = App.useApp()

  const [silProje, setSilProje] = useState<ArsivProje | null>(null)
  const [silForm] = Form.useForm()

  const { data: projeler, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['projeler-arsiv'],
    queryFn: async () => {
      const { data } = await api.get('/projeler', { params: { arsiv: 1 } })
      return data.data as ArsivProje[]
    },
  })

  const onizlemeQuery = useQuery({
    queryKey: ['proje-silme-onizleme', silProje?.id],
    queryFn: async () => {
      const { data } = await api.get(`/projeler/${silProje!.id}/silme-onizleme`)
      return data.data as Record<string, number>
    },
    enabled: !!silProje?.id,
    staleTime: 0,
  })

  const geriAlMutation = useMutation({
    mutationFn: async (projeId: string) => api.post(`/projeler/${projeId}/geri-al`),
    onSuccess: () => {
      messageApi.success('Proje arşivden geri alındı')
      queryClient.invalidateQueries({ queryKey: ['projeler-arsiv'] })
      queryClient.invalidateQueries({ queryKey: ['projeler'] })
      refreshProjects()
    },
    onError: (err: any) => messageApi.error(getErrorMessage(err)),
  })

  const kaliciSilMutation = useMutation({
    mutationFn: async (values: { projeAdiOnay: string }) =>
      api.delete(`/projeler/${silProje!.id}`, { data: values }),
    onSuccess: (res: any) => {
      const silinen = res?.data?.data?.toplam_kayit ?? 0
      messageApi.success(`Proje kalıcı olarak silindi (${silinen} alt kayıt CASCADE ile temizlendi)`)
      queryClient.invalidateQueries({ queryKey: ['projeler-arsiv'] })
      queryClient.invalidateQueries({ queryKey: ['projeler'] })
      // Aktif proje silinen ise temizle
      if (activeProject?.id === silProje?.id) {
        setActiveProject(null)
      }
      refreshProjects()
      setSilProje(null)
      silForm.resetFields()
    },
    onError: (err: any) => messageApi.error(getErrorMessage(err)),
  })

  // Header — geri butonu
  const headerActions = useMemo(
    () => (
      <Button
        icon={<ArrowLeftOutlined />}
        onClick={() => navigate('/projeler')}
        size="middle"
      >
        Proje Listesine Dön
      </Button>
    ),
    [navigate],
  )
  usePageSettings('Arşivlenmiş Projeler', headerActions)

  // Sil modalı için: onay alanı kullanıcı proje adını birebir yazmalı
  const adOnayValue = Form.useWatch('projeAdiOnay', silForm)
  const adEslesiyor = adOnayValue?.trim() === silProje?.proje_adi
  const toplamKayit = Number((onizlemeQuery.data as any)?.toplam_kayit ?? 0)
  const veriVar = toplamKayit > 0
  // "Veri varsa sadece admin silebilir" kuralı — frontend gate (server ayrıca enforce eder)
  const silmeyeYetkili = !veriVar || isLegacyGlobalAdmin

  return (
    <div className="animate-in fade-in duration-500" style={{ fontSize: '13px' }}>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="Bu sayfada arşivlenmiş projeleriniz listelenir."
        description={
          <span>
            <strong>Geri Al</strong> projeyi tekrar aktif yapar. <strong>Kalıcı Sil</strong> projeyi
            ve TÜM bağlı kayıtları (üyeler, faturalar, hakedişler vb.) <strong>geri alınamaz</strong>{' '}
            şekilde siler — veri içeren projelerde yalnızca sistem yöneticisi (admin) gerçekleştirebilir.
          </span>
        }
      />

      <Row gutter={[12, 12]}>
        {isLoading ? (
          <Col span={24}><LoadingState fullHeight /></Col>
        ) : isError ? (
          <Col span={24}><ErrorState error={error} onRetry={() => refetch()} /></Col>
        ) : projeler?.length === 0 ? (
          <Col span={24}>
            <EmptyState description="Arşivlenmiş bir projeniz yok." />
          </Col>
        ) : (
          projeler?.map((p) => (
            <Col xs={24} sm={12} lg={8} key={p.id}>
              <Card
                size="small"
                title={
                  <Space>
                    <InboxOutlined style={{ color: '#94a3b8' }} />
                    <span style={{ fontSize: '14px', fontWeight: 600 }}>{p.proje_adi}</span>
                  </Space>
                }
                extra={<Tag color="default">Arşivde</Tag>}
                actions={[
                  <Button
                    key="restore"
                    type="text"
                    size="small"
                    icon={<RollbackOutlined />}
                    loading={geriAlMutation.isPending && geriAlMutation.variables === p.id}
                    onClick={() => geriAlMutation.mutate(p.id)}
                    data-testid={`restore-project-${p.id}`}
                  >
                    Geri Al
                  </Button>,
                  <Button
                    key="hard-delete"
                    type="text"
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => {
                      setSilProje(p)
                      silForm.resetFields()
                    }}
                    data-testid={`hard-delete-project-${p.id}`}
                  >
                    Kalıcı Sil
                  </Button>,
                ]}
              >
                <div style={{ padding: 0 }}>
                  {p.aciklama && (
                    <Paragraph style={{ color: '#64748b', fontSize: '12px', marginBottom: 8 }} ellipsis={{ rows: 2 }}>
                      {p.aciklama}
                    </Paragraph>
                  )}
                  <Descriptions size="small" column={1} colon={false} labelStyle={{ color: '#94a3b8', fontSize: '11px', width: 90 }} contentStyle={{ fontSize: '12px' }}>
                    <Descriptions.Item label="Arşivlenme">
                      {p.silinme_tarihi ? dayjs(p.silinme_tarihi).format('DD.MM.YYYY HH:mm') : '—'}
                    </Descriptions.Item>
                    {p.silinme_sebebi && (
                      <Descriptions.Item label="Sebep">
                        <Text type="secondary" style={{ fontSize: '12px' }}>{p.silinme_sebebi}</Text>
                      </Descriptions.Item>
                    )}
                  </Descriptions>
                </div>
              </Card>
            </Col>
          ))
        )}
      </Row>

      {/* Kalıcı silme onay modalı */}
      <Modal
        title={
          <Space>
            <WarningOutlined style={{ color: '#dc2626' }} />
            <span>Projeyi Kalıcı Olarak Sil</span>
          </Space>
        }
        open={!!silProje}
        onCancel={() => { setSilProje(null); silForm.resetFields() }}
        onOk={() => silForm.submit()}
        okText="KALICI OLARAK SİL"
        okButtonProps={{
          danger: true,
          loading: kaliciSilMutation.isPending,
          disabled: !adEslesiyor || !silmeyeYetkili || onizlemeQuery.isLoading,
        }}
        cancelText="Vazgeç"
        width="min(640px, 95vw)"
        destroyOnHidden
        centered
        getContainer={() => document.body}
      >
        {silProje && (
          <>
            <Alert
              type="error"
              showIcon
              style={{ marginBottom: 12 }}
              message={<span>Bu işlem <strong>GERİ ALINAMAZ</strong></span>}
              description={
                <span>
                  <strong>{silProje.proje_adi}</strong> ve tüm bağlı veriler (üyeler, faturalar,
                  hakedişler, banka hareketleri vb.) veritabanından kalıcı olarak silinecektir.
                  CASCADE silme zincirleri devreye girecektir.
                </span>
              }
            />

            {onizlemeQuery.isLoading ? (
              <div style={{ padding: 16, textAlign: 'center', color: '#64748b' }}>
                Etkilenen kayıt sayıları yükleniyor...
              </div>
            ) : onizlemeQuery.data ? (
              veriVar ? (
                <>
                  <Descriptions
                    size="small"
                    column={2}
                    bordered
                    style={{ marginBottom: 12 }}
                    title={<span><WarningOutlined style={{ color: '#dc2626' }} /> Silinecek kayıtlar ({toplamKayit} toplam)</span>}
                  >
                    {Object.entries(onizlemeQuery.data)
                      .filter(([k, v]) => k !== 'toplam_kayit' && Number(v) > 0)
                      .sort((a, b) => Number(b[1]) - Number(a[1]))
                      .map(([k, v]) => (
                        <Descriptions.Item key={k} label={k}>{String(v)}</Descriptions.Item>
                      ))}
                  </Descriptions>
                  {!isLegacyGlobalAdmin && (
                    <Alert
                      type="warning"
                      showIcon
                      style={{ marginBottom: 12 }}
                      message="Bu işlemi yalnızca sistem yöneticisi (admin) gerçekleştirebilir"
                      description="Veri içeren projeyi kalıcı silmek için bir admin ile iletişime geçin veya projeyi arşivde bırakın."
                    />
                  )}
                </>
              ) : (
                <Alert
                  type="success"
                  showIcon
                  style={{ marginBottom: 12 }}
                  message="Bu proje boş — alt kayıt yok"
                  description="Owner olarak güvenle kalıcı silebilirsiniz."
                />
              )
            ) : null}

            <Form
              form={silForm}
              layout="vertical"
              onFinish={(v) => kaliciSilMutation.mutate(v)}
              autoComplete="off"
              size="small"
            >
              <Form.Item
                name="projeAdiOnay"
                label={
                  <span style={{ fontWeight: 500 }}>
                    Onaylamak için proje adını birebir yazın: <Text code>{silProje.proje_adi}</Text>
                  </span>
                }
                rules={[
                  { required: true, message: 'Proje adı zorunlu' },
                  {
                    validator: (_r, v) =>
                      v && v.trim() === silProje.proje_adi
                        ? Promise.resolve()
                        : Promise.reject(new Error('Yazdığınız ad eşleşmiyor')),
                  },
                ]}
              >
                <Input
                  placeholder={silProje.proje_adi}
                  autoComplete="off"
                  data-testid="hard-delete-confirm-input"
                />
              </Form.Item>
            </Form>
          </>
        )}
      </Modal>
    </div>
  )
}
