import { useEffect, useMemo, useState } from 'react';
import {
  Bot, Check, CheckCircle2, CircleAlert, Clock3, Eye, EyeOff, KeyRound,
  LoaderCircle, LockKeyhole, Network, Save, Server, ShieldCheck, Terminal,
} from 'lucide-react';
import AppShell from '../components/AppShell.jsx';
import { formatAnalysisTime } from '../hooks/usePersistentAnalysis.js';

const AGENT_COPY = {
  codex: { name: 'Codex CLI', description: 'OpenAI 兼容模型服务', icon: Terminal },
  'claude-code': { name: 'Claude Code', description: 'Anthropic 模型协议', icon: Bot },
};

function toDraft(config) {
  return {
    protocol: config.protocol,
    baseUrl: config.baseUrl,
    model: config.model,
    wireApi: config.wireApi,
    timeoutSeconds: config.timeoutSeconds,
  };
}

function Field({ label, hint, children }) {
  return <label className="settings-field"><span className="settings-field__label">{label}</span>{children}{hint ? <small>{hint}</small> : null}</label>;
}

function CheckDetails({ result }) {
  if (!result) return null;
  return (
    <div className="agent-check-details" aria-live="polite">
      {result.checks.map((check) => (
        <div className="agent-check-row" key={check.id}>
          <span className={`check-icon check-icon--${check.status}`}>
            {check.status === 'success' ? <CheckCircle2 size={16} /> : check.status === 'error' ? <CircleAlert size={16} /> : <Clock3 size={16} />}
          </span>
          <div><strong>{check.label}</strong><p>{check.detail}</p></div>
        </div>
      ))}
    </div>
  );
}

