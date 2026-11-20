import React, { useEffect, useState } from 'react';
import { fetchWeather } from '../lib/weather.js';
import { Card, Pill } from './ui.jsx';

export default function WeatherStrip({ region }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    let alive = true;
    if (!region) return () => {};
    fetchWeather(region).then((res) => {
      if (alive) setData(res);
    });
    return () => {
      alive = false;
    };
  }, [region]);

  // 실패·로딩 중에는 아무 것도 그리지 않는다 (앱을 절대 막지 않음)
  if (!data || !data.ok || !data.list.length) return null;

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <p className="text-base font-extrabold text-slate-800">{data.region} 날씨 (오늘~3일)</p>
        <Pill tone={data.alert ? 'warn' : 'ok'}>{data.alert ? '일정 주의' : '작업 무난'}</Pill>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-1.5">
        {data.list.map((d) => (
          <div key={d.date} className="rounded-xl bg-slate-50 px-1 py-2 text-center">
            <p className="text-sm font-bold text-slate-500">{d.label}</p>
            <p className="text-2xl leading-8" aria-hidden>
              {d.emoji}
            </p>
            <p className="text-sm font-extrabold tabular-nums text-slate-800">
              {d.tMax}°<span className="text-slate-400">/{d.tMin}°</span>
            </p>
            <p className={`text-xs font-bold ${d.pop >= 50 ? 'text-sky-700' : 'text-slate-400'}`}>비 {d.pop}%</p>
          </div>
        ))}
      </div>

      {data.alert ? (
        <p className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-bold leading-6 text-amber-900">
          {data.alert.text}
        </p>
      ) : null}
    </Card>
  );
}
