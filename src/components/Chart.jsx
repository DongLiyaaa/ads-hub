import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';

export default function Chart({ option, className, style, ariaLabel }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    const chart = echarts.init(containerRef.current, null, { renderer: 'canvas' });
    chartRef.current = chart;
    const observer = new ResizeObserver(() => {
      if (!chart.isDisposed()) chart.resize();
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
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
