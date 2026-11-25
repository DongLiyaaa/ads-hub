import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import express from 'express';
import { CodexCliError } from './codex.js';
import { cancelCodexOAuth, getCodexOAuthState, startCodexOAuth } from './codexOAuth.js';
import { checkAgentConnection, isAgentAvailable, runAgentAnalysis } from './agentHealth.js';
import { processChatA2ui } from './a2uiChat.js';
import { AgentConfigError, getActiveAgentConfig, getAgentSettings, recordAgentCheck, saveAgentSettings } from './configStore.js';
import { checkDatabase, runMigrations } from './db.js';
import { getAnalysisDataset, getReportPayload, REPORT_TYPES, ReportDataError } from './reportData.js';
import { uploadReportExcel } from './reportImport.js';
import { seedDemoData } from './demoData.js';
import { getLatestAnalysis, saveAnalysis } from './analysisStore.js';
import { buildChatData, getChatContext } from './chatData.js';
import { getConversation, getRecentMessages, listConversations, saveChatExchange, saveChatViewState } from './chatStore.js';
import { deleteSkill, getSkillOptions, getSkillsForChat, listSkills, saveSkill } from './skills.js';
import {
  AuthError, authenticate, clearSessionCookie, createStore, createTenant, createTenantUser,
  getSessionPayload, getSetupStatus, listTenantAdmin, loginAdministratorOrUser, loginDemo, logout,
  requireAdmin, requireSameSiteRequest, setSessionCookie, setupAdministrator,
  switchTenant, updateTenantUser,
} from './tenancy.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const activeRequests = new Map();
const activeChatRequests = new Map();
const activeConversationRequests = new Map();
const activeTenantTasks = new Map();

function removeUnsupportedCharacters(value) {
  if (typeof value === 'string') return value.replaceAll('\u0000', '');
  if (Array.isArray(value)) return value.map(removeUnsupportedCharacters);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, removeUnsupportedCharacters(item)]));
  }
  return value;
}

function validatePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return '请求数据格式无效';
  if (!REPORT_TYPES.has(payload.reportType)) return '报表类型无效';
  if (!payload.storeId) return '缺少当前店铺';
  if (!payload.range?.startDate || !payload.range?.endDate) return '缺少分析时间范围';
  if (!Array.isArray(payload.daily) || !payload.daily.length) return '当前时间范围没有可分析数据';
  if (payload.reportType === 'placement') {
    if (!Array.isArray(payload.allPlacements?.rows) || !Array.isArray(payload.allCampaigns?.rows) || !Array.isArray(payload.allStrategies?.rows)) return '缺少完整广告位、广告活动或竞价策略数据';
    if (!Array.isArray(payload.allDaily?.rows)) return '缺少完整广告位每日趋势';
    if (payload.allCampaigns.rows.length > 100000 || payload.allDaily.rows.length > 10000) return '广告位数据量超过单次分析上限';
    return null;
  }
  if (payload.reportType === 'purchased-product') {
    if (!Array.isArray(payload.allPurchased?.rows) || !Array.isArray(payload.allAdvertised?.rows) || !Array.isArray(payload.allPaths?.rows)) return '缺少完整购买商品、广告商品或购买路径数据';
    if (!Array.isArray(payload.allDaily?.rows) || !Array.isArray(payload.topDailyPurchased?.rows)) return '缺少完整购买商品每日趋势';
    if (payload.allPaths.rows.length > 100000 || payload.allDaily.rows.length > 10000) return '购买商品数据量超过单次分析上限';
    return null;
  }
  if (!Array.isArray(payload.allKeywords?.rows) || !Array.isArray(payload.allCampaigns?.rows)) return '缺少完整关键词或广告活动数据';
  if (payload.allKeywords.rows.length > 100000 || payload.allCampaigns.rows.length > 10000) return '数据量超过单次分析上限';
  return null;
}

app.disable('x-powered-by');
app.use(express.json({ limit: '8mb' }));
app.use('/api', (request, response, next) => {
  response.set('Cache-Control', 'no-store');
  next();
});

app.get('/healthz', async (request, response) => {
  try {
    await checkDatabase();
    response.type('text').send('ok\n');
  } catch {
    response.status(503).type('text').send('database unavailable\n');
  }
});

