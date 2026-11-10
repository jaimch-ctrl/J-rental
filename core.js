/* J攝影師租機｜共用規則（網站與後端使用同一份，改規則只改這裡） */
var API_URL = 'https://script.google.com/macros/s/AKfycbxXNkTHFp_My20SeQMj8teC60qXopGAnd6wyLbkhUvAcZrR_DzuuoI_GjeuDlU19Iz9fQ/exec';

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
  extendPerHour: 100,
  addons: { powerDaily: 50, transferEach: 200, transferMax: 3 }
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
  var power = o.power ? 1 : 0;
  var transfer = Math.max(0, Math.min(RULES.addons.transferMax, Math.floor(Number(o.transfer) || 0)));
  var powerFee = power * RULES.addons.powerDaily * days, transferFee = transfer * RULES.addons.transferEach, addonFee = powerFee + transferFee;
  return { ok: true, days: days, daily: eq.daily, rent: rent, prepay: prepay, deposit: deposit, power: power, transfer: transfer, powerFee: powerFee, transferFee: transferFee, addonFee: addonFee, dueAtPickup: rent - prepay + deposit + addonFee, total: rent + deposit + addonFee, planLabel: planLabel, equipLabel: eq.label, lens: eq.lens };
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

/* ===== 合約內容（由 Word 合約產生） ===== */
var CONTRACT = [{"k": "h1", "t": "手機及配件租賃合約書"}, {"k": "p", "t": "合約編號：＿＿＿＿＿＿＿＿"}, {"k": "p", "t": "甲乙雙方就手機及相關配件租賃事宜，經雙方同意，訂立本合約，並共同遵守以下條款。"}, {"k": "h2", "t": "第一條｜租賃雙方資料"}, {"k": "s", "t": "甲方（出租人）"}, {"k": "p", "t": "姓名／店家名稱：J攝影師租機"}, {"k": "p", "t": "聯絡電話：＿＿＿＿＿＿＿＿＿＿＿＿＿＿"}, {"k": "p", "t": "聯絡地址：＿＿＿＿＿＿＿＿＿＿＿＿＿＿"}, {"k": "s", "t": "乙方（承租人）"}, {"k": "p", "t": "姓名：＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿"}, {"k": "p", "t": "身分證／護照號碼：＿＿＿＿＿＿＿＿＿＿"}, {"k": "p", "t": "聯絡電話：＿＿＿＿＿＿＿＿＿＿＿＿＿＿"}, {"k": "p", "t": "聯絡地址：＿＿＿＿＿＿＿＿＿＿＿＿＿＿"}, {"k": "p", "t": "緊急聯絡人及電話：＿＿＿＿＿＿＿＿＿＿"}, {"k": "h2", "t": "第二條｜租賃設備及配件"}, {"k": "p", "t": "手機品牌及型號：vivo X300 Ultra"}, {"k": "p", "t": "手機容量／顏色：256GB／＿＿＿＿＿＿＿"}, {"k": "p", "t": "手機序號／IMEI：＿＿＿＿＿＿＿＿＿＿＿"}, {"k": "p", "t": "增距鏡型號：＿＿＿＿＿＿＿＿＿＿＿＿＿"}, {"k": "p", "t": "其他配件：＿＿＿＿＿＿＿＿＿＿＿＿＿＿"}, {"k": "p", "t": "取機時設備外觀及功能狀況：＿＿＿＿＿＿"}, {"k": "p", "t": "隨附配件及數量：＿＿＿＿＿＿＿＿＿＿＿"}, {"k": "p", "t": "甲乙雙方應於取機時共同確認設備及配件之外觀、功能及數量，並以照片或影片記錄，作為日後歸還檢查及責任認定之依據。"}, {"k": "h2", "t": "第三條｜租賃期間及租金"}, {"k": "p", "t": "一、租借起始時間：＿＿年＿＿月＿＿日＿＿時＿＿分。"}, {"k": "p", "t": "二、預定歸還時間：＿＿年＿＿月＿＿日＿＿時＿＿分。"}, {"k": "p", "t": "三、租賃期間以日為計算單位。凡跨越日曆日（即有隔夜情形）者，即計為2日；若租期超過2日，其後之計費方式以此類推。實際借還手機之時間點不影響天數之計算；另於同一日內借出並歸還者，以 1 日計算。"}, {"k": "p", "t": "四、本次租賃方案及費用如下："}, {"k": "p", "t": "租賃方案：＿＿＿＿＿＿＿＿＿＿＿＿＿＿"}, {"k": "p", "t": "租賃天數：＿＿＿＿日"}, {"k": "p", "t": "約定租金：新臺幣＿＿＿＿＿＿元"}, {"k": "p", "t": "押金：新臺幣＿＿＿＿＿＿元"}, {"k": "p", "t": "加購服務（行動電源、照片影片導出）：新臺幣＿＿＿＿＿＿元"}, {"k": "p", "t": "預約金（租金之 30%，取機時折抵租金）：新臺幣＿＿＿＿＿＿元"}, {"k": "p", "t": "應付總額：新臺幣＿＿＿＿＿＿元"}, {"k": "p", "t": "取機時應付（租金餘額＋押金＋加購服務）：新臺幣＿＿＿＿＿＿元"}, {"k": "p", "t": "五、預約金、租金餘額及押金之支付，依第三條之一約定辦理。"}, {"k": "box", "t": "方案一｜一般日租"}, {"k": "box", "t": "手機：NT$1,000。"}, {"k": "box", "t": "手機+200mm增距鏡：NT$1,300"}, {"k": "box", "t": "手機+400mm增距鏡：NT$1,500"}, {"k": "box", "t": "方案二｜長租優惠"}, {"k": "box", "t": "承租滿 3 日以上：日租費用乘以租借天數再乘0.9計算。"}, {"k": "box", "t": "承租滿 5 日以上：日租費用乘以租借天數再乘0.85計算。"}, {"k": "box", "t": "方案三｜介紹人專案（免押金）"}, {"k": "box", "t": "連續承租 5 日，手機+200mm增距鏡：NT$5,500。"}, {"k": "box", "t": "連續承租 5 日，手機+400mm增距鏡：NT$6,000。"}, {"k": "box", "t": "加購｜行動電源 NT$50／日、照片導出 NT$200／次"}, {"k": "h2", "t": "第三條之一｜預約金及取消規定"}, {"k": "p", "t": "一、乙方應於預約後 24 小時內匯付租金 30% 之預約金（取機時間較近者，依預約時所示期限），經甲方確認入帳後預約始成立；逾期未付，預約自動取消。"}, {"k": "p", "t": "二、預約金於取機時全額折抵租金，不得折抵押金。租金餘額及押金應於取機時付清。"}, {"k": "p", "t": "三、乙方取消時，依通知日距取機日之日數處理：取機日 7 日前通知者，全額退還預約金；取機日前 3 至 6 日通知者，退還 50%；未滿 3 日通知或未到場取機者，不予退還。"}, {"k": "p", "t": "四、乙方於取機日 3 日前提出且尚有檔期者，得改期一次，預約金保留。"}, {"k": "p", "t": "五、乙方參加之活動經主辦單位取消或延期者，乙方憑主辦單位公告得改期一次，預約金保留，不予退還。"}, {"k": "p", "t": "六、因可歸責於甲方之事由致無法出租者，甲方應加倍返還預約金。"}, {"k": "h2", "t": "第四條｜臨時加租費用"}, {"k": "p", "t": "一、乙方如於原定租賃期間內臨時提出加租需求，應事先通知甲方，並經甲方同意後，始得延長使用期間。"}, {"k": "p", "t": "二、臨時加租費用為每小時新臺幣 100 元。（適用於所有方案）"}, {"k": "p", "t": "三、乙方未經甲方同意，不得自行延長租賃期間。若有逾時歸還情形，依第五條約定辦理。"}, {"k": "h2", "t": "第五條｜逾時歸還規定"}, {"k": "p", "t": "一、乙方應依本合約約定之日期及時間歸還手機及全部配件。"}, {"k": "p", "t": "二、逾約定歸還時間未滿 30 分鐘者，不另收費。"}, {"k": "p", "t": "三、逾約定歸還時間達 30 分鐘以上、未超過 4 小時者，視同加租 4 小時，收取新臺幣 400 元。"}, {"k": "p", "t": "四、逾約定歸還時間超過 4 小時者，加收一日租金（依方案一單日價格計算）。"}, {"k": "p", "t": "五、前二款費用得自押金扣抵，餘額退還；無押金或押金不足者，乙方應另行支付。"}, {"k": "p", "t": "六、如遇突發事故或不可抗力等特殊情況，乙方應儘速通知甲方，雙方得協議處理。"}, {"k": "p", "t": "七、前述押金扣抵及違約金約定，仍應符合相關法律規定；如有爭議，依實際情況及法律規定處理。"}, {"k": "h2", "t": "第六條｜押金及退還方式"}, {"k": "p", "t": "一、國內租借押金為新臺幣 5,000 元。"}, {"k": "p", "t": "二、國外租借押金為新臺幣 10,000 元。"}, {"k": "p", "t": "三、本次租借押金："}, {"k": "p", "t": "□ 國內租借：新臺幣 5,000 元"}, {"k": "p", "t": "□ 國外租借：新臺幣10,000 元"}, {"k": "p", "t": "□ 介紹人專案：免押金"}, {"k": "p", "t": "四、乙方依約歸還手機及全部配件後，甲方應檢查設備之外觀、功能及配件數量。"}, {"k": "p", "t": "五、經確認設備及配件均無異常，且無其他依約應由乙方負擔之費用後，甲方應退還押金。"}, {"k": "p", "t": "六、如有逾時、損壞、遺失或其他應負擔之費用，甲方應向乙方說明扣款原因及金額，並依本合約及相關法律規定處理。"}, {"k": "p", "t": "七、如應賠償金額超過押金，乙方仍應就依法應負擔之差額負責。"}, {"k": "h2", "t": "第七條｜身分核對及未成年承租人"}, {"k": "p", "t": "一、乙方應於預約時線上提供身分證正反面及另一種有效證件之影像供甲方審核，並於取機時出示正本供甲方核對。"}, {"k": "p", "t": "二、甲方應妥善處理乙方之個人資料，僅於租賃管理、聯絡及依法處理爭議等必要範圍內使用。"}, {"k": "p", "t": "三、不租借給未滿 18 歲之乙方。"}, {"k": "p", "t": "四、乙方線上提供之證件影像，甲方僅用於身分核對、租賃管理及依法處理爭議，並於租賃結案且無爭議後 30 日內刪除。"}, {"k": "h2", "t": "第八條｜取機及歸還檢查"}, {"k": "p", "t": "一、交付手機時，甲乙雙方應共同檢查手機、增距鏡及全部配件，確認手機外觀及內部各項功能完整無損、運作正常，並確認配件完整、數量無誤，拍攝照片或影片留存。"}, {"k": "p", "t": "二、甲乙雙方完成前項檢查並共同確認無誤後，辦理手機及配件之交付。"}, {"k": "p", "t": "三、歸還時，甲乙雙方應再次確認設備及配件狀況，並拍攝照片或影片留存。"}, {"k": "p", "t": "四、如發現損壞、異常或配件短少，雙方應共同確認並記錄，必要時提供維修檢測資料，以釐清責任。"}, {"k": "p", "t": "五、設備檢查完成且無應扣款項目後，甲方應依約退還押金。"}, {"k": "h2", "t": "第九條｜設備損壞及賠償責任"}, {"k": "p", "t": "一、租賃期間，乙方應妥善保管手機、增距鏡及全部配件，不得擅自轉租、轉借、拆解或以不當方式使用。"}, {"k": "p", "t": "二、因乙方故意或過失造成設備或配件損壞、遺失或無法正常使用者，乙方應依實際責任負擔合理之維修費用或損害賠償。"}, {"k": "p", "t": "三、手機及增距鏡如有損壞，依雙方約定及實際責任處理。甲方應提供合理之維修估價、維修單據或其他可供確認之資料。"}, {"k": "p", "t": "四、設備損壞可歸責於乙方且可修復者，乙方負擔維修費 80%，甲方負擔 20%，約定如下："}, {"k": "p", "t": "計算基準：以原廠或授權維修中心出具之估價單或收據所載金額為準，含零件及工資。"}, {"k": "p", "t": "適用情形：摔落、撞擊、進水、螢幕或鏡頭破損等可修復之損壞。"}, {"k": "p", "t": "全損賠償：設備遺失、遭竊未能尋回、無法修復或因故意損壞者，不適用前述 80%，乙方應按市價全額賠償。市價以維修或事故確認當日兩家通訊行同型號、同容量之公開報價平均計算，甲方應提供報價資料供乙方確認。"}, {"k": "p", "t": "押金暫留：維修費待確認期間，甲方得暫留押金，並於取得估價單或維修單據後 3 日內結算退還。"}, {"k": "p", "t": "五、設備損壞如非可歸責於乙方之事由，或屬原有瑕疵、正常合理使用所生之情形，應依實際證據及相關法律規定釐清責任。"}, {"k": "p", "t": "六、設備如遭竊、遺失或發生重大故障，乙方應立即通知甲方，並於必要時配合報警或相關調查。"}, {"k": "h2", "t": "第十條｜資料轉移及個人資料"}, {"k": "p", "t": "一、乙方應自行安排手機資料轉移、備份及相關設定所需時間，不得要求甲方無償延長租賃期間。"}, {"k": "p", "t": "二、如因資料轉移需要延長使用時間，乙方應事先取得甲方同意，並依雙方約定辦理。"}, {"k": "p", "t": "三、乙方歸還前應自行備份個人資料、登出個人帳號，並依甲方指示完成必要之資料清除或恢復原廠設定程序。"}, {"k": "p", "t": "四、甲方不得任意存取、利用或揭露乙方之個人資料。"}, {"k": "p", "t": "五、雙方提供之個人資料，應依個人資料保護相關法令處理。"}, {"k": "h2", "t": "第十一條｜合約效力及其他約定"}, {"k": "p", "t": "一、本合約未盡事宜，得由甲乙雙方另以書面補充約定。"}, {"k": "p", "t": "二、雙方因本合約發生爭議時，應先本於誠信原則協商；協商不成時，依中華民國相關法律處理。"}, {"k": "p", "t": "三、本合約經甲乙雙方確認內容並簽名後生效；乙方得於線上以電子方式簽名，與書面簽名具同等效力。"}, {"k": "p", "t": "四、本合約以紙本簽署者一式兩份，由甲乙雙方各執一份；以電子方式簽署者，由甲方留存電子檔，乙方得於簽署完成時自行列印或存檔。"}, {"k": "h2", "t": "簽署欄"}, {"k": "p", "t": "甲方（出租人）簽名：＿＿＿＿＿＿＿＿＿"}, {"k": "p", "t": "乙方（承租人）簽名：＿＿＿＿＿＿＿＿＿"}, {"k": "p", "t": "簽約日期：＿＿年＿＿月＿＿日"}, {"k": "p", "t": "取機確認時間：＿＿年＿＿月＿＿日＿＿時＿＿分"}, {"k": "p", "t": "歸還確認時間：＿＿年＿＿月＿＿日＿＿時＿＿分"}, {"k": "p", "t": "押金退還金額：新臺幣＿＿＿＿＿＿元"}, {"k": "p", "t": "其他備註：＿＿＿＿＿＿＿＿＿＿＿＿＿＿"}];
function fillBlanks_(line, vals) {
  var i = 0;
  return line.replace(/＿+/g, function (m) { var v = vals[i++]; return v === undefined || v === '' ? m : v; });
}
function numStr_(n) { return Number(n || 0).toLocaleString('en-US'); }
function dtParts_(s) { return [s.slice(0, 4), s.slice(5, 7), s.slice(8, 10), s.slice(11, 13), s.slice(14, 16)]; }
/* o 為訂單（不給則為空白範本），shop = {phone, address} */
function contractLines(o, shop) {
  if (!o) return CONTRACT.map(function (c) { return { k: c.k, t: c.t }; });
  shop = shop || {};
  var phone = 0, addr = 0, ref = o.plan === 'referral', eq = RULES.equipment[o.equip] || {};
  var region = o.region === '國外' || o.region === 'foreign' ? '國外' : '國內';
  return CONTRACT.map(function (c) {
    var t = c.t;
    function has(p) { return t.indexOf(p) === 0; }
    if (has('合約編號')) t = fillBlanks_(t, [o.id]);
    else if (has('聯絡電話')) t = fillBlanks_(t, [phone++ === 0 ? shop.phone : o.phone]);
    else if (has('聯絡地址')) { if (addr++ === 0) t = fillBlanks_(t, [shop.address]); }
    else if (has('姓名：')) t = fillBlanks_(t, [o.name]);
    else if (has('手機序號')) t = fillBlanks_(t, [o.unit]);
    else if (has('增距鏡型號')) t = fillBlanks_(t, [eq.lens ? eq.lens + 'mm' : '無']);
    else if (has('其他配件')) t = fillBlanks_(t, [Number(o.power) ? '行動電源 1 個' : '無']);
    else if (has('一、租借起始時間')) t = fillBlanks_(t, dtParts_(o.start));
    else if (has('二、預定歸還時間')) t = fillBlanks_(t, dtParts_(o.end));
    else if (has('租賃方案')) t = fillBlanks_(t, [o.planLabel + '，' + o.equipLabel + (Number(o.transferQty) ? '，照片影片導出 ' + o.transferQty + ' 次' : '')]);
    else if (has('租賃天數')) t = fillBlanks_(t, [String(o.days)]);
    else if (has('約定租金')) t = fillBlanks_(t, [numStr_(o.rent)]);
    else if (has('押金：新臺幣')) t = fillBlanks_(t, [numStr_(o.deposit)]);
    else if (has('加購服務')) t = fillBlanks_(t, [numStr_(o.addonFee)]);
    else if (has('預約金（')) t = fillBlanks_(t, [numStr_(o.prepay)]);
    else if (has('應付總額')) t = fillBlanks_(t, [numStr_(Number(o.rent) + Number(o.deposit) + Number(o.addonFee || 0))]);
    else if (has('取機時應付')) t = fillBlanks_(t, [numStr_(o.dueAtPickup)]);
    else if (has('□ 國內租借') && !ref && region === '國內') t = t.replace('□', '☑');
    else if (has('□ 國外租借') && !ref && region === '國外') t = t.replace('□', '☑');
    else if (has('□ 介紹人專案') && ref) t = t.replace('□', '☑');
    else if (has('簽約日期') && o.signedAt) t = fillBlanks_(t, dtParts_(o.signedAt));
    return { k: has('乙方（承租人）簽名') ? 'sig' : c.k, t: t };
  });
}
