/* =====================================================
   API TRANG ADMIN – chạy trên Vercel (Serverless Function)
   Lưu "Tiện ích hay dùng", số tài khoản, lịch hẹn và tệp tải lên vào kho GitHub.

   Cần khai báo các biến môi trường trong Vercel:
     ADMIN_PASSWORD  (không bắt buộc) mật khẩu ban đầu; nếu bỏ trống
                     dùng mật khẩu mặc định bên dưới. Sau khi đổi mật
                     khẩu trong trang admin, mật khẩu mới được lưu (đã mã
                     hóa scrypt) ở private/admin.json và được ưu tiên dùng.
     GITHUB_TOKEN    token GitHub (quyền Contents: Read and write)
     GITHUB_REPO     ví dụ: tenban/phanthietpho
     GITHUB_BRANCH   thường là: main
     RELEASES_REPO   (không bắt buộc) kho CÔNG KHAI chứa tệp tải về
                     (GitHub Releases). Mặc định: chính GITHUB_REPO.
     ADMIN_SECRET    (không bắt buộc) chuỗi bí mật để mã hóa mật khẩu;
                     mặc định dùng GITHUB_TOKEN.
     VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY   khóa gửi thông báo đẩy (bản 11).
                     Đặt 1 lần rồi ĐỪNG ĐỔI: lịch hẹn được mã hóa bằng khóa này.
     CRON_SECRET     chuỗi bí mật để Vercel gọi nhắc lịch mỗi sáng (bản 11).

   Phiên đăng nhập: đăng nhập bằng mật khẩu → nhận "vé phiên" 20 phút.
   Mỗi lần thao tác, vé được gia hạn thêm 20 phút; để yên 20 phút là hết phiên.
   ===================================================== */
const crypto = require('crypto');

const DATA_PATH = 'data/tienich.json';
const BANK_PATH = 'data/bank.json';   // danh sách tài khoản ngân hàng (hiện ở nút "Số TK")
const SCHED_PATH = 'private/lichhen.json';   // lịch hẹn (mã hóa, không đăng lên web)
const PUSH_PATH = 'private/thongbao.json';   // thiết bị nhận thông báo (mã hóa)
const MAX_BANKS = 10;
const MAX_ITEMS = 60;
const MAX_SCHED = 400;
const MAX_DEVICES = 20;
const SESSION_MS = 20 * 60 * 1000;           // phiên làm việc 20 phút
const MAX_FILE_BYTES = 2 * 1024 * 1024;   // ảnh icon tối đa 2 MB (thực tế ~30 KB)
const MAX_PART_BYTES = 3 * 1024 * 1024;   // mỗi phần gửi lên tối đa 3 MB
const MAX_PARTS = 6;
const REL_TAG = 'tai-ve';                     // bản phát hành chứa tệp tải về
const REL_MAX_BYTES = 50 * 1024 * 1024;       // tệp tải về tối đa 50 MB
const REL_MAX_PARTS = 20;
const ICON_EXT = ['png', 'jpg', 'jpeg', 'webp', 'gif'];
const BLOCKED_EXT = ['html', 'htm', 'js', 'mjs', 'svg', 'xml', 'php', 'exe', 'bat', 'cmd', 'sh'];

const env = (k, def) => (process.env[k] || def || '').trim();
const branch = () => env('GITHUB_BRANCH', 'main');

/* ---------- mật khẩu ---------- */
const DEFAULT_PASSWORD = '29081989@';
const PASS_PATH = 'private/admin.json'; // không đăng lên web (xem .vercelignore, vercel.json)
let passCache = null;
let passCacheAt = 0;

function scryptHex(pw, saltHex) {
  return crypto.scryptSync(pw, Buffer.from(saltHex, 'hex'), 32).toString('hex');
}

/* Kho đang để công khai nên mã băm mật khẩu được trộn thêm khóa bí mật
   (chỉ nằm trên Vercel) – người xem kho không thể dò ngược mật khẩu. */
function pepperedHex(pw, saltHex) {
  const s = crypto.scryptSync(pw, Buffer.from(saltHex, 'hex'), 32);
  return crypto.createHmac('sha256', env('ADMIN_SECRET') || env('GITHUB_TOKEN')).update(s).digest('hex');
}

async function loadPassRecord() {
  if (passCache !== null && Date.now() - passCacheAt < 30000) return passCache;
  const f = await getContent(PASS_PATH); // lỗi mạng → báo lỗi, không tự rơi về mật khẩu mặc định
  let rec = false;
  if (f && f.content) {
    try { rec = JSON.parse(Buffer.from(f.content, 'base64').toString('utf8')); } catch (e) { rec = false; }
  }
  passCache = rec && rec.salt && rec.hash ? rec : false;
  passCacheAt = Date.now();
  return passCache;
}

