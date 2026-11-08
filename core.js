/* J攝影師租機｜共用規則（網站與後端使用同一份，改規則只改這裡） */
var API_URL = 'https://script.google.com/macros/s/AKfycbzlsrRFXHRmtSdKA-u9ZeUi5IbmwTdM4yq4ZSrJqb3ga0Xz48LzMnce7MQVyXtPGuYs/exec';

var RULES = {
  phones: 2,
  lens: { '200': 1, '400': 1 },
  gapMin: 120,
  windowStart: '16:00',
  windowEnd: '21:00',
  stepMin: 30,
  equipment: {
    phone: { label: '手機', daily: 1000, lens: '' },
    p200: { label: '手機＋200mm 增距鏡', daily: 1300, lens: '200' },
    p400: { label: '手機＋400mm 增距鏡', daily: 1500, lens: '400' }
  },
  tiers: [{ minDays: 5, pct: 85 }, { minDays: 3, pct: 90 }],
  referral: { days: 5, price: { p200: 5500, p400: 6000 } },
  prepayPct: 30,
  deposit: { domestic: 5000, foreign: 10000 },
  regionLabel: { domestic: '國內', foreign: '國外' },
  payHours: 24,
  minLeadDays: 1,
  maxAdvanceDays: 120,
  maxDays: 30,
  extendPerHour: 100
};

var TZ_MS = 8 * 3600 * 1000;
function pad2(n) { return (n < 10 ? '0' : '') + n; }

/* 時間一律用台北時間字串 YYYY-MM-DD HH:mm */
function toMs(s) {
  var m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(String(s));
  if (!m) return NaN;
  var u = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  var d = new Date(u);
  if (d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3] || +m[4] > 23 || +m[5] > 59) return NaN;
  return u - TZ_MS;
}
function fmtMs(ms) {
  var d = new Date(ms + TZ_MS);
  return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate()) + ' ' + pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes());
}
function dateOf(s) { return String(s).slice(0, 10); }
function timeOf(s) { return String(s).slice(11, 16); }
function dayNum(date) { return Math.round((toMs(date + ' 00:00') + TZ_MS) / 86400000); }
function dayDiff(a, b) { return dayNum(b) - dayNum(a); }
function addDays(date, n) { return dateOf(fmtMs(toMs(date + ' 00:00') + n * 86400000)); }
function rentalDays(start, end) { return dayDiff(dateOf(start), dateOf(end)) + 1; }
function minutesOf(t) { return +t.slice(0, 2) * 60 + +t.slice(3, 5); }

function timeSlots() {
  var out = [], m = minutesOf(RULES.windowStart), e = minutesOf(RULES.windowEnd);
  for (; m <= e; m += RULES.stepMin) out.push(pad2(Math.floor(m / 60)) + ':' + pad2(m % 60));
  return out;
}
function isSlot(s) {
  if (isNaN(toMs(s))) return false;
  return timeSlots().indexOf(timeOf(s)) >= 0;
}

/* 預約時段檢查，回傳錯誤訊息或空字串 */
function checkTimes(start, end, nowMs) {
  if (!isSlot(start) || !isSlot(end)) return '取還時間需在 ' + RULES.windowStart + '–' + RULES.windowEnd + ' 之間';
  if (toMs(end) <= toMs(start)) return '歸還時間需晚於取機時間';
  var today = dateOf(fmtMs(nowMs));
  var lead = dayDiff(today, dateOf(start));
  if (lead < RULES.minLeadDays) return '請至少提前 ' + RULES.minLeadDays + ' 天預約';
  if (lead > RULES.maxAdvanceDays) return '目前只開放 ' + RULES.maxAdvanceDays + ' 天內的預約';
  if (rentalDays(start, end) > RULES.maxDays) return '單次最長租 ' + RULES.maxDays + ' 天';
  return '';
}

function tierPct(days) {
  for (var i = 0; i < RULES.tiers.length; i++) if (days >= RULES.tiers[i].minDays) return RULES.tiers[i].pct;
  return 100;
}

