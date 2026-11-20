// 공사기간 예상 — 공종·규모·선택 마감으로 계산한다. (시공일 날씨·하루 순수익 계산에 함께 쓴다)
export function estimateWorkDays(c, calc, designDays = 0) {
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
