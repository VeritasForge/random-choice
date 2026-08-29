export type ErrorNotice = { title: string; description: string };

/**
 * 오류 코드마다 보여 줄 안내 문구.
 *
 * 여기 담긴 코드는 세 곳에서 온다:
 *   - 서버(api/internal/httpapi/handler.go): invalid_coordinates · invalid_radius ·
 *     not_configured · quota_exceeded · upstream_error
 *   - 서버 호출(lib/api.ts): network_error · timeout · malformed_response · unknown_error
 *   - 위치 확인(lib/geo.ts): permission_denied · position_unavailable · unsupported
 * 그 밖에 예상하지 못한 오류는 unexpected로 들어온다.
 *
 * 서버가 아는 코드를 새로 추가하면 여기도 함께 늘려야 한다.
 * errors.test.ts가 서버 코드 목록과 이 표를 대조해 빠진 것을 잡는다.
 */
const ERROR_TEXT: Record<string, ErrorNotice> = {
  permission_denied: {
    title: "위치를 알아야 주변 음식점을 찾을 수 있어요",
    description:
      "브라우저 주소창 왼쪽의 자물쇠 아이콘을 눌러 위치 권한을 허용한 뒤, 다시 시도해 주세요.",
  },
  position_unavailable: {
    title: "지금 위치를 확인하지 못했어요",
    description: "실내이거나 신호가 약할 때 생길 수 있습니다. 잠시 후 다시 시도해 주세요.",
  },
  unsupported: {
    title: "이 브라우저는 위치 기능을 지원하지 않아요",
    description: "크롬이나 사파리 같은 최신 브라우저에서 다시 열어 주세요.",
  },
  invalid_coordinates: {
    title: "위치 값이 올바르지 않아요",
    description: "위치를 다시 확인해야 합니다. 잠시 후 다시 시도해 주세요.",
  },
  invalid_radius: {
    title: "찾는 범위가 올바르지 않아요",
    description: "범위는 100m 이상 20km 이하여야 합니다. 처음부터 다시 해 주세요.",
  },
  not_configured: {
    title: "서버 준비가 아직 안 됐어요",
    description:
      "장소 조회에 필요한 열쇠가 서버에 설정되지 않았습니다. 다시 시도해도 같은 결과가 나옵니다.",
  },
  invalid_key: {
    title: "서버 설정에 문제가 있어요",
    description:
      "장소 조회에 쓰는 열쇠가 거부되었습니다. 다시 시도해도 같은 결과가 나오니 관리자에게 알려 주세요.",
  },
  internal_error: {
    title: "서버가 응답을 만들지 못했어요",
    description: "잠시 후 다시 시도해 주세요.",
  },
  quota_exceeded: {
    title: "오늘 조회 한도를 다 썼어요",
    description: "내일 다시 이용해 주세요.",
  },
  upstream_error: {
    title: "장소 정보를 가져오지 못했어요",
    description: "잠시 후 다시 시도해 주세요.",
  },
  network_error: {
    title: "서버에 연결하지 못했어요",
    description: "인터넷 연결을 확인한 뒤 다시 시도해 주세요.",
  },
  timeout: {
    title: "응답이 너무 오래 걸려요",
    description: "지금 서버가 붐비는 것 같습니다. 잠시 후 다시 시도해 주세요.",
  },
  malformed_response: {
    title: "서버 응답을 읽지 못했어요",
    description: "잠시 후 다시 시도해 주세요.",
  },
  unknown_error: {
    title: "문제가 생겼어요",
    description: "잠시 후 다시 시도해 주세요.",
  },
  unexpected: {
    title: "문제가 생겼어요",
    description: "잠시 후 다시 시도해 주세요.",
  },
};

const FALLBACK: ErrorNotice = {
  title: "문제가 생겼어요",
  description: "잠시 후 다시 시도해 주세요.",
};

/**
 * 오류 코드와 서버가 준 문구로 화면에 보여 줄 안내를 만든다.
 *
 * 아는 코드면 이 파일의 문구를 쓴다. 서버 문구는 "무엇이 잘못됐는지"만 말하고
 * "그래서 무엇을 하면 되는지"는 말하지 않기 때문이다 — 예를 들어 한도 초과에서
 * 서버 문구를 그대로 쓰면 제목과 거의 같은 문장이 두 번 나오고, 정작
 * "내일 다시 이용해 주세요"라는 다음 행동 안내가 사라진다.
 *
 * 모르는 코드일 때만 서버 문구를 쓴다. 그때는 그것이 유일한 단서다.
 */
export function errorNotice(code: string, serverMessage?: string): ErrorNotice {
  const known = ERROR_TEXT[code];
  if (known) {
    return known;
  }
  return {
    title: FALLBACK.title,
    description: serverMessage?.trim() || FALLBACK.description,
  };
}

/** 시험이 표 전체를 대조할 수 있도록 아는 코드 목록을 내보낸다. */
export const KNOWN_ERROR_CODES = Object.keys(ERROR_TEXT);