app.get('/api/auth/status', async (request, response) => {
  response.json(await getSetupStatus());
});
app.post('/api/auth/setup', requireSameSiteRequest, async (request, response) => {
  const session = await setupAdministrator(request.body);
  setSessionCookie(request, response, session.token);
  response.status(201).json({ ok: true });
});
app.post('/api/auth/login', requireSameSiteRequest, async (request, response) => {
  const session = await loginAdministratorOrUser(request, request.body);
  setSessionCookie(request, response, session.token);
  response.json({ ok: true });
});
app.post('/api/auth/demo', requireSameSiteRequest, async (request, response) => {
  const session = await loginDemo();
  setSessionCookie(request, response, session.token);
  response.json({ ok: true });
});

app.use('/api', authenticate);
app.use('/api', (request, response, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return requireSameSiteRequest(request, response, next);
  return next();
});

app.get('/api/auth/session', async (request, response) => {
  response.json(await getSessionPayload(request.auth));
});
app.post('/api/auth/switch-tenant', async (request, response) => {
  await switchTenant(request.auth, request.body?.tenantId);
  response.json({ ok: true });
});
app.post('/api/auth/logout', async (request, response) => {
  await logout(request.auth);
  clearSessionCookie(response);
  response.json({ ok: true });
});

app.get('/api/admin/tenant', requireAdmin, async (request, response) => {
  response.json(await listTenantAdmin(request.auth));
});
app.post('/api/admin/tenants', requireAdmin, async (request, response) => {
  await createTenant(request.auth, request.body);
  response.status(201).json({ ok: true });
});
app.post('/api/admin/users', requireAdmin, async (request, response) => {
  await createTenantUser(request.auth, request.body);
  response.status(201).json({ ok: true });
});
app.patch('/api/admin/users/:membershipId', requireAdmin, async (request, response) => {
  await updateTenantUser(request.auth, request.params.membershipId, request.body);
  response.json({ ok: true });
});
app.post('/api/admin/stores', requireAdmin, async (request, response) => {
  await createStore(request.auth, request.body);
  response.status(201).json({ ok: true });
});

app.get('/api/skills', async (request, response) => {
  const [skills, options] = await Promise.all([
    listSkills(request.auth, { storeId: request.query.storeId || null }),
    getSkillOptions(request.auth),
  ]);
  response.json({ skills, options, isAdmin: request.auth.tenant.role === 'admin' });
});
app.post('/api/skills', async (request, response) => {
  const id = await saveSkill(request.auth, removeUnsupportedCharacters(request.body));
  response.status(201).json({ id });
});
app.put('/api/skills/:skillId', async (request, response) => {
  const id = await saveSkill(request.auth, removeUnsupportedCharacters(request.body), request.params.skillId);
  response.json({ id });
});
app.delete('/api/skills/:skillId', async (request, response) => {
  await deleteSkill(request.auth, request.params.skillId);
  response.json({ ok: true });
});

