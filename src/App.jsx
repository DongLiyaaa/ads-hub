import { useCallback, useEffect, useState } from 'react';
import SearchShareDashboard from './pages/SearchShareDashboard.jsx';
import PlacementDashboard from './pages/PlacementDashboard.jsx';
import PurchasedProductDashboard from './pages/PurchasedProductDashboard.jsx';
import AgentSettingsPage from './pages/AgentSettingsPage.jsx';
import TenantAdminPage from './pages/TenantAdminPage.jsx';
import AiChatPage from './pages/AiChatPage.jsx';
import SkillManagementPage from './pages/SkillManagementPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import AppShell, { Brand } from './components/AppShell.jsx';
import { apiFetch } from './lib/api.js';
import { clearReportCache } from './lib/reportCache.js';

const PAGE_TITLES = {
  'ai-chat': '广告 AI 对话 · ShareScope',
  'search-share': '搜索词展示份额 · ShareScope',
  placement: '广告位报表分析 · ShareScope',
  'purchased-product': '已购买商品报表分析 · ShareScope',
  'agent-settings': 'Agent 与模型配置 · ShareScope',
  'tenant-admin': '租户与权限 · ShareScope',
  skills: 'Skill 管理 · ShareScope',
};

function getReportPage() {
  const page = window.location.hash.slice(2);
  return Object.hasOwn(PAGE_TITLES, page) ? page : 'search-share';
}

export default function App() {
  const [page, setPage] = useState(getReportPage);
  const [session, setSession] = useState(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [selectedStoreId, setSelectedStoreId] = useState(null);
  const [authError, setAuthError] = useState('');

  const loadSession = useCallback(async () => {
    const body = await apiFetch('/api/auth/session');
    setSession(body);
    setNeedsSetup(false);
    setSelectedStoreId((previous) => body.stores.some((store) => store.id === previous) ? previous : body.stores[0]?.id || null);
    return body;
  }, []);

  useEffect(() => {
    const handleHashChange = () => setPage(getReportPage());
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(() => {
    const handleUnauthorized = () => {
      setSession(null);
      setSelectedStoreId(null);
      setNeedsSetup(false);
      clearReportCache();
    };
    window.addEventListener('sharescope:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('sharescope:unauthorized', handleUnauthorized);
  }, []);

  useEffect(() => {
    let active = true;
    async function initialize() {
      try {
        const status = await apiFetch('/api/auth/status');
        if (!active) return;
        setNeedsSetup(status.needsSetup);
        if (!status.needsSetup) await loadSession();
      } catch {
        if (active) setSession(null);
      } finally {
        if (active) setInitializing(false);
      }
    }
    initialize();
    return () => { active = false; };
  }, [loadSession]);

  const isAdmin = session?.currentTenant.role === 'admin';
  const effectivePage = !isAdmin && ['agent-settings', 'tenant-admin'].includes(page) ? 'search-share' : page;
  useEffect(() => {
    document.title = session ? PAGE_TITLES[effectivePage] : '登录 · ShareScope';
  }, [effectivePage, session]);

  const switchTenant = async (tenantId) => {
    if (tenantId === session.currentTenant.id) return;
    setAuthError('');
    try {
      await apiFetch('/api/auth/switch-tenant', { method: 'POST', body: JSON.stringify({ tenantId }) });
      setSelectedStoreId(null);
      await loadSession();
    } catch (requestError) { setAuthError(requestError.message); }
  };

  const logout = async () => {
    try { await apiFetch('/api/auth/logout', { method: 'POST' }); } catch { /* Local credentials are still cleared. */ }
    await clearReportCache();
    setSession(null);
    setSelectedStoreId(null);
    setNeedsSetup(false);
  };

  if (initializing) return <main className="status-screen"><div className="loading-content"><Brand /><span className="loading-spinner" /><p>正在检查登录状态…</p></div></main>;
  if (!session) return <LoginPage needsSetup={needsSetup} onAuthenticated={loadSession} />;

  const commonProps = { session, storeId: selectedStoreId, onStoreChange: setSelectedStoreId, onSwitchTenant: switchTenant, onLogout: logout };
  const workspaceKey = `${session.user.id}:${session.currentTenant.id}`;
  let content;
  if (!selectedStoreId && !['tenant-admin', 'agent-settings', 'skills'].includes(effectivePage)) {
    content = <AppShell {...commonProps} page={effectivePage}><main className="dashboard"><section className="panel empty-workspace"><h1>尚未分配可用店铺</h1><p>{isAdmin ? '请先在“租户与权限”中创建店铺。' : '请联系租户管理员分配店铺；服务端不会返回其他店铺的数据。'}</p></section></main></AppShell>;
  } else if (effectivePage === 'placement') content = <PlacementDashboard key={workspaceKey} {...commonProps} />;
  else if (effectivePage === 'ai-chat') content = <AiChatPage key={workspaceKey} {...commonProps} />;
  else if (effectivePage === 'skills') content = <SkillManagementPage key={workspaceKey} {...commonProps} />;
  else if (effectivePage === 'purchased-product') content = <PurchasedProductDashboard key={workspaceKey} {...commonProps} />;
  else if (effectivePage === 'agent-settings') content = <AgentSettingsPage key={workspaceKey} {...commonProps} />;
  else if (effectivePage === 'tenant-admin') content = <TenantAdminPage key={workspaceKey} {...commonProps} onSessionRefresh={loadSession} />;
  else content = <SearchShareDashboard key={workspaceKey} {...commonProps} />;

  return <>{authError ? <div className="global-auth-error" role="alert">{authError}<button onClick={() => setAuthError('')}>关闭</button></div> : null}{content}</>;
}
