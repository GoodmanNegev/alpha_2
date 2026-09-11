// Visible boot diagnostics. Module import failures otherwise look like a black screen.
const FILES = [
  'src/main.js',
  'src/game.js',
  'src/engine/reducer.js',
  'src/engine/state.js',
  'src/data/floors.js',
  'src/render/renderer.js',
  'css/style.css',
];

function show(text) {
  let el = document.getElementById('boot-error');
  if (!el) {
    el = document.createElement('pre');
    el.id = 'boot-error';
    el.style.cssText = 'position:fixed;inset:12px;z-index:9999;margin:0;padding:16px;overflow:auto;background:#2a1010;color:#ffd0d0;border:1px solid #c44;font:13px/1.5 ui-monospace,monospace;white-space:pre-wrap';
    document.body.append(el);
  }
  el.textContent = text;
}

window.addEventListener('error', (event) => {
  const where = event.filename ? `${event.filename}:${event.lineno}` : 'script';
  show(`页面脚本失败：${event.message}\n${where}`);
});
window.addEventListener('unhandledrejection', (event) => {
  show(`页面脚本失败：${event.reason && event.reason.stack ? event.reason.stack : event.reason}`);
});

Promise.all(FILES.map(async (file) => {
  const res = await fetch(file, { cache: 'no-store' });
  const type = res.headers.get('content-type') || '';
  const okType = file.endsWith('.css') ? /css/i.test(type) : /javascript|ecmascript/i.test(type);
  if (!res.ok) return `${file} → HTTP ${res.status}`;
  if (!okType) return `${file} → Content-Type ${type || '(空)'}`;
  return null;
})).then((rows) => {
  const fails = rows.filter(Boolean);
  if (fails.length) show(`游戏资源未正确加载：\n${fails.join('\n')}\n\n请强制刷新；若仍在，把这段文字发给维护者。`);
}).catch((err) => show(`游戏资源检查失败：${err}`));
