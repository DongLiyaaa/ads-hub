import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getCodexHome } from './codexHome.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CODEX_CANDIDATES = [
  process.env.CODEX_CLI_PATH,
  path.resolve(__dirname, '../node_modules/.bin/codex'),
  '/Users/dongli/Library/Application Support/Code/agent-host/sdk-cache/codex/0.163.0/darwin-arm64/node_modules/@openai/codex-darwin-arm64/vendor/aarch64-apple-darwin/bin/codex',
  '/Users/dongli/Library/Application Support/zcbrowser/agent/codex-runtime/bin/codex',
].filter(Boolean);

const CODEX_CLI = CODEX_CANDIDATES.find((candidate) => existsSync(candidate));
const SEARCH_SHARE_PROMPT = `你是亚马逊广告数据分析专家。基于用户提供的完整汇总数据进行分析，不得编造数据，不得把相关性说成因果关系。
必须使用中文，输出恰好五个二级标题，顺序和标题名固定：
## 趋势图汇总与拆解
## 词云结构分析
## 核心关键词
## 最差五个广告活动
## 最差50个关键词
每节输出2至4条简短要点，使用“- ”列表，不要使用其他标题、表格、加粗或代码块。
趋势图需覆盖整体峰值、低谷、起止变化及TOP关键词分化；词云需覆盖展示集中度、头部词结构和长尾；核心关键词需兼顾销售、订单、CVR与ACOS；广告活动和低效关键词需引用具体名称、数值与评分拆解，并给出可执行但谨慎的优化建议。
数据覆盖范围内的全部关键词和广告活动均已提供。不要把局部样例说成全部数据，不要重复解释计算口径。金额单位为USD，比率字段单位为%。`;

const PLACEMENT_PROMPT = `你是亚马逊广告数据分析专家。基于用户提供的完整商品推广广告位汇总数据进行分析，不得编造数据，不得把相关性说成因果关系。
必须使用中文，输出恰好五个二级标题，顺序和标题名固定：
## 广告位结构与投入产出
## 每日趋势与异常
## 广告活动与广告位拆解
## 竞价策略组合分析
## 7天14天30天行动建议
每节输出2至4条简短要点，使用“- ”列表，不要使用其他标题、表格、加粗或代码块。
结构分析需比较花费、销售额和订单占比，并结合CTR、CPC、CVR、CPO、ACOS和ROAS；趋势需指出具体日期、峰值、低谷与起止变化；活动分析需引用具体活动、广告位、数值和命中原因；策略分析必须提示小样本限制；行动建议需区分扩量候选与风险复核，同时说明动作优势、潜在劣势和复核周期。
候选只是相对表现，不代表盈利。缺少毛利、目标ACOS、预算、当前广告位溢价、关键词、匹配模式和ASIN时，不得虚构这些维度，不得给出自动调价或自动执行指令。不要把局部样例说成全部数据，不要重复解释计算口径。金额单位为USD，比率字段单位为%。`;

const PURCHASED_PRODUCT_PROMPT = `你是亚马逊广告数据分析专家。基于用户提供的完整已购买商品汇总数据进行分析，不得编造数据，不得把相关性说成因果关系。
必须使用中文，输出恰好五个二级标题，顺序和标题名固定：
## 数据范围与承接结构
## 已购买ASIN承接分析
## 广告投放ASIN引流分析
## 关键路径与商品角色
## 7天14天30天行动建议
每节输出2至4条简短要点，使用“- ”列表，不要使用其他标题、表格、加粗或代码块。
必须区分广告投放ASIN与已购买ASIN：前者是引流入口，后者是购买承接。引用具体ASIN、销售额、订单、销售量、销售占比和来源数量；路径分析需指出高销售路径和商品角色，说明结论依据。
行动建议需按保留观察、补充数据、小预算验证分层，每项说明原因、优势、潜在劣势和复核周期。本报告只有7天内其他SKU销售额、订单和销售量，不是账户完整Same-ASIN或Cross-ASIN报告。缺少Spend、Clicks、Impressions、Purchased SKU、父子ASIN映射、利润、库存和购买ASIN直接投放效率，不得计算ACOS、CPO、CVR或CTR，不得判断同父体，不得把承接候选直接等同于适合投流，不得建议直接迁移预算。金额单位为USD，比率字段单位为%。`;

export function getSystemPrompt(payload) {
  if (payload?.reportType === 'placement') return PLACEMENT_PROMPT;
  if (payload?.reportType === 'purchased-product') return PURCHASED_PRODUCT_PROMPT;
  return SEARCH_SHARE_PROMPT;
}

export class CodexCliError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = 'CodexCliError';
    this.status = status;
  }
}