async function passwordOk(p) {
  if (typeof p !== 'string' || !p || p.length > 200) return false;
  const rec = await loadPassRecord();
  let got;
  let want;
  if (rec) {
    got = Buffer.from(rec.algo === 'scrypt+hmac' ? pepperedHex(p, rec.salt) : scryptHex(p, rec.salt), 'hex');
    want = Buffer.from(rec.hash, 'hex');
  } else {
    got = crypto.createHash('sha256').update(p).digest();
    want = crypto.createHash('sha256').update(env('ADMIN_PASSWORD') || DEFAULT_PASSWORD).digest();
  }
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

/* ---------- phiên đăng nhập 20 phút ----------
   Vé phiên được ký bằng khóa bí mật + mật khẩu hiện tại, nên khi đổi mật khẩu
   mọi phiên cũ (trên máy khác) tự hết hiệu lực. */
function sessionKey() {
  const rec = passCache || false;
  const seed = rec ? 'mk:' + rec.hash : 'macdinh:' + (env('ADMIN_PASSWORD') || DEFAULT_PASSWORD);
  return crypto.createHmac('sha256', env('ADMIN_SECRET') || env('GITHUB_TOKEN')).update('phien-20-phut|' + seed).digest();
}

function issueToken() {
  const exp = Date.now() + SESSION_MS;
  const payload = Buffer.from(JSON.stringify({ exp, n: crypto.randomBytes(6).toString('hex') })).toString('base64url');
  const sig = crypto.createHmac('sha256', sessionKey()).update(payload).digest('base64url');
  return { token: payload + '.' + sig, exp };
}

async function tokenOk(t) {
  if (typeof t !== 'string' || t.length > 400 || t.indexOf('.') < 1) return false;
  await loadPassRecord();
  const [payload, sig] = t.split('.');
  const want = crypto.createHmac('sha256', sessionKey()).update(payload).digest();
  let got;
  try { got = Buffer.from(sig, 'base64url'); } catch (e) { return false; }
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return false;
  try {
    const p = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof p.exp === 'number' && p.exp > Date.now();
  } catch (e) { return false; }
}

/* ---------- gọi GitHub ---------- */
async function gh(path, options = {}, repo = env('GITHUB_REPO')) {
  const res = await fetch(`https://api.github.com/repos/${repo}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${env('GITHUB_TOKEN')}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'phanthietpho-admin',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  return res;
}

async function ghJson(path, options, what, repo) {
  const r = await gh(path, options || {}, repo);
  if (!r.ok) {
    let msg = '';
    try { msg = (await r.json()).message || ''; } catch (e) { /* bỏ qua */ }
    const err = new Error(`GitHub báo lỗi ${r.status}${what ? ' khi ' + what : ''}${msg ? ': ' + msg : ''}`);
    err.status = r.status;
    throw err;
  }
  return r.status === 204 ? {} : r.json();
}

const enc = (p) => p.split('/').map(encodeURIComponent).join('/');

async function getContent(path) {
  const r = await gh(`/contents/${enc(path)}?ref=${encodeURIComponent(branch())}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GitHub báo lỗi ${r.status} khi đọc ${path}`);
  return r.json();
}

async function putContent(path, base64, message) {
  const cur = await getContent(path);
  await ghJson(`/contents/${enc(path)}`, {
    method: 'PUT',
    body: JSON.stringify({ message, content: base64, branch: branch(), ...(cur && cur.sha ? { sha: cur.sha } : {}) }),
  }, 'lưu ' + path);
}

/* Ghi nhiều thay đổi trong 1 lần commit. changes: [{path, sha}] – sha=null để xóa */
async function commitTree(changes, message) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const ref = await ghJson(`/git/ref/heads/${encodeURIComponent(branch())}`, {}, 'đọc nhánh');
    const head = await ghJson(`/git/commits/${ref.object.sha}`, {}, 'đọc commit');
    const tree = await ghJson('/git/trees', {
      method: 'POST',
      body: JSON.stringify({
        base_tree: head.tree.sha,
        tree: changes.map((c) => ({ path: c.path, mode: '100644', type: 'blob', sha: c.sha })),
      }),
    }, 'tạo cây thư mục');
    const commit = await ghJson('/git/commits', {
      method: 'POST',
      body: JSON.stringify({ message, tree: tree.sha, parents: [ref.object.sha] }),
    }, 'tạo commit');
    const r = await gh(`/git/refs/heads/${encodeURIComponent(branch())}`, {
      method: 'PATCH',
      body: JSON.stringify({ sha: commit.sha, force: false }),
    });
    if (r.ok) return commit.sha;
    if (r.status !== 422 && r.status !== 409) throw new Error(`GitHub báo lỗi ${r.status} khi cập nhật nhánh`);
    // có thay đổi khác chen vào giữa chừng → thử lại
  }
  throw new Error('Kho đang bận, hãy thử lại sau vài giây');
}

async function listTree() {
  const t = await ghJson(`/git/trees/${encodeURIComponent(branch())}?recursive=1`, {}, 'đọc danh sách tệp');
  return t.tree || [];
}

/* ---------- dữ liệu riêng (lịch hẹn, thiết bị) – mã hóa vì kho đang công khai ---------- */
function dataKey(kind) {
  const base = kind === 'v' ? env('VAPID_PRIVATE_KEY') : env('GITHUB_TOKEN');
  return Buffer.from(crypto.hkdfSync('sha256', Buffer.from(base), Buffer.from('phanthietpho'), Buffer.from('du-lieu-rieng-v1'), 32));
}

function seal(obj) {
  const k = env('VAPID_PRIVATE_KEY') ? 'v' : 'g';
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', dataKey(k), iv);
  const data = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return { v: 1, k, iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), data: data.toString('base64') };
}

function unseal(rec) {
  const d = crypto.createDecipheriv('aes-256-gcm', dataKey(rec.k), Buffer.from(rec.iv, 'base64'));
  d.setAuthTag(Buffer.from(rec.tag, 'base64'));
  return JSON.parse(Buffer.concat([d.update(Buffer.from(rec.data, 'base64')), d.final()]).toString('utf8'));
}

async function readPrivate(path, fallback) {
  const f = await getContent(path);
  if (!f || !f.content) return fallback;
  let rec;
  try { rec = JSON.parse(Buffer.from(f.content, 'base64').toString('utf8')); } catch (e) { return fallback; }
  if (!rec || !rec.data) return rec || fallback;
  try { return unseal(rec); } catch (e) {
    throw new Error('Không mở được ' + path + ' – có thể khóa VAPID_PRIVATE_KEY hoặc GITHUB_TOKEN trên Vercel đã bị đổi');
  }
}

async function writePrivate(path, obj, message) {
  await putContent(path, Buffer.from(JSON.stringify(seal(obj)) + '\n', 'utf8').toString('base64'), '[skip deploy] ' + message);
}

/* ---------- lịch hẹn ---------- */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function validDate(s) {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
}
function vnDate(offsetDays) { // ngày theo giờ Việt Nam (UTC+7)
  return new Date(Date.now() + 7 * 3600e3 + (offsetDays || 0) * 864e5).toISOString().slice(0, 10);
}
function cleanSchedules(list) {
  if (!Array.isArray(list)) throw new Error('Dữ liệu lịch hẹn không hợp lệ');
  return list.slice(0, MAX_SCHED).map((x) => {
    const mode = x.mode === 'range' ? 'range' : 'day';
    let from = validDate(x.from) ? x.from : '';
    let to = mode === 'range' && validDate(x.to) ? x.to : from;
    if (to < from) { const t = to; to = from; from = t; }
    return {
      id: cleanText(x.id, 40) || crypto.randomBytes(6).toString('hex'),
      title: cleanText(x.title, 100),
      mode,
      from,
      to,
      time: typeof x.time === 'string' && /^\d{2}:\d{2}$/.test(x.time) ? x.time : '',
      note: cleanText(x.note, 1500),
      done: x.done === true,
      created: cleanText(x.created, 30) || new Date().toISOString(),
    };
  }).filter((x) => x.title && x.from);
}
async function loadSchedules() {
  const v = await readPrivate(SCHED_PATH, { items: [] });
  return Array.isArray(v.items) ? v.items : [];
}
function activeOn(items, day) { // lịch cần xử lý trong ngày (chưa xong, ngày nằm trong khoảng)
  return items.filter((x) => !x.done && x.from <= day && day <= x.to)
    .sort((a, b) => (a.time || '99').localeCompare(b.time || '99') || a.from.localeCompare(b.from));
}
function listTitles(items, max) {
  const t = items.slice(0, max).map((x) => '• ' + (x.time ? x.time + ' ' : '') + x.title);
  if (items.length > max) t.push('… và ' + (items.length - max) + ' lịch khác');
  return t.join('\n');
}

/* ---------- thông báo đẩy (Web Push, không cần thư viện ngoài) ---------- */
function vapid() {
  const pub = env('VAPID_PUBLIC_KEY');
  const priv = env('VAPID_PRIVATE_KEY');
  if (!pub || !priv) return null;
  const P = Buffer.from(pub, 'base64url');
  if (P.length !== 65 || P[0] !== 4) return null;
  try {
    const key = crypto.createPrivateKey({
      format: 'jwk',
      key: { kty: 'EC', crv: 'P-256', d: priv, x: P.subarray(1, 33).toString('base64url'), y: P.subarray(33, 65).toString('base64url') },
    });
    return { pub, key };
  } catch (e) { return null; }
}

function vapidHeader(endpoint, v, subject) {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = b({ typ: 'JWT', alg: 'ES256' }) + '.' + b({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 3600,
    sub: subject,
  });
  const sig = crypto.sign('sha256', Buffer.from(unsigned), { key: v.key, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${unsigned}.${sig.toString('base64url')}, k=${v.pub}`;
}

/* Mã hóa nội dung theo chuẩn RFC 8291 (aes128gcm) */
function encryptPush(sub, text) {
  const ua = Buffer.from(sub.keys.p256dh, 'base64');
  const auth = Buffer.from(sub.keys.auth, 'base64');
  const ecdh = crypto.createECDH('prime256v1');
  const asPub = ecdh.generateKeys();
  const secret = ecdh.computeSecret(ua);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', secret, auth, Buffer.concat([Buffer.from('WebPush: info\0'), ua, asPub]), 32));
  const salt = crypto.randomBytes(16);
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const c = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const ct = Buffer.concat([c.update(Buffer.concat([Buffer.from(text, 'utf8'), Buffer.from([2])])), c.final(), c.getAuthTag()]);
  const head = Buffer.alloc(21);
  salt.copy(head, 0);
  head.writeUInt32BE(4096, 16);
  head[20] = 65;
  return Buffer.concat([head, asPub, ct]);
}

async function sendOne(sub, data, subject, v) {
  try {
    const r = await fetch(sub.endpoint, {
      method: 'POST',
      headers: {
        Authorization: vapidHeader(sub.endpoint, v, subject),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: '86400',
        Urgency: 'high',
      },
      body: encryptPush(sub, JSON.stringify(data)),
    });
    return r.status;
  } catch (e) { return 0; }
}

/* Gửi tới các thiết bị; thiết bị đã gỡ app / tắt thông báo (404, 410) tự bị xóa khỏi danh sách */
async function notify(store, data, subject, onlyEndpoint) {
  const v = vapid();
  if (!v) return { sent: 0, failed: 0, removed: 0, error: 'Chưa khai báo VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY trên Vercel' };
  const targets = store.subs.filter((s) => !onlyEndpoint || s.endpoint === onlyEndpoint);
  const codes = await Promise.all(targets.map((s) => sendOne(s, data, subject, v)));
  const gone = new Set(targets.filter((s, i) => codes[i] === 404 || codes[i] === 410).map((s) => s.endpoint));
  const sent = codes.filter((c) => c >= 200 && c < 300).length;
  if (gone.size) store.subs = store.subs.filter((s) => !gone.has(s.endpoint));
  return { sent, failed: targets.length - sent - gone.size, removed: gone.size, codes };
}

async function loadPushStore() {
  const v = await readPrivate(PUSH_PATH, {});
  return { subs: Array.isArray(v.subs) ? v.subs : [], lastSent: v.lastSent || '', lastDay: v.lastDay || '', lastBadge: v.lastBadge || 0 };
}

function subjectFrom(req) {
  if (env('VAPID_SUBJECT')) return env('VAPID_SUBJECT');
  const host = (req && req.headers && (req.headers['x-forwarded-host'] || req.headers.host)) || '';
  return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host) ? 'https://' + host : 'mailto:admin@phanthietpho.vn';
}

function badgePayload(active, title, body) {
  return { title, body, badge: active.length, url: '/admin/#lich', tag: 'lich-hen' };
}

/* ---------- GitHub Releases: kho tệp tải về ---------- */
const relRepo = () => env('RELEASES_REPO') || env('GITHUB_REPO');

async function getRelease(create) {
  const r = await gh(`/releases/tags/${REL_TAG}`, {}, relRepo());
  if (r.ok) return r.json();
  if (r.status !== 404) throw new Error(`GitHub báo lỗi ${r.status} khi đọc Releases của ${relRepo()}`);
  if (!create) return null;
  return ghJson('/releases', {
    method: 'POST',
    body: JSON.stringify({
      tag_name: REL_TAG,
      ...(relRepo() === env('GITHUB_REPO') ? { target_commitish: branch() } : {}),
      name: 'Kho tệp tải về',
      body: 'Tệp tải về của trang Phan Thiết Phố – quản lý trong trang /admin.',
      draft: false,
      prerelease: false,
    }),
  }, 'tạo bản phát hành "' + REL_TAG + '"', relRepo());
}

function assetInfo(a) {
  return {
    id: a.id,
    name: a.name,
    label: a.label || a.name,
    size: a.size || 0,
    downloads: a.download_count || 0,
    url: a.browser_download_url,
    created: a.created_at,
  };
}

function safeAssetName(original) {
  const dot = original.lastIndexOf('.');
  const ext = (dot > 0 ? original.slice(dot + 1) : '').replace(/[^A-Za-z0-9]/g, '').slice(0, 10);
  const base = (dot > 0 ? original.slice(0, dot) : original)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 80) || 'tep';
  return { base, ext, name: base + (ext ? '.' + ext : '') };
}

