// 업체별 자재 발주 리스트 — "발주 문자" 하나로 뭉뚱그리지 않고, 거래처마다 따로 발주한다.
// 각 업체 카드: 품명·규격·수량 + 저렴하게 사는 팁 + 그 업체에만 보낼 짧은 발주 내용.
import { toPyung, needsLadder } from './pricing.js';
import { scopeList } from './constants.js';

const num = (v, f = 0) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : f;
};

const ceil = (n) => Math.max(1, Math.ceil(n));

function group(id, vendor, tone, items, tips, extra = {}) {
  const lines = items.map((it) => `· ${it.name}${it.spec ? ` / ${it.spec}` : ''} — ${it.qty}`);
  return {
    id,
    vendor,
    tone,
    items,
    tips: tips.filter(Boolean),
    message: [`[자재 발주] ${vendor}`, ...lines, ...(extra.footer ? ['', extra.footer] : [])].join('\n'),
    ...extra,
  };
}


// 복합 현장의 세부 공종별 발주 — 켜 둔 공종의 품목만 만든다.
function scopeOrderGroups(scope, c, calc, pyung, order, sizeVal, unit) {
  const out = [];
  if (scope === 'demolition') {
    out.push(
      group(
        'demo-bag',
        '철물점 / 건재상 (철거 준비물)',
        'amber',
        [
          { name: order.bag || '마대 5종 분리', qty: `${ceil(pyung * 4)}장` },
          { name: order.protect || '부직포 + 비닐 보양', qty: '각 1롤' },
          { name: '커터날·바리깡 날', qty: '10개' },
          { name: '방진마스크·작업장갑', qty: '인부 수만큼' },
        ],
        [
          '마대를 5종(콘크리트·목재·석고·금속·비닐)으로 나누면 처리비가 최대 6배 차이 납니다.',
          '보양재는 현장 근처 철물점이 온라인보다 빠릅니다. 착공 전날까지 준비하세요.',
        ],
        { footer: `철거 면적 ${pyung}평 기준 / 착공 전날까지` }
      ),
      group(
        'demo-equip',
        '장비·폐기물 업체',
        'slate',
        [
          { name: '집게차(1회 출동)', qty: `${Math.max(1, Math.round(pyung / 10))}회` },
          { name: '1톤/2.5톤 덤프', qty: `${Math.max(1, Math.round(pyung / 5))}대` },
          { name: '처리확인서(올바로)', qty: '1부' },
        ],
        ['집게차는 오전 예약이 대기 없이 빠릅니다.', '폐기물 차량은 성상 분리 뒤에 부르세요. 섞이면 대수가 늘어납니다.'],
        { footer: '방문: 착공일 오전 8시 / 주차·진입로 확인' }
      )
    );
  } else if (scope === 'groundwork') {
    const area = Math.max(1, +(pyung * 3.3).toFixed(1));
    out.push(
      group(
        'ground-mat',
        '골재상 / 건재상',
        'orange',
        [
          { name: '쇄석·잡석(기초 골재)', qty: `${ceil(area * 0.12)}㎥` },
          { name: '시멘트·레미탈(40kg)', qty: `${ceil(area * 0.6)}포` },
          { name: '메쉬·철근(바닥 보강)', qty: `${ceil(area / 10)}롤` },
        ],
        ['골재는 ㎥ 단위로 주문합니다. 다짐 전에 물을 뿌려야 밀도가 나옵니다.', '잔토(남는 흙)는 반출 허가업체에 맡기고 계량증명서를 받으세요.'],
        { footer: `${area}㎡ 기준 / 착공 D-2 발주` }
      ),
      group(
        'ground-equip',
        '장비 대여 / 반출',
        'slate',
        [
          { name: '굴삭기(0.8㎥)', qty: `1대 · ${Math.max(1, Math.ceil(area / 60))}일` },
          { name: '다짐기(콤팩터)', qty: '1대 · 1일' },
          { name: '잔토 반출 덤프', qty: `${Math.max(1, Math.ceil(area / 40))}대` },
        ],
        ['굴삭기는 진입로 폭과 상부 전선 높이를 먼저 확인하세요.', '장비는 하루 단위로 빌립니다. 우천이면 다음 날로 미루세요.'],
        { footer: `${area}㎡ 기준 / 장비 진입로·매설물 확인 후` }
      )
    );
  } else if (scope === 'wallpaper') {
    const wallPyung = +(pyung * 2.3).toFixed(1);
    const rolls = ceil((wallPyung / num(order.rollPerPyung, 5)) * 1.15);
    const floorSqm = Math.round(pyung * 2.3);
    out.push(
      group(
        'wall',
        '벽지 도매상',
        'amber',
        [
          { name: order.wallpaper || '광폭 합지', spec: '롤당 5평', qty: `${rolls}롤 (로스 15%)` },
          { name: '친환경 벽지풀', qty: `${ceil(rolls / 4)}말` },
          { name: '초배지', qty: `${ceil(wallPyung / 10)}롤` },
        ],
        ['같은 로트로 받아야 색 차이가 없습니다.', '롤 단가는 30롤 이상 주문할 때 유리합니다.'],
        { footer: `벽 ${wallPyung}평 기준 / 납기: 도배 D-2` }
      ),
      group(
        'floor',
        '장판 대리점',
        'orange',
        [{ name: order.floor || '2.0T 모노륨 장판', qty: `${ceil(floorSqm / 5.5)}롤 (${floorSqm}㎡)` }, { name: '장판 본드(수성)', qty: `${ceil(floorSqm / 25)}통` }],
        ['장판은 폭 1.83m로 재단합니다. 이음새 위치를 먼저 정하세요.'],
        { footer: `바닥 ${floorSqm}㎡ / 납기: 장판 D-2` }
      )
    );
  } else if (scope === 'bathroom') {
    const kans = unit === '칸' && sizeVal > 0 ? sizeVal : 1;
    const area = +(kans * 5.9).toFixed(1);
    const boxArea = num(order.tileBox, 3.6);
    out.push(
      group(
        'bath-tile',
        '타일·도기 대리점',
        'cyan',
        [
          { name: order.tile || '600×600 포세린', spec: `1박스 ${boxArea}㎡`, qty: `${ceil((area * 1.1) / boxArea)}박스` },
          { name: '타일 접착제', qty: `${ceil(area / 5)}포` },
          { name: '줄눈재(무광)', qty: `${ceil(area / 8)}포` },
          { name: order.fixture || '도기·수전 세트', qty: `${ceil(kans)}세트` },
        ],
        ['파손 대비 여유분 10%와 같은 로트는 기본입니다.', '도기·수전은 대리점 정품이 A/S됩니다.'],
        { footer: `${kans}칸 기준 / 납기: 철거 D-1` }
      ),
      group(
        'bath-water',
        '방수 자재상',
        'sky',
        [
          { name: order.waterproof || '2액형 우레탄 방수', qty: `${ceil(kans)}세트(20kg)` },
          { name: '방수 프라이머', qty: `${ceil(kans)}통(4L)` },
          { name: '보강테이프(모서리·배관)', qty: `${ceil(kans * 2)}롤` },
        ],
        ['방수는 프라이머와 같은 브랜드 세트로 사야 들뜸이 없습니다.'],
        { footer: '담수 48시간 시험 전 도포' }
      )
    );
  } else if (scope === 'kitchen') {
    const meters = unit === 'm' && sizeVal > 0 ? sizeVal : 3.2;
    out.push(
      group(
        'kitchen',
        '싱크대·상판 업체',
        'rose',
        [
          { name: order.sink || 'LPM 상·하부장', spec: 'm당', qty: `${meters}m` },
          { name: order.top || '인조대리석 상판', qty: `${meters}m (수전 홀 가공)` },
          { name: '수전·싱크볼 세트', qty: '1세트' },
        ],
        ['상판은 실측 확정 후 가공합니다. 수전 홀 위치를 문자로 남기세요.', '후드·가스레인지는 재사용 여부를 먼저 정하세요.'],
        { footer: `${meters}m 기준 / 실측 후 발주` }
      )
    );
  } else if (scope === 'entrance') {
    out.push(
      group(
        'entrance',
        '중문·신발장 업체',
        'indigo',
        [
          { name: '3연동 중문', qty: '1세트 (실측)' },
          { name: '신발장(맞춤)', qty: '1개 (실측)' },
          { name: '현관 타일', qty: '2㎡' },
        ],
        ['중문은 실측 후 제작이라 납기 2주입니다. 현관 폭을 먼저 재세요.'],
        { footer: '실측 후 발주 / 납기 2주' }
      )
    );
  } else if (scope === 'plaster') {
    const area = unit === '㎡' && sizeVal > 0 ? sizeVal : Math.max(1, +(pyung * 3.3).toFixed(1));
    out.push(
      group(
        'mortar',
        '건재상 / 레미탈 대리점',
        'orange',
        [
          { name: order.mortar || '고강도 몰탈(25kg)', qty: `${ceil(area * 2)}포` },
          { name: order.mesh || '전면 메쉬', qty: `${ceil(area / 10)}롤` },
          { name: '양생 비닐', qty: '1롤' },
        ],
        ['몰탈은 ㎡당 2포대(30mm) 기준입니다.', '양생 전 출입하면 바닥이 깨져 재시공입니다.'],
        { footer: `${area}㎡ 기준 / 납기: 미장 D-1` }
      )
    );
  } else if (scope === 'carpentry') {
    out.push(
      group(
        'wood',
        '목재상 / 문·몰딩 업체',
        'amber',
        [
          { name: '문틀·몰딩(MDF)', qty: '문 개수 실측 후' },
          { name: '문짝·경첩·손잡이', qty: '문 개수만큼' },
          { name: '도장재(문짝 페인트)', qty: '1식' },
        ],
        ['문틀 규격을 잘못 재면 맞춤 제작으로 자재비가 2~3배 붙습니다.'],
        { footer: '문 개수·규격 실측 후 발주' }
      )
    );
  } else if (scope === 'electric') {
    const points = unit === '개소' && sizeVal > 0 ? sizeVal : 5;
    out.push(
      group(
        'elec',
        '전기 자재상',
        'yellow',
        [
          { name: '스위치·콘센트', qty: `${ceil(points)}개소` },
          { name: 'LED 조명', qty: `${Math.max(2, ceil(points))}개` },
          { name: '전선·몰드', qty: '1식' },
        ],
        ['분전함 용량을 먼저 확인하세요. 증설이면 한전 승압 비용이 붙습니다.'],
        { footer: '차단기 용량 확인 후 발주' }
      )
    );
  }
  return out;
}

