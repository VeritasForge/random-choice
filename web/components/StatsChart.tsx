import { axisMax, bucketLabel, type Bucket, type Unit } from "@/lib/stats";

const WIDTH = 600;
const HEIGHT = 220;
const LEFT = 36; // 세로 눈금 숫자 자리
const TOP = 12;
const BOTTOM = 28; // 가로 날짜 자리
const PLOT_W = WIDTH - LEFT;
const PLOT_H = HEIGHT - TOP - BOTTOM;

/**
 * 방문자 수 막대그래프(오래된 칸이 왼쪽). 서버 컴포넌트이고 상태가 없다.
 * 색은 globals.css의 변수(accent·line·muted)만 쓰므로 어두운 화면에 저절로 따라간다.
 */
export default function StatsChart({ buckets, unit }: { buckets: Bucket[]; unit: Unit }) {
  const top = axisMax(buckets.map((b) => b.visitors));
  const slot = buckets.length > 0 ? PLOT_W / buckets.length : PLOT_W;
  const barW = slot * 0.7;
  const total = buckets.reduce((sum, b) => sum + b.visitors, 0);
  const first = buckets[0];
  const last = buckets[buckets.length - 1];
  const summary =
    first && last
      ? `방문자 막대그래프, ${bucketLabel(first.start, unit)}부터 ${bucketLabel(last.start, unit)}까지 ${buckets.length}칸, 합계 ${total}명`
      : "방문자 막대그래프, 데이터 없음";

  return (
    <svg role="img" aria-label={summary} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-auto w-full">
      {/* 맨 위 눈금선과 바닥선 */}
      <line x1={LEFT} x2={WIDTH} y1={TOP} y2={TOP} stroke="var(--line)" strokeWidth={1} opacity={0.4} />
      <line x1={LEFT} x2={WIDTH} y1={TOP + PLOT_H} y2={TOP + PLOT_H} stroke="var(--line)" strokeWidth={1} />
      <text x={LEFT - 6} y={TOP + 4} textAnchor="end" fontSize={12} fill="var(--muted)">
        {top}
      </text>
      <text x={LEFT - 6} y={TOP + PLOT_H + 4} textAnchor="end" fontSize={12} fill="var(--muted)">
        0
      </text>
      {buckets.map((b, i) => {
        const h = (b.visitors / top) * PLOT_H;
        const x = LEFT + i * slot + (slot - barW) / 2;
        return (
          <rect key={b.start} x={x} y={TOP + PLOT_H - h} width={barW} height={h} fill="var(--accent)">
            <title>{`${bucketLabel(b.start, unit)}: 방문자 ${b.visitors}명`}</title>
          </rect>
        );
      })}
      {first && last && (
        <>
          <text x={LEFT} y={HEIGHT - 8} textAnchor="start" fontSize={12} fill="var(--muted)">
            {bucketLabel(first.start, unit)}
          </text>
          <text x={WIDTH} y={HEIGHT - 8} textAnchor="end" fontSize={12} fill="var(--muted)">
            {bucketLabel(last.start, unit)}
          </text>
        </>
      )}
    </svg>
  );
}
