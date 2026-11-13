import { useMemo, useState } from 'react';
import { formatNumber } from '../lib/data.js';
import { layoutWordCloud, WORD_CLOUD_VIEWBOX } from '../lib/wordCloudLayout.js';

export default function WordCloud({ keywords }) {
  const [count, setCount] = useState(100);
  const words = useMemo(() => layoutWordCloud(keywords, count), [keywords, count]);

  return (
    <section className="panel wordcloud-panel" aria-labelledby="wordcloud-title">
      <div className="panel__header chart-header">
        <div>
          <h2 id="wordcloud-title">搜索词词云</h2>
          <p>字号代表搜索词展示量</p>
        </div>
        <label className="compact-select">
          <span className="sr-only">词云展示数量</span>
          <select value={count} onChange={(event) => setCount(Number(event.target.value))}>
            <option value={50}>前 50 词</option>
            <option value={100}>前 100 词</option>
            <option value={200}>前 200 词</option>
          </select>
        </label>
      </div>
      {words.length ? (
        <svg
          className="wordcloud-chart"
          style={{ height: 324 }}
          viewBox={`0 0 ${WORD_CLOUD_VIEWBOX.width} ${WORD_CLOUD_VIEWBOX.height}`}
          role="img"
          aria-label={`按展示量生成的前 ${words.length} 个搜索词词云，完整数据见关键词汇总表`}
        >
          {words.map((word) => (
            <text
              key={word.fullName}
              x={word.x}
              y={word.y}
              fill={word.color}
              fontSize={word.fontSize}
              fontFamily="system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
              fontWeight={500}
              textAnchor="middle"
              dominantBaseline="central"
              aria-hidden="true"
              data-keyword={word.fullName}
            >
              <title>{`${word.fullName}\n展示量  ${formatNumber(word.value)}`}</title>
              {word.name}
            </text>
          ))}
        </svg>
      ) : (
        <div className="chart-empty">当前时间范围暂无搜索词</div>
      )}
      <div className="chart-footnote">按展示量选取 · 悬浮查看完整词语与数值</div>
    </section>
  );
}
