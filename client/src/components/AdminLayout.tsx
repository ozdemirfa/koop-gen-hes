import React, { useState, useMemo, useCallback, useEffect } from 'react'
import { Layout, Menu, Button, Typography, Tooltip, Dropdown, Drawer, Grid } from 'antd'
import {
  UserOutlined,
  LogoutOutlined,
  DollarOutlined,
  BankOutlined,
  ShopOutlined,
  TruckOutlined,
  ProjectOutlined,
  PieChartOutlined,
  WalletOutlined,
  SettingOutlined,
  MenuOutlined,
} from '@ant-design/icons'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useProject } from '../contexts/ProjectContext'
import { useLayout } from '../contexts/LayoutContext'
import logo from '../assets/logo.png'

const { Header, Sider, Content } = Layout
const { useBreakpoint } = Grid

const menuItems = [
  { key: '/', icon: <BankOutlined />, label: 'Pano' },
  { key: '/uyeler', icon: <UserOutlined />, label: 'Üye Yönetimi' },
  {
    key: 'aidat-group',
    icon: <DollarOutlined />,
    label: 'Aidat Yönetimi',
    children: [
      { key: '/aidatlar', label: 'Aidat Listesi' },
      { key: '/aidatlar/tanimlar', label: 'Aidat Tanımları' },
    ],
  },
  {
    key: 'firmalar-group',
    icon: <ShopOutlined />,
    label: 'Firmalar',
    children: [
      { key: '/firmalar', label: 'Firma Listesi' },
      { key: '/hakedisler', label: 'Hakedişler' },
      { key: '/faturalar', label: 'Faturalar' },
      { key: '/cari-hesaplar', label: 'Firma Ekstre' },
    ],
  },
  {
    key: 'payment-management-group',
    icon: <WalletOutlined />,
    label: 'Ödeme Yönetimi',
    children: [
      { key: '/banka-hesaplari', label: 'Banka Hesapları' },
      { key: '/cari-hesaplar/odeme-kayit', label: 'Ödeme/Tahsilat Kaydı' },
      { key: '/cek-takibi', label: 'Çek Takibi' },
    ],
  },
  { key: '/fatura-irsaliye', icon: <TruckOutlined />, label: 'Malzeme Teslimat' },
  { key: '/projeler', icon: <ProjectOutlined />, label: 'İnşaat Projeleri' },
  {
    key: 'raporlar-group',
    icon: <PieChartOutlined />,
    label: 'Raporlar',
    children: [
      { key: '/raporlar/aylik', label: 'Aylık Mali Rapor' },
      { key: '/raporlar/yillik', label: 'Yıllık Mali Rapor' },
      { key: '/raporlar/uye-borc', label: 'Üye Borç Listesi' },
      { key: '/raporlar/mizan', label: 'Genel Mizan' },
    ],
  },
]

