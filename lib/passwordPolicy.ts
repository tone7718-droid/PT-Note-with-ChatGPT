/**
 * 비밀번호 정책 (변경/설정 공용).
 *
 * - 길이: 8~20자
 * - 허용 문자: 영문/숫자/특수문자 (공백·제어문자·비ASCII 불가) — 숫자 전용 강제 아님
 * - 기본 비밀번호 "0000" 은 사용 불가
 *
 * UI(모달)에서 즉시 피드백용으로 호출하고, localDataService 저장 시에도
 * 방어적으로 한 번 더 호출한다 (단일 소스).
 */

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 20;
export const DEFAULT_PASSWORD = "0000";

/** 공백을 제외한 출력 가능 ASCII (영문/숫자/특수문자) */
const ALLOWED_CHARS = /^[\x21-\x7E]+$/;

/**
 * 새 비밀번호 검증. 통과하면 null, 실패하면 사용자에게 보여줄 오류 메시지를 반환.
 */
export function validateNewPassword(pw: string): string | null {
  if (pw === DEFAULT_PASSWORD) {
    return `기본 비밀번호(${DEFAULT_PASSWORD})는 사용할 수 없습니다. 다른 비밀번호를 선택하세요.`;
  }
  if (pw.length < PASSWORD_MIN || pw.length > PASSWORD_MAX) {
    return `비밀번호는 ${PASSWORD_MIN}~${PASSWORD_MAX}자여야 합니다.`;
  }
  if (!ALLOWED_CHARS.test(pw)) {
    return "영문·숫자·특수문자만 사용할 수 있습니다 (공백 불가).";
  }

  return null;
}
