import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import StatsChart from "@/components/StatsChart";
import StatsOwnerMark from "@/components/StatsOwnerMark";
import { bucketLabel, fetchStats, parseUnit, type Unit } from "@/lib/stats";
import { checkBasicAuth } from "@/lib/statsAuth";

/** 검색 결과에 나오지 않게 한다. 운영자 전용 화면이다. */
export const metadata: Metadata = {
  title: "접속 통계",
  robots: { index: false, follow: false },
};

const UNITS: { unit: Unit; label: string }[] = [
  { unit: "day", label: "일" },
  { unit: "week", label: "주" },
  { unit: "month", label: "월" },
];

/**
 * 접속 통계. 판단은 lib/stats.ts·lib/statsAuth.ts에 있고 여기는 그린다.
 * headers()·searchParams를 읽으므로 요청마다 그려지는 동적 경로다.
 */
export default async function StatsPage({ searchParams }: PageProps<"/stats">) {
  // Proxy(proxy.ts)를 믿기만 하지 않고 한 번 더 확인한다. 틀리면 이 경로가 있다는 사실도 숨긴다.
  const authorization = (await headers()).get("authorization");
  if (!checkBasicAuth(authorization, process.env.STATS_PASSWORD ?? "")) {
    notFound();
  }

  const unit = parseUnit((await searchParams).unit);
  // 브라우저가 아니라 이 서버가 Go 서버를 부른다. 요청 시점에 읽는다(app/api/v1/nearby/route.ts와 같다).
  const result = await fetchStats(
    unit,
    process.env.API_ORIGIN ?? "http://localhost:8080",
    process.env.INTERNAL_API_KEY ?? "",
    fetch,
  );

  return (
    <main className="mx-auto w-full max-w-2xl bg-background px-4 py-6 text-foreground">
      <StatsOwnerMark />
      <h1 className="text-xl font-bold">접속 통계</h1>

      <nav aria-label="단위" className="mt-4 flex gap-2">
        {UNITS.map((u) => (
          <a
            key={u.unit}
            href={`/stats?unit=${u.unit}`}
            aria-current={u.unit === unit ? "page" : undefined}
            className={`flex min-h-12 min-w-12 items-center justify-center rounded-lg border border-line px-4 ${
              u.unit === unit ? "bg-accent text-accent-ink" : "bg-surface"
            }`}
          >
            {u.label}
          </a>
        ))}
      </nav>

      {result.ok ? (
        <>
          <p className="mt-6 flex items-center gap-2 text-sm text-muted">
            <span aria-hidden="true" className="inline-block size-3 bg-accent" />
            방문자
          </p>
          <StatsChart buckets={result.buckets} unit={unit} />

          <table className="mt-6 w-full text-left">
            <thead className="text-sm text-muted">
              <tr>
                <th className="py-2 font-normal">날짜</th>
                <th className="py-2 text-right font-normal">방문자</th>
                <th className="py-2 text-right font-normal">방문 횟수</th>
              </tr>
            </thead>
            <tbody>
              {[...result.buckets].reverse().map((b) => (
                <tr key={b.start} className="border-t border-line">
                  <td className="py-2">{bucketLabel(b.start, unit)}</td>
                  <td className="py-2 text-right tabular-nums">{b.visitors}</td>
                  <td className="py-2 text-right tabular-nums">{b.visits}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <p role="alert" className="mt-6 rounded-lg border border-line bg-surface p-4">
          통계를 불러오지 못했어요. (상태 {result.status})
        </p>
      )}
    </main>
  );
}