// Separate component for the Sider content to avoid re-renders when header context changes
const SiderContent: React.FC<{
  collapsed: boolean
  isMobile: boolean
  selectedKey: string
  openKeys: string[]
  onOpenChange: (keys: string[]) => void
  onNavigate: (key: string) => void
  activeProject: any
}> = React.memo(({ collapsed, isMobile, selectedKey, openKeys, onOpenChange, onNavigate, activeProject }) => (
  <>
    <div style={{ padding: '24px 8px', borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
        <img 
          src={logo} 
          alt="KoopGenHes Logo" 
          style={{ 
            height: collapsed && !isMobile ? '32px' : '64px',
            width: '100%',
            maxWidth: collapsed && !isMobile ? '40px' : '180px',
            objectFit: 'contain',
            transition: 'all 0.2s ease-in-out'
          }} 
        />
      </div>
      {activeProject && (
        <Tooltip title={collapsed && !isMobile ? `Aktif Proje: ${activeProject.proje_adi}` : ''} placement="right">
          <div style={{ padding: collapsed && !isMobile ? '0' : '0 12px', textAlign: 'center' }}>
            {!collapsed || isMobile ? (
              <>
                <Typography.Text type="secondary" style={{ fontSize: '10px', display: 'block' }}>
                  AKTİF PROJE
                </Typography.Text>
                <Typography.Text strong style={{ 
                  fontSize: '12px', 
                  color: '#4f46e5', 
                  display: 'block', 
                  overflow: 'hidden', 
                  textOverflow: 'ellipsis', 
                  whiteSpace: 'nowrap' 
                }}>
                  {activeProject.proje_adi}
                </Typography.Text>
              </>
            ) : (
              <ProjectOutlined style={{ color: '#4f46e5', fontSize: '16px', marginTop: '4px' }} />
            )}
          </div>
        </Tooltip>
      )}
    </div>
    <Menu
      theme="light"
      selectedKeys={selectedKey ? [selectedKey] : []}
      openKeys={openKeys}
      onOpenChange={onOpenChange}
      mode="inline"
      items={menuItems}
      onClick={({ key }) => onNavigate(key)}
      style={{ borderRight: 0, marginTop: 8, paddingBottom: 48 }}
    />
  </>
))

// Separate component for Header that consumes LayoutContext
// This isolates context-driven re-renders to just this component
const MainHeader: React.FC<{
  isMobile: boolean
  onToggleCollapsed: () => void
  onLogout: () => void
  settingsMenu: any
}> = ({ isMobile, onToggleCollapsed, onLogout, settingsMenu }) => {
  const { title, headerActions, headerRightActions } = useLayout()

  return (
    <Header style={{ 
      padding: isMobile ? '0 12px' : '0 24px', 
      background: 'white', 
      display: 'flex', 
      justifyContent: 'space-between', 
      alignItems: 'center',
      borderBottom: '1px solid #e2e8f0',
      position: 'sticky',
      top: 0,
      zIndex: 999,
      height: 64
    }}>
      <div id="header-left" style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '8px' : '16px', flex: 1, minWidth: 0 }}>
        {isMobile && (
          <Button
            type="text"
            icon={<MenuOutlined />}
            onClick={onToggleCollapsed}
            style={{
              fontSize: '16px',
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          />
        )}
        {title && (
          <div
            className="admin-header-title"
            style={{ flexShrink: 0, display: 'flex', alignItems: 'center', minWidth: 0 }}
          >
            <Typography.Text
              style={{
                margin: 0,
                color: '#1e293b',
                whiteSpace: 'nowrap',
                fontWeight: 600,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                width: '100%'
              }}
              title={typeof title === 'string' ? title : undefined}
            >
              {title}
            </Typography.Text>
          </div>
        )}
        
        {headerActions && (
          <div
            className={isMobile ? 'hide-scrollbar' : ''}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginLeft: isMobile ? '4px' : '8px',
              flexShrink: 0,
              minWidth: 'fit-content',
              maxWidth: '100%',
              overflowX: 'auto',
              flexWrap: 'nowrap'
            }}
          >
            {headerActions}
          </div>
        )}
      </div>
      <div id="header-right" style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '4px' : '8px', marginLeft: '8px' }}>
        {headerRightActions && (
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {headerRightActions}
          </div>
        )}
        <Dropdown menu={settingsMenu} placement="bottomRight" arrow>
          <Button 
            type="text" 
            icon={<SettingOutlined />} 
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              color: '#64748b',
              height: 40,
              width: 40,
              borderRadius: 8
            }}
          />
        </Dropdown>
        
        <div
          className="admin-header-separator"
          style={{ width: '1px', height: '24px', background: '#e2e8f0', margin: '0 4px' }}
        />

        <Button
          type="text"
          icon={<LogoutOutlined />}
          onClick={onLogout}
          className="admin-header-logout"
          style={{
            display: 'flex',
            alignItems: 'center',
            color: '#64748b',
            height: 40,
            borderRadius: 8,
          }}
        >
          Çıkış Yap
        </Button>
      </div>
    </Header>
  )
}