app.get('/api/chat/bootstrap', async (request, response) => {
  const [context, skills, agentConfig] = await Promise.all([
    getChatContext(request.auth, request.query.storeId),
    listSkills(request.auth, { storeId: request.query.storeId }),
    getActiveAgentConfig(request.auth.tenant.id),
  ]);
  response.json({
    ...context,
    skills,
    agent: {
      type: agentConfig.agentType,
      name: agentConfig.name,
      model: agentConfig.model || 'CLI 默认模型',
      timeoutSeconds: agentConfig.timeoutSeconds || 180,
      configured: isAgentAvailable(agentConfig.agentType),
    },
  });
});
app.get('/api/chat/conversations', async (request, response) => {
  response.json({ conversations: await listConversations(request.auth, request.query.storeId) });
});
app.get('/api/chat/conversations/:conversationId', async (request, response) => {
  response.json(await getConversation(request.auth, request.params.conversationId, request.query.storeId));
});
app.patch('/api/chat/messages/:messageId/view-state', async (request, response) => {
  const payload = removeUnsupportedCharacters(request.body);
  const result = await saveChatViewState(request.auth, request.params.messageId, payload?.storeId, payload?.viewState);
  response.json(result);
});
app.post('/api/chat/messages', async (request, response) => {
  const payload = removeUnsupportedCharacters(request.body);
  const message = String(payload?.message || '').trim();
  if (!message || message.length > 4000) return response.status(400).json({ error: '请输入 1–4000 个字符的问题' });
  const agentConfig = await getActiveAgentConfig(request.auth.tenant.id);
  if (!isAgentAvailable(agentConfig.agentType)) {
    return response.status(503).json({ error: `未找到 ${agentConfig.name}，请联系租户管理员检查 Agent 与模型配置。` });
  }
  const tenantId = request.auth.tenant.id;
  const clientRequestId = String(payload?.clientRequestId || '').trim();
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(clientRequestId)) return response.status(400).json({ error: '缺少有效的对话请求标识' });
  const conversationLockKey = `${tenantId}:${payload?.conversationId || `new:${request.auth.user.id}:${clientRequestId}`}`;
  const previousTask = activeTenantTasks.get(tenantId);
  if (previousTask?.clientDisconnected) {
    previousTask.controller.abort();
    await Promise.race([previousTask.done, new Promise((resolve) => setTimeout(resolve, 4000))]);
  }
  const tenantRequests = activeRequests.get(tenantId) || 0;
  const tenantChatRequests = activeChatRequests.get(tenantId) || 0;
  const tenantReportRequests = tenantRequests - tenantChatRequests;
  const totalRequests = [...activeRequests.values()].reduce((sum, count) => sum + count, 0);
  if (activeConversationRequests.has(conversationLockKey)) return response.status(409).json({ error: '当前对话正在生成，请等待本轮完成。' });
  if (tenantReportRequests >= 1 || tenantChatRequests >= 3 || totalRequests >= 5) return response.status(429).json({ error: '同时分析任务较多，请稍后重试；每个租户最多并行 3 个对话。' });

  const abortController = new AbortController();
  let resolveTaskDone;
  const taskDone = new Promise((resolve) => { resolveTaskDone = resolve; });
  const taskEntry = { controller: abortController, clientDisconnected: false, done: taskDone };
  const handleDisconnect = () => {
    if (response.writableEnded) return;
    taskEntry.clientDisconnected = true;
    abortController.abort();
  };
  request.on('aborted', handleDisconnect);
  response.on('close', handleDisconnect);
  activeRequests.set(tenantId, tenantRequests + 1);
  activeChatRequests.set(tenantId, tenantChatRequests + 1);
  activeConversationRequests.set(conversationLockKey, true);
  activeTenantTasks.set(tenantId, taskEntry);
  let stage = 'dataset';
  try {
    const [chatData, skills, history] = await Promise.all([
      buildChatData(request.auth, payload),
      getSkillsForChat(request.auth, payload?.skillIds || [], payload?.storeId),
      getRecentMessages(request.auth, payload?.conversationId, payload?.storeId),
    ]);
    const promptPayload = {
      reportType: 'advertising-chat',
      store: chatData.store,
      range: chatData.range,
      previousRange: chatData.previousRange,
      question: message,
      history,
      skills,
      reports: chatData.reports,
      previousReports: chatData.previousReports,
    };
    if (JSON.stringify(promptPayload).length > 6000000) {
      throw new ReportDataError('当前对话数据超过 6MB，请缩短时间范围后重试。', 413);
    }
    stage = 'model';
    const generated = await runAgentAnalysis(promptPayload, agentConfig, { signal: abortController.signal });
    const processed = processChatA2ui(generated.analysis, chatData);
    stage = 'database';
    const saved = await saveChatExchange(request.auth, {
      conversationId: payload?.conversationId || null,
      storeId: chatData.store.id,
      message,
      answer: processed.answer,
      ui: processed.ui,
      skills,
      dataSnapshot: chatData.dataSnapshot,
      agentType: agentConfig.agentType,
      model: generated.model,
    });
    if (response.writableEnded || taskEntry.clientDisconnected) return undefined;
    return response.status(201).json({ ...saved, data: chatData.dataSnapshot });
  } catch (error) {
    if (response.writableEnded || taskEntry.clientDisconnected || error?.status === 499) return undefined;
    if (error instanceof ReportDataError || error instanceof AgentConfigError || error instanceof AuthError) return response.status(error.status).json({ error: error.message });
    console.error('Agent chat failed:', `agent=${agentConfig.agentType}`, `stage=${stage}`, `name=${error.name}`, `code=${error.code || 'no-code'}`, `status=${error.status || 'no-status'}`);
    if (error instanceof CodexCliError) return response.status(error.status).json({ error: error.message });
    return response.status(502).json({ error: `${agentConfig.name} 对话或结果保存暂时失败，请稍后重试。` });
  } finally {
    request.off('aborted', handleDisconnect);
    response.off('close', handleDisconnect);
    if (activeTenantTasks.get(tenantId) === taskEntry) activeTenantTasks.delete(tenantId);
    const remainingChats = (activeChatRequests.get(tenantId) || 1) - 1;
    if (remainingChats) activeChatRequests.set(tenantId, remainingChats);
    else activeChatRequests.delete(tenantId);
    activeConversationRequests.delete(conversationLockKey);
    const remaining = (activeRequests.get(tenantId) || 1) - 1;
    if (remaining) activeRequests.set(tenantId, remaining);
    else activeRequests.delete(tenantId);
    resolveTaskDone();
  }
});