/* o: {equip, plan:'standard'|'referral', start, end, region} */
function calcQuote(o) {
  var eq = RULES.equipment[o.equip];
  if (!eq) return { ok: false, err: '請選擇配備' };
  if (isNaN(toMs(o.start)) || isNaN(toMs(o.end)) || toMs(o.end) <= toMs(o.start)) return { ok: false, err: '請選擇取還時間' };
  if (!RULES.deposit[o.region]) return { ok: false, err: '請選擇租借地區' };
  var days = rentalDays(o.start, o.end), rent, deposit, planLabel;
  if (o.plan === 'referral') {
    var p = RULES.referral.price[o.equip];
    if (!p) return { ok: false, err: '介紹人專案只適用手機加增距鏡' };
    if (days !== RULES.referral.days) return { ok: false, err: '介紹人專案需連續承租 ' + RULES.referral.days + ' 日' };
    rent = p; deposit = 0; planLabel = '方案三｜介紹人專案（免押金）';
  } else {
    var pct = tierPct(days);
    rent = Math.round(eq.daily * days * pct / 100);
    deposit = RULES.deposit[o.region];
    planLabel = pct === 100 ? '方案一｜一般日租' : '方案二｜長租優惠（' + (pct / 10) + ' 折）';
  }
  var prepay = Math.ceil(rent * RULES.prepayPct / 100);
  return { ok: true, days: days, daily: eq.daily, rent: rent, prepay: prepay, deposit: deposit, dueAtPickup: rent - prepay + deposit, total: rent + deposit, planLabel: planLabel, equipLabel: eq.label, lens: eq.lens };
}

/* 檔期：bookings = [{id,s,e,l}]，同一支手機前後需隔 gapMin 分鐘 */
function peak_(sMs, eMs, list) {
  var pts = [sMs], max = 0, i, j, gap = RULES.gapMin * 60000, hit = [];
  for (i = 0; i < list.length; i++) {
    var a = toMs(list[i].s), b = toMs(list[i].e) + gap;
    if (a < eMs && sMs < b) { hit.push([a, b]); if (a > sMs) pts.push(a); }
  }
  for (i = 0; i < pts.length; i++) {
    var c = 0;
    for (j = 0; j < hit.length; j++) if (hit[j][0] <= pts[i] && pts[i] < hit[j][1]) c++;
    if (c > max) max = c;
  }
  return max;
}
function canFit(start, end, lens, bookings, ignoreId) {
  var list = ignoreId ? bookings.filter(function (b) { return b.id !== ignoreId; }) : bookings;
  var s = toMs(start), e = toMs(end) + RULES.gapMin * 60000;
  if (peak_(s, e, list) >= RULES.phones) return false;
  if (lens) {
    var same = list.filter(function (b) { return b.l === lens; });
    if (peak_(s, e, same) >= RULES.lens[lens]) return false;
  }
  return true;
}
function dayStatus(date, equip, bookings) {
  var lens = RULES.equipment[equip].lens, slots = timeSlots(), free = 0;
  slots.forEach(function (t) {
    var s = date + ' ' + t;
    if (canFit(s, fmtMs(toMs(s) + RULES.stepMin * 60000), lens, bookings)) free++;
  });
  return free === 0 ? 'full' : free === slots.length ? 'open' : 'partial';
}

function payDeadlineMs(nowMs, start) {
  return Math.min(nowMs + RULES.payHours * 3600000, toMs(start) - 2 * 3600000);
}

/* 逾時費：未滿 30 分免收；30 分至 4 小時 400；超過 4 小時加收一日租金 */
function lateFee(scheduledEnd, actualEnd, daily) {
  var mins = (toMs(actualEnd) - toMs(scheduledEnd)) / 60000;
  if (mins < 30) return 0;
  if (mins <= 240) return 400;
  return daily;
}

/* 取消退款（預約金）。reason: customer 客人取消／owner 甲方因素／force 不可抗力／noshow 未到場 */
function cancelRefund(prepaid, pickupDate, today, reason, wasPaid) {
  if (!wasPaid) return 0;
  if (reason === 'owner') return prepaid * 2;
  if (reason === 'force') return prepaid;
  if (reason === 'noshow') return 0;
  var d = dayDiff(today, pickupDate);
  if (d >= 7) return prepaid;
  if (d >= 3) return Math.floor(prepaid / 2);
  return 0;
}
function extendFee(oldEnd, newEnd) {
  return Math.ceil((toMs(newEnd) - toMs(oldEnd)) / 3600000) * RULES.extendPerHour;
}
function money(n) { return 'NT$' + Number(n || 0).toLocaleString('en-US'); }
