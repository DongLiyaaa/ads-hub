import { useCallback, useEffect, useState } from 'react';
import { Building2, CheckCircle2, CircleAlert, LoaderCircle, Plus, Save, Store, UserPlus } from 'lucide-react';
import AppShell from '../components/AppShell.jsx';
import { apiFetch } from '../lib/api.js';

function StoreChecks({ stores, value, onChange, disabled = false }) {
  return <div className="store-checks">{stores.map((store) => <label key={store.id} className={value.includes(store.id) ? 'is-selected' : ''}><input type="checkbox" checked={value.includes(store.id)} disabled={disabled} onChange={() => onChange(value.includes(store.id) ? value.filter((id) => id !== store.id) : [...value, store.id])} /><span><strong>{store.name}</strong><small>{store.code} · {store.site}</small></span></label>)}</div>;
}

function MemberRow({ member, stores, onSave }) {
  const [role, setRole] = useState(member.role);
  const [active, setActive] = useState(member.active);
  const [storeIds, setStoreIds] = useState(member.storeIds);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setRole(member.role); setActive(member.active); setStoreIds(member.storeIds); }, [member]);
  const save = async () => {
    setSaving(true);
    try { await onSave(member.membershipId, { role, active, storeIds }); } finally { setSaving(false); }
  };
  return <tr>
    <td><strong>{member.displayName}</strong><small>{member.email}</small></td>
    <td><select value={role} onChange={(event) => setRole(event.target.value)} aria-label={`${member.displayName} 的角色`}><option value="user">普通用户</option><option value="admin">管理员</option></select></td>
    <td>{role === 'admin' ? <span className="admin-all-stores">全部店铺</span> : <StoreChecks stores={stores} value={storeIds} onChange={setStoreIds} />}</td>
    <td><label className="active-toggle"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />{active ? '启用' : '停用'}</label></td>
    <td><button type="button" className="secondary-button" onClick={save} disabled={saving}>{saving ? <LoaderCircle size={14} className="spin" /> : <Save size={14} />}保存</button></td>
  </tr>;
}

