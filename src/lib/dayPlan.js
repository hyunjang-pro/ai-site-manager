// 일차별 시공 브리핑 — 공사기간(일수)만큼 1일차·2일차…를 만들고,
// 그날 투입할 인원·차량·핵심 작업·챙길 장비를 공종 공정 순서대로 나눈다.
// (예전에는 첫날 1일치만 보여서 "2일차는 뭐 하냐"를 알 수 없었다)
import { addDaysISO, korDateLabel, isISODate } from './date.js';
import { wasteVehicle } from './waste.js';

const ROLE_HELPER = /보조|잡부|인부|조수/;

const PHASES = {
  demolition: [
    {
      label: '철거·해체',
      work: ['보양·분진막 설치', '천장·벽체·바닥 마감 철거', '문·창틀·설비 철거'],
      prep: ['기초안전보건교육 이수증', '안전화·장갑·방진마스크', '커터날·브레이커', '마대·보양재'],
    },
    {
      label: '성상 분리·반출',
      work: ['폐기물 성상별 분리', '상차·반출 (계량증명서)', '잔재 1차 정리'],
      prep: ['마대(성상별)', '계량증명서', '집게차·손수레', '분진 청소도구'],
    },
    {
      label: '정리·검수',
      work: ['바닥·벽면 잔재 정리', '철거 후 6부위 사진', '현장 인계·잔금 확인'],
      prep: ['청소도구', '촬영용 휴대폰', '처리확인서'],
    },
  ],
  wallpaper: [
    {
      label: '밑작업·초배',
      work: ['기존 벽지 제거', '벽면 보수·초배', '곰팡이·들뜸 확인'],
      prep: ['초배지·풀', '스크레이퍼', '보양재', '사다리'],
    },
    {
      label: '도배·마감',
      work: ['실크·합지 도배', '몰딩·걸레받이 마감', '건조 상태 확인'],
      prep: ['벽지·풀', '이음새 롤러', '칼·자'],
    },
    {
      label: '마감·검수',
      work: ['들뜸·이음새 점검', '현장 정리·청소', '준공 사진'],
      prep: ['청소도구', '촬영용 휴대폰'],
    },
  ],
  bathroom: [
    {
      label: '철거·방수',
      work: ['기존 타일·도기 철거', '바탕 정리·미장 보수', '방수 2회 도포'],
      prep: ['마대·보양재', '방수재·롤러', '커터·그라인더', '배수구 마감재'],
    },
    {
      label: '담수 확인·타일',
      work: ['담수 48시간 누수 확인', '타일 붙임(벽→바닥)', '줄눈·실리콘'],
      prep: ['레벨링 클립', '타일 절단기', '수평계', '줄눈·스펀지'],
    },
    {
      label: '준공 검수',
      work: ['도기·수전 설치 확인', '줄눈 마감·청소', '준공 사진 3컷'],
      prep: ['실리콘·헤라', '청소도구', '수준기'],
    },
  ],
  tilewaterproof: [
    {
      label: '철거·방수',
      work: ['기존 타일·바탕 철거', '바탕 정리·미장 보수', '방수 2회 도포'],
      prep: ['마대·보양재', '방수재·롤러', '커터·그라인더'],
    },
    {
      label: '담수·타일',
      work: ['담수 누수 확인', '타일 붙임', '줄눈·실리콘'],
      prep: ['레벨링 클립', '타일 절단기', '수평계'],
    },
    {
      label: '마감·검수',
      work: ['줄눈 마감', '배수 상태 확인', '준공 사진'],
      prep: ['실리콘·헤라', '청소도구'],
    },
  ],
  kitchen: [
    {
      label: '철거·하부장',
      work: ['기존 상·하부장 철거', '급배수·가스 위치 확인', '하부장 설치'],
      prep: ['보양재', '수평계', '전동드릴', '실리콘'],
    },
    {
      label: '상판·마감',
      work: ['상판 실측·가공 설치', '수전·후드 연결', '마감·청소'],
      prep: ['상판 자재', '수전·배관 자재', '실리콘', '청소도구'],
    },
  ],
  plaster: [
    {
      label: '바탕·미장',
      work: ['바탕 정리·프라이머', '몰탈 미장', '평탄·다짐 작업'],
      prep: ['몰탈·모래', '흙손·레벨', '보양재'],
    },
    {
      label: '양생·검수',
      work: ['양생 상태 확인', '평탄도 검수', '배수 구배 확인'],
      prep: ['수평계', '청소도구'],
    },
  ],
  window: [
    {
      label: '철거·창틀',
      work: ['기존 창호 철거', '창틀·앙카 설치', '단열·방수 마감'],
      prep: ['창틀·앙카', '단열재', '수평계'],
    },
    {
      label: '창호·유리',
      work: ['창호·유리 설치', '개폐·잠금 조정', '실리콘 마감'],
      prep: ['유리·창호', '글레이징 비드', '청소도구'],
    },
  ],
  groundwork: [
    {
      label: '터파기·정지',
      work: ['지하 매설물 확인', '터파기·정지', '잔토 반출'],
      prep: ['굴삭기', '안전펜스', '측량 도구'],
    },
    {
      label: '골재·다짐',
      work: ['골재 부설', '다짐·평탄', '되메우기'],
      prep: ['골재', '다짐기', '수평계'],
    },
    {
      label: '검수·정리',
      work: ['평탄·배수 확인', '잔토 정리', '준공 사진'],
      prep: ['청소도구', '촬영용 휴대폰'],
    },
  ],
  waste: [
    {
      label: '수거·상차',
      work: ['성상별 수거', '상차·적재량 사진', '계량증명서 받기'],
      prep: ['마대(성상별)', '계량증명서', '안전화·장갑'],
    },
    {
      label: '분리·운반',
      work: ['성상 분리 이어서', '처리장 운반', '처리확인서 확인'],
      prep: ['마대', '계량증명서', '안전화·장갑'],
    },
  ],
  labor: [
    {
      label: '현장 지원',
      work: ['요청 작업 범위 지시', '투입 인원 작업', '진행 사진'],
      prep: ['기초안전보건교육 이수증', '안전화·장갑'],
    },
    {
      label: '현장 지원(이어서)',
      work: ['전일 작업 이어서', '작업 범위 추가 확인', '진행 사진'],
      prep: ['기초안전보건교육 이수증', '안전화·장갑'],
    },
  ],
  repair: [
    {
      label: '보수 작업',
      work: ['하자 부위 확인', '부분 철거·보수', '마감 정리'],
      prep: ['보수 자재', '공구', '보양재'],
    },
    {
      label: '마감·검수',
      work: ['마감 상태 확인', '현장 정리', '준공 사진'],
      prep: ['청소도구', '촬영용 휴대폰'],
    },
  ],
  // 가벽·칸막이(경량벽체) — 목공 일정은 '철거'가 아니라 스터드·석고·퍼티·도장 순서다.
  // (예전에는 목공 현장도 5단계 브리핑이 '보양·분진막 / 마감 철거'로 나왔다)
  carpentry: [
    {
      label: '골조·석고',
      work: ['먹줄·수평 잡기', '스터드·문틀 세우기', '석고 2겹 붙이기'],
      prep: ['경량스터드·러너', '석고보드 9.5T', '문틀·도어', '레이저 수평기', '전동드릴'],
    },
    {
      label: '퍼티·도장·검수',
      work: ['테이프·퍼티·코너비드', '수성 도장', '문·손잡이 조정', '현장 정리·준공 사진'],
      prep: ['퍼티·조인트테이프', '수성페인트', '샌더', '청소도구'],
    },
  ],
  doorMoldings: [
    {
      label: '문·몰딩',
      work: ['문틀·몰딩 설치', '경첩·손잡이 조정'],
      prep: ['문·몰딩 자재', '전동드릴'],
    },
    {
      label: '마감·검수',
      work: ['도장·마감 상태 확인', '현장 정리', '준공 사진'],
      prep: ['도장재', '청소도구', '촬영용 휴대폰'],
    },
  ],
};