export function isCodexCliAvailable() {
  return Boolean(CODEX_CLI);
}

export function getCodexCliPath() {
  return CODEX_CLI || null;
}

export function extractModelName(output) {
  return output.match(/^model:\s*(.+)$/m)?.[1]?.trim() || null;
}

export async function runCodexAnalysis(payload, configuration = {}, selfCheck = false) {
  if (!CODEX_CLI) {
    throw new CodexCliError('未找到本机 Codex CLI，请配置 CODEX_CLI_PATH 后重试。', 503);
  }

  const workdir = await mkdtemp(path.join(os.tmpdir(), 'sharescope-codex-'));
  const isolatedCodexHome = path.join(workdir, 'codex-home');
  const useOAuth = configuration.authMethod === 'oauth';
  const useCustomProvider = !useOAuth && Boolean(configuration.baseUrl || configuration.apiKey);
  if (useCustomProvider) await mkdir(isolatedCodexHome, { recursive: true });
  if (useOAuth) await mkdir(getCodexHome(configuration.tenantId), { recursive: true, mode: 0o700 });
  const outputPath = path.join(workdir, 'analysis.md');
  const prompt = selfCheck
    ? '这是连通性自检。只回复 OK，不要调用任何工具。'
    : `${getSystemPrompt(payload)}\n\n请分析以下当前筛选范围内的完整汇总数据：\n${JSON.stringify(payload)}`;
  const timeoutMs = Math.min(Number(configuration.timeoutSeconds || 180), selfCheck ? 45 : 600) * 1000;
  const args = [
    'exec', '--ephemeral', '--skip-git-repo-check', '--ignore-rules',
    '--sandbox', 'read-only', '--color', 'never', '-c', 'mcp_servers={}',
    '-C', workdir, '-o', outputPath,
  ];
  if (configuration.model) args.push('-m', configuration.model);
  if (useOAuth) {
    args.push(
      '-c', 'model_provider="openai"',
      '-c', 'cli_auth_credentials_store_mode="file"',
    );
  } else if (useCustomProvider) {
    args.push(
      '-c', 'model_provider="sharescope"',
      '-c', 'model_providers.sharescope.name="ShareScope OpenAI Compatible"',
      '-c', `model_providers.sharescope.base_url=${JSON.stringify(configuration.baseUrl || 'https://api.openai.com/v1')}`,
      '-c', `model_providers.sharescope.wire_api=${JSON.stringify(configuration.wireApi || 'responses')}`,
    );
    if (configuration.apiKey) args.push('-c', 'model_providers.sharescope.env_key="SHARESCOPE_OPENAI_API_KEY"');
  }
  args.push('-');

  try {
    const cliOutput = await new Promise((resolve, reject) => {
      const child = spawn(CODEX_CLI, args, {
        cwd: workdir,
        env: {
          ...process.env,
          NO_COLOR: '1',
          ...(useCustomProvider ? { CODEX_HOME: isolatedCodexHome } : {}),
          ...(useOAuth ? { CODEX_HOME: getCodexHome(configuration.tenantId) } : {}),
          ...(!useOAuth && configuration.apiKey ? { SHARESCOPE_OPENAI_API_KEY: configuration.apiKey } : {}),
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let settled = false;
      let output = '';
      let killTimer;
      const appendOutput = (chunk) => {
        if (output.length < 65536) output = (output + chunk.toString()).slice(0, 65536);
      };
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        clearTimeout(killTimer);
        callback(value);
      };
      const timeout = setTimeout(() => {
        child.kill('SIGTERM');
        finish(reject, new CodexCliError('Codex 分析等待超时，请稍后重试。', 504));
        killTimer = setTimeout(() => child.kill('SIGKILL'), 3000);
        killTimer.unref();
      }, timeoutMs);

      child.stdout.on('data', appendOutput);
      child.stderr.on('data', appendOutput);
      child.stdin.on('error', () => {});
      child.on('error', () => {
        finish(reject, new CodexCliError('无法启动 Codex CLI，请检查安装与登录状态。', 503));
      });
      child.on('close', (code) => {
        if (code !== 0) {
          finish(reject, new CodexCliError('Codex CLI 分析失败，请检查登录状态或稍后重试。'));
          return;
        }
        finish(resolve, output);
      });
      child.stdin.end(prompt);
    });

    const analysis = (await readFile(outputPath, 'utf8')).trim();
    if (!analysis) throw new CodexCliError('Codex 返回了空分析，请重试。');
    const model = extractModelName(cliOutput);
    return { analysis, model: model ? `Codex CLI · ${model}` : `Codex CLI · ${configuration.model || 'CLI 默认模型'}` };
  } finally {
    await rm(workdir, { recursive: true, force: true });
  }
}
