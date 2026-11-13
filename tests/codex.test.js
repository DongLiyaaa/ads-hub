import { describe, expect, it } from 'vitest';
import { CodexCliError, extractModelName, getSystemPrompt } from '../server/codex.js';

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

  it('保留可返回给前端的错误状态', () => {
    const error = new CodexCliError('未找到 CLI', 503);
    expect(error.name).toBe('CodexCliError');
    expect(error.status).toBe(503);
    expect(error.message).toBe('未找到 CLI');
  });
});
