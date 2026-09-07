/**
 * 브라우저의 조회 요청을 Go 서버로 중계한다.
 *
 * 왜 화면 서버가 중간에 서는가: Go 서버의 실서비스 주소는 인터넷에 열려 있어서,
 * 조회 한 번이 카카오를 최대 열다섯 번 부른다는 사실을 아는 사람이면 스크립트로
 * 하루 한도를 몇 분 만에 소진시킬 수 있다. 그래서 Go 서버가 비밀값이 담긴 헤더를
 * 요구하고, 그 헤더는 브라우저가 아니라 **화면 서버에서** 붙는다.
 * 브라우저는 이 중계를 거쳐서만 조회하므로 개발자 도구에 비밀값이 나타나지 않는다.
 *
 *   브라우저 ──/api/v1/nearby──▶ 화면 서버 ──X-Internal-Key──▶ Go 서버
 *              여기까지만 봄                  서버끼리라 브라우저에 안 보임
 *
 * 이 파일이 라우트 핸들러(app/api/v1/nearby/route.ts)가 아니라 lib에 있는 이유:
 * 화면 시험은 브라우저 없이 node에서 돈다(web/vitest.config.mts). app/ 안에 판단을
 * 두면 어떤 시험도 그것을 지키지 못한다.
 */

/**
 * 조회 서버에 닿지 못했을 때 쓰는 오류 코드. **글자는 errors.ts에 하나만 둔다.**
 *
 * 이 코드는 Go 서버가 아니라 이 파일이 만들기 때문에, Go 소스를 훑는 errors.test.ts의
 * 대조가 잡아 주지 않는다. 글자를 이 파일에도 따로 적으면 한쪽만 바뀌어도 아무 시험이
 * 실패하지 않고, 그 순간 안내 표에 없는 코드가 되어 "눌러도 낫지 않는 다시 시도 버튼"이
 * 돌아온다. 그래서 안내 문구를 가진 쪽(errors.ts)을 단일 출처로 삼고 여기서 들여온다.
 * 이 방향이 안전한 이유는 errors.ts의 상수 주석에 적혀 있다.
 */
import { UNREACHABLE_ERROR_CODE } from "./errors";

/**
 * 조회를 실제로 보내는 함수. 시험에서 가짜를 넣을 수 있도록 인자로 받는다 —
 * 이 저장소가 난수 생성기와 저장소에 쓰는 것과 같은 수법이다.
 */
export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

/** Go 서버가 요구하는 헤더 이름. api/internal/httpapi/handler.go의 internalKeyHeader와 같은 값이다. */
export const INTERNAL_KEY_HEADER = "X-Internal-Key";

/**
 * 조회 요청을 Go 서버로 넘기고 그 응답을 그대로 돌려준다.
 *
 * @param search 브라우저가 보낸 질의 문자열("?lat=...&lng=...&radius=..."). 손대지 않고 넘긴다.
 * @param apiOrigin Go 서버 주소.
 * @param internalKey 두 서버가 나눠 갖는 비밀값. 빈 문자열이면 헤더를 아예 붙이지 않는다.
 *   **ASCII여야 한다** — HTTP 헤더 값은 latin-1만 담을 수 있어서, 한글처럼 그 범위를 넘는
 *   글자가 섞이면 fetch가 요청을 보내기도 전에 TypeError를 던진다(모든 조회가 실패한다).
 * @param fetcher 실제 호출자.
 */
export async function proxyNearby(
  search: string,
  apiOrigin: string,
  internalKey: string,
  fetcher: Fetcher,
): Promise<Response> {
  const headers: Record<string, string> = {};
  // 빈 값을 보내지 않는다. Go 서버는 빈 헤더도 틀린 값으로 보고 막으므로,
  // 붙이나 마나가 아니라 "붙이면 반드시 실패"다.
  if (internalKey !== "") {
    headers[INTERNAL_KEY_HEADER] = internalKey;
  }

  let upstream: Response;
  let body: string;
  try {
    upstream = await fetcher(`${apiOrigin}/api/v1/nearby${search}`, { headers });
    // 상태 코드와 본문을 손대지 않고 넘긴다. 오류일 때도 마찬가지다 — 화면의
    // errors.ts가 서버가 준 코드로 안내 문구를 고르기 때문에, 여기서 삼키면
    // 사용자는 무엇이 잘못됐는지 알 방법이 없어진다.
    //
    // 본문 읽기를 같은 try 안에 두는 이유: 머리는 받았는데 본문이 오는 도중 연결이
    // 끊길 수 있다. 그것도 위쪽에서 답을 받지 못한 것이므로 아래와 같이 다뤄야 한다.
    // 밖으로 던지면 다시 본문 없는 500이 되어, 이 갈래가 막으려던 것이 좁게 되살아난다.
    body = await upstream.text();
  } catch (cause) {
    // 여기까지 오는 경우는 셋이다. Go 서버에 닿지 못했거나(주소가 틀렸거나 그 서버가
    // 멎었다), 비밀값에 ASCII 밖의 글자가 있어 요청을 만들다 실패했거나,
    // 응답 본문을 받는 도중 끊겼거나.
    // 그냥 던지면 라우트 핸들러 밖으로 나가 본문 없는 500이 되고, 화면은 서버가 준
    // 코드를 읽지 못해 "문제가 생겼어요"와 눌러도 낫지 않는 다시 시도 버튼을 그린다.
    // 원인을 아는 것은 이 자리뿐이므로 여기서 우리 오류 형식으로 바꿔 준다.
    //
    // 상태 코드가 502인 이유: 못 한 것은 우리가 아니라 우리가 부른 상대다.
    // 원인은 서버 기록에만 남긴다 — 주소 같은 것이 브라우저로 나가면 안 된다.
    console.error("[proxyNearby] 조회 서버에서 응답을 받지 못했습니다", cause);
    return errorResponse(
      502,
      UNREACHABLE_ERROR_CODE,
      "조회 서버에서 응답을 받지 못했습니다.",
    );
  }

  const responseHeaders = new Headers();
  const contentType = upstream.headers.get("Content-Type");
  if (contentType) {
    responseHeaders.set("Content-Type", contentType);
  }
  // 카카오가 결과 저장을 금지한다(설계 문서 9절). Go 서버는 모든 응답에 이 헤더를
  // 붙이지만, 중계가 그것을 떨어뜨리면 Vercel이나 중간 캐시가 응답을 담을 수 있다.
  // 위에서 그대로 옮기지 않고 여기서 직접 붙이는 이유: 응답이 Go 서버가 아니라
  // 중간의 무언가에게서 온 경우에도 이 약속은 지켜져야 한다.
  responseHeaders.set("Cache-Control", "no-store");

  return new Response(body, { status: upstream.status, headers: responseHeaders });
}

/**
 * 중계가 스스로 만드는 오류 응답. Go 서버의 writeError와 같은 형식이라
 * 화면(lib/api.ts·lib/errors.ts)이 서버가 준 오류와 똑같이 다룰 수 있다.
 * 캐시 금지는 이쪽에도 붙인다 — 오류라고 저장을 허락할 이유가 없다.
 */
function errorResponse(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ error: code, message }), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
