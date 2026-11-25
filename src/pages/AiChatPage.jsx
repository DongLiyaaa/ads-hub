import { useEffect, useRef, useState } from 'react';
import { Bot, CalendarDays, Check, CircleAlert, Database, LoaderCircle, MessageSquareText, Plus, Send, ShieldCheck, Sparkles, SquareTerminal } from 'lucide-react';
import AppShell from '../components/AppShell.jsx';
import A2uiChatSurface from '../components/chat/A2uiChatSurface.jsx';
import { apiFetch } from '../lib/api.js';

const REPORT_LABELS = {
  'search-share': '搜索词展示份额',
  placement: '广告位报表',
  'purchased-product': '已购买商品',
};

const SUGGESTIONS = [
  '综合三类报表，找出当前最值得优先复核的广告问题',
  '哪些高花费搜索词需要关注？请结合广告位表现分析',
  '分析投放 ASIN 与已购买 ASIN 的主要销售承接路径',
];

function formatTime(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
}

export default function AiChatPage({ session, storeId, onStoreChange, onSwitchTenant, onLogout }) {
  const [context, setContext] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [range, setRange] = useState({ startDate: '', endDate: '' });
  const [selectedSkills, setSelectedSkills] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const messageEndRef = useRef(null);
  const requestSequence = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    const sequence = ++requestSequence.current;
    setLoading(true);
    setSending(false);
    setError('');
    setContext(null);
    setConversations([]);
    setSelectedId(null);
    setMessages([]);
    setSelectedSkills([]);
    setInput('');
    Promise.all([
      apiFetch(`/api/chat/bootstrap?storeId=${encodeURIComponent(storeId)}`, { signal: controller.signal }),
      apiFetch(`/api/chat/conversations?storeId=${encodeURIComponent(storeId)}`, { signal: controller.signal }),
    ]).then(([bootstrap, history]) => {
      if (sequence !== requestSequence.current) return;
      setContext(bootstrap);
      setRange(bootstrap.range || { startDate: '', endDate: '' });
      setConversations(history.conversations);
    }).catch((loadError) => {
      if (loadError.name !== 'AbortError' && sequence === requestSequence.current) setError(loadError.message);
    }).finally(() => {
      if (sequence === requestSequence.current) setLoading(false);
    });
    return () => controller.abort();
  }, [storeId]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ block: 'nearest', behavior: messages.length > 2 ? 'smooth' : 'auto' });
  }, [messages, sending]);

  const newConversation = () => {
    requestSequence.current += 1;
    setSelectedId(null);
    setMessages([]);
    setError('');
    setInput('');
  };

  const openConversation = async (conversationId) => {
    if (sending || conversationId === selectedId) return;
    const sequence = ++requestSequence.current;
    setError('');
    try {
      const body = await apiFetch(`/api/chat/conversations/${conversationId}?storeId=${encodeURIComponent(storeId)}`);
      if (sequence !== requestSequence.current) return;
      setSelectedId(conversationId);
      setMessages(body.messages);
    } catch (loadError) {
      if (sequence === requestSequence.current) setError(loadError.message);
    }
  };

  const toggleSkill = (skillId) => {
    setSelectedSkills((previous) => previous.includes(skillId) ? previous.filter((id) => id !== skillId) : [...previous, skillId]);
  };

  const send = async (event) => {
    event?.preventDefault();
    const message = input.trim();
    if (!message || sending || !context?.agent.configured) return;
    if (!range.startDate || !range.endDate || range.endDate < range.startDate) {
      setError('请选择有效的分析时间范围');
      return;
    }
    setSending(true);
    const sequence = ++requestSequence.current;
    setError('');
    const optimistic = { id: `local-${Date.now()}`, role: 'user', content: message, skills: context.skills.filter((skill) => selectedSkills.includes(skill.id)), createdAt: new Date().toISOString() };
    setMessages((previous) => [...previous, optimistic]);
    setInput('');
    try {
      const body = await apiFetch('/api/chat/messages', {
        method: 'POST',
        body: JSON.stringify({ conversationId: selectedId, storeId, ...range, message, skillIds: selectedSkills }),
      });
      if (sequence !== requestSequence.current) return;
      setSelectedId(body.conversation.id);
      setMessages((previous) => [...previous, body.assistantMessage]);
      setConversations((previous) => [body.conversation, ...previous.filter((item) => item.id !== body.conversation.id)]);
    } catch (sendError) {
      if (sequence !== requestSequence.current) return;
      setMessages((previous) => previous.filter((item) => item.id !== optimistic.id));
      setInput(message);
      setError(sendError.message);
    } finally {
      if (sequence === requestSequence.current) setSending(false);
    }
  };

  const availableCount = Object.values(context?.datasets || {}).filter(Boolean).length;
  const selectedSkillNames = context?.skills.filter((skill) => selectedSkills.includes(skill.id)).map((skill) => skill.name) || [];

  return <AppShell page="ai-chat" session={session} storeId={storeId} onStoreChange={onStoreChange} onSwitchTenant={onSwitchTenant} onLogout={onLogout} reportContext="广告 AI 对话">
    <main className="dashboard ai-chat-page">
      <div className="page-heading"><div><h1>广告 AI 对话</h1><p>围绕当前店铺＋站点的三类广告数据连续提问，并按需加载 Skill。</p></div><button type="button" className="primary-button" onClick={newConversation} disabled={sending}><Plus size={16} />新对话</button></div>
      <div className="chat-agent-bar"><span className="chat-agent-bar__icon">{context?.agent.type === 'claude-code' ? <Bot size={19} /> : <SquareTerminal size={19} />}</span><div><strong>{context?.agent.name || '管理员启用的 Agent'}</strong><small>{context ? `${context.agent.model} · 由租户管理员统一配置` : '正在读取当前配置…'}</small></div><span className={`chat-agent-state${context?.agent.configured ? ' is-ready' : ''}`}>{context?.agent.configured ? '运行时就绪' : '等待检查配置'}</span></div>
      {error ? <div className="settings-message settings-message--error" role="alert"><CircleAlert size={17} />{error}</div> : null}
      <div className="chat-layout">
        <aside className="panel conversation-panel" aria-label="我的历史对话">
          <div className="conversation-panel__heading"><strong>我的对话</strong><span>{conversations.length}</span></div>
          <div className="conversation-list">{conversations.map((conversation) => <button type="button" key={conversation.id} className={selectedId === conversation.id ? 'is-selected' : ''} onClick={() => openConversation(conversation.id)} disabled={sending}><MessageSquareText size={15} /><span><strong>{conversation.title}</strong><small>{formatTime(conversation.updatedAt)}</small></span></button>)}
          {!loading && !conversations.length ? <div className="conversation-empty"><MessageSquareText size={22} /><p>当前店铺＋站点还没有对话。</p></div> : null}</div>
          <p className="conversation-privacy"><ShieldCheck size={13} />仅自己可见，其他用户无法读取</p>
        </aside>

        <section className="panel chat-workbench" aria-label="广告分析对话区">
          <div className="chat-context-toolbar">
            <div className="chat-range-fields"><CalendarDays size={16} /><label><span className="sr-only">开始日期</span><input type="date" value={range.startDate} onChange={(event) => setRange((previous) => ({ ...previous, startDate: event.target.value }))} disabled={!context || sending} /></label><span>至</span><label><span className="sr-only">结束日期</span><input type="date" value={range.endDate} onChange={(event) => setRange((previous) => ({ ...previous, endDate: event.target.value }))} disabled={!context || sending} /></label></div>
            <details className="chat-skill-picker"><summary><Sparkles size={15} /><span>{selectedSkills.length ? `已加载 ${selectedSkills.length} 个 Skill` : '加载 Skill（可选）'}</span></summary><div className="chat-skill-menu"><div><strong>本轮加载 Skill</strong><small>最多 8 个；仅显示您有权在当前店铺＋站点使用的 Skill</small></div>{context?.skills.map((skill) => <label key={skill.id}><input type="checkbox" checked={selectedSkills.includes(skill.id)} onChange={() => toggleSkill(skill.id)} disabled={sending || (!selectedSkills.includes(skill.id) && selectedSkills.length >= 8)} /><span><strong>{skill.name}</strong><small>{skill.description}</small></span>{selectedSkills.includes(skill.id) ? <Check size={15} /> : null}</label>)}{context && !context.skills.length ? <p>暂无可用 Skill，可先到“Skill 管理”创建。</p> : null}</div></details>
          </div>
          <div className="chat-data-scope"><Database size={14} /><span>数据范围：{Object.entries(REPORT_LABELS).map(([type, label]) => <span key={type} className={context?.datasets[type] ? 'is-available' : 'is-unavailable'}>{label}{context?.datasets[type] ? ` ${context.datasets[type].rowCount} 行` : ' 未导入'}</span>)}</span></div>

          <div className="chat-messages" aria-live="polite">
            {loading ? <div className="chat-empty"><LoaderCircle className="spin" size={25} /><strong>正在加载数据范围与历史对话…</strong></div> : messages.length ? messages.map((message) => <article key={message.id} className={`chat-message chat-message--${message.role}`}>
              <div className="chat-message__avatar">{message.role === 'user' ? session.user.displayName.slice(0, 1) : <Sparkles size={17} />}</div>
              <div className="chat-message__content"><div className="chat-message__meta"><strong>{message.role === 'user' ? '我' : '广告 AI'}</strong><span>{formatTime(message.createdAt)}</span></div><div className="chat-message__bubble">{message.content}</div><A2uiChatSurface key={`ui-${message.id}`} ui={message.ui} />{message.ui?.status === 'fallback' ? <div className="a2ui-fallback" role="status">本轮结构化视图未通过校验，已自动降级为文字分析。</div> : null}{message.skills?.length ? <div className="chat-message__skills"><Sparkles size={12} />{message.skills.map((skill) => skill.name).join('、')}</div> : null}{message.model ? <div className="chat-message__model">{message.model}</div> : null}</div>
            </article>) : <div className="chat-empty"><span className="chat-empty__icon"><MessageSquareText size={27} /></span><h2>从当前广告数据开始提问</h2><p>AI 会读取您有权访问的当前店铺＋站点数据。可选择下方问题，也可以输入自己的分析目标。</p><div className="chat-suggestions">{SUGGESTIONS.map((suggestion) => <button type="button" key={suggestion} onClick={() => setInput(suggestion)}>{suggestion}</button>)}</div></div>}
            {sending ? <div className="chat-thinking"><LoaderCircle className="spin" size={17} /><span>{context?.agent.name} 正在分析 {availableCount} 类报表{selectedSkillNames.length ? `，并加载 ${selectedSkillNames.join('、')}` : ''}…</span></div> : null}
            <div ref={messageEndRef} />
          </div>

          <form className="chat-composer" onSubmit={send}>
            {selectedSkillNames.length ? <div className="composer-skills"><Sparkles size={13} />本次加载：{selectedSkillNames.join('、')}</div> : null}
            <textarea value={input} onChange={(event) => setInput(event.target.value)} maxLength={4000} rows={3} placeholder="输入广告分析问题；Enter 发送，Shift + Enter 换行" onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(); } }} disabled={sending || !context} />
            <div className="chat-composer__footer"><span>仅发送当前授权范围的数据；AI 建议需人工复核，发送会产生模型费用。</span><button type="submit" className="primary-button" disabled={sending || !input.trim() || !context?.agent.configured || !availableCount}>{sending ? <LoaderCircle className="spin" size={16} /> : <Send size={16} />}{sending ? '正在分析…' : '发送'}</button></div>
          </form>
        </section>
      </div>
    </main>
  </AppShell>;
}
