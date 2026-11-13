import { BarChart3, MapPinned, Settings2, ShoppingBag } from 'lucide-react';
import DateRangeFilter from './DateRangeFilter.jsx';

function GitHubIcon() {
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 1.8a10.2 10.2 0 0 0-3.23 19.88c.51.1.7-.22.7-.49v-1.9c-2.84.62-3.44-1.2-3.44-1.2-.47-1.18-1.14-1.5-1.14-1.5-.93-.63.07-.62.07-.62 1.03.08 1.57 1.06 1.57 1.06.92 1.56 2.4 1.11 2.98.85.09-.66.36-1.11.65-1.37-2.27-.26-4.65-1.13-4.65-5.04 0-1.11.4-2.02 1.05-2.74-.1-.26-.46-1.3.1-2.7 0 0 .86-.28 2.8 1.05a9.75 9.75 0 0 1 5.1 0c1.94-1.33 2.8-1.05 2.8-1.05.56 1.4.2 2.44.1 2.7.65.72 1.05 1.63 1.05 2.74 0 3.92-2.39 4.78-4.66 5.03.37.32.69.94.69 1.9v2.81c0 .27.18.6.7.49A10.2 10.2 0 0 0 12 1.8Z" /></svg>;
}

function WeChatIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M9.7 3.2C5.2 3.2 1.5 6.13 1.5 9.74c0 2.07 1.13 3.92 2.9 5.14l-.73 2.2 2.55-1.28c.65.18 1.33.33 2.04.42-.09-.36-.14-.73-.14-1.1 0-3.42 3.52-6.19 7.85-6.19.26 0 .53.01.79.03C16.08 5.7 13.25 3.2 9.7 3.2Zm-2.6 3.02a1.13 1.13 0 1 1 0 2.26 1.13 1.13 0 0 1 0-2.26Zm5.2 0a1.13 1.13 0 1 1 0 2.26 1.13 1.13 0 0 1 0-2.26Z" clipRule="evenodd" /><path d="M22.5 15.1c0-3.06-2.96-5.54-6.61-5.54s-6.61 2.48-6.61 5.54 2.96 5.54 6.61 5.54c.74 0 1.46-.11 2.13-.3l2.13 1.07-.61-1.85c1.57-1.02 2.56-2.64 2.56-4.46Zm-8.82-1.63a.94.94 0 1 1 0 1.88.94.94 0 0 1 0-1.88Zm4.4 0a.94.94 0 1 1 0 1.88.94.94 0 0 1 0-1.88Z" /></svg>;
}

function DouyinIcon() {
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M14.2 2h3.35c.16 1.16.72 2.18 1.56 2.94A6.6 6.6 0 0 0 22 6.42v3.36a10.15 10.15 0 0 1-4.4-1.26v6.58a6.91 6.91 0 1 1-6.91-6.91c.35 0 .7.03 1.04.08v3.45a3.53 3.53 0 1 0 2.47 3.38V2Z" /></svg>;
}

export function Brand({ subtitle = '广告报表分析' }) {
  return (
    <div className="brand" aria-label={`ShareScope ${subtitle}`}>
      <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
      <span className="brand-name">ShareScope</span>
      <span className="brand-subtitle">{subtitle}</span>
    </div>
  );
}

const REPORTS = [
  { id: 'search-share', label: '搜索词展示份额', description: '搜索词份额与效率', href: '#/search-share', icon: BarChart3 },
  { id: 'placement', label: '广告位报表分析', description: '位置结构与活动下钻', href: '#/placement', icon: MapPinned },
  { id: 'purchased-product', label: '已购买商品分析', description: '引流商品与购买路径', href: '#/purchased-product', icon: ShoppingBag },
];

export function ContactFooter() {
  return (
    <footer className="contact-footer" aria-label="联系方式">
      <a href="https://github.com/DongLiyaaa" target="_blank" rel="noreferrer">
        <GitHubIcon />
        <span>GitHub：DongLiyaaa</span>
      </a>
      <span><WeChatIcon />微信公众号：冬离鸭冬离</span>
      <span><DouyinIcon />抖音号：冬离鸭冬离</span>
    </footer>
  );
}

export default function AppShell({ page, reportContext, dateProps, children }) {
  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <Brand />
        <div className="sidebar-section-label">REPORT LIBRARY</div>
        <nav className="report-nav" aria-label="报表分析导航">
          {REPORTS.map((report, index) => {
            const Icon = report.icon;
            return (
              <a key={report.id} href={report.href} className={page === report.id ? 'is-active' : ''} aria-current={page === report.id ? 'page' : undefined}>
                <span className="report-nav__icon"><Icon size={18} strokeWidth={1.8} aria-hidden="true" /></span>
                <span className="report-nav__copy"><strong>{report.label}</strong><small>{report.description}</small></span>
                <span className="report-nav__index" aria-hidden="true">0{index + 1}</span>
              </a>
            );
          })}
        </nav>
        <div className="sidebar-section-label sidebar-section-label--settings">WORKSPACE</div>
        <nav className="report-nav" aria-label="工作区设置">
          <a href="#/agent-settings" className={page === 'agent-settings' ? 'is-active' : ''} aria-current={page === 'agent-settings' ? 'page' : undefined}>
            <span className="report-nav__icon"><Settings2 size={18} strokeWidth={1.8} aria-hidden="true" /></span>
            <span className="report-nav__copy"><strong>Agent 与模型</strong><small>执行器、协议与连通性</small></span>
          </a>
        </nav>
        <div className="sidebar-footer"><span className="sidebar-status-dot" aria-hidden="true" /><span>本地演示环境</span><small>Amazon Ads Analytics</small></div>
      </aside>
      <div className="app-workspace">
        <header className="app-header">
          <div className="app-header__inner">
            <div className="header-actions">
              <span className="report-context">{reportContext || '本地工作区'}</span>
              {dateProps ? <DateRangeFilter {...dateProps} /> : null}
            </div>
          </div>
        </header>
        {children}
        <ContactFooter />
      </div>
    </div>
  );
}
