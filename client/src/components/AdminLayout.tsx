import React, { useState } from 'react'
import { Layout, Menu, Button, theme, Space, Typography, Tooltip, Dropdown, Drawer } from 'antd'
import {
  UserOutlined,
  LogoutOutlined,
  DollarOutlined,
  BankOutlined,
  TransactionOutlined,
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

export const AdminLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false)
  const [openKeys, setOpenKeys] = useState<string[]>([])
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  const navigate = useNavigate()
  const location = useLocation()
  const { title, headerActions, headerRightActions } = useLayout()
  const { activeProject } = useProject()
  const { signOut } = useAuth()

  // Handle window resize
  React.useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Find the matching menu key and its parent group safely
  const { selectedKey, parentKey } = React.useMemo(() => {
    const pathname = location.pathname;
    
    let currentSelectedKey = '';
    let currentParentKey: string | null = null;

    // 1. Exact match
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

    // 2. Prefix match (e.g. /uyeler/123 -> /uyeler)
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

    // Default to '/' if completely unknown
    if (!currentSelectedKey) {
       currentSelectedKey = '/';
       currentParentKey = null;
    }

    return { selectedKey: currentSelectedKey, parentKey: currentParentKey };
  }, [location.pathname]);

  // Sync openKeys when selection changes using functional state to prevent stale closure bugs
  React.useEffect(() => {
    if (parentKey) {
      setOpenKeys(prev => (prev.includes(parentKey) && prev.length === 1 ? prev : [parentKey]));
    } else {
      setOpenKeys(prev => (prev.length === 0 ? prev : []));
    }
  }, [parentKey]);

  const handleLogout = async () => {
    await signOut();
  };

  const handleNavigation = React.useCallback((key: string) => {
    // If it's a submenu group, don't navigate
    const isGroup = menuItems.some(item => item.children && item.key === key);
    if (isGroup) return;

    navigate(key);

    if (isMobile) {
      setCollapsed(true);
    }
  }, [navigate, isMobile]);

  const handleOpenChange = React.useCallback((keys: string[]) => {
    // Accordion behavior: only one open submenu at a time
    const latestOpenKey = keys.find(key => openKeys.indexOf(key) === -1);
    setOpenKeys(latestOpenKey ? [latestOpenKey] : []);
  }, [openKeys]);

  const settingsMenu = {
    items: [
      { key: '/ayarlar/birimler', label: 'Birimler' },
      { key: '/ayarlar/pozlar', label: 'Pozlar' },
      { key: '/ayarlar/parametreler', label: 'Parametreler' },
    ],
    onClick: ({ key }: { key: string }) => handleNavigation(key),
  }

  const renderSiderContent = () => (
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
        onOpenChange={handleOpenChange}
        mode="inline"
        items={menuItems}
        onClick={({ key }) => handleNavigation(key)}
        style={{ borderRight: 0, marginTop: 8, paddingBottom: 48 }}
      />
    </>
  )

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {isMobile ? (
        <Drawer
          placement="left"
          closable={false}
          onClose={() => setCollapsed(true)}
          open={!collapsed}
          width={260}
          styles={{ body: { padding: 0 } }}
        >
          {renderSiderContent()}
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
          {renderSiderContent()}
        </Sider>
      )}
      <Layout>
        <Header style={{ 
          padding: '0 24px', 
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
          <div id="header-left" style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1, minWidth: 0 }}>
            {isMobile && (
              <Button
                type="text"
                icon={<MenuOutlined />}
                onClick={() => setCollapsed(!collapsed)}
                style={{
                  fontSize: '16px',
                  width: 40,
                  height: 40,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              />
            )}
            {title && (
              <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                <Typography.Text style={{ margin: 0, color: '#1e293b', whiteSpace: 'nowrap', fontWeight: 600, fontSize: '16px' }}>
                  {title}
                </Typography.Text>
              </div>
            )}
            
            {headerActions && (
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                marginLeft: '8px',
                flex: 1,
                minWidth: 0,
                overflow: 'hidden'
              }}>
                {headerActions}
              </div>
            )}
          </div>
          <div id="header-right" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
            
            <div style={{ width: '1px', height: '24px', background: '#e2e8f0', margin: '0 4px' }} />

            <Button 
              type="text" 
              icon={<LogoutOutlined />} 
              onClick={handleLogout}
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                color: '#64748b',
                height: 40,
                borderRadius: 8
              }}
            >
              Çıkış Yap
            </Button>
          </div>
        </Header>
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
