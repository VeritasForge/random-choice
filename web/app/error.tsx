"use client";

import { useEffect } from "react";
import Notice from "@/components/Notice";

/**
 * 화면을 그리는 도중 예외가 나면 Next.js가 이 파일을 대신 보여 준다.
 * 이것이 없으면 Next.js의 영어 기본 화면("This page couldn't load" + Reload·Back)이 뜬다.
 * 한국어 안내와 이 앱의 생김새, 그리고 전체 새로고침 없이 다시 그리는 reset을
 * 주려고 이 파일을 둔다.
 *
 * 이벤트 처리 중에 난 오류는 page.tsx의 try/catch가 맡는다.
 * 여기는 그 그물에 걸리지 않는 렌더 경로 전용이다.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 배포 빌드는 화면에 원인을 남기지 않으므로 콘솔에라도 원본을 남긴다.
    console.error("[render] 화면을 그리지 못했습니다", error);
  }, [error]);

  return (
    // 아래 여백을 안전 영역만큼 벌리는 까닭은 app/page.tsx에 적어 두었다.
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-8 p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <Notice
        title="화면을 보여 주지 못했어요"
        description="잠시 후 다시 시도해 주세요. 문제가 계속되면 새로고침해 주세요."
        actions={[{ label: "다시 시도", onClick: reset }]}
      />
    </main>
  );
}
