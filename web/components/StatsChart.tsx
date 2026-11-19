import { axisEndLabels, axisMax, bucketLabel, type Bucket, type Unit } from "@/lib/stats";

/*
  그림의 좌표계 폭을 폰 화면의 그래프 폭(390px 화면에서 약 358px)에 맞춰 360으로 둔다.
  SVG는 화면 폭에 맞춰 통째로 늘고 줄어서 글자 크기도 같은 비율로 변한다. 예전처럼 폭을 600으로 잡으면
  폰에서 0.6배가 되어 12px 글자가 7px로 읽히지 않았다. 360이면 폰에서 거의 1배라 글자가
  FONT(13)px 안팎으로 남는다. 넓은 화면에서 글자가 커지는 것은 아래 max-w-md(448px)로 막는다 —
  그 폭에서도 배율이 1.25배라 글자는 16px 안팎에 머문다. 막대는 SVG 도형이라 그대로 비율대로 늘어난다.
*/
const WIDTH = 360;
const HEIGHT = 200;
const FONT = 13;
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
  const endLabels = axisEndLabels(buckets, unit);
  const summary =
    first && last
      ? `방문자 막대그래프, ${bucketLabel(first.start, unit)}부터 ${bucketLabel(last.start, unit)}까지 ${buckets.length}칸, 합계 ${total}명`
      : "방문자 막대그래프, 데이터 없음";

  return (
    <svg role="img" aria-label={summary} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-auto w-full max-w-md">
      {/* 맨 위 눈금선과 바닥선 */}
      <line x1={LEFT} x2={WIDTH} y1={TOP} y2={TOP} stroke="var(--line)" strokeWidth={1} opacity={0.4} />
      <line x1={LEFT} x2={WIDTH} y1={TOP + PLOT_H} y2={TOP + PLOT_H} stroke="var(--line)" strokeWidth={1} />
      <text x={LEFT - 6} y={TOP + 4} textAnchor="end" fontSize={FONT} fill="var(--muted)">
        {top}
      </text>
      <text x={LEFT - 6} y={TOP + PLOT_H + 4} textAnchor="end" fontSize={FONT} fill="var(--muted)">
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
      {endLabels.map((label, i) => (
        <text
          key={i}
          x={i === 0 ? LEFT : WIDTH}
          y={HEIGHT - 8}
          textAnchor={i === 0 ? "start" : "end"}
          fontSize={FONT}
          fill="var(--muted)"
        >
          {label}
        </text>
      ))}
    </svg>
  );
}
