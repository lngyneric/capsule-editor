var WASM_B64 = "__WASM_B64__";
var THEMES = __THEMES__;
var EMBEDDED_PAGES = __EMBEDDED_PAGES__; /* 合并单文件模式：[{label, html}]，否则为 null */
function b64ToU8(b64) {
  var bin = atob(b64), len = bin.length, u8 = new Uint8Array(len);
  for (var i = 0; i < len; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}
var SQL = null;
var files = [];   /* [{name, db, meta, versions:[{version, active, created}]}] */
var embeddedPages = []; /* 合并模式预置页面：[{label, html}]，排在文件页面之前 */
var pages = [];   /* [{fi, ver, label} | {fi:-1, label, html}]，按“文件顺序 × 版本从旧到新”排列 */
var lastIdx = -1, firstRender = true;
var frame = document.getElementById('frame');
var currentThemeId = 'default';
var currentRemap = {};

function setStatus(t, isErr) {
  var el = document.getElementById('status');
  el.textContent = t;
  el.className = 'status' + (isErr ? ' err' : '');
}

/* 新增一个 capsule 文件（同名则替换），重建统一页序列 */
function addCapsule(buf, label) {
  var db;
  try {
    db = new SQL.Database(new Uint8Array(buf));
  } catch (e) { setStatus('\u201c' + label + '\u201d不是有效的 capsule 文件', true); return; }
  var meta = {};
  try {
    db.exec("SELECT key, value FROM app_meta").forEach(function(r) {
      r.values.forEach(function(v) { meta[v[0]] = v[1]; });
    });
  } catch (e) {}
  var versions = [];
  try {
    db.exec("SELECT version, is_active, created_at FROM app_ui ORDER BY version ASC").forEach(function(r) {
      r.values.forEach(function(v) { versions.push({version: v[0], active: v[1], created: v[2]}); });
    });
  } catch (e) {}
  if (!versions.length) {
    try { db.close(); } catch (e) {}
    setStatus('\u201c' + label + '\u201d中没有可用版本，已跳过', true);
    return;
  }
  var rec = { name: label, db: db, meta: meta, versions: versions };
  var idx = -1;
  for (var i = 0; i < files.length; i++) if (files[i].name === label) { idx = i; break; }
  if (idx >= 0) { try { files[idx].db.close(); } catch (e) {} files[idx] = rec; }
  else files.push(rec);
  rebuildPages();
}

/* 页面 HTML 来源：内嵌页直接取，capsule 页查库 */
function pageHtml(p) {
  if (p.html !== undefined) return p.html;
  var res = files[p.fi].db.exec("SELECT html FROM app_ui WHERE version = " + p.ver + " LIMIT 1");
  return (res.length && res[0].values.length) ? res[0].values[0][0] : null;
}

/* 重建统一翻页序列：预置内嵌页在前，每个文件内部版本从旧到新，文件之间按加入顺序接续 */
function rebuildPages() {
  pages = [];
  embeddedPages.forEach(function(pg) {
    pages.push({ fi: -1, ver: 0, label: pg.label, html: pg.html, ts: pg.ts || nowTs() });
  });
  files.forEach(function(f, fi) {
    f.versions.forEach(function(v) {
      pages.push({ fi: fi, ver: v.version, ts: v.created,
        label: f.name + ' \u00b7 v' + v.version + (v.active ? '\uff08当前\uff09' : '') });
    });
  });
  refreshUI();
}

/* 按当前 pages[] 刷新下拉框、标题栏并定位默认页 */
function refreshUI() {
  var sel = document.getElementById('vers');
  sel.options.length = 0;
  pages.forEach(function(p, i) {
    var o = document.createElement('option');
    o.value = i;
    o.textContent = (i + 1) + '. ' + p.label;
    sel.appendChild(o);
  });
  var nEmb = embeddedPages.length;
  document.getElementById('appname').textContent =
    (nEmb && !files.length) ? '合并文档'
    : files.length <= 1
      ? ((files[0] && (files[0].meta.app_name || files[0].name)) || 'capsule')
      : ('\u5171 ' + files.length + ' \u4e2a capsule');
  if (!pages.length) { setStatus('暂无页面', true); return; }
  var defIdx = 0;
  if (!nEmb && files.length) {
    var vs0 = files[0].versions, ai = -1;
    for (var vi = 0; vi < vs0.length; vi++) if (vs0[vi].active) { ai = vi; break; }
    defIdx = ai >= 0 ? ai : vs0.length - 1;
  }
  sel.selectedIndex = defIdx;
  lastIdx = defIdx;
  firstRender = true;
  renderPage(defIdx, 0);
  var src = nEmb ? (nEmb + ' 组内嵌页') : '';
  if (files.length) src += (src ? ' + ' : '') + files.length + ' \u4e2a\u6587\u4ef6';
  setStatus('\u5df2\u52a0\u8f7d' + (src || '0 页') + '\uff0c\u5171 ' + pages.length + ' \u9875\uff0c\u53ef\u7ffb\u9875\u6d4f\u89c8');
}

function renderPage(pi, dir) {
  pi = parseInt(pi, 10);
  var p = pages[pi];
  if (!p) { setStatus('页面不存在', true); return; }
  var raw = pageHtml(p);
  if (raw === null || raw === undefined) { setStatus('该页无内容', true); return; }
  var html = applyRemap(raw);
  var doc = frame.contentDocument;
  if (firstRender || !dir) {
    doc.open(); doc.write(html); doc.close();
    try { doc.documentElement.style.scrollBehavior = 'smooth'; } catch (e) {}
    firstRender = false;
    setStatus('\u7b2c ' + (pi + 1) + ' / ' + pages.length + ' \u9875 \u00b7 ' + p.label);
    return;
  }
  var outX = dir > 0 ? -28 : 28;
  frame.style.opacity = '0';
  frame.style.transform = 'translateX(' + outX + 'px)';
  setTimeout(function() {
    doc.open(); doc.write(html); doc.close();
    try { doc.documentElement.style.scrollBehavior = 'smooth'; } catch (e) {}
    frame.style.transition = 'none';
    frame.style.transform = 'translateX(' + (-outX) + 'px)';
    frame.style.opacity = '0';
    void frame.offsetWidth;
    frame.style.transition = '';
    frame.style.opacity = '1';
    frame.style.transform = 'translateX(0)';
  }, 200);
  setStatus('\u7b2c ' + (pi + 1) + ' / ' + pages.length + ' \u9875 \u00b7 ' + p.label);
}

/* d=+1 下一页（前进），d=-1 上一页（后退） */
function stepPage(d) {
  if (!pages.length) return;
  var sel = document.getElementById('vers');
  var idx = sel.selectedIndex + d;
  if (idx < 0 || idx >= sel.options.length) { setStatus('\u5df2\u7ecf\u5230\u5934\u4e86\uff08\u5171 ' + pages.length + ' \u9875\uff09', false); return; }
  sel.selectedIndex = idx;
  lastIdx = idx;
  renderPage(idx, d);
}

function loadFromUrl() {
  setStatus('\u6b63\u5728\u52a0\u8f7d ' + CAPSULE_URL + ' \u2026');
  fetch(CAPSULE_URL).then(function(r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.arrayBuffer();
  }).then(function(buf) {
    addCapsule(buf, CAPSULE_URL);
  }).catch(function(e) {
    setStatus('\u81ea\u52a8\u52a0\u8f7d\u5931\u8d25\uff08' + e.message + '\uff09\uff0c\u8bf7\u70b9\u300c\u9009\u62e9 capsule \u6587\u4ef6\u300d\u624b\u52a8\u6253\u5f00\uff08\u53ef\u591a\u9009\uff09', true);
  });
}

document.getElementById('vers').addEventListener('change', function(e) {
  var idx = e.target.selectedIndex;
  var dir = lastIdx === -1 ? 0 : (idx > lastIdx ? 1 : (idx < lastIdx ? -1 : 0));
  lastIdx = idx;
  renderPage(idx, dir);
});
function goFirst() {
  if (!pages.length) return;
  var sel = document.getElementById('vers');
  if (sel.selectedIndex <= 0) { setStatus('已经是第一页'); return; }
  sel.selectedIndex = 0;
  lastIdx = 0;
  renderPage(0, -1);
}
function goLast() {
  if (!pages.length) return;
  var sel = document.getElementById('vers');
  var n = sel.options.length - 1;
  if (sel.selectedIndex >= n) { setStatus('已经是最后一页'); return; }
  sel.selectedIndex = n;
  lastIdx = n;
  renderPage(n, 1);
}

document.getElementById('first').addEventListener('click', goFirst);
document.getElementById('prev').addEventListener('click', function() { stepPage(-1); });
document.getElementById('next').addEventListener('click', function() { stepPage(1); });
document.getElementById('last').addEventListener('click', goLast);
/* PPT 演示模式按键：→/↓/空格/PageDown/回车=下一页，←/↑/PageUp=上一页，Home/End=首/末页 */
document.addEventListener('keydown', function(e) {
  var t = e.target && e.target.tagName;
  if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT') return; /* 原生控件优先 */
  var k = e.key;
  /* 焦点在按钮上时，空格/回车交给按钮原生激活（只翻一次），避免 keydown+原生点击造成翻两页 */
  if (t === 'BUTTON' && (k === ' ' || k === 'Enter')) return;
  if (k === 'ArrowRight' || k === 'ArrowDown' || k === ' ' || k === 'PageDown' || k === 'Enter') {
    e.preventDefault(); stepPage(1);
  } else if (k === 'ArrowLeft' || k === 'ArrowUp' || k === 'PageUp') {
    e.preventDefault(); stepPage(-1);
  } else if (k === 'Home') {
    e.preventDefault(); goFirst();
  } else if (k === 'End') {
    e.preventDefault(); goLast();
  }
});
/* ================= 合并导出 =================
   把当前所有页面（按当前顺序）合并导出 */
function nowTs() {
  var d = new Date(), p = function(n) { return (n < 10 ? '0' : '') + n; };
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' +
         p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
}

function downloadBlob(blob, filename) {
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(function() { try { URL.revokeObjectURL(a.href); } catch (e) {} a.remove(); }, 1500);
  setStatus('已导出：' + filename + '（' + pages.length + ' 页）');
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
                  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* 合订本：把全部页面内嵌进单个 HTML，自带翻页条 + PPT 式键盘。
   注意：源码里不出现字面的 script 结束标签（用 'scr'+'ipt' 拼接），否则 HTML 解析会截断 script 块 */
function buildBoundHtml(pages, title) {
  var items = [];
  for (var i = 0; i < pages.length; i++) {
    var p = pages[i], html = pageHtml(p);
    if (html === null || html === undefined) continue;
    html = applyRemap(html);
    /* 注入按键转发：焦点在 iframe 内时键盘翻页依然有效 */
    var fwd = '<scr' + 'ipt>document.addEventListener("keydown",function(e){' +
              'try{parent.postMessage({__flip:e.key},"*");}catch(_){}});</scr' + 'ipt>';
    if (/<\/body\s*>/i.test(html)) html = html.replace(/<\/body\s*>/i, fwd + '</body>');
    else html += fwd;
    items.push({ label: p.label, html: html });
  }
  if (!items.length) return null;
  var json = JSON.stringify(items).replace(/</g, '\\u003c');
  var h = '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<title>' + escHtml(title) + '</title>\n<style>\n' +
    'html,body{margin:0;height:100%;overflow:hidden;' +
    'font-family:system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;}\n' +
    '#bar{position:fixed;top:0;left:0;right:0;height:46px;display:flex;align-items:center;gap:8px;' +
    'padding:0 12px;background:#111827;color:#f9fafb;font-size:14px;z-index:10;' +
    'overflow-x:auto;white-space:nowrap;-webkit-overflow-scrolling:touch;}\n' +
    '#bar button{background:#1f2937;color:#f9fafb;border:1px solid #374151;border-radius:6px;' +
    'padding:5px 10px;font-size:14px;cursor:pointer;flex-shrink:0;}\n' +
    '#bar button:active{background:#374151;}\n' +
    '#pg{color:#9ca3af;flex-shrink:0;}#label{color:#d1d5db;overflow:hidden;text-overflow:ellipsis;}\n' +
    '#frame{position:fixed;top:46px;left:0;width:100%;height:calc(100% - 46px);border:0;background:#fff;}\n' +
    '</style>\n</head>\n<body>\n' +
    '<div id="bar"><button id="bFirst" title="第一页 (Home)">⏮</button>' +
    '<button id="bPrev" title="上一页 (←/↑)">◀</button><span id="pg"></span>' +
    '<button id="bNext" title="下一页 (→/↓/空格)">▶</button>' +
    '<button id="bLast" title="最后一页 (End)">⏭</button>' +
    '<span id="label"></span></div>\n' +
    '<iframe id="frame" title="page"></iframe>\n' +
    '<scr' + 'ipt>\nvar PAGES=' + json + ';\nvar cur=0;\n' +
    'function show(i){if(i<0||i>=PAGES.length)return;cur=i;\n' +
    'document.getElementById("frame").srcdoc=PAGES[i].html;\n' +
    'document.getElementById("pg").textContent=(i+1)+" / "+PAGES.length;\n' +
    'document.getElementById("label").textContent=PAGES[i].label;}\n' +
    'function step(d){var n=cur+d;if(n<0||n>=PAGES.length)return;show(n);}\n' +
    'function flipKey(k){' +
    'if(k==="ArrowRight"||k==="ArrowDown"||k===" "||k==="PageDown"||k==="Enter"){step(1);}\n' +
    'else if(k==="ArrowLeft"||k==="ArrowUp"||k==="PageUp"){step(-1);}\n' +
    'else if(k==="Home"){show(0);}else if(k==="End"){show(PAGES.length-1);}}\n' +
    'document.getElementById("bFirst").onclick=function(){show(0);};\n' +
    'document.getElementById("bPrev").onclick=function(){step(-1);};\n' +
    'document.getElementById("bNext").onclick=function(){step(1);};\n' +
    'document.getElementById("bLast").onclick=function(){show(PAGES.length-1);};\n' +
    'document.addEventListener("keydown",function(e){' +
    'var t=e.target&&e.target.tagName;' +
    'if(t==="BUTTON"&&(e.key===" "||e.key==="Enter"))return;' +
    'flipKey(e.key);});\n' +
    'window.addEventListener("message",function(e){if(e.data&&e.data.__flip)flipKey(e.data.__flip);});\n' +
    'show(0);\n</scr' + 'ipt>\n</body>\n</html>';
  return h;
}

function boundTitle() {
  if (files.length === 1 && files[0].meta.app_name) return files[0].meta.app_name + ' · 合订本';
  if (embeddedPages.length && !files.length) return '合并文档 · 合订本';
  return '合并文档（' + pages.length + '页）· 合订本';
}

/* 导出合并后的 .capsule：合订本单版本（v1/active），翻页功能内嵌在 HTML 里，
   任何 capsule 渲染器打开都能翻页 */
function exportMergedCapsule() {
  if (!pages.length) { setStatus('没有可导出的页面', true); return; }
  if (!SQL) { setStatus('sql.js 尚未就绪，稍后再试', true); return; }
  try {
    var bound = buildBoundHtml(pages, boundTitle());
    if (!bound) { setStatus('没有可导出的页面', true); return; }
    var db2 = new SQL.Database();
    /* 完整 capsule schema（与原生 capsule 一致：STRICT / WITHOUT ROWID / application_id='CAPS'），
       确保第三方 capsule 应用可直接打开 */
    db2.run("PRAGMA application_id = 1128353875;");
    db2.run("CREATE TABLE app_meta (key TEXT PRIMARY KEY, value TEXT) STRICT, WITHOUT ROWID;");
    db2.run("CREATE TABLE app_permissions (permission TEXT PRIMARY KEY, reason TEXT) STRICT, WITHOUT ROWID;");
    db2.run("CREATE TABLE app_ui (id INTEGER PRIMARY KEY AUTOINCREMENT, version INTEGER NOT NULL DEFAULT 1, html TEXT NOT NULL, source_bundle TEXT, source_framework TEXT, created_at TEXT DEFAULT (datetime('now')), is_active INTEGER DEFAULT 1) STRICT;");
    db2.run("CREATE TABLE app_assets (id INTEGER PRIMARY KEY AUTOINCREMENT, filename TEXT NOT NULL UNIQUE, mime_type TEXT NOT NULL, data BLOB NOT NULL, size_bytes INTEGER, hash_sha256 TEXT, created_at TEXT DEFAULT (datetime('now'))) STRICT;");
    db2.run("CREATE TABLE doc_records (collection TEXT NOT NULL, _id TEXT NOT NULL, data_json TEXT NOT NULL, PRIMARY KEY (collection, _id)) STRICT;");
    db2.run("CREATE TABLE doc_storage (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;");
    db2.run("CREATE TABLE doc_assets (id TEXT PRIMARY KEY, display_name TEXT, belongs_to TEXT, mime_type TEXT NOT NULL, size_bytes INTEGER, hash_sha256 TEXT, created_at TEXT DEFAULT (datetime('now'))) STRICT, WITHOUT ROWID;");
    db2.run("CREATE TABLE doc_asset_blobs (id TEXT PRIMARY KEY, data BLOB NOT NULL) STRICT;");
    db2.run("CREATE UNIQUE INDEX idx_app_ui_single_active ON app_ui(is_active) WHERE is_active = 1;");
    db2.run("CREATE INDEX idx_doc_assets_belongs_to ON doc_assets(belongs_to);");
    var ts = nowTs(), name = boundTitle();
    db2.run("INSERT INTO app_meta (key, value) VALUES ('app_name', ?)", [name]);
    db2.run("INSERT INTO app_meta (key, value) VALUES ('app_version', '1.0.0')");
    db2.run("INSERT INTO app_meta (key, value) VALUES ('schema_version', '9')");
    db2.run("INSERT INTO app_meta (key, value) VALUES ('ui_version', '1')");
    db2.run("INSERT INTO app_meta (key, value) VALUES ('created_at', ?)", [ts]);
    db2.run("INSERT INTO app_meta (key, value) VALUES ('updated_at', ?)", [ts]);
    db2.run('INSERT INTO app_ui (version, html, source_bundle, created_at, is_active) VALUES (?,?,?,?,?)',
            [1, bound, 'bound:' + pages.length + '页合订本', ts, 1]);
    var data = db2.export();
    db2.close();
    downloadBlob(new Blob([data], {type: 'application/octet-stream'}), 'merged.capsule');
  } catch (e) {
    setStatus('导出失败：' + e.message, true);
  }
}

/* 导出合并后的单个 HTML：把当前文档序列化，将 EMBEDDED_PAGES 替换为合并后的页面 */
function exportMergedHtml() {
  if (!pages.length) { setStatus('没有可导出的页面', true); return; }
  try {
    var arr = [];
    for (var i = 0; i < pages.length; i++) {
      var p = pages[i], html = pageHtml(p);
      if (html === null || html === undefined) continue;
      arr.push({label: p.label, html: html, ts: p.ts || nowTs()});
    }
    if (!arr.length) { setStatus('没有可导出的页面', true); return; }
    /* JSON 嵌入 script 块时必须转义 <，防止 HTML 解析器提前截断 script */
    var json = JSON.stringify(arr).replace(/</g, '\\u003c');
    var docHtml = document.documentElement.outerHTML;
    /* 用注释锚点定位 EMBEDDED_PAGES 赋值行，整体替换（兼容 null 与已有数组两种形态） */
    var re = /var EMBEDDED_PAGES = [\s\S]*?\/\* 合并单文件模式/;
    if (!re.test(docHtml)) { setStatus('当前页面不支持导出（找不到 EMBEDDED_PAGES）', true); return; }
    var out = docHtml.replace(re, 'var EMBEDDED_PAGES = ' + json + ' /* 合并单文件模式');
    out = out.replace(/<title>.*?<\/title>/, '<title>合并文档（' + arr.length + '页）</title>');
    downloadBlob(new Blob([out], {type: 'text/html;charset=utf-8'}), 'merged.html');
  } catch (e) {
    setStatus('导出失败：' + e.message, true);
  }
}

document.getElementById('expCap').addEventListener('click', exportMergedCapsule);
document.getElementById('expHtml').addEventListener('click', exportMergedHtml);

document.getElementById('reload').addEventListener('click', loadFromUrl);
document.getElementById('choose').addEventListener('click', function() {
  document.getElementById('pick').click();
});
document.getElementById('pick').addEventListener('change', function(e) {
  var list = e.target.files;
  if (!list || !list.length) return;
  for (var i = 0; i < list.length; i++) {
    (function(f) {
      var rd = new FileReader();
      rd.onload = function() { addCapsule(rd.result, f.name); };
      rd.readAsArrayBuffer(f);
    })(list[i]);
  }
  e.target.value = '';
});

/* ================= 主题框架 =================
   主题 = 调色映射 remap（旧 hex -> 新 hex，渲染前对 HTML 做字符串替换，
   因此对已打包的旧版本内容同样生效）+ 工具栏 chrome 变量。
   详见 docs/THEMING.md */
function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function applyRemap(html) {
  var keys = Object.keys(currentRemap).sort(function(a, b) { return b.length - a.length; });
  for (var i = 0; i < keys.length; i++) {
    var old = keys[i];
    if (!old || old.length < 4) continue;
    /* 大小写不敏感；负前瞻避免 #fff 误伤 #ffffff */
    var re = new RegExp(escRe(old) + '(?![0-9a-fA-F])', 'gi');
    html = html.replace(re, currentRemap[old]);
  }
  return html;
}

function getTheme(id) {
  for (var i = 0; i < THEMES.length; i++) if (THEMES[i].id === id) return THEMES[i];
  return THEMES[0];
}

function applyTheme(id, silent) {
  var t = getTheme(id);
  currentThemeId = t.id;
  currentRemap = t.remap || {};
  var root = document.documentElement;
  var chrome = t.chrome || {};
  Object.keys(chrome).forEach(function(k) { root.style.setProperty(k, chrome[k]); });
  try { localStorage.setItem('capsule-viewer-theme', t.id); } catch (e) {}
  var sel = document.getElementById('theme');
  if (sel) sel.value = t.id;
  if (!silent && pages.length && lastIdx >= 0) { firstRender = true; renderPage(lastIdx, 0); }
}

function initThemes() {
  var sel = document.getElementById('theme');
  if (!sel) return;
  THEMES.forEach(function(t) {
    var o = document.createElement('option');
    o.value = t.id;
    o.textContent = t.name;
    sel.appendChild(o);
  });
  var saved = null;
  try { saved = localStorage.getItem('capsule-viewer-theme'); } catch (e) {}
  applyTheme(saved || (THEMES[0] && THEMES[0].id) || 'default', true);
  sel.addEventListener('change', function(e) { applyTheme(e.target.value, false); });
}

initThemes();

/* sql.js 始终初始化：capsule 模式用于读取，内嵌模式用于“合并导出 capsule” */
initSqlJs({ wasmBinary: b64ToU8(WASM_B64) }).then(function(sql) {
  SQL = sql;
  if (EMBEDDED_PAGES && EMBEDDED_PAGES.length) {
    embeddedPages = EMBEDDED_PAGES;
    rebuildPages();
  } else {
    loadFromUrl();
  }
}).catch(function(e) {
  setStatus('sql.js 初始化失败：' + e.message, true);
});
