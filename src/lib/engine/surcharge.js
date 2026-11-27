// 현장 조건 할증 레이어 — 층수·시간·거리·장비·규제를 **한 규칙표**로 모은다.
// ─────────────────────────────────────────────────────────────
// 예전에는 이 가산들이 pricing.js 곳곳에 if로 흩어져 있어서
//   · 어떤 항목은 합계에 들어가고(원가 반영), 어떤 항목은 화면에만 떠서 돈이 새고,
//   · 같은 조건(엘베 없음)이 양중비·자재 올리기·사다리차에서 세 번 붙기도 했다.
// 이제 조건은 여기 표에만 있고, 각 줄은 자기 축(자재·인건비·장비·폐기물)을 갖는다.
//   mode: 'extra' 원가에 더한다 · 'in' 이미 다른 줄에 들어 있다(표시용) · 'aside' 조건부 별도비
import { getRate } from '../rates.js';
import { RATE_BOOK } from './rate-book.js';

const S = RATE_BOOK.site;

export const SURCHARGE_RULES = [
  // ── 운반·양중 (층수) ─────────────────────────────
  {
    id: 'lift',
    when: (c, x) => x.lifting && x.lifting.cost > 0,
    line: (c, x) => ({
      category: '추가(운반)',
      name: `자재·폐기물 운반 — ${x.lifting.chosen.label}`,
      detail: x.lifting.chosen.detail,
      amount: x.lifting.cost,
      mode: 'in',
      addToLabor: true,
    }),
  },
  {
    id: 'longCarry',
    when: (c, x) => x.survey('longCarry') && x.lifting.carryM < 30,
    line: () => ({ category: '추가(운반)', name: '운반거리 30m 이상', detail: '잡부 반일 추가', amount: S.longCarry.l, mode: 'extra' }),
  },
  {
    id: 'noParking',
    when: (c, x) => x.survey('noParking'),
    line: () => ({ category: '추가(운반)', name: '차량 진입·주차 곤란', detail: '반출 대기·추가 운반', amount: S.noParking.l, mode: 'extra' }),
  },
  {
    id: 'narrowDoor',
    when: (c, x) => x.survey('narrowDoor'),
    line: () => ({ category: '추가(운반)', name: '출입문·복도 협소', detail: '소형 운반·분해 반입', amount: S.narrowDoor.l, mode: 'extra' }),
  },
  {
    id: 'materialLift',
    when: (c, x) => x.survey('materialLift'),
    line: (c, x) => ({
      category: '추가(운반)',
      name: '자재 올리기',
      detail: '자재를 층까지 올리는 인력',
      amount: x.amount('materialLift', getRate(x.rates, ['site', 'materialLift'], 15)),
      mode: 'in',
      addToLabor: true,
    }),
  },
  // ── 장비 (사다리차·스카이·굴삭기) ──────────────────
  {
    id: 'ladderSmall',
    when: (c, x) => x.survey('ladderSmall'),
    line: (c, x) => ({
      category: '추가(운반)',
      name: '사다리차 소형 1회',
      detail: '4층 규모 자재·폐기물 반출',
      amount: x.amount('ladderSmall', getRate(x.rates, ['ladder', 'small'], 12)),
      mode: 'in',
      addToEquip: true,
    }),
  },
  {
    id: 'ladderHalf',
    when: (c, x) => x.survey('ladderHalf'),
    line: (c, x) => ({
      category: '추가(운반)',
      name: '사다리차 반나절',
      detail: '자재·폐기물 반출',
      amount: x.amount('ladderHalf', getRate(x.rates, ['ladder', 'half'], 35)),
      mode: 'in',
      addToEquip: true,
    }),
  },
  // ── 구조 (철거 난이도) ────────────────────────────
  {
    id: 'heating',
    when: (c, x) => x.survey('floorHeatingPipe'),
    line: () => ({ category: '추가(구조)', name: '난방배관 매설 대비', detail: '저속 파쇄·보수 예비비', amount: S.heatingPipe.l, mode: 'in', addToLabor: true }),
  },
  {
    id: 'leak',
    when: (c, x) => x.survey('existingLeak'),
    line: () => ({ category: '추가(구조)', name: '기존 누수 보수·방수', detail: '보강 시공비', amount: S.leak.l, mode: 'in', addToLabor: true }),
  },
  {
    id: 'plumbing',
    when: (c, x) => x.survey('oldPlumbing'),
    line: () => ({ category: '추가(구조)', name: '노후 급배수관 정리', detail: '배관 교체·압력 테스트', amount: S.oldPlumbing.m, mode: 'in', addToMaterial: true }),
  },
  {
    id: 'loadBearing',
    when: (c, x) => x.survey('loadBearingWall'),
    line: () => ({ category: '추가(구조)', name: '내력벽 철거 구조검토', detail: '구조기술사 검토·보강(없으면 착공 금지)', amount: S.loadBearing.l, mode: 'extra' }),
  },
  // ── 규제·행정 ────────────────────────────────────
  {
    id: 'asbestos',
    when: (c, x) => x.survey('asbestosRisk'),
    line: () => ({ category: '추가(규제)', name: '석면 사전조사 착수비', detail: '시료 분석·조사기관 수수료(발견 시 청구)', amount: S.asbestos.e, mode: 'aside' }),
  },
  {
    id: 'worktime',
    when: (c, x) => x.survey('workTimeLimit'),
    line: () => ({ category: '추가(규제)', name: '작업시간 제한', detail: '공사 기간이 늘어난 인건비', amount: S.workTimeLimit.l, mode: 'in', addToLabor: true }),
  },
  {
    id: 'mixedWaste',
    when: (c, x) => x.survey('wasteMixed'),
    line: (c, x) => ({
      category: '추가(폐기물)',
      name: '혼합 폐기물 분리·추가 처리',
      detail: '성상 분리 인력 + 혼합 처리 단가',
      amount: x.amount('wasteMixed', Math.max(15, Math.round(x.wasteTotal * 0.35))),
      mode: 'in',
      addToWaste: true,
    }),
  },
  {
    id: 'deposit',
    when: (c, x) => x.survey('adminDeposit'),
    line: (c, x) => ({
      category: '추가(규제)',
      name: '관리사무소 신고·동의서',
      detail: '동의서 작성·대행',
      amount: x.amount('adminDeposit', getRate(x.rates, ['site', 'adminReport'], 8)),
      mode: 'extra',
    }),
  },
  {
    id: 'cut',
    when: (c, x) => x.survey('powerWaterCut'),
    line: () => ({ category: '추가(규제)', name: '단전·단수 조치', detail: '차단·마감', amount: S.powerWaterCut.e, mode: 'extra' }),
  },
  {
    id: 'gas',
    when: (c, x) => x.survey('gasFirePermit'),
    line: () => ({ category: '추가(규제)', name: '가스·소방 작업허가', detail: '허가·보양', amount: S.gasFirePermit.e, mode: 'extra' }),
  },
  // ── 현장 (거주·보양·청소) ─────────────────────────
  {
    id: 'residential',
    when: (c, x) => x.survey('residential'),
    line: (c, x) => ({
      category: '추가(현장)',
      name: '거주 중 시공 보양',
      detail: '가구 이동·먼지막이·매일 청소',
      amount: x.amount('residential', S.residential.l),
      mode: 'in',
      addToLabor: true,
    }),
  },
  {
    id: 'protect',
    when: (c, x) => x.survey('protectLevel'),
    line: (c, x) => {
      const spots = Math.max(1, parseInt(c?.protectSpots, 10) || 1);
      return {
        category: '추가(현장)',
        name: '보양(엘베·복도·현관)',
        detail: `${spots}곳 기준 (아래에서 금액 수정)`,
        amount: x.amount('protectLevel', getRate(x.rates, ['site', 'protect'], 8) * spots),
        mode: 'extra',
      };
    },
  },
  {
    id: 'worktime_weekend',
    when: (c, x) => x.survey('noWeekend') && x.workDays > 0,
    line: (c, x) => ({
      category: '추가(규제)',
      name: '주말·공휴일 작업',
      detail: '인력 수급·소음 민원 대응 (인건비의 10%)',
      amount: Math.max(5, Math.round(x.laborTotal * 0.1)),
      mode: 'in',
      addToLabor: true,
    }),
  },
  {
    id: 'outOfTown',
    when: (c, x) => x.outOfTown,
    line: () => ({ category: '추가(운반)', name: '외곽 출장', detail: '안동 외 지역 — 왕복 이동·장비 회송', amount: 20, mode: 'extra' }),
  },
  {
    id: 'clean',
    when: (c, x) => x.survey('afterCare'),
    line: (c, x) => {
      const cleanPeople = Math.max(1, Math.ceil(x.pyung / 20));
      const cleanDays = x.pyung < 10 ? 0.5 : 1;
      const cleanRate = getRate(x.rates, ['labor', 'cleaner'], 19);
      return {
        category: '추가(현장)',
        name: '준공 청소',
        detail: `청소 ${cleanPeople}명 × ${cleanDays}일 × ${cleanRate}만 (${x.pyung}평 기준)`,
        amount: x.amount('afterCare', Math.round(cleanPeople * cleanDays * cleanRate)),
        mode: 'in',
        addToLabor: true,
        crewDays: cleanPeople * cleanDays,
      };
    },
  },
];

// 현장 조건 → 가산 줄 목록. 금액이 0인 조건은 줄을 만들지 않는다.
export function siteSurchargeLines(c, ctx) {
  const out = [];
  SURCHARGE_RULES.forEach((rule) => {
    let hit = false;
    try {
      hit = rule.when(c, ctx);
    } catch {
      hit = false;
    }
    if (!hit) return;
    const line = rule.line(c, ctx);
    if (!line || !line.amount) return;
    out.push({ id: rule.id, ...line });
  });
  return out;
}
