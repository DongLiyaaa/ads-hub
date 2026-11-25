import { useState } from 'react';
import { ArrowRight, FlaskConical, LoaderCircle, LockKeyhole } from 'lucide-react';
import { Brand, ContactFooter } from '../components/AppShell.jsx';
import { apiFetch } from '../lib/api.js';

export default function LoginPage({ needsSetup, onAuthenticated }) {
  const [form, setForm] = useState({ displayName: '', workspaceName: '我的广告工作区', email: '', password: '', confirmPassword: '' });
  const [busy, setBusy] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);
  const [error, setError] = useState('');
  const update = (field, value) => setForm((previous) => ({ ...previous, [field]: value }));

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (needsSetup && form.password !== form.confirmPassword) return setError('两次输入的密码不一致');
    setBusy(true);
    try {
      await apiFetch(needsSetup ? '/api/auth/setup' : '/api/auth/login', { method: 'POST', body: JSON.stringify(form) });
      await onAuthenticated();
    } catch (requestError) {
      setError(requestError.message || '登录失败，请稍后重试');
    } finally {
      setBusy(false);
    }
  };

  const enterDemo = async () => {
    setError('');
    setDemoBusy(true);
    try {
      await apiFetch('/api/auth/demo', { method: 'POST', body: JSON.stringify({}) });
      await onAuthenticated();
    } catch (requestError) {
      setError(requestError.message || 'Demo 暂时无法进入，请稍后重试');
    } finally {
      setDemoBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <main className="auth-layout">
        <section className="auth-intro">
          <Brand />
          <div><h1>让每一家店铺的数据，<br />只属于正确的人。</h1><p>搜索词、广告位与已购买商品分析，集中在安全的多租户工作区。</p></div>
          <ul><li>服务端逐请求校验租户和店铺权限</li><li>AI 历史永久保存，报表本地缓存两小时</li><li>Agent 密钥与 OAuth 凭据按租户隔离</li></ul>
        </section>
        <section className="auth-card" aria-labelledby="auth-title">
          <span className="auth-card__icon"><LockKeyhole size={22} /></span>
          <h2 id="auth-title">{needsSetup ? '初始化租户管理员' : '登录 ShareScope'}</h2>
          <p>{needsSetup ? '创建第一个管理员账号，现有报表会归入此工作区。' : '使用管理员分配的邮箱和密码进入工作区。'}</p>
          <form onSubmit={submit}>
            {needsSetup ? <><label className="settings-field"><span className="settings-field__label">管理员姓名</span><input value={form.displayName} onChange={(event) => update('displayName', event.target.value)} required maxLength={100} autoComplete="name" /></label><label className="settings-field"><span className="settings-field__label">租户名称</span><input value={form.workspaceName} onChange={(event) => update('workspaceName', event.target.value)} required maxLength={100} /></label></> : null}
            <label className="settings-field"><span className="settings-field__label">邮箱</span><input type="email" value={form.email} onChange={(event) => update('email', event.target.value)} required autoComplete="username" placeholder="name@company.com" /></label>
            <label className="settings-field"><span className="settings-field__label">密码</span><input type="password" value={form.password} onChange={(event) => update('password', event.target.value)} required minLength={12} maxLength={128} autoComplete={needsSetup ? 'new-password' : 'current-password'} /></label>
            {needsSetup ? <label className="settings-field"><span className="settings-field__label">确认密码</span><input type="password" value={form.confirmPassword} onChange={(event) => update('confirmPassword', event.target.value)} required minLength={12} maxLength={128} autoComplete="new-password" /></label> : null}
            {error ? <div className="settings-message settings-message--error" role="alert">{error}</div> : null}
            <button className="primary-button auth-submit" type="submit" disabled={busy || demoBusy}>{busy ? <LoaderCircle size={17} className="spin" /> : <ArrowRight size={17} />}{busy ? '正在验证…' : needsSetup ? '创建并进入正式工作区' : '登录正式工作区'}</button>
          </form>
          <div className="auth-divider"><span>无需账号，直接体验</span></div>
          <button className="secondary-button auth-submit auth-demo" type="button" onClick={enterDemo} disabled={busy || demoBusy}>{demoBusy ? <LoaderCircle size={17} className="spin" /> : <FlaskConical size={17} />}{demoBusy ? '正在准备 Demo…' : '进入 Demo 演示环境'}</button>
          <p className="auth-demo-note">Demo 数据与正式工作区完全隔离；报表共享只读，每位访客的 AI 对话独立保存。</p>
          <small className="auth-security">密码至少 12 个字符。登录会话使用 HttpOnly Cookie，不写入浏览器报表缓存。</small>
        </section>
      </main>
      <ContactFooter />
    </div>
  );
}