export const AdminLayout: React.FC = () => {
  const screens = useBreakpoint()
  const isMobile = !screens.md
  const [collapsed, setCollapsed] = useState(false)
  const [openKeys, setOpenKeys] = useState<string[]>([])
  const navigate = useNavigate()
  const location = useLocation()
  const { activeProject } = useProject()
  const { signOut } = useAuth()

  // Find the matching menu key and its parent group safely
  const { selectedKey, parentKey } = useMemo(() => {
    const pathname = location.pathname;
    
    let currentSelectedKey = '';
    let currentParentKey: string | null = null;

    for (const item of menuItems) {
      if (item.children) {
        const child = item.children.find(c => c.key === pathname);
        if (child) {
          currentSelectedKey = child.key;
          currentParentKey = item.key;
          break;
        }
      } else if (item.key === pathname) {
        currentSelectedKey = item.key;
        break;
      }
    }

    if (!currentSelectedKey) {
      for (const item of menuItems) {
        if (item.children) {
          for (const child of item.children) {
            if (child.key !== '/' && pathname.startsWith(child.key) && child.key.length > currentSelectedKey.length) {
              currentSelectedKey = child.key;
              currentParentKey = item.key;
            }
          }
        } else if (item.key !== '/' && pathname.startsWith(item.key) && item.key.length > currentSelectedKey.length) {
          currentSelectedKey = item.key;
          currentParentKey = null;
        }
      }
    }

    if (!currentSelectedKey) {
       currentSelectedKey = '/';
       currentParentKey = null;
    }

    return { selectedKey: currentSelectedKey, parentKey: currentParentKey };
  }, [location.pathname]);

  // Sync openKeys when selection changes
  useEffect(() => {
    if (parentKey) {
      setOpenKeys(prev => (prev.includes(parentKey) && prev.length === 1 ? prev : [parentKey]));
    } else {
      setOpenKeys(prev => (prev.length === 0 ? prev : []));
    }
  }, [parentKey]);

  const handleLogout = useCallback(async () => {
    await signOut();
  }, [signOut]);

  const handleNavigation = useCallback((key: string) => {
    const isGroup = menuItems.some(item => item.children && item.key === key);
    if (isGroup) return;

    navigate(key);

    if (isMobile) {
      setCollapsed(true);
    }
  }, [navigate, isMobile]);

  const handleOpenChange = useCallback((keys: string[]) => {
    const latestOpenKey = keys.find(key => openKeys.indexOf(key) === -1);
    setOpenKeys(latestOpenKey ? [latestOpenKey] : []);
  }, [openKeys]);

  const settingsMenu = useMemo(() => ({
    items: [
      { key: '/ayarlar/birimler', label: 'Birimler' },
      { key: '/ayarlar/pozlar', label: 'Pozlar' },
      { key: '/ayarlar/parametreler', label: 'Parametreler' },
    ],
    onClick: ({ key }: { key: string }) => handleNavigation(key),
  }), [handleNavigation])

  const siderProps = {
    collapsed,
    isMobile,
    selectedKey,
    openKeys,
    onOpenChange: handleOpenChange,
    onNavigate: handleNavigation,
    activeProject
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {isMobile ? (
        <Drawer
          placement="left"
          closable={false}
          onClose={() => setCollapsed(true)}
          open={!collapsed}
          size="default"
          styles={{ body: { padding: 0 } }}
        >
          <SiderContent {...siderProps} />
        </Drawer>
      ) : (
        <Sider
          collapsible
          collapsed={collapsed}
          onCollapse={(value) => setCollapsed(value)}
          breakpoint="lg"
          collapsedWidth={80}
          theme="light"
          style={{
            borderRight: '1px solid #e2e8f0',
            position: 'sticky',
            top: 0,
            left: 0,
            height: '100vh',
            zIndex: 1000,
            overflowY: 'auto'
          }}
        >
          <SiderContent {...siderProps} />
        </Sider>
      )}
      <Layout>
        <MainHeader 
          isMobile={isMobile} 
          onToggleCollapsed={() => setCollapsed(!collapsed)} 
          onLogout={handleLogout} 
          settingsMenu={settingsMenu} 
        />
        <Content style={{ 
          margin: '24px', 
          minHeight: 280, 
          background: 'transparent',
          overflow: 'initial'
        }}>
          <div style={{ maxWidth: 1400, margin: '0 auto' }}>
            <Outlet />
          </div>
        </Content>
      </Layout>
    </Layout>
  )
}
