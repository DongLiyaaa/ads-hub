import { useEffect, useRef, useState } from 'react';

export function formatAnalysisTime(value) {
  if (!value) return '生成时间未知';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(date);
}

export default function usePersistentAnalysis({ reportType, datasetId, range, createPayload }) {
  const [status, setStatus] = useState('idle');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [agentName, setAgentName] = useState('分析 Agent');
  const [agentTimeout, setAgentTimeout] = useState(190);
  const generationRef = useRef(null);
  const restoreRef = useRef(null);
  const payloadFactoryRef = useRef(createPayload);
  payloadFactoryRef.current = createPayload;

  useEffect(() => {
    generationRef.current?.abort();
    generationRef.current = null;
    restoreRef.current?.abort();
    const controller = new AbortController();
    restoreRef.current = controller;
    setResult(null);
    setError('');
    if (!datasetId) {
      setStatus('idle');
      return () => controller.abort();
    }

    setStatus('restoring');
    const query = new URLSearchParams({ reportType, datasetId, startDate: range.startDate, endDate: range.endDate });
    fetch(`/api/analysis/latest?${query}`, { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || `历史分析加载失败（${response.status}）`);
        if (restoreRef.current !== controller) return;
        setResult(body.result || null);
        setStatus(body.result ? 'success' : 'idle');
      })
      .catch((requestError) => {
        if (restoreRef.current !== controller || requestError.name === 'AbortError') return;
        setError(requestError.message || '历史分析加载失败，请稍后重试。');
        setStatus('error');
      });
    return () => controller.abort();
  }, [reportType, datasetId, range.startDate, range.endDate]);

  useEffect(() => () => {
    generationRef.current?.abort();
    restoreRef.current?.abort();
  }, []);

  const analyze = async () => {
    generationRef.current?.abort();
    restoreRef.current?.abort();
    const controller = new AbortController();
    generationRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), agentTimeout * 1000);
    setStatus('loading');
    setError('');
    try {
      const response = await fetch('/api/analysis', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadFactoryRef.current()), signal: controller.signal,
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `分析请求失败（${response.status}）`);
      if (!body.analysis || typeof body.analysis !== 'string') throw new Error('服务端未返回有效分析，请重试。');
      if (!body.persisted || !body.id || !body.version || !body.generatedAt) throw new Error('分析结果未确认保存，请重试。');
      if (generationRef.current !== controller) return;
      setResult(body);
      setStatus('success');
    } catch (requestError) {
      if (generationRef.current !== controller) return;
      setError(requestError.name === 'AbortError' ? '分析等待超时或已取消。如仍在等待，请稍后重试。' : requestError.message || 'AI 分析暂时失败，请稍后重试。');
      setStatus('error');
    } finally {
      window.clearTimeout(timeout);
      if (generationRef.current === controller) generationRef.current = null;
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/config', { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Agent 配置读取失败');
        setAgentName(body.model || '分析 Agent');
        setAgentTimeout(Math.min((Number(body.timeoutSeconds) || 180) + 10, 610));
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  return { status, result, error, analyze, agentName };
}
