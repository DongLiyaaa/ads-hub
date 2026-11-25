import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../../lib/api.js';

const DEFAULT_STATE = { metricByComponent: {}, selectedEntity: null, comparePrevious: false, viewByComponent: {} };
const ChatViewStateContext = createContext(null);

function initialState(value) {
  return {
    metricByComponent: value?.metricByComponent || {},
    selectedEntity: value?.selectedEntity || null,
    comparePrevious: value?.comparePrevious === true,
    viewByComponent: value?.viewByComponent || {},
  };
}

export function ChatViewStateProvider({ children, messageId, storeId, value }) {
  const [viewState, setViewState] = useState(() => initialState(value));
  const [persistError, setPersistError] = useState('');
  const firstRender = useRef(true);
  const requestSequence = useRef(0);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return undefined;
    }
    if (!messageId || !storeId) return undefined;
    const sequence = ++requestSequence.current;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      apiFetch(`/api/chat/messages/${encodeURIComponent(messageId)}/view-state`, {
        method: 'PATCH', signal: controller.signal,
        body: JSON.stringify({ storeId, viewState }),
      }).then(() => {
        if (sequence === requestSequence.current) setPersistError('');
      }).catch((error) => {
        if (error.name !== 'AbortError' && sequence === requestSequence.current) setPersistError('视图状态暂未保存，本次联动仍可继续；刷新后可能恢复上次状态。');
      });
    }, 450);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [messageId, storeId, viewState]);

  useEffect(() => () => { requestSequence.current += 1; }, []);

  const setMetric = useCallback((componentId, metric) => {
    setViewState((previous) => ({ ...previous, metricByComponent: { ...previous.metricByComponent, [componentId]: metric } }));
  }, []);
  const setView = useCallback((componentId, view) => {
    setViewState((previous) => ({ ...previous, viewByComponent: { ...previous.viewByComponent, [componentId]: view } }));
  }, []);
  const selectEntity = useCallback((selectedEntity) => {
    setViewState((previous) => ({
      ...previous,
      selectedEntity: previous.selectedEntity?.type === selectedEntity?.type && previous.selectedEntity?.id === selectedEntity?.id ? null : selectedEntity,
    }));
  }, []);
  const setComparePrevious = useCallback((comparePrevious) => {
    setViewState((previous) => ({ ...previous, comparePrevious }));
  }, []);

  return <ChatViewStateContext.Provider value={{ viewState, setMetric, setView, selectEntity, setComparePrevious, persistError }}>
    {children}
    {persistError ? <div className="a2ui-persist-error" role="status">{persistError}</div> : null}
  </ChatViewStateContext.Provider>;
}

export function useChatViewState() {
  return useContext(ChatViewStateContext) || {
    viewState: DEFAULT_STATE,
    setMetric: () => {}, setView: () => {}, selectEntity: () => {}, setComparePrevious: () => {}, persistError: '',
  };
}
