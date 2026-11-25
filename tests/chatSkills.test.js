import { describe, expect, it } from 'vitest';
import { aggregateRows, validateChatRange } from '../server/chatData.js';
import { validateSkillInput } from '../server/skills.js';

const userId = '11111111-1111-4111-8111-111111111111';
const storeId = '22222222-2222-4222-8222-222222222222';

function validSkill(overrides = {}) {
  return {
    name: '低效搜索词诊断',
    description: '定位高花费低转化搜索词',
    body: '先汇总花费、订单和销售额，再给出人工复核建议。',
    userIds: [userId],
    storeIds: [storeId],
    ...overrides,
  };
}

describe('Skill 必填校验', () => {
  it.each(['name', 'description', 'body'])('拒绝空 %s', (field) => {
    expect(() => validateSkillInput(validSkill({ [field]: '  ' }))).toThrow('请填写');
  });

  it.each(['userIds', 'storeIds'])('拒绝空 %s', (field) => {
    expect(() => validateSkillInput(validSkill({ [field]: [] }))).toThrow('请至少选择');
  });

  it('清理正文并去重权限 ID', () => {
    const result = validateSkillInput(validSkill({ name: '  诊断  ', userIds: [userId, userId] }));
    expect(result.name).toBe('诊断');
    expect(result.userIds).toEqual([userId]);
  });
});

describe('对话数据范围与聚合', () => {
  it('拒绝无效、倒置或不存在的日期', () => {
    expect(() => validateChatRange('2026-02-30', '2026-03-01')).toThrow('有效的分析时间范围');
    expect(() => validateChatRange('2026-03-02', '2026-03-01')).toThrow('有效的分析时间范围');
    expect(validateChatRange('2026-03-01', '2026-03-02')).toEqual({ startDate: '2026-03-01', endDate: '2026-03-02' });
  });

  it('保留全部分组并从汇总值重算比率', () => {
    const rows = [
      { campaign: 'A', impressions: 100, clicks: 10, spend: 20, orders: 2, sales: 100 },
      { campaign: 'A', impressions: 100, clicks: 10, spend: 20, orders: 0, sales: 0 },
      { campaign: 'B', impressions: 50, clicks: 0, spend: 5, orders: 0, sales: 0 },
    ];
    const groups = aggregateRows(rows, ['campaign'], ['impressions', 'clicks', 'spend', 'orders', 'sales']);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ campaign: 'A', impressions: 200, clicks: 20, spend: 40, orders: 2, sales: 100, ctr: 10, cpc: 2, cvr: 10, acos: 40, roas: 2.5 });
    expect(groups[1].ctr).toBe(0);
    expect(groups[1].cpc).toBeNull();
    expect(groups[1].acos).toBeNull();
  });
});
