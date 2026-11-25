import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';

export default function Chart({ option, className, style, ariaLabel, onClick }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const clickRef = useRef(onClick);
  clickRef.current = onClick;

  useEffect(() => {
    const chart = echarts.init(containerRef.current, null, { renderer: 'canvas' });
    chartRef.current = chart;
    const handleClick = (params) => clickRef.current?.(params);
    chart.on('click', handleClick);
    const observer = new ResizeObserver(() => {
      if (!chart.isDisposed()) chart.resize();
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      chart.off('click', handleClick);
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (chartRef.current && !chartRef.current.isDisposed()) {
      chartRef.current.setOption(option, { notMerge: true, lazyUpdate: false });
    }
  }, [option]);

  return <div ref={containerRef} className={className} style={style} role="img" aria-label={ariaLabel} />;
}
