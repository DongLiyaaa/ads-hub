import { useEffect, useRef, useState } from 'react';
import { CalendarDays, Check, ChevronDown } from 'lucide-react';
import { shiftDate } from '../lib/data.js';

const displayDate = (date) => date.replaceAll('-', '/');

export default function DateRangeFilter({ minDate, maxDate, startDate, endDate, onChange }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ startDate, endDate });
  const containerRef = useRef(null);
  const buttonRef = useRef(null);

  const presets = [
    { key: 'all', label: '全部时间', start: minDate, end: maxDate },
    { key: '7', label: '近 7 天', start: shiftDate(maxDate, -6), end: maxDate },
    { key: '14', label: '近 14 天', start: shiftDate(maxDate, -13), end: maxDate },
    { key: '30', label: '近 30 天', start: shiftDate(maxDate, -29), end: maxDate },
  ].map((preset) => ({ ...preset, start: preset.start < minDate ? minDate : preset.start }));
  const selectedPreset = presets.find((preset) => preset.start === startDate && preset.end === endDate);

  useEffect(() => setDraft({ startDate, endDate }), [startDate, endDate, open]);

  useEffect(() => {
    if (!open) return undefined;
    const handlePointer = (event) => {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    };
    const handleKey = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('pointerdown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const applyPreset = (preset) => {
    onChange(preset.start, preset.end);
    setOpen(false);
  };

  const updateDraft = (field, value) => {
    const next = { ...draft, [field]: value };
    setDraft(next);
    if (next.startDate && next.endDate && next.startDate <= next.endDate) {
      onChange(next.startDate, next.endDate);
    }
  };

  return (
    <div className="date-filter" ref={containerRef}>
      <button
        ref={buttonRef}
        type="button"
        className={`date-filter__trigger${open ? ' is-open' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <CalendarDays size={18} aria-hidden="true" />
        <span className="date-filter__copy">
          <span className="date-filter__label">{selectedPreset?.label || '自定义时间'}</span>
          <span className="date-filter__value">{displayDate(startDate)} – {displayDate(endDate)}</span>
        </span>
        <ChevronDown size={16} className={open ? 'rotate' : ''} aria-hidden="true" />
      </button>

      {open && (
        <div className="date-popover" role="dialog" aria-label="选择数据时间范围">
          <div className="date-popover__heading">时间范围</div>
          <div className="preset-list">
            {presets.map((preset) => {
              const selected = preset.start === startDate && preset.end === endDate;
              return (
                <button
                  type="button"
                  className={`preset-option${selected ? ' is-selected' : ''}`}
                  key={preset.key}
                  onClick={() => applyPreset(preset)}
                >
                  <span>{preset.label}</span>
                  <span className="preset-option__dates">{displayDate(preset.start)} – {displayDate(preset.end)}</span>
                  {selected && <Check size={16} strokeWidth={2.5} aria-hidden="true" />}
                </button>
              );
            })}
          </div>
          <div className="custom-range">
            <div className="custom-range__title">自定义</div>
            <div className="custom-range__inputs">
              <label>
                <span>开始日期</span>
                <input
                  type="date"
                  min={minDate}
                  max={maxDate}
                  value={draft.startDate}
                  onChange={(event) => updateDraft('startDate', event.target.value)}
                />
              </label>
              <span className="range-separator" aria-hidden="true">—</span>
              <label>
                <span>结束日期</span>
                <input
                  type="date"
                  min={minDate}
                  max={maxDate}
                  value={draft.endDate}
                  onChange={(event) => updateDraft('endDate', event.target.value)}
                />
              </label>
            </div>
            {draft.startDate > draft.endDate && <p className="date-error">开始日期不能晚于结束日期</p>}
          </div>
        </div>
      )}
    </div>
  );
}
