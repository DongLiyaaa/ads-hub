import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Blocks, CheckCircle2, CircleAlert, LoaderCircle, Plus, Save, ShieldCheck, Trash2, UsersRound } from 'lucide-react';
import AppShell from '../components/AppShell.jsx';
import { apiFetch } from '../lib/api.js';

function emptyDraft(userId, isAdmin) {
  return { name: '', description: '', body: '', userIds: isAdmin ? [] : [userId], storeIds: [] };
}

function PermissionChecks({ items, value, onChange, type, disabled }) {
  if (!items.length) return <p className="permission-empty">当前没有可选择的{type === 'user' ? '用户' : '店铺＋站点'}。</p>;
  return <div className="skill-permission-checks">{items.map((item) => {
    const id = item.id;
    const checked = value.includes(id);
    return <label key={id} className={checked ? 'is-selected' : ''}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={() => onChange(checked ? value.filter((itemId) => itemId !== id) : [...value, id])} />
      <span><strong>{type === 'user' ? item.displayName : item.name}</strong><small>{type === 'user' ? `${item.email} · ${item.role === 'admin' ? '管理员' : '普通用户'}` : `${item.code} · ${item.site}`}</small></span>
    </label>;
  })}</div>;
}

function validate(draft) {
  const errors = {};
  if (!draft.name.trim()) errors.name = '请填写 Skill 名称';
  if (!draft.description.trim()) errors.description = '请填写 Skill 描述';
  if (!draft.body.trim()) errors.body = '请填写 Skill 正文';
  if (!draft.userIds.length) errors.userIds = '请至少选择一名用户';
  if (!draft.storeIds.length) errors.storeIds = '请至少选择一个店铺＋站点';
  return errors;
}

