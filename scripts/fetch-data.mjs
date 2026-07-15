// 네이버 금융 시세 API에서 종목별 일/주/월 종가를 수집해 data/*.json 으로 저장한다.
// GitHub Actions 및 로컬(Node 18+)에서 실행: node scripts/fetch-data.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dataDir = path.join(root, 'data');
mkdirSync(dataDir, { recursive: true });

const { symbols } = JSON.parse(readFileSync(path.join(root, 'symbols.json'), 'utf8'));

const UA = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' };

function ymd(d) {
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

async function fetchSise(code, timeframe, startDate) {
  const url =
    `https://api.finance.naver.com/siseJson.naver?symbol=${code}` +
    `&requestType=1&startTime=${ymd(startDate)}&endTime=${ymd(new Date())}&timeframe=${timeframe}`;
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`${code} ${timeframe}: HTTP ${res.status}`);
  const text = await res.text();
  // 응답은 헤더 행에 작은따옴표를 쓰는 느슨한 JSON — 정규화 후 파싱
  const rows = JSON.parse(text.replace(/'/g, '"'));
  return rows
    .slice(1)
    .filter((r) => Array.isArray(r) && /^\d{8}$/.test(String(r[0])))
    .map((r) => [
      String(r[0]).replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'),
      Number(r[4]), // 종가
    ])
    .filter((r) => Number.isFinite(r[1]) && r[1] > 0);
}

async function fetchName(code) {
  try {
    const res = await fetch(`https://m.stock.naver.com/api/stock/${code}/basic`, { headers: UA });
    const j = await res.json();
    return j.stockName || code;
  } catch {
    return code;
  }
}

const index = { updated: new Date().toISOString(), symbols: [] };

for (const code of symbols) {
  console.log(`fetching ${code} ...`);
  const [name, day, week, month] = await Promise.all([
    fetchName(code),
    fetchSise(code, 'day', daysAgo(220)),      // 일봉: 최근 6개월 표시용 여유분
    fetchSise(code, 'week', daysAgo(430)),     // 주봉: 최근 1년
    fetchSise(code, 'month', daysAgo(365 * 11 + 30)), // 월봉: 3년(월) + 10년(년) 파생용
  ]);
  if (!day.length || !week.length || !month.length) {
    throw new Error(`${code}: empty series (day=${day.length}, week=${week.length}, month=${month.length})`);
  }
  writeFileSync(
    path.join(dataDir, `${code}.json`),
    JSON.stringify({ code, name, day, week, month })
  );
  index.symbols.push({ code, name });
  console.log(`  ${name}: day=${day.length} week=${week.length} month=${month.length}`);
}

writeFileSync(path.join(dataDir, 'index.json'), JSON.stringify(index));
console.log('done.');