const SCOPE_PHASE = {
  demolition: PHASES.demolition[0],
  groundwork: PHASES.groundwork[0],
  bathroom: PHASES.bathroom[1],
  tilewaterproof: PHASES.tilewaterproof[1],
  wallpaper: PHASES.wallpaper[1],
  kitchen: PHASES.kitchen[1],
  plaster: PHASES.plaster[0],
  carpentry: { label: '문·몰딩', work: ['문틀·몰딩 설치', '경첩·손잡이 조정'], prep: ['문·몰딩 자재', '전동드릴'] },
  electric: { label: '전기·조명', work: ['배선·스위치 점검', '조명 설치'], prep: ['전선·스위치', '조명', '검전기'] },
  entrance: { label: '현관', work: ['중문·신발장 설치', '현관 타일 마감'], prep: ['중문·신발장', '타일·줄눈'] },
};

function mergePhases(list) {
  const out = { label: list.map((p) => p.label).join(' · '), work: [], prep: [] };
  list.forEach((p) => {
    p.work.forEach((w) => out.work.push(w));
    p.prep.forEach((x) => out.prep.push(x));
  });
  out.work = [...new Set(out.work)].slice(0, 5);
  out.prep = [...new Set(out.prep)].slice(0, 6);
  return out;
}

// 공사기간(일)에 맞춰 공정을 일차별로 배치한다.
export function fitPhases(phases, days) {
  const n = Math.max(1, Math.round(days));
  if (!phases.length) return [{ label: '현장 작업', work: ['현장 작업'], prep: [] }];
  if (n === 1) return [mergePhases(phases)];
  if (phases.length === n) return phases;
  const last = phases[phases.length - 1];
  if (phases.length < n) {
    // 공정보다 날짜가 많으면 마지막 '마감·검수' 전까지 이어서 작업으로 채운다
    const body = phases.slice(0, -1);
    const out = [];
    for (let i = 0; i < n - 1; i += 1) {
      const p = body[Math.min(i, body.length - 1)] || last;
      out.push(i < body.length ? p : { ...p, label: `${p.label} (이어서)` });
    }
    out.push(last);
    return out;
  }
  // 공정이 날짜보다 많으면 앞 공정을 날짜 수에 맞춰 묶는다
  const head = phases.slice(0, -1);
  const per = Math.ceil(head.length / (n - 1));
  const out = [];
  for (let i = 0; i < n - 1; i += 1) {
    const chunk = head.slice(i * per, (i + 1) * per);
    out.push(chunk.length ? mergePhases(chunk) : head[head.length - 1]);
  }
  out.push(last);
  return out;
}

