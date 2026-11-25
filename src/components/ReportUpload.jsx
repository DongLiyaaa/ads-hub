import { useRef, useState } from 'react';
import { CircleAlert, FileCheck2, LoaderCircle, Upload } from 'lucide-react';
import { apiFetch } from '../lib/api.js';

const MAX_FILE_SIZE = 20 * 1024 * 1024;

export default function ReportUpload({ reportType, storeId, onUploaded, isDemo }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const upload = async (event) => {
    const file = event.target.files?.[0];
    if (!file || busy) return;
    setResult(null);
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      setResult({ error: true, message: '仅支持 .xlsx 文件，请先将 Excel 另存为该格式。' });
      event.target.value = '';
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setResult({ error: true, message: 'Excel 文件不能超过 20MB。' });
      event.target.value = '';
      return;
    }
    setBusy(true);
    try {
      const body = await apiFetch(`/api/reports/${reportType}/upload?${new URLSearchParams({ storeId })}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'X-Report-File-Name': encodeURIComponent(file.name),
        },
        body: file,
      });
      setResult({ error: false, message: body.duplicate ? `文件已上传过，未重复写入（${body.rowCount} 行）。` : `校验通过，已导入 ${body.rowCount} 行。` });
      await onUploaded();
    } catch (error) {
      setResult({ error: true, message: error.message || '上传失败，请检查后重试。' });
    } finally {
      setBusy(false);
      event.target.value = '';
    }
  };

  return <div className="report-upload">
    <input ref={inputRef} className="sr-only" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={upload} tabIndex={-1} aria-hidden="true" />
    <button type="button" className="secondary-button report-upload__button" onClick={() => inputRef.current?.click()} disabled={busy || isDemo || !storeId} title={isDemo ? 'Demo 为共享只读数据，请登录正式工作区上传' : '上传 Amazon 导出的 .xlsx；整表校验，重复文件自动去重'}>
      {busy ? <LoaderCircle className="spin" size={16} /> : <Upload size={16} />}{busy ? '正在校验上传…' : isDemo ? 'Demo 只读' : '上传 Excel'}
    </button>
    {result ? <div className={`report-upload__result${result.error ? ' is-error' : ' is-success'}`} role={result.error ? 'alert' : 'status'}>{result.error ? <CircleAlert size={15} /> : <FileCheck2 size={15} />}<span>{result.message}</span></div> : null}
  </div>;
}
