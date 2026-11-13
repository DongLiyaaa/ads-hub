import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import express from 'express';
import { CodexCliError } from './codex.js';
import { checkAgentConnection, isAgentAvailable, runAgentAnalysis } from './agentHealth.js';
import { AgentConfigError, getActiveAgentConfig, getAgentSettings, recordAgentCheck, saveAgentSettings } from './configStore.js';
import { checkDatabase, runMigrations } from './db.js';
import { getAnalysisDataset, getReportPayload, REPORT_TYPES, ReportDataError } from './reportData.js';
import { getLatestAnalysis, saveAnalysis } from './analysisStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
let activeRequests = 0;

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

app.get('/healthz', async (request, response) => {
  try {
    await checkDatabase();
    response.type('text').send('ok\n');
  } catch {
    response.status(503).type('text').send('database unavailable\n');
  }
});

async function getPublicAgentSettings() {
  const settings = await getAgentSettings();
  return {
    ...settings,
    configs: settings.configs.map((config) => ({ ...config, cliAvailable: isAgentAvailable(config.agentType) })),
  };
}

app.get('/api/config', async (request, response) => {
  const settings = await getPublicAgentSettings();
  const active = settings.configs.find((config) => config.agentType === settings.activeAgent);
  response.set('Cache-Control', 'no-store');
  response.json({
    provider: settings.activeAgent,
    model: active?.name || 'Agent',
    configured: isAgentAvailable(settings.activeAgent),
    activeAgent: settings.activeAgent,
    timeoutSeconds: active?.timeoutSeconds || 180,
  });
});

app.get('/api/agent-settings', async (request, response) => {
  response.set('Cache-Control', 'no-store');
  response.json(await getPublicAgentSettings());
});

app.put('/api/agent-settings', async (request, response) => {
  await saveAgentSettings(request.body?.activeAgent, request.body?.config || {});
  response.json(await getPublicAgentSettings());
});

app.post('/api/agent-settings/check', async (request, response) => {
  const config = await getActiveAgentConfig(request.body?.agentType);
  const result = await checkAgentConnection(config);
  await recordAgentCheck(config.agentType, result);
  response.json({ ...result, settings: await getPublicAgentSettings() });
});

app.get('/api/reports/:reportType', async (request, response) => {
  response.set('Cache-Control', 'no-store');
  response.json(await getReportPayload(request.params.reportType));
});

app.get('/api/analysis/latest', async (request, response) => {
  const { reportType, datasetId, startDate, endDate } = request.query;
  const dataset = await getAnalysisDataset({ reportType, datasetId, range: { startDate, endDate } });
  const result = await getLatestAnalysis(dataset, { startDate, endDate });
  response.set('Cache-Control', 'no-store');
  response.json({ result });
});

app.post('/api/analysis', async (request, response) => {
  const payload = removeUnsupportedCharacters(request.body);
  const validationError = validatePayload(payload);
  if (validationError) return response.status(400).json({ error: validationError });
  const agentConfig = await getActiveAgentConfig();
  if (!isAgentAvailable(agentConfig.agentType)) {
    return response.status(503).json({ error: `未找到 ${agentConfig.name}，请先在 Agent 与模型页面检查运行时。` });
  }
  if (activeRequests >= 2) return response.status(429).json({ error: '已有分析任务正在进行，请稍后重试。' });

  activeRequests += 1;
  let stage = 'dataset';
  try {
    const dataset = await getAnalysisDataset(payload);
    const payloadSha256 = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    stage = 'model';
    const generated = await runAgentAnalysis(payload, agentConfig);
    stage = 'database';
    const result = await saveAnalysis({ dataset, payload, result: generated, payloadSha256, agentConfig });
    return response.json(result);
  } catch (error) {
    if (error instanceof ReportDataError || error instanceof AgentConfigError) return response.status(error.status).json({ error: error.message });
    console.error('Agent analysis failed:', `agent=${agentConfig.agentType}`, `stage=${stage}`, `name=${error.name}`, `code=${error.code || 'no-code'}`, `status=${error.status || 'no-status'}`);
    if (error instanceof CodexCliError) {
      return response.status(error.status).json({ error: error.message });
    }
    return response.status(502).json({ error: `${agentConfig.name} 分析或结果保存暂时失败，请稍后重试。` });
  } finally {
    activeRequests -= 1;
  }
});

app.use((error, request, response, next) => {
  if (error?.type === 'entity.too.large') return response.status(413).json({ error: '分析数据超过 8MB，请缩小时间范围。' });
  if (error instanceof SyntaxError) return response.status(400).json({ error: '请求 JSON 格式无效。' });
  if (error instanceof ReportDataError || error instanceof AgentConfigError) return response.status(error.status).json({ error: error.message });
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
  app.listen(port, host, () => {
    console.log(`ShareScope server listening on ${host}:${port} (${process.env.NODE_ENV || 'development'})`);
  });
}

start().catch((error) => {
  console.error('ShareScope startup failed:', error.name || 'Error');
  process.exitCode = 1;
});
