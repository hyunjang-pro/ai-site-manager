// 공사일수 — 견적 엔진이 계산한 일수(calc.workDays)를 먼저 쓴다.
// 화면마다 다른 일수를 보여 주면(가견적 '하루 96만' vs 최종 '하루 32만') 사장님이 손해 본다.
export function estimateWorkDays(c, calc, designDays = 0) {
  const fromCalc = Number(calc?.workDays);
  if (Number.isFinite(fromCalc) && fromCalc > 0) return Math.max(1, Math.round((fromCalc + (Number(designDays) || 0)) * 10) / 10);
  const size = parseFloat(c?.sizeValue) || 0;
  const unit = c?.sizeUnit || '평';
  const pyung = unit === '평' ? size : unit === '㎡' ? size / 3.3 : unit === '칸' ? size * 1.8 : size || 15;
  const trade = calc?.trade || c?.trade;
  let days = 3;
  switch (trade) {
    case 'demolition':
      days = Math.max(1, Math.ceil((pyung || 15) / 6));
      break;
    case 'wallpaper':
      days = (pyung || 24) >= 30 ? 3 : 2;
      break;
    case 'bathroom':
      days = 4 + (c?.bathroom?.method === 'overlay' ? 0 : 1);
      break;
    case 'kitchen':
      days = 3;
      break;
    case 'tilewaterproof':
      days = 3;
      break;
    case 'plaster':
      days = 3;
      break;
    case 'window':
      days = 2;
      break;
    case 'electric':
    case 'plumbing':
    case 'film':
      // 콘센트·수전·필름은 한 번 방문해 하루에 끝나는 일이 대부분이다
      days = 1;
      break;
    case 'carpentry':
      days = Math.max(1, Math.ceil((size || 1) / 8));
      break;
    case 'waste':
      days = 1;
      break;
    case 'labor':
      days = Math.max(1, parseInt(c?.laborDays, 10) || 1);
      break;
    case 'repair':
      days = Math.max(1, Math.ceil(size || 1));
      break;
    default:
      days = 7;
  }
  return Math.max(1, days + (Number(designDays) || 0));
}