export default function TenantAdminPage({ session, storeId, onStoreChange, onSwitchTenant, onLogout, onSessionRefresh }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [newUser, setNewUser] = useState({ displayName: '', email: '', password: '', role: 'user', storeIds: [] });
  const [newStore, setNewStore] = useState({ name: '', code: '', site: 'Amazon.com' });
  const [newTenant, setNewTenant] = useState({ name: '', storeName: '', code: '', site: 'Amazon.com' });

  const load = useCallback(async () => {
    try { setData(await apiFetch('/api/admin/tenant')); setError(''); }
    catch (loadError) { setError(loadError.message); }
  }, []);
  useEffect(() => { setData(null); load(); }, [load, session.currentTenant.id]);

  const run = async (key, action, message) => {
    setBusy(key); setError(''); setNotice('');
    try { await action(); await load(); setNotice(message); return true; }
    catch (requestError) { setError(requestError.message); return false; }
    finally { setBusy(''); }
  };
  const createUser = async (event) => {
    event.preventDefault();
    if (await run('user', () => apiFetch('/api/admin/users', { method: 'POST', body: JSON.stringify(newUser) }), '用户已创建，店铺权限已生效')) setNewUser({ displayName: '', email: '', password: '', role: 'user', storeIds: [] });
  };
  const createStore = async (event) => {
    event.preventDefault();
    if (await run('store', () => apiFetch('/api/admin/stores', { method: 'POST', body: JSON.stringify(newStore) }), '店铺已创建，可立即分配给用户')) setNewStore({ name: '', code: '', site: 'Amazon.com' });
  };
  const createTenant = async (event) => {
    event.preventDefault();
    setBusy('tenant'); setError(''); setNotice('');
    try {
      await apiFetch('/api/admin/tenants', { method: 'POST', body: JSON.stringify(newTenant) });
      await onSessionRefresh();
      setNewTenant({ name: '', storeName: '', code: '', site: 'Amazon.com' });
      setNotice('新租户已创建并切换；其 Agent 配置与 OAuth 凭据独立初始化');
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(''); }
  };

  return <AppShell page="tenant-admin" session={session} storeId={storeId} onStoreChange={onStoreChange} onSwitchTenant={onSwitchTenant} onLogout={onLogout} reportContext="租户管理">
    <main className="dashboard tenant-admin-page">
      <div className="page-heading"><div><h1>租户与权限</h1><p>管理 {session.currentTenant.name} 的成员、店铺及访问范围。</p></div><span className="role-summary">{data?.users.length || 0} 名成员 · {data?.stores.length || 0} 个店铺</span></div>
      {error ? <div className="settings-message settings-message--error" role="alert"><CircleAlert size={17} />{error}</div> : null}
      {notice ? <div className="settings-message settings-message--success" role="status"><CheckCircle2 size={17} />{notice}</div> : null}
      <div className="admin-create-grid">
        <section className="panel admin-form-panel"><div className="settings-section-heading"><div><h2>创建用户</h2><p>邮箱在当前部署中全局唯一，密码不会回显。</p></div><UserPlus size={19} /></div>
          <form onSubmit={createUser} className="admin-form">
            <label className="settings-field"><span className="settings-field__label">姓名</span><input required value={newUser.displayName} onChange={(event) => setNewUser({ ...newUser, displayName: event.target.value })} /></label>
            <label className="settings-field"><span className="settings-field__label">邮箱</span><input required type="email" value={newUser.email} onChange={(event) => setNewUser({ ...newUser, email: event.target.value })} autoComplete="off" /></label>
            <label className="settings-field"><span className="settings-field__label">初始密码</span><input required minLength={12} maxLength={128} type="password" value={newUser.password} onChange={(event) => setNewUser({ ...newUser, password: event.target.value })} autoComplete="new-password" /></label>
            <label className="settings-field"><span className="settings-field__label">角色</span><select value={newUser.role} onChange={(event) => setNewUser({ ...newUser, role: event.target.value })}><option value="user">普通用户 · 仅分配店铺</option><option value="admin">管理员 · 全部店铺</option></select></label>
            {newUser.role === 'user' ? <div className="settings-field"><span className="settings-field__label">分配店铺</span><StoreChecks stores={data?.stores || []} value={newUser.storeIds} onChange={(storeIds) => setNewUser({ ...newUser, storeIds })} /></div> : null}
            <button className="primary-button" type="submit" disabled={busy === 'user'}>{busy === 'user' ? <LoaderCircle size={15} className="spin" /> : <Plus size={15} />}创建用户</button>
          </form>
        </section>
        <div className="admin-side-forms">
          <section className="panel admin-form-panel"><div className="settings-section-heading"><div><h2>新增店铺 / 站点</h2><p>店铺编码只需在当前租户内唯一。</p></div><Store size={19} /></div>
            <form onSubmit={createStore} className="admin-form admin-form--compact"><label className="settings-field"><span className="settings-field__label">店铺名称</span><input required value={newStore.name} onChange={(event) => setNewStore({ ...newStore, name: event.target.value })} /></label><div className="admin-inline-fields"><label className="settings-field"><span className="settings-field__label">编码</span><input required value={newStore.code} onChange={(event) => setNewStore({ ...newStore, code: event.target.value })} placeholder="US12" /></label><label className="settings-field"><span className="settings-field__label">站点</span><input required value={newStore.site} onChange={(event) => setNewStore({ ...newStore, site: event.target.value })} /></label></div><button className="secondary-button" type="submit" disabled={busy === 'store'}><Plus size={15} />新增店铺</button></form>
          </section>
          <details className="panel new-tenant-panel"><summary><Building2 size={17} /><span><strong>创建独立租户</strong><small>适合独立团队；数据、Agent 和 OAuth 均隔离</small></span></summary><form onSubmit={createTenant} className="admin-form"><label className="settings-field"><span className="settings-field__label">租户名称</span><input required value={newTenant.name} onChange={(event) => setNewTenant({ ...newTenant, name: event.target.value })} /></label><label className="settings-field"><span className="settings-field__label">首个店铺</span><input required value={newTenant.storeName} onChange={(event) => setNewTenant({ ...newTenant, storeName: event.target.value })} /></label><div className="admin-inline-fields"><label className="settings-field"><span className="settings-field__label">编码</span><input required value={newTenant.code} onChange={(event) => setNewTenant({ ...newTenant, code: event.target.value })} /></label><label className="settings-field"><span className="settings-field__label">站点</span><input required value={newTenant.site} onChange={(event) => setNewTenant({ ...newTenant, site: event.target.value })} /></label></div><button className="secondary-button" type="submit" disabled={busy === 'tenant'}>创建并切换</button></form></details>
        </div>
      </div>
      <section className="panel members-panel"><div className="settings-section-heading"><div><h2>成员与店铺分配</h2><p>普通用户只可读取勾选店铺；管理员自动访问本租户全部店铺。服务端每次请求都会复核。</p></div></div>
        <div className="protocol-table-scroll"><table className="members-table"><thead><tr><th>用户</th><th>角色</th><th>可访问店铺</th><th>状态</th><th>操作</th></tr></thead><tbody>{data?.users.map((member) => <MemberRow key={member.membershipId} member={member} stores={data.stores} onSave={(id, input) => run(`member-${id}`, () => apiFetch(`/api/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(input) }), '成员权限已更新')} />) || <tr><td colSpan="5"><LoaderCircle className="spin" size={20} /></td></tr>}</tbody></table></div>
      </section>
      <div className="permission-note"><strong>权限边界</strong><span>停用成员会清除其当前租户会话；最后一个启用中的管理员不能被停用或降级。</span></div>
    </main>
  </AppShell>;
}
