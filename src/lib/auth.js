// 가족 전용 잠금 — 앱 진입 시 4자리 PIN.
// ※ 브라우저에서 도는 화면 잠금이라 강한 보안 장치는 아닙니다(코드를 보면 우회 가능).
//   개인정보·계정은 저장하지 않고, 결제·발송 같은 일은 하지 않는 앱입니다.
export const FAMILY_PIN = '3885';
export const UNLOCK_KEY = 'aiSiteManager.unlocked';

export function isUnlocked() {
  try {
    return sessionStorage.getItem(UNLOCK_KEY) === '1';
  } catch (e) {
    return false;
  }
}

export function setUnlocked(value) {
  try {
    if (value) sessionStorage.setItem(UNLOCK_KEY, '1');
    else sessionStorage.removeItem(UNLOCK_KEY);
  } catch (e) {
    // sessionStorage를 못 쓰는 환경이면 잠금 없이 동작한다
  }
}
