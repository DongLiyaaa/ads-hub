import { z } from 'zod';
import {
  Catalog, ColumnApi, DynamicStringSchema, DynamicValueSchema, spec,
} from '@a2ui/web_core/v1_0';

export const SHARE_SCOPE_CATALOG_ID = 'https://sharescope.local/a2ui/catalogs/advertising-chat/v1.json';
export const SHARE_SCOPE_SURFACE_ID = 'chat';

const title = DynamicStringSchema.optional().describe('简短中文标题；不得包含 HTML、链接或脚本。');
const trustedData = DynamicValueSchema.describe('只能绑定服务端提供的可信数据路径，禁止字面量或函数调用。');

export const MetricGroupApi = {
  name: 'MetricGroup',
  schema: spec(z.object({ title, data: trustedData }).strict(), { mixins: [] }),
};
export const TrendChartApi = {
  name: 'TrendChart',
  schema: spec(z.object({ title, data: trustedData }).strict(), { mixins: [] }),
};
export const MetricTableApi = {
  name: 'MetricTable',
  schema: spec(z.object({ title, data: trustedData }).strict(), { mixins: [] }),
};
export const DataScopeApi = {
  name: 'DataScope',
  schema: spec(z.object({ title, data: trustedData }).strict(), { mixins: [] }),
};
export const RecommendationListApi = {
  name: 'RecommendationList',
  schema: spec(z.object({ title, data: trustedData }).strict(), { mixins: [] }),
};

export const SHARE_SCOPE_COMPONENT_APIS = [
  ColumnApi,
  DataScopeApi,
  MetricGroupApi,
  TrendChartApi,
  MetricTableApi,
  RecommendationListApi,
];

export function createShareScopeCatalog(components = SHARE_SCOPE_COMPONENT_APIS) {
  return new Catalog(SHARE_SCOPE_CATALOG_ID, '1.0', components, [], {
    title: 'ShareScope 广告 AI 对话目录',
    description: '只读广告分析组件。所有业务数据由服务端数据模型提供。',
    instructions: '使用 Column 作为 root，将 DataScope、MetricGroup、TrendChart、MetricTable、RecommendationList 按需作为子组件。data 必须使用 @path 绑定，不能生成 updateDataModel、action 或函数调用。',
  });
}