export default function AgentSettingsPage() {
  const [settings, setSettings] = useState(null);
  const [selectedAgent, setSelectedAgent] = useState('codex');
  const [draft, setDraft] = useState(null);
  const [apiKey, setApiKey] = useState('');
  const [clearApiKey, setClearApiKey] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [checkResult, setCheckResult] = useState(null);

  const selectAgent = (agentType, nextSettings = settings) => {
    const config = nextSettings?.configs.find((item) => item.agentType === agentType);
    if (!config) return;
    setSelectedAgent(agentType);
    setDraft(toDraft(config));
    setApiKey('');
    setClearApiKey(false);
    setShowKey(false);
    setCheckResult(null);
    setError('');
    setNotice('');
  };

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/agent-settings', { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || '配置加载失败');
        setSettings(body);
        selectAgent(body.activeAgent, body);
      })
      .catch((loadError) => {
        if (loadError.name !== 'AbortError') setError(loadError.message || '配置加载失败');
      });
    return () => controller.abort();
  }, []);

  const current = settings?.configs.find((item) => item.agentType === selectedAgent);
  const active = settings?.configs.find((item) => item.agentType === settings.activeAgent);
  const dirty = useMemo(() => {
    if (!current || !draft) return false;
    return Boolean(apiKey || clearApiKey || JSON.stringify(toDraft(current)) !== JSON.stringify(draft));
  }, [current, draft, apiKey, clearApiKey]);

  const update = (field, value) => {
    setDraft((previous) => ({ ...previous, [field]: value }));
    setNotice('');
    setError('');
  };

  const save = async () => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/agent-settings', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activeAgent: selectedAgent, config: { ...draft, apiKey, clearApiKey } }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || '配置保存失败');
      setSettings(body);
      selectAgent(body.activeAgent, body);
      setNotice(`${AGENT_COPY[body.activeAgent].name} 已保存并设为当前分析 Agent`);
    } catch (saveError) {
      setError(saveError.message || '配置保存失败');
    } finally {
      setSaving(false);
    }
  };

  const check = async () => {
    setChecking(true);
    setError('');
    setNotice('');
    setCheckResult(null);
    try {
      const response = await fetch('/api/agent-settings/check', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentType: selectedAgent }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || '自检请求失败');
      setCheckResult(body);
      setSettings(body.settings);
    } catch (checkError) {
      setError(checkError.message || '自检请求失败');
    } finally {
      setChecking(false);
    }
  };

  return (
    <AppShell page="agent-settings" reportContext="工作区设置">
      <main className="dashboard agent-settings-page">
        <div className="page-heading">
          <div><h1>Agent 与模型配置</h1><p>选择报表分析执行器，配置模型服务并验证真实连通性。</p></div>
          <a className="secondary-button settings-back-link" href="#/search-share">返回报表</a>
        </div>

        {!settings || !draft ? (
          <section className="panel settings-loading" aria-live="polite">
            {error ? <><CircleAlert size={22} /><div><strong>配置暂时无法加载</strong><p>{error}</p></div><button className="secondary-button" onClick={() => window.location.reload()}>重新加载</button></> : <><LoaderCircle className="spin" size={22} /><span>正在读取 Agent 配置…</span></>}
          </section>
        ) : <>
          <section className="agent-selector" aria-label="选择分析 Agent">
            {Object.entries(AGENT_COPY).map(([id, copy]) => {
              const Icon = copy.icon;
              const selected = selectedAgent === id;
              const isActive = settings.activeAgent === id;
              return <button type="button" className={`agent-option${selected ? ' is-selected' : ''}`} key={id} onClick={() => selectAgent(id)} aria-pressed={selected}>
                <span className="agent-option__icon"><Icon size={22} /></span>
                <span className="agent-option__copy"><strong>{copy.name}</strong><small>{copy.description}</small></span>
                <span className="agent-option__state">{isActive ? '当前使用' : selected ? <Check size={17} /> : null}</span>
              </button>;
            })}
          </section>

          <div className="settings-layout">
            <section className="panel settings-form-panel" aria-labelledby="model-config-title">
              <div className="settings-section-heading"><div><h2 id="model-config-title">模型连接</h2><p>{AGENT_COPY[selectedAgent].name} · 配置版本 v{current.revision}</p></div><span className="protocol-badge"><Network size={14} />{current.protocol === 'openai' ? 'OpenAI 兼容协议' : 'Anthropic 协议'}</span></div>
              <div className="settings-form-grid">
                <Field label="Base URL" hint={selectedAgent === 'codex' ? '通常填写到 /v1；留空使用 Codex 当前登录与服务商。' : '填写 Anthropic 兼容服务根地址；留空使用 CLI 当前登录。'}>
                  <input type="url" value={draft.baseUrl} onChange={(event) => update('baseUrl', event.target.value)} placeholder={selectedAgent === 'codex' ? 'https://api.openai.com/v1' : 'https://api.anthropic.com'} autoComplete="url" />
                </Field>
                <Field label="模型名称" hint="使用服务商实际支持的模型 ID。">
                  <input value={draft.model} onChange={(event) => update('model', event.target.value)} placeholder={selectedAgent === 'codex' ? '留空使用 CLI 默认模型' : 'claude-opus-5-5'} autoComplete="off" />
                </Field>
                {selectedAgent === 'codex' ? <Field label="OpenAI 接口模式" hint="Codex 0.163.0 已移除 Chat Completions，仅使用 Responses API。">
                  <div className="settings-static-value"><Server size={16} />Responses API</div>
                </Field> : <Field label="Anthropic 接口" hint="由 Claude Code 使用 Messages API 发起请求。"><div className="settings-static-value"><Server size={16} />/v1/messages</div></Field>}
                <Field label="请求超时" hint="分析请求允许 15–600 秒；自检最长等待 45 秒。">
                  <div className="settings-input-suffix"><input type="number" min="15" max="600" value={draft.timeoutSeconds} onChange={(event) => update('timeoutSeconds', Number(event.target.value))} /><span>秒</span></div>
                </Field>
              </div>
              <div className="settings-key-field">
                <Field label="API Key" hint={current.hasApiKey && !clearApiKey ? `已保存 ${current.apiKeyHint}；留空表示不修改。密钥不会回显。` : '密钥仅用于服务端 Agent 请求，不会写入分析快照或返回浏览器。'}>
                  <div className="settings-key-input"><KeyRound size={16} /><input type={showKey ? 'text' : 'password'} value={apiKey} onChange={(event) => { setApiKey(event.target.value); setClearApiKey(false); }} placeholder={current.hasApiKey && !clearApiKey ? '留空保持已保存密钥' : '输入 API Key'} autoComplete="new-password" disabled={clearApiKey} /><button type="button" onClick={() => setShowKey((value) => !value)} aria-label={showKey ? '隐藏 API Key' : '显示 API Key'}>{showKey ? <EyeOff size={16} /> : <Eye size={16} />}</button></div>
                </Field>
                {current.hasApiKey ? <button type="button" className="text-button" onClick={() => { setClearApiKey((value) => !value); setApiKey(''); }}>{clearApiKey ? '取消清除' : '清除已保存密钥'}</button> : null}
              </div>
              {clearApiKey ? <p className="settings-warning"><CircleAlert size={14} />保存后将删除已保存密钥，并改用 CLI 登录或免认证服务。</p> : null}
              <div className="settings-actions">
                <button type="button" className="primary-button" onClick={save} disabled={saving || checking}>{saving ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />}{saving ? '正在保存…' : '保存并启用'}</button>
                <button type="button" className="secondary-button" onClick={check} disabled={saving || checking || dirty} title={dirty ? '请先保存配置，再执行自检' : '发送一次最小模型请求'}>{checking ? <LoaderCircle className="spin" size={16} /> : <ShieldCheck size={16} />}{checking ? '正在自检…' : '检查 Agent 连通性'}</button>
                {dirty ? <span className="settings-action-hint">有未保存修改，保存后可自检</span> : null}
              </div>
              {error ? <div className="settings-message settings-message--error" role="alert"><CircleAlert size={17} />{error}</div> : null}
              {notice ? <div className="settings-message settings-message--success" role="status"><CheckCircle2 size={17} />{notice}</div> : null}
            </section>

            <aside className="panel agent-status-panel" aria-labelledby="agent-status-title">
              <div className="settings-section-heading"><div><h2 id="agent-status-title">运行状态</h2><p>当前报表分析使用的执行器</p></div><span className={`runtime-dot${active?.cliAvailable ? ' is-ready' : ''}`} /></div>
              <div className="active-agent-summary"><span>{active?.agentType === 'codex' ? <Terminal size={23} /> : <Bot size={23} />}</span><div><strong>{active?.name}</strong><p>{active?.protocol === 'openai' ? 'OpenAI 兼容协议' : 'Anthropic 协议'} · 配置 v{active?.revision}</p></div></div>
              <dl className="agent-status-list"><div><dt>所选 CLI</dt><dd>{current.cliAvailable ? '已检测到' : '未检测到'}</dd></div><div><dt>所选认证</dt><dd>{current.hasApiKey ? '已保存 API Key' : 'CLI 登录 / 免认证'}</dd></div><div><dt>所选模型</dt><dd title={current.model}>{current.model || 'CLI 默认模型'}</dd></div></dl>
              <div className={`last-check${checkResult?.status === 'error' || current.lastCheck?.status === 'error' ? ' is-error' : ''}`}>
                <strong>{checking ? '正在执行三项检查' : checkResult?.message || current.lastCheck?.message || '尚未执行连通性自检'}</strong>
                <p>{checking ? '依次检查 CLI、认证配置和最小模型请求。' : current.lastCheck?.checkedAt ? `${formatAnalysisTime(current.lastCheck.checkedAt)} · ${current.lastCheck.durationMs} ms` : '自检只发送“只回复 OK”，不会读取报表数据。'}</p>
              </div>
              <CheckDetails result={checkResult} />
              <p className="self-check-cost">点击自检会产生一次最小模型请求，可能消耗少量模型额度。</p>
            </aside>
          </div>

          <section className="panel protocol-panel" aria-labelledby="protocol-title">
            <div className="settings-section-heading"><div><h2 id="protocol-title">协议匹配</h2><p>执行器与协议固定匹配，避免把不兼容的请求直接发给模型服务。</p></div><LockKeyhole size={18} /></div>
            <div className="protocol-table-scroll"><table className="protocol-table"><thead><tr><th>执行器</th><th>协议</th><th>优势</th><th>限制</th></tr></thead><tbody><tr><td>Codex CLI</td><td>OpenAI Responses</td><td>兼容 OpenAI 及支持 Responses 的网关</td><td>当前 CLI 不支持仅提供 Chat Completions 的服务</td></tr><tr><td>Claude Code</td><td>Anthropic Messages</td><td>直接使用 Claude Code 原生协议</td><td>OpenAI 服务需先经协议转换网关</td></tr></tbody></table></div>
          </section>
        </>}
      </main>
    </AppShell>
  );
}