async function readBlobs(shas) {
  const out = new Array(shas.length);
  let next = 0;
  async function worker() {
    while (next < shas.length) {
      const i = next++;
      const b = await ghJson(`/git/blobs/${shas[i]}`, {}, 'đọc phần tệp');
      out[i] = Buffer.from(b.content || '', 'base64');
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  return Buffer.concat(out);
}

/* ---------- tiện ích ---------- */
function slugify(name) {
  return String(name)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'tep';
}

function safeUploadPath(p) {
  return typeof p === 'string' && /^uploads\/(icons|files|qr)\/[\w.\-]+$/.test(p) && !p.includes('..');
}

function cleanText(v, max) {
  return typeof v === 'string' ? v.replace(/\r\n/g, '\n').trim().slice(0, max) : '';
}

function cleanItems(items) {
  if (!Array.isArray(items)) throw new Error('Dữ liệu không hợp lệ');
  return items.slice(0, MAX_ITEMS).map((it) => {
    const url = cleanText(it.url, 1000);
    return {
      id: cleanText(it.id, 40) || crypto.randomBytes(6).toString('hex'),
      name: cleanText(it.name, 60),
      icon: safeUploadPath(it.icon) ? it.icon : '',
      url: /^https?:\/\/\S+$/i.test(url) ? url : '',
      file: safeUploadPath(it.file) ? it.file : '',
      fileName: cleanText(it.fileName, 120),
      fileSize: Number.isFinite(it.fileSize) ? Math.max(0, Math.round(it.fileSize)) : 0,
      download: it.download === true && /^https?:\/\/\S+$/i.test(url),
      note: cleanText(it.note, 3000),
    };
  }).filter((it) => it.name);
}

function cleanBanks(list) {
  if (!Array.isArray(list)) throw new Error('Dữ liệu ngân hàng không hợp lệ');
  return list.slice(0, MAX_BANKS).map((b) => ({
    id: cleanText(b.id, 40) || crypto.randomBytes(6).toString('hex'),
    bank: cleanText(b.bank, 80),
    owner: cleanText(b.owner, 80),
    number: cleanText(b.number, 40).replace(/[^0-9A-Za-z .-]/g, ''),
    qr: safeUploadPath(b.qr) && b.qr.startsWith('uploads/qr/') ? b.qr : '',
  })).filter((b) => b.bank && b.number);
}

async function readJson(path) {
  const f = await getContent(path);
  if (!f || !f.content) return [];
  try {
    const v = JSON.parse(Buffer.from(f.content, 'base64').toString('utf8'));
    return Array.isArray(v) ? v : [];
  } catch (e) { return []; }
}

async function removePaths(paths) {
  const wanted = [...new Set(paths)].filter(safeUploadPath);
  if (!wanted.length) return 0;
  const existing = new Set((await listTree()).filter((e) => e.type === 'blob').map((e) => e.path));
  const del = wanted.filter((p) => existing.has(p));
  if (!del.length) return 0;
  await commitTree(del.map((p) => ({ path: p, sha: null })), `[skip deploy] Xóa ${del.length} tệp`);
  return del.length;
}

function cleanSub(s) {
  if (!s || typeof s !== 'object' || !s.keys) return null;
  const endpoint = cleanText(s.endpoint, 1000);
  let u;
  try { u = new URL(endpoint); } catch (e) { return null; }
  if (u.protocol !== 'https:') return null;
  const p256dh = cleanText(s.keys.p256dh, 200);
  const auth = cleanText(s.keys.auth, 100);
  if (!/^[A-Za-z0-9_\-+/=]+$/.test(p256dh) || !/^[A-Za-z0-9_\-+/=]+$/.test(auth)) return null;
  if (Buffer.from(p256dh, 'base64').length !== 65 || Buffer.from(auth, 'base64').length !== 16) return null;
  return { endpoint, keys: { p256dh, auth } };
}

/* ---------- xử lý yêu cầu ---------- */
async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Chỉ nhận POST' });

  const missing = ['GITHUB_TOKEN', 'GITHUB_REPO'].filter((k) => !env(k));
  if (missing.length) {
    return res.status(500).json({ ok: false, error: 'Chưa khai báo biến môi trường trên Vercel: ' + missing.join(', ') });
  }

  let body = req.body || {};
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }

  const isLogin = body.action === 'login';
  let authed = false;
  try { authed = isLogin ? await passwordOk(body.password) : await tokenOk(body.token); } catch (e) {
    return res.status(502).json({ ok: false, error: 'Không đọc được mật khẩu từ GitHub: ' + e.message });
  }
  if (!authed) {
    if (isLogin) {
      await new Promise((r) => setTimeout(r, 800)); // làm chậm việc dò mật khẩu
      return res.status(401).json({ ok: false, error: 'Sai mật khẩu' });
    }
    return res.status(401).json({ ok: false, expired: true, error: 'Phiên làm việc đã hết (20 phút). Vui lòng đăng nhập lại.' });
  }

  // Mỗi phản hồi thành công kèm vé phiên mới (gia hạn thêm 20 phút)
  const sendJson = res.json.bind(res);
  res.json = (obj) => sendJson(obj && obj.ok ? { ...obj, ...issueToken() } : obj);

  try {
    switch (body.action) {
      case 'login': {
        return res.json({ ok: true, repo: env('GITHUB_REPO'), releasesRepo: relRepo(), releaseTag: REL_TAG });
      }

      case 'ping': // gia hạn phiên
        return res.json({ ok: true, repo: env('GITHUB_REPO'), releasesRepo: relRepo(), releaseTag: REL_TAG });

      case 'list': {
        const f = await getContent(DATA_PATH);
        let items = [];
        if (f && f.content) {
          try { items = JSON.parse(Buffer.from(f.content, 'base64').toString('utf8')); } catch (e) { items = []; }
        }
        return res.json({ ok: true, items: Array.isArray(items) ? items : [] });
      }

      /* Số tài khoản ngân hàng */
      case 'bankList':
        return res.json({ ok: true, banks: await readJson(BANK_PATH) });

      case 'bankSave': {
        const banks = cleanBanks(body.banks);
        await putContent(BANK_PATH, Buffer.from(JSON.stringify(banks, null, 2) + '\n', 'utf8').toString('base64'), 'Cập nhật Số tài khoản ngân hàng');
        return res.json({ ok: true, banks });
      }

      /* Tiện ích hay dùng */
      case 'save': {
        const items = cleanItems(body.items);
        const json = JSON.stringify(items, null, 2) + '\n';
        await putContent(DATA_PATH, Buffer.from(json, 'utf8').toString('base64'), 'Cập nhật Tiện ích hay dùng');
        return res.json({ ok: true, items });
      }

      /* Lịch hẹn */
      case 'schedList':
        return res.json({ ok: true, items: await loadSchedules(), today: vnDate(0) });

      case 'schedSave': {
        const items = cleanSchedules(body.items);
        const today = vnDate(0);
        const before = await loadSchedules();
        await writePrivate(SCHED_PATH, { items }, 'Cập nhật lịch hẹn');
        // Có lịch MỚI cần xử lý hôm nay → báo ngay lên điện thoại (kèm số trên icon)
        const oldIds = new Set(activeOn(before, today).map((x) => x.id));
        const active = activeOn(items, today);
        const fresh = active.filter((x) => !oldIds.has(x.id));
        let push = null;
        if (fresh.length) {
          const store = await loadPushStore();
          if (store.subs.length && vapid()) {
            push = await notify(store, badgePayload(active,
              fresh.length === 1 ? '📅 Lịch hẹn mới hôm nay' : `📅 ${fresh.length} lịch hẹn mới hôm nay`,
              listTitles(fresh, 4) + `\nHôm nay cần xử lý: ${active.length} việc`), subjectFrom(req));
            store.lastBadge = active.length;
            store.lastSent = new Date().toISOString();
            await writePrivate(PUSH_PATH, store, 'Gửi thông báo lịch hẹn');
          }
        }
        return res.json({ ok: true, items, today, push });
      }

      /* Thông báo trên điện thoại */
      case 'pushInfo': {
        const store = await loadPushStore();
        return res.json({
          ok: true,
          publicKey: vapid() ? env('VAPID_PUBLIC_KEY') : '',
          cronReady: !!env('CRON_SECRET'),
          devices: store.subs.map((s) => ({ id: s.id, label: s.label, created: s.created, endpoint: s.endpoint })),
          lastSent: store.lastSent,
        });
      }

      case 'pushSubscribe': {
        if (!vapid()) throw new Error('Chưa khai báo khóa thông báo (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY) trên Vercel');
        const sub = cleanSub(body.sub);
        if (!sub) throw new Error('Thông tin thiết bị không hợp lệ');
        const store = await loadPushStore();
        const old = store.subs.find((s) => s.endpoint === sub.endpoint);
        const rec = { id: old ? old.id : crypto.randomBytes(5).toString('hex'), ...sub, label: cleanText(body.label, 60) || 'Thiết bị', created: old ? old.created : new Date().toISOString() };
        store.subs = [rec].concat(store.subs.filter((s) => s.endpoint !== sub.endpoint)).slice(0, MAX_DEVICES);
        await writePrivate(PUSH_PATH, store, 'Bật thông báo trên ' + rec.label);
        return res.json({ ok: true, id: rec.id });
      }

      case 'pushUnsubscribe': {
        const store = await loadPushStore();
        const n = store.subs.length;
        store.subs = store.subs.filter((s) => s.endpoint !== body.endpoint && s.id !== body.id);
        if (store.subs.length !== n) await writePrivate(PUSH_PATH, store, 'Tắt thông báo trên 1 thiết bị');
        return res.json({ ok: true, removed: n - store.subs.length });
      }

      case 'pushTest': {
        const store = await loadPushStore();
        if (!store.subs.length) throw new Error('Chưa có thiết bị nào bật thông báo');
        const only = typeof body.endpoint === 'string' && store.subs.some((s) => s.endpoint === body.endpoint) ? body.endpoint : '';
        const active = activeOn(await loadSchedules(), vnDate(0));
        const r = await notify(store, badgePayload(active, '🔔 Thử thông báo – Phan Thiết Phố',
          active.length ? `Hôm nay có ${active.length} lịch hẹn cần xử lý.\n` + listTitles(active, 3) : 'Thông báo đang hoạt động. Hôm nay chưa có lịch hẹn nào.'), subjectFrom(req), only);
        if (r.error) throw new Error(r.error);
        if (r.removed) await writePrivate(PUSH_PATH, store, 'Xóa thiết bị đã tắt thông báo');
        if (!r.sent) throw new Error('Không gửi được (mã lỗi ' + (r.codes || []).join(', ') + '). Hãy bấm "Bật thông báo trên máy này" lại.');
        return res.json({ ok: true, sent: r.sent, removed: r.removed });
      }

      /* Bước 1 tải tệp: gửi từng phần (≤ 3 MB), GitHub giữ tạm, trả về mã phần */
      case 'part': {
        const data = typeof body.data === 'string' ? body.data.replace(/^data:[^,]*,/, '') : '';
        if (!data || !/^[A-Za-z0-9+/=]+$/.test(data)) throw new Error('Dữ liệu tệp không hợp lệ');
        if (Math.floor(data.length * 3 / 4) > MAX_PART_BYTES) throw new Error('Phần tệp quá lớn');
        const blob = await ghJson('/git/blobs', {
          method: 'POST', body: JSON.stringify({ content: data, encoding: 'base64' }),
        }, 'tải phần tệp');
        return res.json({ ok: true, sha: blob.sha });
      }

      /* Bước 2 tải tệp: ghép các phần thành 1 tệp và lưu vào uploads/ */
      case 'finish': {
        // Từ bản 5 chỉ tải lên ảnh icon; tệp lớn dùng link ngoài (GitHub Releases, Google Drive…)
        if (body.kind !== 'icon' && body.kind !== 'qr') throw new Error('Chỉ hỗ trợ tải lên ảnh icon hoặc ảnh mã QR. Tệp hãy dùng Kho tệp tải về.');
        const kind = body.kind === 'qr' ? 'qr' : 'icons';
        const parts = Array.isArray(body.parts) ? body.parts : [];
        if (!parts.length || parts.length > MAX_PARTS || !parts.every((s) => /^[0-9a-f]{40}$/.test(s))) {
          throw new Error('Danh sách phần tệp không hợp lệ');
        }
        const original = cleanText(body.name, 160) || 'tep';
        const dot = original.lastIndexOf('.');
        const ext = (dot > 0 ? original.slice(dot + 1) : '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
        const base = slugify(dot > 0 ? original.slice(0, dot) : original);
        if (!ICON_EXT.includes(ext)) throw new Error('Ảnh phải là PNG, JPG, WEBP hoặc GIF');
        if (BLOCKED_EXT.includes(ext)) throw new Error('Không cho phép tải lên loại tệp .' + ext);

        let sha = parts[0];
        let size = 0;
        if (parts.length === 1) {
          const b = await ghJson(`/git/blobs/${parts[0]}`, {}, 'đọc phần tệp');
          size = b.size;
        } else {
          const bufs = [];
          for (const s of parts) {
            const b = await ghJson(`/git/blobs/${s}`, {}, 'đọc phần tệp');
            bufs.push(Buffer.from(b.content || '', 'base64'));
          }
          const all = Buffer.concat(bufs);
          size = all.length;
          if (size > MAX_FILE_BYTES) throw new Error('Ảnh icon quá lớn');
          const blob = await ghJson('/git/blobs', {
            method: 'POST', body: JSON.stringify({ content: all.toString('base64'), encoding: 'base64' }),
          }, 'ghép tệp');
          sha = blob.sha;
        }
        if (size > MAX_FILE_BYTES) throw new Error('Ảnh icon quá lớn');
        const path = `uploads/${kind}/${Date.now().toString(36)}-${base}${ext ? '.' + ext : ''}`;
        await commitTree([{ path, sha }], `[skip deploy] Tải lên ${path}`);
        return res.json({ ok: true, path, size });
      }

      /* Xóa hẳn tệp khỏi kho lưu trữ (1 hoặc nhiều tệp) */
      case 'remove': {
        const paths = Array.isArray(body.paths) ? body.paths : [body.path];
        if (!paths.every(safeUploadPath)) throw new Error('Đường dẫn tệp không hợp lệ');
        const n = await removePaths(paths);
        return res.json({ ok: true, removed: n });
      }

      /* Danh sách tệp đã tải lên + dung lượng */
      case 'files': {
        const [tree, repo] = await Promise.all([listTree(), ghJson('', {}, 'đọc thông tin kho')]);
        const files = tree
          .filter((e) => e.type === 'blob' && /^uploads\/(icons|files|qr)\//.test(e.path))
          .map((e) => ({ path: e.path, size: e.size || 0 }));
        const siteBytes = tree.filter((e) => e.type === 'blob').reduce((s, e) => s + (e.size || 0), 0);
        return res.json({ ok: true, files, siteBytes, repoKB: repo.size || 0 });
      }

      /* Kiểm tra kết nối: token, quyền đọc/ghi, nhánh, tệp dữ liệu */
      case 'check': {
        const checks = [];
        const step = async (name, fn) => {
          try { checks.push({ name, ok: true, detail: (await fn()) || '' }); }
          catch (e) { checks.push({ name, ok: false, detail: e.message }); }
        };
        checks.push({ name: 'Biến môi trường trên Vercel', ok: true, detail: 'Đủ GITHUB_TOKEN, GITHUB_REPO' });
        checks.push({ name: 'Mật khẩu admin', ok: true, detail: (await loadPassRecord()) ? 'Đang dùng mật khẩu bạn đã đổi' : 'Đang dùng mật khẩu mặc định – nên đổi mật khẩu mới' });
        checks.push({ name: 'Phiên làm việc', ok: true, detail: 'Tự đăng xuất sau 20 phút không thao tác' });
        await step('Kết nối kho GitHub', async () => {
          const r = await ghJson('', {}, 'đọc kho ' + env('GITHUB_REPO'));
          return r.full_name + (r.private ? ' (riêng tư)' : ' (công khai)');
        });
        await step('Nhánh ' + branch(), async () => {
          const r = await ghJson(`/git/ref/heads/${encodeURIComponent(branch())}`, {}, 'đọc nhánh');
          return 'Commit mới nhất ' + r.object.sha.slice(0, 7);
        });
        await step('Quyền ghi (Contents: Read and write)', async () => {
          await ghJson('/git/blobs', {
            method: 'POST', body: JSON.stringify({ content: 'kiem tra ket noi', encoding: 'utf-8' }),
          }, 'thử ghi');
          return 'Ghi được vào kho';
        });
        await step('Kho tệp tải về (GitHub Releases)', async () => {
          const repoInfo = await ghJson('', {}, 'đọc kho ' + relRepo(), relRepo());
          if (repoInfo.private) throw new Error(relRepo() + ' đang để Private – người ngoài sẽ không tải được tệp');
          const rel = await getRelease(false);
          return relRepo() + ' (công khai) · ' + (rel ? (rel.assets || []).length + ' tệp' : 'chưa có tệp – sẽ tự tạo khi tải tệp đầu tiên');
        });
        await step('Tệp dữ liệu ' + DATA_PATH, async () => {
          const f = await getContent(DATA_PATH);
          return f ? 'Có sẵn' : 'Chưa có – sẽ tự tạo khi bạn bấm Lưu lần đầu (bình thường)';
        });
        await step('Khóa thông báo (VAPID)', async () => {
          if (!env('VAPID_PUBLIC_KEY') || !env('VAPID_PRIVATE_KEY')) throw new Error('Chưa khai báo VAPID_PUBLIC_KEY và VAPID_PRIVATE_KEY trên Vercel');
          if (!vapid()) throw new Error('Khóa VAPID sai định dạng – hãy dán lại đúng 2 khóa trong hướng dẫn');
          return 'Đúng định dạng';
        });
        await step('Nhắc lịch mỗi sáng (Cron 7:00–8:00)', async () => {
          if (!env('CRON_SECRET')) throw new Error('Chưa khai báo CRON_SECRET trên Vercel – sẽ không có thông báo buổi sáng');
          const s = await loadPushStore();
          return 'Đã sẵn sàng · ' + s.subs.length + ' thiết bị nhận' + (s.lastDay ? ' · lần nhắc gần nhất ngày ' + s.lastDay.split('-').reverse().join('/') : '');
        });
        await step('Lịch hẹn (mã hóa)', async () => {
          const n = (await loadSchedules()).length;
          return n + ' lịch hẹn · đọc được';
        });
        return res.json({ ok: true, checks });
      }

      /* Dọn lịch sử: giữ nguyên toàn bộ tệp hiện tại, bỏ các bản cũ để kho nhẹ hơn */
      case 'squash': {
        const ref = await ghJson(`/git/ref/heads/${encodeURIComponent(branch())}`, {}, 'đọc nhánh');
        const head = await ghJson(`/git/commits/${ref.object.sha}`, {}, 'đọc commit');
        const commit = await ghJson('/git/commits', {
          method: 'POST',
          body: JSON.stringify({ message: 'Dọn dẹp lịch sử – giữ nguyên nội dung hiện tại', tree: head.tree.sha, parents: [] }),
        }, 'tạo commit mới');
        await ghJson(`/git/refs/heads/${encodeURIComponent(branch())}`, {
          method: 'PATCH', body: JSON.stringify({ sha: commit.sha, force: true }),
        }, 'cập nhật nhánh');
        return res.json({ ok: true });
      }

      /* Kho tệp tải về: danh sách tệp trong bản phát hành "tai-ve" */
      case 'relList': {
        const rel = await getRelease(false);
        const assets = rel ? (rel.assets || []).map(assetInfo) : [];
        assets.sort((a, b) => String(b.created).localeCompare(String(a.created)));
        return res.json({ ok: true, repo: relRepo(), tag: REL_TAG, exists: !!rel, assets });
      }

      /* Kho tệp tải về: ghép các phần đã gửi rồi đưa lên GitHub Releases */
      case 'relUpload': {
        const parts = Array.isArray(body.parts) ? body.parts : [];
        if (!parts.length || parts.length > REL_MAX_PARTS || !parts.every((x) => /^[0-9a-f]{40}$/.test(x))) {
          throw new Error('Danh sách phần tệp không hợp lệ');
        }
        const original = cleanText(body.name, 160) || 'tep';
        const buf = await readBlobs(parts);
        if (!buf.length) throw new Error('Tệp trống');
        if (buf.length > REL_MAX_BYTES) throw new Error('Tệp quá lớn (tối đa 50 MB)');
        const rel = await getRelease(true);
        let { base, ext, name } = safeAssetName(original);
        const same = (rel.assets || []).find((a) => a.name.toLowerCase() === name.toLowerCase());
        if (same) {
          if (body.replace === true) {
            await ghJson(`/releases/assets/${same.id}`, { method: 'DELETE' }, 'xóa tệp cũ', relRepo());
          } else {
            name = `${base}-${Date.now().toString(36)}${ext ? '.' + ext : ''}`;
          }
        }
        const up = await fetch(
          `https://uploads.github.com/repos/${relRepo()}/releases/${rel.id}/assets?name=${encodeURIComponent(name)}&label=${encodeURIComponent(original.slice(0, 120))}`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${env('GITHUB_TOKEN')}`,
              Accept: 'application/vnd.github+json',
              'X-GitHub-Api-Version': '2022-11-28',
              'User-Agent': 'phanthietpho-admin',
              'Content-Type': 'application/octet-stream',
            },
            body: buf,
          },
        );
        if (!up.ok) {
          let msg = '';
          try { msg = (await up.json()).message || ''; } catch (e) { /* bỏ qua */ }
          throw new Error(`GitHub báo lỗi ${up.status} khi tải tệp lên Releases${msg ? ': ' + msg : ''}`);
        }
        return res.json({ ok: true, asset: assetInfo(await up.json()) });
      }

      /* Kho tệp tải về: xóa hẳn 1 tệp */
      case 'relDelete': {
        const id = Number(body.id);
        if (!Number.isInteger(id) || id <= 0) throw new Error('Mã tệp không hợp lệ');
        await ghJson(`/releases/assets/${id}`, { method: 'DELETE' }, 'xóa tệp', relRepo());
        return res.json({ ok: true });
      }

      /* Đổi mật khẩu trang admin (phải nhập đúng mật khẩu hiện tại) */
      case 'changePassword': {
        if (!(await passwordOk(body.currentPassword))) throw new Error('Mật khẩu hiện tại không đúng');
        const np = typeof body.newPassword === 'string' ? body.newPassword : '';
        if (np.length < 6) throw new Error('Mật khẩu mới phải có ít nhất 6 ký tự');
        if (np.length > 100) throw new Error('Mật khẩu mới quá dài');
        if (np === body.currentPassword) throw new Error('Mật khẩu mới phải khác mật khẩu hiện tại');
        const salt = crypto.randomBytes(16).toString('hex');
        const rec = { algo: 'scrypt+hmac', salt, hash: pepperedHex(np, salt), updated: new Date().toISOString() };
        await putContent(PASS_PATH, Buffer.from(JSON.stringify(rec, null, 2) + '\n').toString('base64'), '[skip deploy] Đổi mật khẩu trang admin');
        passCache = rec;
        passCacheAt = Date.now();
        return res.json({ ok: true }); // kèm vé phiên mới theo mật khẩu mới; máy khác bị đăng xuất
      }

      default:
        return res.status(400).json({ ok: false, error: 'Yêu cầu không hợp lệ' });
    }
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message || 'Lỗi không xác định' });
  }
}

/* ---------- Nhắc lịch mỗi sáng (Vercel Cron gọi /api/cron lúc 0:00 UTC = 7:00–8:00 giờ VN) ----------
   Có việc cần xử lý → gửi 1 thông báo + đặt số trên icon app = đúng số ở chuông.
   Hôm nay không có việc nhưng hôm qua icon còn số → gửi 1 thông báo để xóa số. */
async function daily(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const secret = env('CRON_SECRET');
  const auth = (req.headers && req.headers.authorization) || '';
  if (!secret || auth !== 'Bearer ' + secret) return res.status(401).json({ ok: false, error: 'Không có quyền' });
  try {
    const today = vnDate(0);
    const store = await loadPushStore();
    if (store.lastDay === today) return res.json({ ok: true, skipped: 'Hôm nay đã nhắc rồi' });
    const active = activeOn(await loadSchedules(), today);
    let result = { sent: 0 };
    if (store.subs.length && (active.length || store.lastBadge > 0)) {
      const title = active.length ? `📅 Hôm nay có ${active.length} lịch hẹn` : '✅ Hôm nay không có lịch hẹn';
      const bodyTxt = active.length ? listTitles(active, 5) : 'Không có việc cần xử lý. Chúc bạn một ngày vui vẻ!';
      result = await notify(store, badgePayload(active, title, bodyTxt), subjectFrom(req));
      store.lastSent = new Date().toISOString();
    }
    store.lastDay = today;
    store.lastBadge = active.length;
    await writePrivate(PUSH_PATH, store, 'Nhắc lịch hẹn buổi sáng ' + today);
    return res.json({ ok: true, today, count: active.length, ...result });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}

module.exports = handler;
module.exports.daily = daily;
module.exports._test = { encryptPush, vapidHeader, vapid, seal, unseal, issueToken, tokenOk, cleanSchedules, activeOn, cleanSub };
