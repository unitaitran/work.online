// Trang quản trị tường than thở: xem bài bị báo cáo, ẩn/hiện lại, xoá. Bảo vệ bằng ADMIN_KEY
// (nhập trên trang, gửi qua header x-admin-key, chỉ giữ trong sessionStorage của tab).
// Nội dung người chơi luôn gán bằng textContent, không dùng innerHTML.
export const ADMIN_PAGE = `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Quản trị · Đi làm Online</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 0 auto; padding: 16px; max-width: 860px; background: #fdf8f2; color: #3b3241; }
  h1 { font-size: 1.3rem; }
  form { display: flex; gap: 8px; margin-bottom: 16px; }
  input { flex: 1; padding: 8px; font: inherit; }
  button { padding: 8px 12px; font: inherit; cursor: pointer; }
  table { width: 100%; border-collapse: collapse; background: #fff; }
  td, th { padding: 8px; border-bottom: 1px solid #eee; text-align: left; vertical-align: top; }
  .hidden { color: #a33; font-weight: 700; }
  #msg { min-height: 1.2em; }
</style>
</head>
<body>
<h1>Tường than thở: bài bị báo cáo</h1>
<form id="login"><input id="key" type="password" placeholder="Khoá quản trị" autocomplete="off"><button>Vào</button></form>
<p id="msg"></p>
<table><thead><tr><th>Nội dung</th><th>Ngày</th><th>Báo cáo</th><th>Trạng thái</th><th></th></tr></thead><tbody id="rows"></tbody></table>
<script>
  const rows = document.getElementById('rows');
  const msg = document.getElementById('msg');
  const keyInput = document.getElementById('key');
  let key = sessionStorage.getItem('dilam.admin') || '';
  const call = (method, path) =>
    fetch(path, { method, headers: { 'x-admin-key': key } });
  async function load() {
    rows.replaceChildren();
    const res = await call('GET', '/api/admin/wall');
    if (!res.ok) { msg.textContent = 'Khoá không đúng.'; return; }
    msg.textContent = '';
    const data = await res.json();
    for (const post of data.posts) {
      const tr = document.createElement('tr');
      const cells = [post.text, post.day, String(post.reports), post.hidden ? 'Đang ẩn' : 'Đang hiện'];
      cells.forEach((text, i) => {
        const td = document.createElement('td');
        td.textContent = text;
        if (i === 3 && post.hidden) td.className = 'hidden';
        tr.append(td);
      });
      const actions = document.createElement('td');
      const restore = document.createElement('button');
      restore.textContent = 'Hiện lại';
      restore.disabled = !post.hidden;
      restore.onclick = async () => { await call('POST', '/api/admin/wall/' + post.id + '/restore'); load(); };
      const del = document.createElement('button');
      del.textContent = 'Xoá';
      del.onclick = async () => { if (confirm('Xoá bài này?')) { await call('DELETE', '/api/admin/wall/' + post.id); load(); } };
      actions.append(restore, del);
      tr.append(actions);
      rows.append(tr);
    }
    if (data.posts.length === 0) msg.textContent = 'Không có bài nào bị báo cáo.';
  }
  document.getElementById('login').onsubmit = (e) => {
    e.preventDefault();
    key = keyInput.value;
    sessionStorage.setItem('dilam.admin', key);
    load();
  };
  if (key) load();
</script>
</body>
</html>
`;
