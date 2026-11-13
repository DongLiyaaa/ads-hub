import { useEffect, useState } from 'react';
import SearchShareDashboard from './pages/SearchShareDashboard.jsx';
import PlacementDashboard from './pages/PlacementDashboard.jsx';
import PurchasedProductDashboard from './pages/PurchasedProductDashboard.jsx';
import AgentSettingsPage from './pages/AgentSettingsPage.jsx';

const PAGE_TITLES = {
  'search-share': '搜索词展示份额 · ShareScope',
  placement: '广告位报表分析 · ShareScope',
  'purchased-product': '已购买商品报表分析 · ShareScope',
  'agent-settings': 'Agent 与模型配置 · ShareScope',
};

function getReportPage() {
  const page = window.location.hash.slice(2);
  return Object.hasOwn(PAGE_TITLES, page) ? page : 'search-share';
}

export default function App() {
  const [page, setPage] = useState(getReportPage);

  useEffect(() => {
    const handleHashChange = () => setPage(getReportPage());
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(() => {
    document.title = PAGE_TITLES[page];
  }, [page]);

  if (page === 'placement') return <PlacementDashboard />;
  if (page === 'purchased-product') return <PurchasedProductDashboard />;
  if (page === 'agent-settings') return <AgentSettingsPage />;
  return <SearchShareDashboard />;
}
