/* =====================================================
   API TRANG ADMIN – chạy trên Vercel (Serverless Function)
   Lưu "Tiện ích hay dùng" và tệp tải lên vào kho GitHub.

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

   Tệp lớn (tới 10 MB) được gửi thành nhiều phần nhỏ (vì Vercel
   chỉ nhận ~4,5 MB mỗi lần), máy chủ ghép lại rồi lưu vào GitHub.
   ===================================================== */
const crypto = require('crypto');

const DATA_PATH = 'data/tienich.json';
const BANK_PATH = 'data/bank.json';   // danh sách tài khoản ngân hàng (hiện ở nút "Số TK")
const MAX_BANKS = 10;
const MAX_ITEMS = 60;
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
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
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

/* ---------- xử lý yêu cầu ---------- */
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Chỉ nhận POST' });

  const missing = ['GITHUB_TOKEN', 'GITHUB_REPO'].filter((k) => !env(k));
  if (missing.length) {
    return res.status(500).json({ ok: false, error: 'Chưa khai báo biến môi trường trên Vercel: ' + missing.join(', ') });
  }

  let body = req.body || {};
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }

  let authed = false;
  try { authed = await passwordOk(body.password); } catch (e) {
    return res.status(502).json({ ok: false, error: 'Không đọc được mật khẩu từ GitHub: ' + e.message });
  }
  if (!authed) {
    await new Promise((r) => setTimeout(r, 800)); // làm chậm việc dò mật khẩu
    return res.status(401).json({ ok: false, error: 'Sai mật khẩu' });
  }

  try {
    switch (body.action) {
      case 'login': {
        return res.json({ ok: true, repo: env('GITHUB_REPO'), releasesRepo: relRepo(), releaseTag: REL_TAG });
      }

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

      case 'save': {
        const items = cleanItems(body.items);
        const json = JSON.stringify(items, null, 2) + '\n';
        await putContent(DATA_PATH, Buffer.from(json, 'utf8').toString('base64'), 'Cập nhật Tiện ích hay dùng');
        return res.json({ ok: true, items });
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

      /* Đổi mật khẩu trang admin */
      case 'changePassword': {
        const np = typeof body.newPassword === 'string' ? body.newPassword : '';
        if (np.length < 6) throw new Error('Mật khẩu mới phải có ít nhất 6 ký tự');
        if (np.length > 100) throw new Error('Mật khẩu mới quá dài');
        if (np === body.password) throw new Error('Mật khẩu mới phải khác mật khẩu hiện tại');
        const salt = crypto.randomBytes(16).toString('hex');
        const rec = { algo: 'scrypt+hmac', salt, hash: pepperedHex(np, salt), updated: new Date().toISOString() };
        await putContent(PASS_PATH, Buffer.from(JSON.stringify(rec, null, 2) + '\n').toString('base64'), '[skip deploy] Đổi mật khẩu trang admin');
        passCache = rec;
        passCacheAt = Date.now();
        return res.json({ ok: true });
      }

      default:
        return res.status(400).json({ ok: false, error: 'Yêu cầu không hợp lệ' });
    }
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message || 'Lỗi không xác định' });
  }
};
