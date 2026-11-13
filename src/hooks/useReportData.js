import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../lib/api.js';
import { getCachedReport, setCachedReport } from '../lib/reportCache.js';

export default function useReportData({ reportType, userId, tenantId, storeId, prepare }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [cacheInfo, setCacheInfo] = useState(null);
  const generationRef = useRef(0);
  const controllerRef = useRef(null);

  const load = useCallback(async (force = false) => {
    const generation = ++generationRef.current;
    controllerRef.current?.abort();
    setError('');
    setCacheInfo(null);
    if (!storeId) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const identity = { userId, tenantId, storeId, reportType };
    try {
      if (!force) {
        const cached = await getCachedReport(identity);
        if (generationRef.current !== generation) return;
        if (cached) {
          setData(prepare(cached.payload));
          setCacheInfo({ source: 'cache', cachedAt: cached.cachedAt, expiresAt: cached.expiresAt });
          return;
        }
      }
      const controller = new AbortController();
      controllerRef.current = controller;
      const payload = await apiFetch(`/api/reports/${reportType}?${new URLSearchParams({ storeId })}`, { signal: controller.signal });
      if (generationRef.current !== generation) return;
      const prepared = prepare(payload);
      setData(prepared);
      const timestamps = await setCachedReport(identity, payload);
      if (generationRef.current !== generation) return;
      setCacheInfo(timestamps
        ? { source: 'network', cachedAt: timestamps.cachedAt, expiresAt: timestamps.expiresAt }
        : { source: 'network', cacheFailed: true });
    } catch (loadError) {
      if (generationRef.current !== generation || loadError.name === 'AbortError') return;
      setData(null);
      setError(loadError.message || '数据加载失败，请稍后重试');
    } finally {
      if (generationRef.current === generation) setLoading(false);
    }
  }, [reportType, userId, tenantId, storeId, prepare]);

  useEffect(() => {
    setData(null);
    load();
    return () => {
      generationRef.current += 1;
      controllerRef.current?.abort();
    };
  }, [load]);

  return { data, error, loading, cacheInfo, refresh: () => load(true) };
}
