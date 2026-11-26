"use client";

import { type ReactNode, useState } from "react";
import { sendShare, type ShareDeps, type ShareOutcome } from "@/lib/share";

type Props = {
  /** 함께 보낼 글. lib/share.ts의 shareText가 만든다. */
  text: string;
  /** 공유 화면의 경로. lib/share.ts의 sharePath가 만든다. 앞의 주소는 누를 때 붙인다. */
  path: string;
  /** 같은 줄에 나란히 둘 다른 버튼(결과 화면의 `기록 보기`). */
  children?: ReactNode;
};

/** 지금 브라우저가 해 줄 수 있는 일을 모은다. 누르는 순간에 본다. */
function browserDeps(): ShareDeps {
  return {
    share: typeof navigator.share === "function" ? (data) => navigator.share(data) : undefined,
    copy:
      typeof navigator.clipboard?.writeText === "function"
        ? (value) => navigator.clipboard.writeText(value)
        : undefined,
  };
}

/**
 * 정한 가게를 다른 사람에게 보내는 버튼.
 *
 * 공유 창을 열지, 복사할지의 판단은 lib/share.ts의 sendShare가 한다. 여기는 그 결과를
 * 화면에 옮긴다. 보낸 것(shared)과 닫은 것(cancelled)에는 아무 표시도 하지 않는다 —
 * 휴대폰의 공유 창이 이미 결과를 보여 줬거나, 사용자가 스스로 그만둔 것이다.
 *
 * 주소를 서버 환경변수(SITE_URL)가 아니라 지금 열린 주소에서 얻는 이유: 이 버튼은 브라우저에서
 * 돌아 그 환경변수를 읽지 못한다(InstallGuide의 주소 복사와 같은 방식이다).
 */
export default function ShareButton({ text, path, children }: Props) {
  const [outcome, setOutcome] = useState<ShareOutcome | null>(null);
  const [url, setUrl] = useState("");

  async function send() {
    const target = window.location.origin + path;
    setUrl(target);
    setOutcome(await sendShare(text, target, browserDeps()));
  }

  const notified = outcome === "copied" || outcome === "failed";

  return (
    <div className="flex w-full flex-col items-center gap-2">
      <div className="flex flex-wrap justify-center gap-3">
        <button type="button" onClick={send} className="btn btn-quiet btn-sm">
          보내기
        </button>
        {children}
      </div>
      {/*
        알릴 것이 없을 때도 이 문단을 지우지 않고 화면에서만 감춘다(sr-only). 화면 낭독기는
        이미 있던 통지 영역의 내용이 바뀔 때 읽어 주므로, 알리는 순간에 문단을 새로 만들면
        읽지 않는 경우가 있다. sr-only는 자리를 차지하지 않아 상자의 간격도 그대로다.
      */}
      <p
        role="status"
        aria-live="polite"
        className={notified ? "text-base leading-relaxed break-keep text-muted" : "sr-only"}
      >
        {outcome === "copied" ? "복사했어요" : null}
        {outcome === "failed" ? (
          <>
            복사하지 못했어요. 아래 주소를 길게 눌러 복사해 주세요
            <span className="mt-1 block break-all text-foreground select-all">{url}</span>
          </>
        ) : null}
      </p>
    </div>
  );
}
