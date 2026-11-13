import { useState } from 'react';
import { Check, CheckCircle2, CircleAlert, Copy, ExternalLink, LoaderCircle, LogIn, X } from 'lucide-react';

export default function CodexOAuthPanel({ oauth, session, busy, disabled, onStart, onCancel }) {
  const [copied, setCopied] = useState(false);
  const pending = ['starting', 'waiting'].includes(session?.status);
  const waiting = session?.status === 'waiting' && session.verificationUrl && session.userCode;

  const copyCode = async () => {
    if (!session?.userCode || !navigator.clipboard) return;
    await navigator.clipboard.writeText(session.userCode);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="codex-oauth-panel">
      <div className="oauth-heading">
        <div><strong>ChatGPT 账号 OAuth</strong><p>通过 Codex CLI 设备授权登录，无需在页面填写 API Key。</p></div>
        <span className={`oauth-status${oauth?.loggedIn ? ' is-logged-in' : ''}`}>
          {oauth?.loggedIn ? <CheckCircle2 size={14} /> : <CircleAlert size={14} />}
          {oauth?.loggedIn ? '已登录' : oauth?.status === 'error' ? '状态检查失败' : '未登录'}
        </span>
      </div>

      {session?.status === 'starting' ? <div className="oauth-progress"><LoaderCircle className="spin" size={17} /><span>正在请求设备码，请稍候…</span></div> : null}
      {waiting ? (
        <div className="oauth-device-flow">
          <div className="oauth-step"><span>1</span><div><strong>打开 OpenAI 验证页面</strong><a href={session.verificationUrl} target="_blank" rel="noreferrer">{session.verificationUrl}<ExternalLink size={13} /></a></div></div>
          <div className="oauth-step"><span>2</span><div><strong>输入一次性设备码</strong><div className="oauth-code"><code>{session.userCode}</code><button type="button" onClick={copyCode} disabled={!navigator.clipboard}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? '已复制' : '复制'}</button></div></div></div>
          <div className="oauth-step"><span>3</span><div><strong>完成授权后返回本页</strong><p>页面会自动确认登录状态，设备码 15 分钟内有效。</p></div></div>
        </div>
      ) : null}
      {session && !pending && session.status !== 'success' ? <p className="oauth-session-message"><CircleAlert size={14} />{session.message}</p> : null}
      {session?.status === 'success' ? <p className="oauth-session-message is-success"><CheckCircle2 size={14} />{session.message}</p> : null}

      <div className="oauth-actions">
        {pending ? <button type="button" className="secondary-button" onClick={onCancel} disabled={busy}><X size={15} />取消本次登录</button> : <button type="button" className="secondary-button" onClick={onStart} disabled={busy || disabled}><LogIn size={15} />{oauth?.loggedIn ? '重新登录 OAuth' : '开始 OAuth 登录'}</button>}
        {pending ? <span><LoaderCircle className="spin" size={13} />正在等待浏览器授权</span> : null}
      </div>
      <p className="oauth-security-note">仅在确认是本人从本页面发起登录时继续。开始新登录会替换应用内现有 Codex CLI 凭据，其他同账号 CLI 会话可能需要重新登录；数据库中已保存的 API Key 不受影响。</p>
    </div>
  );
}
