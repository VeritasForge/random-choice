import type { GeoErrorCode } from "./geo";

export type ErrorNotice = {
  title: string;
  description: string;
  /**
   * 다시 시도하면 결과가 달라질 수 있는가.
   * false면 화면은 "다시 시도" 대신 "처음부터 다시"를 보여 준다 —
   * 반드시 실패할 버튼을 권하면 사용자는 같은 자리를 맴돌게 된다.
   */
  retryable: boolean;
};

/**
 * 위치 확인이 실패했을 때의 안내.
 *
 * 키를 GeoErrorCode 유니온으로 묶는 이유: geo.ts에 실패 갈래를 하나 더하거나
 * 이름을 바꾸면 여기서 컴파일이 깨진다. 묶어 두지 않으면 표에 없는 코드가 와도
 * 아무도 모르고, 화면은 위치 문제라는 사실조차 알리지 못한 채
 * "문제가 생겼어요"만 보여 준다.
 */
export const GEO_TEXT: Record<GeoErrorCode, ErrorNotice> = {
  permission_denied: {
    title: "위치를 알아야 주변 음식점을 찾을 수 있어요",
    description:
      "브라우저 주소창 왼쪽의 자물쇠 아이콘을 눌러 위치 권한을 허용한 뒤, 다시 시도해 주세요.",
    retryable: true,
  },
  position_unavailable: {
    title: "지금 위치를 확인하지 못했어요",
    description: "실내이거나 신호가 약할 때 생길 수 있습니다. 잠시 후 다시 시도해 주세요.",
    retryable: true,
  },
  unsupported: {
    title: "이 브라우저는 위치 기능을 지원하지 않아요",
    description: "크롬이나 사파리 같은 최신 브라우저에서 다시 열어 주세요.",
    retryable: false,
  },
  insecure_context: {
    title: "안전한 연결에서만 위치를 쓸 수 있어요",
    description:
      "주소가 https로 시작하는 곳에서 다시 열어 주세요. 지금 주소로는 다시 시도해도 같은 결과가 나옵니다.",
    retryable: false,
  },
};

/**
 * 오류 코드마다 보여 줄 안내 문구.
 *
 * 여기 담긴 코드는 세 곳에서 온다:
 *   - 위치 확인(lib/geo.ts): 위 GEO_TEXT
 *   - 서버(api/internal/httpapi/handler.go): 그 파일이 내는 코드 전부.
 *     errors.test.ts가 서버 소스에서 코드를 뽑아 이 표와 대조하므로,
 *     여기 목록을 손으로 관리하지 않는다(관리하면 반드시 어긋난다).
 *   - 서버 호출(lib/api.ts): network_error · timeout · malformed_response · unknown_error
 * 그 밖에 예상하지 못한 오류는 unexpected로 들어온다.
 */
const ERROR_TEXT: Record<string, ErrorNotice> = {
  ...GEO_TEXT,
  invalid_coordinates: {
    title: "위치 값이 올바르지 않아요",
    description: "위치를 다시 확인해야 합니다. 잠시 후 다시 시도해 주세요.",
    retryable: true,
  },
  invalid_radius: {
    title: "찾는 범위가 올바르지 않아요",
    description: "범위는 100m 이상 20km 이하여야 합니다. 처음부터 다시 해 주세요.",
    retryable: false,
  },
  not_configured: {
    title: "서버 준비가 아직 안 됐어요",
    description:
      "장소 조회에 필요한 열쇠가 서버에 설정되지 않았습니다. 다시 시도해도 같은 결과가 나옵니다.",
    retryable: false,
  },
  invalid_key: {
    title: "서버 설정에 문제가 있어요",
    description:
      "장소 조회에 쓰는 열쇠가 거부되었습니다. 다시 시도해도 같은 결과가 나오니 관리자에게 알려 주세요.",
    retryable: false,
  },
  internal_error: {
    title: "서버가 응답을 만들지 못했어요",
    description: "잠시 후 다시 시도해 주세요.",
    retryable: true,
  },
  quota_exceeded: {
    title: "오늘 조회 한도를 다 썼어요",
    description: "내일 다시 이용해 주세요.",
    retryable: false,
  },
  upstream_error: {
    title: "장소 정보를 가져오지 못했어요",
    description: "잠시 후 다시 시도해 주세요.",
    retryable: true,
  },
  network_error: {
    title: "서버에 연결하지 못했어요",
    description: "인터넷 연결을 확인한 뒤 다시 시도해 주세요.",
    retryable: true,
  },
  timeout: {
    title: "응답이 너무 오래 걸려요",
    description: "지금 서버가 붐비는 것 같습니다. 잠시 후 다시 시도해 주세요.",
    retryable: true,
  },
  malformed_response: {
    title: "서버 응답을 읽지 못했어요",
    description: "잠시 후 다시 시도해 주세요.",
    retryable: true,
  },
  unknown_error: {
    title: "문제가 생겼어요",
    description: "잠시 후 다시 시도해 주세요.",
    retryable: true,
  },
  unexpected: {
    title: "문제가 생겼어요",
    description: "잠시 후 다시 시도해 주세요.",
    retryable: true,
  },
};

const FALLBACK: ErrorNotice = {
  title: "문제가 생겼어요",
  description: "잠시 후 다시 시도해 주세요.",
  retryable: true,
};

/**
 * 오류 코드와 서버가 준 문구로 화면에 보여 줄 안내를 만든다.
 *
 * 아는 코드면 이 파일의 문구를 쓴다. 서버 문구는 대개 "무엇이 잘못됐는지"까지만
 * 말하기 때문이다 — 예를 들어 upstream_error에서 서버가 주는 "장소 정보를
 * 가져오지 못했습니다."를 그대로 쓰면 제목과 같은 말이 두 번 나오고,
 * "잠시 후 다시 시도해 주세요"라는 다음 행동 안내가 자리를 잃는다.
 *
 * 모르는 코드일 때만 서버 문구를 쓴다. 그때는 그것이 유일한 단서다.
 */
export function errorNotice(code: string, serverMessage?: string): ErrorNotice {
  // Object.hasOwn으로 확인한다. 그냥 색인하면 "constructor"·"toString" 같은
  // 원형 사슬의 이름이 참으로 평가되어, 제목과 설명이 빈 오류 카드가 뜬다.
  const known = Object.hasOwn(ERROR_TEXT, code) ? ERROR_TEXT[code] : undefined;
  if (known) {
    return known;
  }
  return {
    ...FALLBACK,
    description: serverMessage?.trim() || FALLBACK.description,
  };
}

/** 시험이 표 전체를 대조할 수 있도록 아는 코드 목록을 내보낸다. */
export const KNOWN_ERROR_CODES = Object.keys(ERROR_TEXT);
