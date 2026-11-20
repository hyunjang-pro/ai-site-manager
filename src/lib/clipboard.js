// 복사 버튼 공통 — 사파리·인앱 브라우저에서 clipboard가 막히면 textarea로 대체한다.
export function copyText(text, showToast, msg = '복사했습니다') {
  const done = () => showToast && showToast(msg);
  try {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done).catch(() => fallback(text, done));
    } else {
      fallback(text, done);
    }
  } catch (e) {
    fallback(text, done);
  }
}

function fallback(text, done) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    done();
  } catch (e) {
    // ignore
  }
}
