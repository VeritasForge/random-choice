import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import VisitBeacon from "@/components/VisitBeacon";
import { parseShare, sharePath, shareTitle, type Share } from "@/lib/share";
import { SHEET_SANDBOX } from "@/lib/sheet";
import { shareMetadata, SITE_NAME } from "@/lib/site";

/**
 * 주소에서 공유 내용을 읽는다. 장소 번호가 틀리면 없는 페이지로 답한다.
 * 판단은 lib/share.ts의 parseShare가 하고, 여기는 그 결과를 응답으로 옮기기만 한다.
 */
async function readShare({ params, searchParams }: PageProps<"/s/[placeNo]">): Promise<Share> {
  const [{ placeNo }, { c }] = await Promise.all([params, searchParams]);
  const share = parseShare(placeNo, c);
  if (share === null) {
    notFound();
  }
  return share;
}

/**
 * 링크 미리보기와 브라우저 탭에 나갈 정보. 무엇이 들어가는지는 lib/site.ts의 shareMetadata에 있다.
 *
 * 대표 주소에는 우리가 아는 종류만 적는다. 주소에 온 모르는 종류 값을 옮겨 적지 않는 것은
 * "주소에 담긴 글자를 화면에 그대로 내지 않는다"는 이 화면의 원칙을 머리 정보에도 지키려는 것이다.
 */
export async function generateMetadata(props: PageProps<"/s/[placeNo]">): Promise<Metadata> {
  const share = await readShare(props);
  const path =
    share.cuisineId === null ? `/s/${share.placeNo}` : sharePath(share.placeNo, share.cuisineId);
  return shareMetadata(shareTitle(share.cuisineLabel), path);
}

/**
 * 누군가 `보내기`로 보낸 링크를 눌렀을 때 열리는 화면.
 *
 * 받은 사람은 이 서비스를 처음 보는 사람이다. 그래서 가게 정보를 버튼 없이 바로 보여 주고
 * (카카오 가게 페이지를 끼워 넣는다. 결과 화면의 가게 창 PlaceSheet와 같은 방식이다),
 * 그 아래에 `나도 뽑아 보기`를 둔다.
 *
 * **바깥 화면은 스크롤되지 않는다.** 화면 높이에 맞춘 상자 안에서 가게 페이지만 따로 스크롤된다.
 * `나도 뽑아 보기`가 아래로 밀려 안 보이면 이 화면이 있는 이유(새 사람이 서비스를 써 보는 것)가
 * 사라지기 때문이다.
 *
 * `카카오에서 열기`를 항상 두는 이유: 카카오가 다른 사이트 안에 표시되는 것을 막으면 끼워 넣은
 * 자리가 빈 화면이 된다. 주소가 다른 사이트의 iframe은 안을 들여다볼 수 없어 막혔는지를 알아낼
 * 믿을 만한 방법이 없으므로, 감지하지 않고 새 탭으로 가는 길을 늘 둔다.
 *
 * `나도 뽑아 보기`가 시작 화면으로 가는 이유: 받은 사람은 보낸 사람과 다른 곳에 있을 수 있다.
 * 보낸 사람의 위치를 물려주지 않고 자기 위치에서 새로 찾게 한다.
 */
export default async function SharedPage(props: PageProps<"/s/[placeNo]">) {
  const share = await readShare(props);

  return (
    <main className="mx-auto flex h-dvh w-full max-w-md flex-col gap-4 p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <header className="flex flex-col items-center gap-1 text-center">
        <p className="text-base text-muted">{SITE_NAME}</p>
        {share.cuisineLabel !== null ? (
          <h1 className="flex flex-col items-center gap-1 text-3xl font-semibold text-balance break-keep">
            <span className="text-lg font-normal text-muted">오늘은</span>
            {share.cuisineLabel}
          </h1>
        ) : (
          <h1 className="text-2xl font-semibold text-balance break-keep">
            오늘 점심, 여기 어때요?
          </h1>
        )}
      </header>

      <div className="flex min-h-0 grow flex-col overflow-hidden rounded-xl border border-line bg-surface">
        <iframe
          src={share.placeUrl}
          title="카카오 가게 페이지"
          sandbox={SHEET_SANDBOX}
          className="sheet-frame"
        />
      </div>

      <div className="flex flex-col gap-3">
        <a
          href={share.placeUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="btn btn-quiet w-full"
        >
          카카오에서 열기
        </a>
        <Link href="/" className="btn btn-primary w-full">
          나도 뽑아 보기
        </Link>
      </div>

      {/* 이 화면도 방문으로 센다. 공유로 온 방문을 따로 가르는 것은 다음 작업이다. */}
      <VisitBeacon />
    </main>
  );
}
