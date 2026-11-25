import { describe, expect, it } from 'vitest';
import { CodexCliError, buildCodexPrompt, compactCodexPayload, extractModelName, getCodexFailureMessage, getSystemPrompt, runCodexAnalysis } from '../server/codex.js';
import { buildClaudeCodeArgs, runClaudeCodeAnalysis } from '../server/claude.js';
import { parseDeviceAuthOutput } from '../server/codexOAuth.js';

describe('Codex CLI 适配层', () => {
  it('从 CLI 输出中识别实际模型并兼容无模型信息', () => {
    expect(extractModelName('OpenAI Codex v0.163.0\nmodel: gpt-6-astra\nsandbox: read-only')).toBe('gpt-6-astra');
    expect(extractModelName('model:   gpt-test  \n')).toBe('gpt-test');
    expect(extractModelName('Codex CLI')).toBeNull();
  });

  it('按报表类型隔离系统提示词', () => {
    expect(getSystemPrompt({ reportType: 'placement' })).toContain('## 广告位结构与投入产出');
    expect(getSystemPrompt({ reportType: 'placement' })).not.toContain('## 词云结构分析');
    expect(getSystemPrompt({ report: 'US1 商品推广搜索词展示量份额' })).toContain('## 词云结构分析');
    expect(getSystemPrompt({})).not.toContain('## 广告位结构与投入产出');
  });

  it('从 Codex 设备授权输出提取官方地址和一次性代码', () => {
    const output = '\u001b[94mhttps://auth.openai.com/codex/device\u001b[0m\nEnter this one-time code\n\u001b[94mABCD-EFGH\u001b[0m';
    expect(parseDeviceAuthOutput(output)).toEqual({ verificationUrl: 'https://auth.openai.com/codex/device', userCode: 'ABCD-EFGH' });
    expect(parseDeviceAuthOutput('https://openai.com.example.org/device')).toEqual({ verificationUrl: null, userCode: null });
  });

  it('保留可返回给前端的错误状态', () => {
    const error = new CodexCliError('未找到 CLI', 503);
    expect(error.name).toBe('CodexCliError');
    expect(error.status).toBe(503);
    expect(error.message).toBe('未找到 CLI');
  });

  it('大请求使用列式压缩并保留全部分组，不依赖工具文件', () => {
    const payload = {
      reportType: 'advertising-chat',
      question: '分析高花费词',
      reports: {
        'search-share': {
          keywords: [
            { searchTerm: 'alpha', spend: 12.345678, acos: null },
            { searchTerm: 'beta', spend: 8.765432, acos: 25.126789 },
          ],
        },
      },
    };
    const compact = compactCodexPayload(payload);
    expect(compact.reports['search-share'].keywords).toEqual({
      columns: ['searchTerm', 'spend', 'acos'],
      rows: [['alpha', 12.3457, null], ['beta', 8.7654, 25.1268]],
    });
    const prompt = buildCodexPrompt({ ...payload, padding: 'x'.repeat(70000) });
    expect(prompt).toContain('columns + rows');
    expect(prompt).toContain('所有分组均完整保留');
    expect(prompt).toContain('不得调用任何工具');
    expect(prompt).not.toContain('只读文件');
  });

  it('小请求保留原始结构且自检不读取文件', () => {
    const payload = { reportType: 'advertising-chat', question: '分析高花费词' };
    expect(buildCodexPrompt(payload)).toContain(JSON.stringify(payload));
    expect(buildCodexPrompt(payload, true)).toBe('这是连通性自检。只回复 OK，不要调用任何工具。');
  });

  it('将 Codex 底层错误转换为可操作的提示且不泄露原始输出', () => {
    expect(getCodexFailureMessage('ERROR: maximum context length exceeded; secret-report-value')).toContain('缩短时间范围');
    expect(getCodexFailureMessage('HTTP 429: secret-report-value')).toContain('额度或请求频率');
    expect(getCodexFailureMessage('401 Unauthorized')).toContain('认证已失效');
    expect(getCodexFailureMessage('model not found')).toContain('模型不可用');
    expect(getCodexFailureMessage('unknown private-report-marker')).not.toContain('private-report-marker');
  });

  it('Claude Code 默认设置 low effort 避免长思考超时且隔离模型参数', () => {
    const args = buildClaudeCodeArgs({ model: 'gemini-4-carbon-medium' });
    expect(args).toContain('--effort');
    expect(args[args.indexOf('--effort') + 1]).toBe('low');
    expect(args.slice(-2)).toEqual(['--model', 'gemini-4-carbon-medium']);
  });

  it('客户端请求已中断时立即取消 Agent 分析并释放锁', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(runClaudeCodeAnalysis({}, {}, true, { signal: controller.signal })).rejects.toMatchObject({ status: 499 });
    await expect(runCodexAnalysis({}, {}, true, { signal: controller.signal })).rejects.toMatchObject({ status: 499 });
  });
});
