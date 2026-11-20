// 선택 기능: Gemini 도움 분석. 키는 설정 화면에서 입력한 값을 그때그때만 쓰고 코드에 저장하지 않는다.
// 키가 없으면 이 함수는 호출되지 않고, 앱은 내장 규칙 엔진만으로 100% 동작한다.
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

export async function analyzeWithGemini({ apiKey, text, tradeHint }) {
  if (!apiKey) return { ok: false, reason: 'no_key' };
  const prompt = [
    '너는 경북 철거·인테리어 현장 매니저다. 아래 고객 문의/메모를 읽고 JSON만 답한다.',
    '키: trade(demolition|wallpaper|bathroom|kitchen|combined|unclassified), sizeValue(숫자 또는 null), sizeUnit(평|㎡|m|칸|개|톤|모름), floor(숫자 또는 null), summary(한 문장), warnings(문자열 배열, 최대 3)',
    `공종힌트: ${tradeHint || '없음'}`,
    '문의:',
    text,
  ].join('\n');

  try {
    const res = await fetch(`${ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
      }),
    });
    if (!res.ok) return { ok: false, reason: `http_${res.status}` };
    const data = await res.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const jsonText = raw.trim().replace(/^```json\s*/i, '').replace(/```$/, '');
    const parsed = JSON.parse(jsonText);
    return { ok: true, data: parsed };
  } catch (e) {
    return { ok: false, reason: 'network_or_parse' };
  }
}