function phasesOf(c, calc) {
  const trade = calc?.trade || c?.trade;
  if (trade === 'carpentry') return c?.partition ? PHASES.carpentry : PHASES.doorMoldings;
  if (PHASES[trade]) return PHASES[trade];
  if (trade === 'combined') {
    const scopes = Array.isArray(c?.subScopes) && c.subScopes.length ? c.subScopes : [];
    const out = scopes.map((s) => SCOPE_PHASE[s]).filter(Boolean);
    out.push({ label: '마감·검수', work: ['마감 상태 점검', '현장 정리·청소', '준공 사진'], prep: ['청소도구', '촬영용 휴대폰'] });
    return out.length > 1 ? out : [...PHASES.demolition];
  }
  // custom 등 — 만능 견적은 철거→작업→정리 순서로
  return [...PHASES.demolition];
}

function crewText(crew) {
  if (!crew || !crew.length) return '인원 미정';
  return crew.map((p) => (p.unit === '대' ? `${p.role} ${p.count}대` : `${p.role} ${p.count}명`)).join(' · ');
}

export function buildDayPlans({ c, calc, workDays, startDate, crew, trade }) {
  const days = Math.max(1, Math.round(Number(workDays) || 1));
  const phases = fitPhases(phasesOf(c, calc), days);
  const base = Array.isArray(crew) && crew.length ? crew : [];
  const skilled = base.filter((p) => !ROLE_HELPER.test(String(p.role || '')));
  const start = isISODate(startDate) ? startDate : '';

  const wasteLabel = (() => {
    try {
      return wasteVehicle(c).label;
    } catch (e) {
      return '폐기물 차량';
    }
  })();
  const trucks = Math.max(1, Math.round(Number(c?.waste?.trucks) || 1));

  return phases.map((p, i) => {
    const day = i + 1;
    const isLast = day === days;
    const iso = start ? addDaysISO(start, i) : '';
    // 마감·검수 날은 기공만 남긴다 (보조·잡부는 철수) — 단 하루짜리 현장은 그날이 전부라 그대로 투입한다
    const dayCrew = isLast && days > 1 && skilled.length && !['labor', 'waste'].includes(trade) ? skilled : base;

    let vehicle;
    if (trade === 'labor') vehicle = '차량 없음 (현장 집결)';
    else if (trade === 'waste') vehicle = `${wasteLabel} 1대`;
    else if (days === 1) vehicle = `${c?.dispatch?.vehicle || '1톤 카고'} 1대 (자재·공구·폐기물)`;
    else if (isLast) vehicle = '1톤 카고 1대 (잔재·장비 회수)';
    else if (/반출|성상|운반/.test(p.label)) vehicle = `폐기물 차량 ${trucks}대 (성상별 반출)`;
    else if (day === 1) vehicle = `${c?.dispatch?.vehicle || '1톤 카고'} 1대 (자재·공구)`;
    else vehicle = '1톤 카고 1대 (자재·폐기물)';

    return {
      day,
      iso,
      dateLabel: iso ? korDateLabel(iso) : '날짜 미정',
      phase: p.label,
      crew: dayCrew,
      crewText: crewText(dayCrew),
      vehicle,
      work: p.work,
      prep: p.prep,
      isLast,
    };
  });
}