// 공종별 발주 구성. calc·mset(선택한 자재 세트)에 따라 품명·수량이 바뀐다.
export function buildOrderGroups(c, calc, design, mset) {
  const trade = calc?.trade || c?.trade || 'combined';
  const order = mset?.order || {};
  const sizeVal = num(c?.sizeValue);
  const unit = c?.sizeUnit || '평';
  const pyung = toPyung(sizeVal, unit, 15);
  const groups = [];

  if (trade === 'bathroom') {
    const kans = unit === '칸' && sizeVal > 0 ? sizeVal : 1;
    const area = +(kans * 5.9).toFixed(1); // 1칸 ≈ 5.9㎡ (벽+바닥)
    const boxArea = num(order.tileBox, 3.6);
    const boxes = ceil((area * 1.1) / boxArea);
    groups.push(
      group(
        'water',
        '방수 자재상 / 철물점',
        'sky',
        [
          { name: order.waterproof || '2액형 우레탄 방수', qty: `${ceil(kans)}세트(20kg)` },
          { name: '방수 프라이머', qty: `${ceil(kans)}통(4L)` },
          { name: '보강테이프(모서리·배관 주위)', qty: `${ceil(kans * 2)}롤` },
          { name: '마대(철거재)', qty: `${ceil(kans * 20)}장` },
        ],
        [
          '우레탄은 프라이머와 같은 브랜드 세트로 사야 들뜸이 없습니다.',
          '지역 철물점 도매가가 온라인보다 5~10% 싼 경우가 많습니다(배송비 없음).',
        ],
        { footer: `납기: 착공 3일 전 / 방수 1회 도포 후 4시간 건조, 2회째 도포` }
      ),
      group(
        'tile',
        '타일·도기 대리점 / 건재상',
        'cyan',
        [
          { name: order.tile || '600×600 포세린', spec: `1박스 ${boxArea}㎡·약 20kg`, qty: `${boxes}박스 (여유 10%) · 약 ${boxes * 20}kg` },
          { name: '타일 접착제(대형타일용)', qty: `${ceil(area / 5)}포(20kg)` },
          { name: '줄눈재(무광)', qty: `${ceil(area / 8)}포` },
          { name: order.fixture || '도기·수전 세트', qty: `${ceil(kans)}세트` },
        ],
        [
          '파손 대비 여유분 10%는 필수입니다. 같은 로트(제조번호)로 받으세요.',
          '도기·수전은 대리점 정품이 A/S가 됩니다. 온라인 최저가와 비교 후 결정하세요.',
        ],
        { footer: '납기: 철거 D-1 오전 / 하차: 엘리베이터 사용 여부 확인' }
      ),
      group(
        'plumb',
        '설비·부자재',
        'slate',
        [
          { name: '수전·배관 연결 부속', qty: `${ceil(kans)}조` },
          { name: '수중 실리콘(백색/투명)', qty: '2통' },
          { name: '방습등 4000K', qty: `${ceil(kans)}개` },
          { name: '욕실 환풍기(교체 시)', qty: c?.survey?.protectLevel ? '1대' : '확인 후' },
        ],
        ['실리콘은 수중용(욕실용)인지 확인하세요. 일반 실리콘은 곰팡이가 빨리 낍니다.'],
        { footer: '타일 시공 D-1까지 현장 도착' }
      )
    );
  } else if (trade === 'wallpaper') {
    const wallPyung = +(pyung * 2.3).toFixed(1);
    const rolls = ceil((wallPyung / num(order.rollPerPyung, 5)) * 1.15);
    const floorSqm = Math.round(pyung * 2.3);
    groups.push(
      group(
        'wall',
        '벽지 도매상',
        'amber',
        [
          { name: order.wallpaper || '광폭 합지', spec: '롤당 5평·약 2.5kg', qty: `${rolls}롤 (로스 15%) · 약 ${(rolls * 2.5).toFixed(1)}kg` },
          { name: '친환경 벽지풀', spec: '1말 18kg', qty: `${ceil(rolls / 4)}말 · 약 ${ceil(rolls / 4) * 18}kg` },
          { name: '초배지', qty: `${ceil(wallPyung / 10)}롤` },
        ],
        [
          '롤 단가가 싼 도매상은 30롤 이상 주문 시 유리합니다. 현장에서 2~3롤 남기는 게 정상입니다.',
          '같은 로트로 받아야 색 차이가 없습니다.',
        ],
        { footer: `벽 면적 ${wallPyung}평 기준 / 납기: 도배 D-2` }
      ),
      group(
        'floor',
        '장판 대리점',
        'orange',
        [
          { name: order.floor || '2.0T 모노륨 장판', spec: '폭 1.83m·롤당 약 20kg', qty: `${ceil(floorSqm / 5.5)}롤 (${floorSqm}㎡) · 약 ${ceil(floorSqm / 5.5) * 20}kg` },
          { name: '장판 본드(수성)', qty: `${ceil(floorSqm / 25)}통` },
          { name: '걸레받이(교체 시)', qty: `${ceil((pyung * 0.9) / 2.4)}본` },
        ],
        ['장판은 폭 1.83m 기준으로 재단합니다. 이음새 위치를 먼저 정하고 주문하세요.'],
        { footer: `바닥 ${floorSqm}㎡ (${pyung}평 × 2.3) / 납기: 장판 D-2` }
      ),
      group(
        'sub',
        '철물점 / 부자재',
        'slate',
        [
          { name: '퍼티·초배 부자재', qty: '1세트' },
          { name: '마대(기존 벽지 제거)', qty: `${ceil(pyung / 2)}장` },
          { name: '보양 비닐·부직포', qty: '1롤' },
        ],
        ['기존 벽지 제거 후 벽 상태가 나쁘면 초배를 한 번 더 해야 합니다. 퍼티를 여유 있게 사세요.'],
        {}
      )
    );
  } else if (trade === 'kitchen') {
    const meters = unit === 'm' && sizeVal > 0 ? sizeVal : 3.2;
    groups.push(
      group(
        'cabinet',
        '싱크대 제작·납품 업체',
        'rose',
        [
          { name: order.cabinet || 'LPM 상·하부장', spec: '상부 350mm / 하부 600mm', qty: `${meters}m` },
          { name: order.top || '인조대리석 상판', spec: '수전 홀·싱크볼 가공 포함', qty: `${meters}m` },
          { name: '후드·가스레인지', qty: order.hood || '기존 재사용' },
        ],
        [
          '상판 가공 전 실측(수전 홀 위치·싱크볼 좌우)을 확정해야 합니다. 가공 후 변경은 새 상판 값입니다.',
          '제작 업체는 실측 → 제작 → 설치 2주 납기가 기본입니다.',
        ],
        { footer: '납기: 실측 D+0 → 제작 10~14일 → 설치' }
      ),
      group(
        'plumb',
        '설비·부자재',
        'slate',
        [
          { name: '싱크볼·수전(교체 시)', qty: '1세트' },
          { name: '급수·배수 연결 부속', qty: '1조' },
          { name: '가스 호스·밸브', qty: '1조' },
          { name: '수중 실리콘 + 언더캐비닛등', qty: '각 1' },
        ],
        ['가스 연결은 자격자가 해야 합니다. 임의 분리 후 재연결은 보험 사고 시 문제됩니다.'],
        { footer: '설치 D-1까지 현장 도착' }
      )
    );
  } else if (trade === 'demolition') {
    groups.push(
      group(
        'bag',
        '철물점 / 건재상',
        'amber',
        [
          { name: order.bag || '마대 5종 분리', qty: `${ceil(pyung * 4)}장` },
          { name: order.protect || '부직포 + 비닐 보양', qty: '각 1롤' },
          { name: '커터날·바리깡 날', qty: '10개' },
          { name: '먼지막이 테이프(양면)', qty: '5개' },
        ],
        [
          '마대를 5종(콘크리트·목재·석고·금속·비닐)으로 나누면 처리비가 최대 6배 차이 납니다.',
          '보양재는 다이소·철물점이 온라인보다 빠릅니다. 급하면 현장 근처에서 사세요.',
        ],
        { footer: `철거 면적 ${pyung}평 기준 / 착공 전날까지 준비` }
      ),
      group(
        'equip',
        '장비·폐기물 업체',
        'slate',
        [
          { name: '집게차(1회 출동)', qty: `${Math.max(1, Math.round(pyung / 10))}회` },
          { name: '1톤/2.5톤 덤프', qty: `${Math.max(1, Math.round(pyung / 5))}대` },
          ...(needsLadder(c) ? [{ name: '사다리차(층수·주차 확인)', qty: '반나절' }] : []),
        ],
        [
          '집게차는 오전에 예약해야 합니다. 오후는 대기 시간이 붙습니다.',
          '폐기물 차량은 성상 분리 여부에 따라 대수가 달라집니다. 먼저 분리하고 부르세요.',
        ],
        { footer: `방문: 착공일 오전 8시 / 주차·진입로 확인` }
      )
    );
  } else if (trade === 'tilewaterproof') {
    const area = unit === '㎡' && sizeVal > 0 ? sizeVal : Math.max(1, pyung * 3.3);
    const boxArea = num(order.tileBox, 3.6);
    groups.push(
      group(
        'tile',
        '타일 대리점 / 건재상',
        'cyan',
        [
          { name: order.tile || '600×600 포세린', spec: `1박스 ${boxArea}㎡·약 20kg`, qty: `${ceil((area * 1.1) / boxArea)}박스 · 약 ${ceil((area * 1.1) / boxArea) * 20}kg` },
          { name: '타일 접착제', qty: `${ceil(area / 5)}포` },
          { name: '줄눈재', qty: `${ceil(area / 8)}포` },
        ],
        ['파손 대비 여유분 10%와 같은 로트는 기본입니다.', '대형 타일은 대형타일용 접착제(C2TE)를 쓰세요.'],
        { footer: `${area}㎡ 기준 / 납기: 시공 D-2` }
      ),
      group(
        'water',
        '방수 자재상 / 철물점',
        'sky',
        [
          { name: order.waterproof || '2액형 우레탄 방수', qty: `${ceil(area / 12)}세트(20kg)` },
          { name: '프라이머', qty: `${ceil(area / 25)}통` },
          { name: '보강테이프', qty: `${ceil(area / 8)}롤` },
        ],
        ['방수는 2회 이상, 모서리·배관 주위는 보강테이프를 먼저 붙입니다.'],
        {}
      )
    );
  } else if (trade === 'plaster') {
    const area = unit === '㎡' && sizeVal > 0 ? sizeVal : Math.max(1, +(pyung * 3.3).toFixed(1));
    groups.push(
      group(
        'mortar',
        '건재상 / 레미탈 대리점',
        'orange',
        [
          { name: order.mortar || '고강도 몰탈(25kg)', spec: '포당 25kg', qty: `${ceil(area * 2)}포 · 약 ${ceil(area * 2) * 25}kg` },
          { name: order.mesh || '전면 메쉬', qty: `${ceil(area / 10)}롤` },
          { name: '양생 비닐', qty: '1롤' },
        ],
        ['몰탈은 ㎡당 2포대(30mm) 기준입니다. 두께가 두꺼우면 포대 수를 늘리세요.', '여름·겨울 양생은 비닐 보양이 필수입니다.'],
        { footer: `${area}㎡ 기준 / 납기: 미장 D-1` }
      ),
      group(
        'detail',
        '철물점 / 부자재',
        'slate',
        [{ name: '레벨·다듬이·흙손', qty: '현장 보유 확인' }, { name: '난방배관 보강재(해당 시)', qty: '1식' }],
        ['공구는 대여가 하루 2~3만원입니다. 구매보다 대여가 쌉니다.'],
        {}
      )
    );
  } else if (trade === 'window') {
    const area = unit === '㎡' && sizeVal > 0 ? sizeVal : Math.max(1, +(pyung * 3.3).toFixed(1));
    groups.push(
      group(
        'frame',
        '창호 제작·시공 업체',
        'sky',
        [
          { name: order.frame || 'LX하우시스 시스템창', spec: order.glass || '3중 로이유리', qty: `${area}㎡ (실측 기준)` },
          { name: order.screen || '미세방충망', qty: `${ceil(area / 3)}개` },
        ],
        ['창호는 실측 후 제작이라 납기 2~3주입니다. 실측 없이 주문하면 책임이 시공사에 남습니다.', 'A/S 조건(힌지·잠금장치)을 계약서에 넣으세요.'],
        { footer: `${area}㎡ 기준 / 실측 후 제작` }
      ),
      group(
        'sub',
        '철물점 / 부자재',
        'slate',
        [
          { name: '단열 마감재(우레탄폼·단열테이프)', qty: '1식' },
          { name: '외부용 실리콘', qty: `${ceil(area / 2)}통` },
        ],
        ['외부 실리콘은 내후성(외장용) 제품이어야 2~3년 뒤 갈라지지 않습니다.'],
        {}
      )
    );
  } else if (trade === 'repair') {
    groups.push(
      group(
        'mat',
        '철물점 / 자재상',
        'rose',
        [
          { name: order.material || '동일 규격 국산 자재', qty: `${Math.max(1, sizeVal || 1)}개소분` },
          { name: '수중 실리콘·본드', qty: '각 1' },
          { name: '도장·페인트(색 맞춤)', qty: '1식' },
        ],
        ['단종 자재는 같은 규격으로 대체됩니다. 손님 승인을 먼저 받으세요.'],
        {}
      )
    );
  } else if (trade === 'labor') {
    groups.push(
      group(
        'agency',
        '인력사무소 / 현장 준비물',
        'slate',
        [
          { name: '기공(경력 3년 이상)', qty: `${Math.max(1, sizeVal || 1)}명 × ${Math.max(1, num(c?.laborDays, 1))}일` },
          { name: '안전화·안전모·장갑', qty: `${Math.max(1, sizeVal || 1)}세트` },
          { name: '기초안전보건교육 이수증', qty: '전원 확인' },
          { name: '현장 공구(망치·바리깡·커터)', qty: '1세트' },
        ],
        ['자재 발주는 없습니다 — 인력 현장은 준비물만 챙기면 됩니다.', '전날 18시까지 인원 확정을 받으세요. 결원 1명 = 일당 + 공정 1일 지연입니다.'],
        { footer: '집결: 착공일 08:00 / 준비물: 안전화·장갑' }
      )
    );
  } else if (trade === 'waste') {
    const tons = unit === '톤' && sizeVal > 0 ? sizeVal : Math.max(0.5, +(pyung * 0.18).toFixed(1));
    groups.push(
      group(
        'bag',
        '철물·보양재 (철물점)',
        'amber',
        [
          { name: '마대(50장 묶음)', spec: '50장 1묶음', qty: `${Math.max(1, Math.ceil(tons / 0.5))}묶음` },
          { name: '보양 비닐·부직포', qty: '1롤' },
          { name: '테이프·작업장갑', qty: '각 1' },
        ],
        [
          '성상별로 마대를 나눠 담으면 처리비가 3~6배 차이 납니다.',
          '마대는 50장 묶음이 낱장보다 20% 쌉니다.',
        ],
        { footer: `${tons}톤 기준 / 반출 전날까지 준비` }
      ),
      group(
        'truck',
        '폐기물 처리장 / 차량 배차',
        'slate',
        [
          { name: '1톤 카고', qty: `${Math.max(1, Math.ceil(tons / 1.2))}대` },
          { name: '2.5톤 카고', qty: `${Math.max(1, Math.ceil(tons / 3.2))}대` },
          { name: '처리확인서(올바로)', qty: '1부' },
        ],
        [
          '혼합으로 내면 톤당 19만원대, 분리하면 7만원대입니다.',
          '오전 배차가 대기 없이 빠릅니다. 전날 예약하세요.',
        ],
        { footer: `${tons}톤 기준 / 방문: 반출일 08:00` }
      )
    );
  } else if (trade === 'combined') {
    // 복합은 켜 둔 세부 공종만 발주한다 — 철거+정지에 합지·타일·도기가 나오면 안 된다.
    const scopes = scopeList(c);
    if (!scopes.length) {
      const bag = ceil(pyung * 3);
      groups.push(
        group(
          'multi',
          '건재상 (복합 자재 일괄)',
          'indigo',
          [
            { name: order.wallpaper || '합지·장판', qty: `${pyung}평분` },
            { name: order.tile || '타일', qty: '욕실·주방 실측 후' },
            { name: '마대·보양재', qty: `${bag}장` },
          ],
          ['복합 공사는 자재를 한 건재상에서 묶어야 운반비가 한 번만 나갑니다.', '품목이 많으면 발주서를 문자로 남겨 두세요. 분쟁 때 근거가 됩니다.'],
          { footer: `규모 ${pyung}평 기준 / 착공 D-3 발주` }
        )
      );
    } else {
      scopes.forEach((sc) => groups.push(...scopeOrderGroups(sc, c, calc, pyung, order, sizeVal, unit)));
    }
  } else {
    const bag = ceil(pyung * 3);
    groups.push(
      group(
        'multi',
        '건재상 (복합 자재 일괄)',
        'indigo',
        [
          { name: order.wallpaper || '합지·장판', qty: `${pyung}평분` },
          { name: order.tile || '타일', qty: '욕실·주방 실측 후' },
          { name: '마대·보양재', qty: `${bag}장` },
        ],
        ['복합 공사는 자재를 한 건재상에서 묶어야 운반비가 한 번만 나갑니다.', '품목이 많으면 발주서를 문자로 남겨 두세요. 분쟁 때 근거가 됩니다.'],
        { footer: `규모 ${pyung}평 기준 / 착공 D-3 발주` }
      )
    );
  }

  return groups;
}
