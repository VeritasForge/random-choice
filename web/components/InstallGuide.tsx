"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { OfferKind } from "@/lib/install";

type Props = {
  kind: OfferKind;
  /**
   * offer: 결과 화면. 권유 문구와 버튼을 먼저 보여 준다.
   * direct: 시작 화면. 사용자가 링크를 스스로 눌러 연 것이므로 방법을 곧바로 보여 준다.
   */
  variant: "offer" | "direct";
  /** kind가 "prompt"일 때 버튼이 부른다. 브라우저의 설치 확인 창을 띄우는 일은 부모가 한다. */
  onInstall: () => void;
  onClose: () => void;
};

/**
 * 홈 화면에 추가하는 방법을 알리는 상자. 결과 화면과 시작 화면이 함께 쓴다.
 *
 * 이 서비스는 점심때마다 다시 열어야 쓸모가 있는데, 매번 브라우저를 열고 주소를 찾아야
 * 해서 안 쓰게 된다는 말을 들었다. 홈 화면에 아이콘을 두게 하는 것이 그 답이고,
 * 이 상자는 그 방법을 기기에 맞게 알린다(lib/install.ts의 InstallKind).
 */
export default function InstallGuide({ kind, variant, onInstall, onClose }: Props) {
  // offer에서 버튼을 눌러 방법을 펼쳤는지. direct는 처음부터 펼쳐져 있다.
  const [opened, setOpened] = useState(false);
  const [copy, setCopy] = useState<"idle" | "done" | "failed">("idle");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const headingId = useId();

  const showMethod = variant === "direct" || opened;

  // 방법이 펼쳐지면 초점을 제목으로 옮긴다. 방금 누른 버튼(결과 화면)이나 링크(시작 화면)가
  // 그 순간 사라지므로, 옮기지 않으면 초점이 body로 떨어져 키보드 사용자는 자리를 잃고
  // 화면 낭독기는 무엇이 나타났는지 읽지 않는다.
  // offer가 처음 나타날 때는 옮기지 않는다(showMethod가 false다). 그 순간의 초점은 방금 정한
  // 줄의 "정하신 곳"에 있어야 한다(ResultScreen의 markRef 주석).
  useEffect(() => {
    if (showMethod) {
      headingRef.current?.focus();
    }
  }, [showMethod]);

  function start() {
    if (kind === "prompt") {
      onInstall();
      return;
    }
    setOpened(true);
  }

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(window.location.origin);
      setCopy("done");
    } catch {
      // https가 아니거나 앱 안의 화면이 막아 둔 경우다. 주소를 글자로도 보여 주고 있으므로
      // 길게 눌러 복사하라고 알린다.
      setCopy("failed");
    }
  }

  // 한 화면에 강조색으로 칠한 버튼은 하나뿐이어야 한다. 결과 화면에는 칠한 버튼이 없어
  // 여기서 쓰지만, 시작 화면에는 이미 `지금 있는 곳에서 찾기`가 있어 조용한 버튼으로 그린다.
  const buttonClass = variant === "offer" ? "btn btn-primary btn-sm" : "btn btn-quiet btn-sm";

  return (
    <section
      aria-labelledby={headingId}
      className="rise relative flex w-full flex-col items-center gap-2 rounded-xl border border-line bg-background px-4 py-4 text-center"
    >
      {/* 닫기는 손가락이 닿는 넓이 48px를 지키되 글자는 작게 둔다. 제목이 이 버튼 밑으로
          들어가지 않도록 제목 쪽에 좌우 여백을 준다. */}
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        className="absolute top-0 right-0 flex h-12 w-12 items-center justify-center rounded-full text-lg text-muted"
      >
        <span aria-hidden="true">✕</span>
      </button>

      <h3
        ref={headingRef}
        id={headingId}
        tabIndex={-1}
        className="px-10 text-lg font-semibold break-keep focus:outline-none"
      >
        {variant === "offer" ? "내일도 오실 건가요?" : "홈 화면에 추가하기"}
      </h3>

      {variant === "offer" ? (
        <p className="text-base leading-relaxed break-keep text-muted">
          홈 화면에 추가해 두면 브라우저를 열지 않고 바로 시작할 수 있어요
        </p>
      ) : null}

      {!showMethod ? (
        <button type="button" onClick={start} className={buttonClass}>
          홈 화면에 추가하기
        </button>
      ) : null}

      {/*
        아이폰은 웹사이트가 설치 창을 띄울 수 없어 순서를 글로 알린다. 공유 버튼의 자리는
        Safari 기준으로 적었다 — 아이폰의 다른 브라우저는 자리가 다를 수 있다.
      */}
      {showMethod && kind === "ios" ? (
        <>
          {variant === "direct" ? (
            <p className="text-base leading-relaxed break-keep text-muted">
              브라우저를 열지 않고 바로 시작할 수 있어요
            </p>
          ) : null}
          <ol className="list-decimal pl-6 text-left text-base leading-relaxed break-keep">
            <li>화면 아래의 공유 버튼을 눌러요</li>
            <li>
              목록을 내려 <strong className="font-semibold">홈 화면에 추가</strong>를 눌러요
            </li>
            <li>
              오른쪽 위의 <strong className="font-semibold">추가</strong>를 눌러요
            </li>
          </ol>
        </>
      ) : null}

      {/*
        카카오톡 같은 다른 앱 안에서 열린 화면에서는 홈 화면에 추가할 수 없다. 바깥 브라우저에서
        열도록 주소를 건넨다. 주소를 글자로도 보여 주는 것은 복사 버튼이 막힌 환경의 대비다.
      */}
      {showMethod && kind === "in-app" ? (
        <>
          <p className="text-base leading-relaxed break-keep text-muted">
            여기서는 추가할 수 없어요. 먼저 Safari나 Chrome에서 이 페이지를 열어 주세요.
          </p>
          <p className="text-base break-all select-all">
            {typeof window === "undefined" ? "" : window.location.host}
          </p>
          <button type="button" onClick={copyAddress} className={buttonClass}>
            {copy === "done" ? "복사했어요" : "주소 복사하기"}
          </button>
          <p role="status" aria-live="polite" className="text-base leading-relaxed break-keep text-muted">
            {copy === "failed" ? "복사하지 못했어요. 위 주소를 길게 눌러 복사해 주세요" : ""}
          </p>
        </>
      ) : null}
    </section>
  );
}
