import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, MoveHorizontal } from 'lucide-react';

export default function HorizontalScroller({ children, className = '', label = '数据表格' }) {
  const viewportRef = useRef(null);
  const [scrollState, setScrollState] = useState({ overflow: false, left: false, right: false });

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;
    const update = () => {
      const maxScroll = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
      setScrollState({
        overflow: maxScroll > 1,
        left: viewport.scrollLeft > 1,
        right: viewport.scrollLeft < maxScroll - 1,
      });
    };
    update();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(viewport);
    if (viewport.firstElementChild) observer?.observe(viewport.firstElementChild);
    window.addEventListener('resize', update);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [children]);

  const updateScrollState = () => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const maxScroll = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    setScrollState({
      overflow: maxScroll > 1,
      left: viewport.scrollLeft > 1,
      right: viewport.scrollLeft < maxScroll - 1,
    });
  };

  const scroll = (direction) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    viewport.scrollBy({ left: direction * viewport.clientWidth * 0.78, behavior: reducedMotion ? 'auto' : 'smooth' });
  };

  return (
    <div className="horizontal-scroller">
      <div className="horizontal-scroller__toolbar">
        <span><MoveHorizontal size={14} aria-hidden="true" />{scrollState.overflow ? '左右滑动查看完整指标' : '全部列已显示'}</span>
        <div>
          <button type="button" onClick={() => scroll(-1)} disabled={!scrollState.left} aria-label={`${label}向左滚动`}><ArrowLeft size={15} aria-hidden="true" /></button>
          <button type="button" onClick={() => scroll(1)} disabled={!scrollState.right} aria-label={`${label}向右滚动`}><ArrowRight size={15} aria-hidden="true" /></button>
        </div>
      </div>
      <div
        ref={viewportRef}
        className={`horizontal-scroller__viewport ${className}`}
        onScroll={updateScrollState}
        tabIndex={0}
        role="region"
        aria-label={`${label}，可左右滚动`}
      >
        {children}
      </div>
    </div>
  );
}