export default function SkillManagementPage({ session, storeId, onStoreChange, onSwitchTenant, onLogout }) {
  const [data, setData] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const userInteracted = useRef(false);
  const isAdmin = session.currentTenant.role === 'admin';

  const load = useCallback(async () => {
    const body = await apiFetch('/api/skills');
    setData(body);
    return body;
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    apiFetch('/api/skills', { signal: controller.signal })
      .then((body) => {
        setData(body);
        const first = body.skills[0];
        if (first && !userInteracted.current) {
          setSelectedId(first.id);
          setDraft({ name: first.name, description: first.description, body: first.body, userIds: first.userIds, storeIds: first.storeIds });
        }
      })
      .catch((loadError) => { if (loadError.name !== 'AbortError') setError(loadError.message); });
    return () => controller.abort();
  }, []);

  const selected = useMemo(() => data?.skills.find((skill) => skill.id === selectedId), [data, selectedId]);
  const canEdit = !selectedId || selected?.canEdit;

  const selectSkill = (skill) => {
    userInteracted.current = true;
    setSelectedId(skill.id);
    setDraft({ name: skill.name, description: skill.description, body: skill.body, userIds: skill.userIds, storeIds: skill.storeIds });
    setFieldErrors({});
    setError('');
    setNotice('');
  };
  const createNew = () => {
    userInteracted.current = true;
    setSelectedId(null);
    setDraft(emptyDraft(session.user.id, isAdmin));
    setFieldErrors({});
    setError('');
    setNotice('');
  };
  const update = (field, value) => {
    setDraft((previous) => ({ ...previous, [field]: value }));
    setFieldErrors((previous) => ({ ...previous, [field]: undefined }));
    setNotice('');
  };

  const save = async (event) => {
    event.preventDefault();
    const errors = validate(draft);
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const result = await apiFetch(selectedId ? `/api/skills/${selectedId}` : '/api/skills', {
        method: selectedId ? 'PUT' : 'POST', body: JSON.stringify(draft),
      });
      const body = await load();
      const saved = body.skills.find((skill) => skill.id === result.id);
      setSelectedId(result.id);
      if (saved) setDraft({ name: saved.name, description: saved.description, body: saved.body, userIds: saved.userIds, storeIds: saved.storeIds });
      setNotice(isAdmin ? 'Skill 与授权已保存，用户下次加载对话时即可使用' : '私有 Skill 已保存，仅自己可见；其他用户需由管理员分配');
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!selectedId || !window.confirm(`确定删除 Skill“${selected.name}”吗？历史对话中的快照会保留。`)) return;
    setSaving(true);
    setError('');
    try {
      await apiFetch(`/api/skills/${selectedId}`, { method: 'DELETE' });
      setSelectedId(null);
      setDraft(null);
      await load();
      setNotice('Skill 已删除，历史对话记录未受影响');
    } catch (deleteError) {
      setError(deleteError.message);
    } finally {
      setSaving(false);
    }
  };

  return <AppShell page="skills" session={session} storeId={storeId} onStoreChange={onStoreChange} onSwitchTenant={onSwitchTenant} onLogout={onLogout} reportContext="Skill 管理">
    <main className="dashboard skills-page">
      <div className="page-heading"><div><h1>Skill 管理</h1><p>创建可复用的广告分析方法，并按用户和店铺＋站点控制使用范围。</p></div><button type="button" className="primary-button" onClick={createNew}><Plus size={16} />新建 Skill</button></div>
      <div className="skill-security-note"><ShieldCheck size={17} /><span>普通用户创建后仅自己可见，管理员分配后其他授权用户才可见。站点授权不会扩大用户原有的数据权限。</span></div>
      {error ? <div className="settings-message settings-message--error" role="alert"><CircleAlert size={17} />{error}</div> : null}
      {notice ? <div className="settings-message settings-message--success" role="status"><CheckCircle2 size={17} />{notice}</div> : null}
      <div className="skills-layout">
        <section className="panel skill-library" aria-labelledby="skill-library-title">
          <div className="settings-section-heading"><div><h2 id="skill-library-title">可用 Skill</h2><p>{data?.skills.length || 0} 个 · {isAdmin ? '管理员可查看并分配本租户 Skill' : '包含我创建的与管理员分配的'}</p></div><Blocks size={19} /></div>
          <div className="skill-list">{data?.skills.map((skill) => <button type="button" key={skill.id} className={`skill-list-item${selectedId === skill.id ? ' is-selected' : ''}`} onClick={() => selectSkill(skill)}>
            <span className="skill-list-item__top"><strong>{skill.name}</strong><small>{skill.isOwner ? '我创建的' : '管理员分配'}</small></span>
            <span className="skill-list-item__description">{skill.description}</span>
            <span className="skill-list-item__meta">{skill.ownerName} · {skill.storeIds.length} 个店铺＋站点</span>
          </button>)}
          {data && !data.skills.length ? <div className="skill-list-empty"><Blocks size={24} /><strong>还没有可用 Skill</strong><p>点击“新建 Skill”，填写分析方法和权限。</p></div> : null}
          {!data && !error ? <div className="skill-list-empty"><LoaderCircle className="spin" size={22} /><span>正在加载…</span></div> : null}</div>
        </section>

        <section className="panel skill-editor" aria-labelledby="skill-editor-title">
          <div className="settings-section-heading"><div><h2 id="skill-editor-title">{selectedId ? (canEdit ? '编辑与授权' : 'Skill 详情') : '创建 Skill'}</h2><p>名称、描述、正文、用户权限和站点权限均为必填。</p></div>{selectedId && canEdit ? <button type="button" className="danger-icon-button" onClick={remove} disabled={saving} aria-label="删除当前 Skill" title="删除 Skill"><Trash2 size={17} /></button> : <UsersRound size={19} />}</div>
          {!draft ? <div className="skill-editor-empty"><p>从左侧选择 Skill，或创建一个新的分析方法。</p></div> : <form className="skill-form" onSubmit={save}>
            <label className="settings-field"><span className="settings-field__label">Skill 名称 *</span><input value={draft.name} readOnly={!canEdit} maxLength={100} onChange={(event) => update('name', event.target.value)} aria-invalid={Boolean(fieldErrors.name)} placeholder="例如：低效搜索词诊断" />{fieldErrors.name ? <small className="field-error">{fieldErrors.name}</small> : null}</label>
            <label className="settings-field"><span className="settings-field__label">Skill 描述 *</span><textarea className="skill-description-input" value={draft.description} readOnly={!canEdit} maxLength={500} onChange={(event) => update('description', event.target.value)} aria-invalid={Boolean(fieldErrors.description)} placeholder="说明适用场景、分析目标和输出重点" />{fieldErrors.description ? <small className="field-error">{fieldErrors.description}</small> : null}</label>
            <label className="settings-field"><span className="settings-field__label">Skill 正文 *</span><textarea className="skill-body-input" value={draft.body} readOnly={!canEdit} maxLength={20000} onChange={(event) => update('body', event.target.value)} aria-invalid={Boolean(fieldErrors.body)} placeholder="填写具体分析步骤、指标口径、判断规则和输出格式…" /><small className={fieldErrors.body ? 'field-error' : ''}>{fieldErrors.body || `${draft.body.length} / 20000 字；正文会作为本轮已授权的分析指令加载。`}</small></label>
            <fieldset className="skill-permissions" disabled={!canEdit}><legend>用户权限 *</legend><p>{isAdmin ? '选择可加载此 Skill 的本租户启用成员；创建者始终可查看自己的 Skill。' : '普通用户只能授权给自己；其他用户需要管理员分配。'}</p><PermissionChecks items={data?.options.users || []} value={draft.userIds} onChange={(value) => update('userIds', value)} type="user" disabled={!isAdmin} />{fieldErrors.userIds ? <small className="field-error">{fieldErrors.userIds}</small> : null}</fieldset>
            <fieldset className="skill-permissions" disabled={!canEdit}><legend>站点权限 *</legend><p>选择允许加载此 Skill 的店铺＋站点；实际数据仍需通过用户自身权限校验。</p><PermissionChecks items={data?.options.stores || []} value={draft.storeIds} onChange={(value) => update('storeIds', value)} type="store" disabled={!canEdit} />{fieldErrors.storeIds ? <small className="field-error">{fieldErrors.storeIds}</small> : null}</fieldset>
            {canEdit ? <div className="skill-form-actions"><button type="submit" className="primary-button" disabled={saving}>{saving ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />}{saving ? '正在保存…' : '保存 Skill 与权限'}</button><span>空名称、空正文或未选权限均不会保存。</span></div> : <p className="skill-readonly-note">此 Skill 由管理员分配，仅可查看和加载；如需调整权限，请联系管理员。</p>}
          </form>}
        </section>
      </div>
    </main>
  </AppShell>;
}
