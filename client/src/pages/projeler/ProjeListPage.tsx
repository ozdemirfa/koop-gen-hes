import React, { useState } from 'react'
import { Button, Modal, Form, Input, Space, Tag, DatePicker, Card, Row, Col, Select, InputNumber, Divider, Typography, Table, Popconfirm, App } from 'antd'
import { PlusOutlined, EditOutlined, EyeOutlined, ProjectOutlined, DeleteOutlined, TeamOutlined } from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  useMyInvitations,
  useAcceptMyInvitation,
  useRejectMyInvitation,
} from '../../hooks/useMyInvitations'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import api from '../../lib/api'
import { getErrorMessage } from '../../lib/apiError'
import { ProjectSelector } from '../../components/common/ProjectSelector'
import { LoadingState } from '../../components/common/LoadingState'
import { EmptyState } from '../../components/common/EmptyState'
import { ErrorState } from '../../components/common/ErrorState'
import { trNumberFormatter, trNumberParser } from '../../lib/format'
import { usePageSettings } from '../../contexts/LayoutContext'
import { useProject } from '../../contexts/ProjectContext'
import { usePermissions } from '../../hooks/usePermissions'

const { Text } = Typography

interface Blok {
  id?: string
  blok_adi: string
  toplam_daire: number
  daire_baslangic_no?: number
  aciklama?: string
}

interface Proje {
  id: string
  proje_adi: string
  aciklama?: string
  baslangic_tarihi?: string
  bitis_tarihi?: string
  toplam_butce?: number
  durum: 'planli' | 'devam_ediyor' | 'tamamlandi' | 'iptal'
  bloklar?: Blok[]
}

const durumRenkleri: Record<string, string> = {
  planli: 'blue',
  devam_ediyor: 'orange',
  tamamlandi: 'green',
  iptal: 'red',
}

const durumEtiketleri: Record<string, string> = {
  planli: 'Planlı',
  devam_ediyor: 'Devam Ediyor',
  tamamlandi: 'Tamamlandı',
  iptal: 'İptal',
}