async function getPublicAgentSettings(tenantId) {
  const [settings, codexOAuth] = await Promise.all([getAgentSettings(tenantId), getCodexOAuthState(tenantId)]);
  return {
    ...settings,
    codexOAuth,
    configs: settings.configs.map((config) => ({ ...config, cliAvailable: isAgentAvailable(config.agentType) })),
  };
}

app.get('/api/config', async (request, response) => {
  const settings = await getPublicAgentSettings(request.auth.tenant.id);
  const active = settings.configs.find((config) => config.agentType === settings.activeAgent);
  response.json({
    provider: settings.activeAgent,
    model: active?.name || 'Agent',
    configured: isAgentAvailable(settings.activeAgent),
    activeAgent: settings.activeAgent,
    timeoutSeconds: active?.timeoutSeconds || 180,
  });
});

app.use('/api/agent-settings', requireAdmin);
app.get('/api/agent-settings', async (request, response) => {
  response.json(await getPublicAgentSettings(request.auth.tenant.id));
});
app.put('/api/agent-settings', async (request, response) => {
  await saveAgentSettings(request.auth.tenant.id, request.body?.activeAgent, request.body?.config || {});
  response.json(await getPublicAgentSettings(request.auth.tenant.id));
});
app.post('/api/agent-settings/check', async (request, response) => {
  const config = await getActiveAgentConfig(request.auth.tenant.id, request.body?.agentType);
  const result = await checkAgentConnection(config);
  await recordAgentCheck(request.auth.tenant.id, config.agentType, result);
  response.json({ ...result, settings: await getPublicAgentSettings(request.auth.tenant.id) });
});
app.get('/api/agent-settings/codex/oauth', async (request, response) => {
  response.json(await getCodexOAuthState(request.auth.tenant.id));
});
app.post('/api/agent-settings/codex/oauth/start', async (request, response) => {
  if ((activeRequests.get(request.auth.tenant.id) || 0) > 0) return response.status(409).json({ error: '请等待当前租户报表分析完成后再重新登录。' });
  response.status(202).json({ session: await startCodexOAuth(request.auth.tenant.id) });
});
app.post('/api/agent-settings/codex/oauth/cancel', async (request, response) => {
  cancelCodexOAuth(request.auth.tenant.id);
  response.json(await getCodexOAuthState(request.auth.tenant.id));
});

