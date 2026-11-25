import { AuthError } from './tenancy.js';

export const DEFAULT_VIEW_STATE = Object.freeze({
  metricByComponent: {}, selectedEntity: null, comparePrevious: false, viewByComponent: {},
});
const TOP_LEVEL_KEYS = ['metricByComponent', 'selectedEntity', 'comparePrevious', 'viewByComponent'];
const CHART_COMPONENTS = new Set(['TrendChart', 'RankingBarChart', 'CompositionBarChart', 'QuadrantScatterChart', 'ConversionFunnel', 'PurchasePathChart']);

function invalid(message = '视图状态未通过校验') {
  throw new AuthError(message, 400);
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, allowed) {
  if (!isObject(value) || Object.keys(value).some((key) => !allowed.includes(key))) invalid();
}

function readPointer(model, path) {
  if (typeof path !== 'string' || !path.startsWith('/')) return null;
  return path.slice(1).split('/').reduce((value, key) => isObject(value) && Object.hasOwn(value, key) ? value[key] : null, model);
}

export function validateChatViewState(input, uiPayload) {
  exactKeys(input, TOP_LEVEL_KEYS);
  const messages = Array.isArray(uiPayload?.messages) ? uiPayload.messages : [];
  const componentList = messages.find((message) => message?.updateComponents)?.updateComponents?.components || [];
  const model = messages.find((message) => message?.updateDataModel)?.updateDataModel?.value || {};
  const components = Object.fromEntries(componentList.filter((item) => item?.id && item.id !== 'root').map((item) => [item.id, item]));
  const metricByComponent = {};
  const viewByComponent = {};

  exactKeys(input.metricByComponent, Object.keys(components));
  if (Object.keys(input.metricByComponent).length > 30) invalid();
  for (const [componentId, selected] of Object.entries(input.metricByComponent)) {
    const component = components[componentId];
    const data = readPointer(model, component?.data?.['@path']);
    const allowed = new Set((data?.metricOptions || []).map((item) => item.key));
    const values = Array.isArray(selected) ? selected : [selected];
    const isTrend = component.component === 'TrendChart';
    if (!allowed.size || (isTrend && !Array.isArray(selected)) || (!isTrend && typeof selected !== 'string')) invalid();
    if (!values.length || values.length > (isTrend ? 2 : 1) || new Set(values).size !== values.length || values.some((key) => typeof key !== 'string' || !allowed.has(key))) invalid();
    metricByComponent[componentId] = Array.isArray(selected) ? [...selected] : selected;
  }

  exactKeys(input.viewByComponent, Object.keys(components));
  if (Object.keys(input.viewByComponent).length > 30) invalid();
  for (const [componentId, view] of Object.entries(input.viewByComponent)) {
    if (!CHART_COMPONENTS.has(components[componentId]?.component) || !['chart', 'table'].includes(view)) invalid();
    viewByComponent[componentId] = view;
  }

  if (typeof input.comparePrevious !== 'boolean') invalid('上期对比状态无效');
  let selectedEntity = null;
  if (input.selectedEntity !== null) {
    exactKeys(input.selectedEntity, ['type', 'id']);
    const { type, id } = input.selectedEntity;
    if (typeof type !== 'string' || typeof id !== 'string' || !type || !id || type.length > 120 || id.length > 500) invalid('联动对象无效');
    const matched = Object.values(components).some((component) => {
      const data = readPointer(model, component.data?.['@path']);
      return data?.entityType === type && [...(data.rows || []), ...(data.links || [])].some((row) => row.entityId === id);
    });
    if (!matched) invalid('联动对象不在当前消息的可信数据范围内');
    selectedEntity = { type, id };
  }
  return { metricByComponent, selectedEntity, comparePrevious: input.comparePrevious, viewByComponent };
}