export const ProjeListPage: React.FC = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { refreshProjects, setActiveProject } = useProject()
  // Sprint role-system-modernization (PR-C):
  //   - "Yeni Proje" oluşturma: hâlâ legacy global admin'e ait. PR-D ile
  //     birlikte yeniden değerlendirilecek (kooperatif başkanı/owner senaryosu).
  //   - Proje düzenleme (edit) + üyelik yönetimi: artık proje yöneticileri
  //     (owner + manager) da yapabilir — `isManager`.
  const { canCreateProjects, isManager, canManageUsers } = usePermissions()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingProje, setEditingProje] = useState<Proje | null>(null)
  const [form] = Form.useForm()
  const { message: messageApi } = App.useApp()

  const { data: projeler, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['projeler'],
    queryFn: async () => {
      const { data } = await api.get('/projeler')
      return data.data as Proje[]
    },
  })

  const saveMutation = useMutation({
    mutationFn: async (values: any) => {
      const payload = {
        ...values,
        baslangic_tarihi: values.baslangic_tarihi ? values.baslangic_tarihi.format('YYYY-MM-DD') : null,
        bitis_tarihi: values.bitis_tarihi ? values.bitis_tarihi.format('YYYY-MM-DD') : null,
      }
      if (editingProje) {
        return await api.put(`/projeler/${editingProje.id}`, payload)
      }
      return await api.post('/projeler', payload)
    },
    onSuccess: () => {
      messageApi.success('Proje kaydedildi')
      queryClient.invalidateQueries({ queryKey: ['projeler'] })
      refreshProjects()
      setModalOpen(false)
      form.resetFields()
      setEditingProje(null)
    },
    onError: (err: any) => {
      if (err?.details && Array.isArray(err.details)) {
        form.setFields(err.details.map((detail: { field: string; message: string }) => ({
          name: detail.field.includes('.') ? detail.field.split('.') : detail.field,
          errors: [detail.message]
        })))
      } else {
        messageApi.error(getErrorMessage(err))
      }
    },
  })

  const headerActions = React.useMemo(() => {
    // PR-B: canCreateProjects → admin VEYA yetkili. Yetkisi yoksa buton gizlenir.
    if (!canCreateProjects) return null
    return (
      <Button
        type="primary"
        icon={<PlusOutlined />}
        data-testid="add-new-project"
        onClick={() => {
          setModalOpen(true)
          setEditingProje(null)
          // Küçük bir delay ile formun mount olduğundan emin oluyoruz (forceRender olsa bile garantiye almak iyidir)
          setTimeout(() => {
            form.resetFields()
            form.setFieldsValue({
              durum: 'planli',
              bloklar: [{ blok_adi: '', toplam_daire: 0, daire_baslangic_no: 1 }]
            })
          }, 0)
        }}
        size="middle"
      >
        Yeni Proje
      </Button>
    )
  }, [form, canCreateProjects])

  usePageSettings('İnşaat Projeleri', headerActions)

  const openEditModal = async (proje: Proje) => {
    try {
      const { data } = await api.get(`/projeler/${proje.id}`)
      const fullProje = data.data as Proje
      setEditingProje(fullProje)
      setModalOpen(true)
      
      setTimeout(() => {
        form.resetFields() 
        form.setFieldsValue({
          ...fullProje,
          baslangic_tarihi: fullProje.baslangic_tarihi ? dayjs(fullProje.baslangic_tarihi) : null,
          bitis_tarihi: fullProje.bitis_tarihi ? dayjs(fullProje.bitis_tarihi) : null,
        })
      }, 0)
    } catch (err) {
      messageApi.error('Proje detayları yüklenemedi')
    }
  }

  return (
    <div className="animate-in fade-in duration-500" style={{ fontSize: '13px' }}>
      <div style={{ marginBottom: '16px' }}>
        <ProjectSelector inline />
      </div>
      
      <Row gutter={[12, 12]}>
        {isLoading ? (
          <Col span={24}><LoadingState fullHeight /></Col>
        ) : isError ? (
          <Col span={24}><ErrorState error={error} onRetry={() => refetch()} /></Col>
        ) : projeler?.length === 0 ? (
          <Col span={24}>
            {/* A4-01 (2026-05-11): action-oriented copy + primary CTA */}
            {/* PR-B: canCreateProjects → yetkili veya admin. Yetkisi yoksa sadece boş mesaj. */}
            <EmptyState
              description={
                canCreateProjects
                  ? 'Henüz bir projeniz yok. Başlamak için ilk projenizi oluşturun.'
                  : 'Henüz bir projeye davet edilmediniz. Proje oluşturmak için yetkili rolü gereklidir.'
              }
              action={
                canCreateProjects ? (
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={() => { setEditingProje(null); form.resetFields(); setModalOpen(true) }}
                  >
                    İlk Projeyi Oluştur
                  </Button>
                ) : undefined
              }
            />
          </Col>
        ) : (
          projeler?.map((p) => (
            <Col xs={24} sm={12} lg={8} key={p.id}>
              <Card
                hoverable
                variant="borderless"
                size="small"
                style={{ cursor: 'default' }}
                data-testid={`project-card-${p.id}`}
                actions={[
                  <Button
                    type="text"
                    size="small"
                    key="edit"
                    icon={<EditOutlined />}
                    disabled={!isManager}
                    title={!isManager ? 'Yetki yok (manager+ gerekli)' : 'Düzenle'}
                    data-testid={`edit-project-${p.id}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      openEditModal(p)
                    }}
                  />,
                  <div
                    key="view"
                    style={{ color: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', cursor: 'pointer' }}
                    data-testid={`view-project-${p.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/projeler/${p.id}`)
                    }}
                  >
                    <EyeOutlined />
                  </div>,
                  ...(canManageUsers
                    ? [
                        <div
                          key="uyeler"
                          style={{ color: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', cursor: 'pointer' }}
                          title="Üyelikleri Yönet"
                          onClick={(e) => {
                            e.stopPropagation()
                            // Sprint role-system-modernization (PR-D):
                            // Kullanıcı Yönetimi artık aktif projeye göre çalışır;
                            // önce projeyi aktif et, sonra sayfaya git.
                            setActiveProject(p as any)
                            navigate('/admin/kullanicilar')
                          }}
                        >
                          <TeamOutlined />
                        </div>,
                      ]
                    : []),
                ]}
                title={
                  <div 
                    style={{ color: 'inherit', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}
                    data-testid="card-title"
                    onClick={() => navigate(`/projeler/${p.id}`)}
                  >
                    <ProjectOutlined style={{ fontSize: '14px' }} />
                    <span style={{ fontSize: '14px', fontWeight: 600 }}>{p.proje_adi}</span>
                  </div>
                }
                extra={<Tag color={durumRenkleri[p.durum]} style={{ marginRight: 0, fontSize: '11px' }}>{durumEtiketleri[p.durum]}</Tag>}
                styles={{ body: { padding: 0 } }}
              >
                <div 
                  style={{ display: 'block', padding: '12px', color: 'inherit', cursor: 'pointer' }} 
                  data-testid="card-body"
                  onClick={() => navigate(`/projeler/${p.id}`)}
                >
                  <div style={{ height: 36, overflow: 'hidden', textOverflow: 'ellipsis', color: '#64748b', fontSize: '12px', lineHeight: '1.4' }}>
                    {p.aciklama || 'Açıklama yok'}
                  </div>
                  <div style={{ marginTop: 12, borderTop: '1px solid #f1f5f9', paddingTop: 8 }}>
                    <Text type="secondary" style={{ fontSize: '11px' }}>
                      Tarih: {p.baslangic_tarihi ? dayjs(p.baslangic_tarihi).format('DD.MM.YYYY') : '?'} - {p.bitis_tarihi ? dayjs(p.bitis_tarihi).format('DD.MM.YYYY') : '?'}
                    </Text>
                  </div>
                </div>
              </Card>
            </Col>
          ))
        )}
      </Row>

      <BekleyenDavetlerSection />

      <Modal
        title={editingProje ? 'Proje Düzenle' : 'Yeni Proje'}
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false)
          setEditingProje(null)
        }}
        onOk={() => form.submit()}
        confirmLoading={saveMutation.isPending}
        width="min(700px, 95vw)"
        forceRender
        okText="Kaydet"
        cancelText="İptal"
        styles={{ body: { paddingTop: 8 } }}
        centered
        getContainer={() => document.body}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(v) => saveMutation.mutate(v)}
          initialValues={{ durum: 'planli' }}
          size="small"
          autoComplete="off"
          validateTrigger={["onBlur", "onChange"]}
        >
          <Row gutter={12}>
            <Col span={16}>
              <Form.Item 
                name="proje_adi" 
                label={<span style={{ fontWeight: 500 }}>Proje Adı</span>} 
                rules={[
                  { required: true, message: 'Proje adı zorunlu' },
                  {
                    validator: (_, value) => {
                      if (value && projeler?.some(p => p.proje_adi.toLowerCase() === value.toLowerCase() && p.id !== editingProje?.id)) {
                        return Promise.reject(new Error('Bu isimde bir proje zaten mevcut!'));
                      }
                      return Promise.resolve();
                    }
                  }
                ]}
                style={{ marginBottom: 12 }}
              >
                <Input placeholder="Proje ismini giriniz" autoComplete="off" size="small" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item 
                name="durum" 
                label={<span style={{ fontWeight: 500 }}>Durum</span>} 
                rules={[{ required: true }]}
                style={{ marginBottom: 12 }}
              >
                <Select size="small">
                  <Select.Option value="planli">Planlı</Select.Option>
                  <Select.Option value="devam_ediyor">Devam Ediyor</Select.Option>
                  <Select.Option value="tamamlandi">Tamamlandı</Select.Option>
                  <Select.Option value="iptal">İptal</Select.Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          
          <Form.Item 
            name="aciklama" 
            label={<span style={{ fontWeight: 500 }}>Açıklama</span>}
            style={{ marginBottom: 12 }}
          >
            <Input.TextArea rows={2} placeholder="Proje hakkında kısa bilgi..." size="small" autoComplete="off" />
          </Form.Item>
          
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item 
                name="baslangic_tarihi" 
                label={<span style={{ fontWeight: 500 }}>Başlangıç</span>}
                style={{ marginBottom: 12 }}
              >
                <DatePicker 
                  size="small"
                  style={{ width: '100%' }} 
                  format="DD.MM.YYYY" 
                  getPopupContainer={(triggerNode) => triggerNode.parentNode as HTMLElement}
                  classNames={{ popup: { root: 'small-datepicker-popup' } }}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item 
                name="bitis_tarihi" 
                label={<span style={{ fontWeight: 500 }}>Bitiş</span>}
                style={{ marginBottom: 12 }}
              >
                <DatePicker 
                  size="small"
                  style={{ width: '100%' }} 
                  format="DD.MM.YYYY" 
                  getPopupContainer={(triggerNode) => triggerNode.parentNode as HTMLElement}
                  classNames={{ popup: { root: 'small-datepicker-popup' } }}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item 
                name="toplam_butce" 
                label={<span style={{ fontWeight: 500 }}>Toplam Bütçe</span>}
                style={{ marginBottom: 12 }}
              >
                <InputNumber 
                  style={{ width: '100%' }} 
                  min={0} 
                  formatter={trNumberFormatter}
                  parser={trNumberParser}
                  placeholder="0,00"
                />
              </Form.Item>
            </Col>
          </Row>

          <Divider titlePlacement="left" style={{ margin: '12px 0', fontSize: '13px' }}>Bloklar</Divider>
          
          <Form.List name="bloklar">
            {(fields, { add, remove }) => (
              <div style={{ maxHeight: '300px', overflowY: 'auto', paddingRight: '4px' }}>
                {fields.length > 0 && (
                  <Row gutter={8} style={{ marginBottom: 4, paddingLeft: 4 }}>
                    <Col span={4}><Text type="secondary" style={{ fontSize: '11px', fontWeight: 500 }}>Blok Adı</Text></Col>
                    <Col span={3}><Text type="secondary" style={{ fontSize: '11px', fontWeight: 500 }}>Daire Sayı</Text></Col>
                    <Col span={3}><Text type="secondary" style={{ fontSize: '11px', fontWeight: 500 }}>Baş. No</Text></Col>
                    <Col span={12}><Text type="secondary" style={{ fontSize: '11px', fontWeight: 500 }}>Blok Açıklaması</Text></Col>
                    <Col span={2} style={{ textAlign: 'center' }}><Text type="secondary" style={{ fontSize: '11px', fontWeight: 500 }}>İşlem</Text></Col>
                  </Row>
                )}
                {fields.map(({ key, name, ...restField }) => (
                  <div key={key} style={{ 
                    marginBottom: 4, 
                    padding: '4px', 
                    border: '1px solid #f0f0f0', 
                    borderRadius: '4px',
                    backgroundColor: '#fafafa'
                  }}>
                    <Form.Item {...restField} name={[name, 'id']} hidden>
                      <Input />
                    </Form.Item>
                    <Row gutter={8} align="middle">
                      <Col span={4}>
                        <Form.Item
                          {...restField}
                          name={[name, 'blok_adi']}
                          rules={[{ required: true, message: '!' }]}
                          style={{ marginBottom: 0 }}
                        >
                          <Input size="small" placeholder="Örn: A" autoComplete="off" />
                        </Form.Item>
                      </Col>
                      <Col span={3}>
                        <Form.Item
                          {...restField}
                          name={[name, 'toplam_daire']}
                          rules={[{ required: true, message: '!' }]}
                          style={{ marginBottom: 0 }}
                        >
                          <InputNumber size="small" min={1} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col span={3}>
                        <Form.Item
                          {...restField}
                          name={[name, 'daire_baslangic_no']}
                          style={{ marginBottom: 0 }}
                        >
                          <InputNumber size="small" min={0} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col span={12}>
                        <Form.Item
                          {...restField}
                          name={[name, 'aciklama']}
                          style={{ marginBottom: 0 }}
                        >
                          <Input size="small" placeholder="İsteğe bağlı" autoComplete="off" />
                        </Form.Item>
                      </Col>
                      <Col span={2} style={{ textAlign: 'center' }}>
                        {fields.length > 1 && (
                          <Button 
                            type="text" 
                            danger 
                            icon={<DeleteOutlined />} 
                            onClick={() => remove(name)} 
                            size="small"
                          />
                        )}
                      </Col>
                    </Row>
                  </div>
                ))}
                <Form.Item style={{ marginTop: 8, marginBottom: 0 }}>
                  <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />} size="small">
                    Blok Ekle
                  </Button>
                </Form.Item>
              </div>
            )}
          </Form.List>
        </Form>
      </Modal>
    </div>
  )
}

// Kullanıcının pending davetleri — banner ile aynı hook'u kullanır.
// Spec: docs/superpowers/specs/2026-05-21-invitation-flow-design.md §6.3
const BekleyenDavetlerSection: React.FC = () => {
  const { data: invitations, isLoading } = useMyInvitations()
  const accept = useAcceptMyInvitation()
  const reject = useRejectMyInvitation()

  if (isLoading || !invitations?.length) return null

  return (
    <>
      <Divider style={{ marginTop: 24 }} />
      <Typography.Title level={4}>
        Bekleyen Davetler ({invitations.length})
      </Typography.Title>
      <Table
        dataSource={invitations}
        rowKey="id"
        pagination={false}
        columns={[
          { title: 'Proje Adı', dataIndex: 'proje_adi' },
          {
            title: 'Rol',
            dataIndex: 'invited_role',
            render: (r: string) => <Tag color="blue">{r}</Tag>,
          },
          {
            title: 'Davet Tarihi',
            dataIndex: 'created_at',
            render: (v: string) => new Date(v).toLocaleDateString('tr-TR'),
          },
          {
            title: 'Geçerlilik',
            dataIndex: 'expires_at',
            render: (v: string) => new Date(v).toLocaleDateString('tr-TR'),
          },
          {
            title: 'Aksiyon',
            width: 200,
            render: (_: unknown, row) => (
              <Space>
                <Button
                  type="primary"
                  size="small"
                  loading={accept.isPending && accept.variables === row.id}
                  onClick={() => accept.mutate(row.id)}
                >
                  Kabul Et
                </Button>
                <Popconfirm
                  title="Daveti reddetmek istediğinize emin misiniz?"
                  onConfirm={() => reject.mutate(row.id)}
                  okText="Evet, Reddet"
                  cancelText="Vazgeç"
                >
                  <Button
                    danger
                    size="small"
                    loading={reject.isPending && reject.variables === row.id}
                  >
                    Reddet
                  </Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />
    </>
  )
}