app.post('/api/reports/:reportType/upload', express.raw({ type: () => true, limit: '20mb' }), async (request, response) => {
  let sourceName = 'report.xlsx';
  try {
    if (request.headers['x-report-file-name']) sourceName = decodeURIComponent(request.headers['x-report-file-name']);
  } catch {
    throw new ReportDataError('文件名编码无效');
  }
  const result = await uploadReportExcel(request.auth, request.params.reportType, request.query.storeId, sourceName, request.body);
  response.status(result.duplicate ? 200 : 201).json(result);
});
app.get('/api/reports/:reportType', async (request, response) => {
  response.json(await getReportPayload(request.auth, request.params.reportType, request.query.storeId));
});
app.get('/api/analysis/latest', async (request, response) => {
  const { reportType, datasetId, storeId, startDate, endDate } = request.query;
  const dataset = await getAnalysisDataset(request.auth, { reportType, datasetId, storeId, range: { startDate, endDate } });
  const result = await getLatestAnalysis(dataset, { startDate, endDate });
  response.json({ result });
});
app.post('/api/analysis', async (request, response) => {
  const payload = removeUnsupportedCharacters(request.body);
  const validationError = validatePayload(payload);
  if (validationError) return response.status(400).json({ error: validationError });
  const agentConfig = await getActiveAgentConfig(request.auth.tenant.id);
  if (!isAgentAvailable(agentConfig.agentType)) {
    return response.status(503).json({ error: `未找到 ${agentConfig.name}，请联系租户管理员检查 Agent 与模型配置。` });
  }
  const tenantId = request.auth.tenant.id;
  const previousTask = activeTenantTasks.get(tenantId);
  if (previousTask?.clientDisconnected) {
    previousTask.controller.abort();
    await Promise.race([previousTask.done, new Promise((resolve) => setTimeout(resolve, 4000))]);
  }
  const tenantRequests = activeRequests.get(tenantId) || 0;
  const totalRequests = [...activeRequests.values()].reduce((sum, count) => sum + count, 0);
  if (tenantRequests >= 1 || totalRequests >= 2) return response.status(429).json({ error: '已有分析任务正在进行，请稍后重试。' });

  const abortController = new AbortController();
  let resolveTaskDone;
  const taskDone = new Promise((resolve) => { resolveTaskDone = resolve; });
  const taskEntry = { controller: abortController, clientDisconnected: false, done: taskDone };
  const handleDisconnect = () => {
    if (response.writableEnded) return;
    taskEntry.clientDisconnected = true;
    abortController.abort();
  };
  request.on('aborted', handleDisconnect);
  response.on('close', handleDisconnect);

  activeRequests.set(tenantId, tenantRequests + 1);
  activeTenantTasks.set(tenantId, taskEntry);
  let stage = 'dataset';
  try {
    const dataset = await getAnalysisDataset(request.auth, payload);
    const payloadSha256 = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    stage = 'model';
    const generated = await runAgentAnalysis(payload, agentConfig, { signal: abortController.signal });
    stage = 'database';
    const result = await saveAnalysis({ dataset, payload, result: generated, payloadSha256, agentConfig });
    if (response.writableEnded || taskEntry.clientDisconnected) return undefined;
    return response.json(result);
  } catch (error) {
    if (response.writableEnded || taskEntry.clientDisconnected || error?.status === 499) return undefined;
    if (error instanceof ReportDataError || error instanceof AgentConfigError || error instanceof AuthError) return response.status(error.status).json({ error: error.message });
    console.error('Agent analysis failed:', `agent=${agentConfig.agentType}`, `stage=${stage}`, `name=${error.name}`, `code=${error.code || 'no-code'}`, `status=${error.status || 'no-status'}`);
    if (error instanceof CodexCliError) return response.status(error.status).json({ error: error.message });
    return response.status(502).json({ error: `${agentConfig.name} 分析或结果保存暂时失败，请稍后重试。` });
  } finally {
    request.off('aborted', handleDisconnect);
    response.off('close', handleDisconnect);
    if (activeTenantTasks.get(tenantId) === taskEntry) activeTenantTasks.delete(tenantId);
    const remaining = (activeRequests.get(tenantId) || 1) - 1;
    if (remaining) activeRequests.set(tenantId, remaining);
    else activeRequests.delete(tenantId);
    resolveTaskDone();
  }
});

app.use((error, request, response, next) => {
  if (error?.type === 'entity.too.large') return response.status(413).json({ error: request.path.includes('/upload') ? 'Excel 文件不能超过 20MB。' : '分析数据超过 8MB，请缩小时间范围。' });
  if (error instanceof SyntaxError) return response.status(400).json({ error: '请求 JSON 格式无效。' });
  if (error instanceof AuthError || error instanceof ReportDataError || error instanceof AgentConfigError || error instanceof CodexCliError) return response.status(error.status).json({ error: error.message });
  console.error('Request failed:', error.name || 'Error');
  return response.status(500).json({ error: '服务暂时不可用，请稍后重试。' });
});

if (process.env.NODE_ENV === 'production') {
  const dist = path.resolve(__dirname, '../dist');
  app.use(express.static(dist, {
    setHeaders(response, filePath) {
      response.setHeader('X-Content-Type-Options', 'nosniff');
      response.setHeader('X-Frame-Options', 'DENY');
      response.setHeader('Referrer-Policy', 'no-referrer');
      if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else if (filePath.includes(`${path.sep}data${path.sep}`)) {
        response.setHeader('Cache-Control', 'no-cache');
      }
    },
  }));
  app.use((request, response, next) => {
    if (request.method !== 'GET' || !request.accepts('html')) return next();
    response.sendFile(path.join(dist, 'index.html'));
  });
}

const port = Number(process.env.PORT || (process.env.NODE_ENV === 'production' ? 80 : 8787));
const host = process.env.HOST || '0.0.0.0';

async function start() {
  await runMigrations();
  await seedDemoData();
  app.listen(port, host, () => {
    console.log(`ShareScope server listening on ${host}:${port} (${process.env.NODE_ENV || 'development'})`);
  });
}

start().catch((error) => {
  console.error('ShareScope startup failed:', error.name || 'Error');
  process.exitCode = 1;
});
