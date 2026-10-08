#!/usr/bin/env python3
"""合并多个文档（.capsule / .html）为单个输出。

输入：
  .capsule  默认取 active 版本；加 --all-versions 取全部版本（从旧到新）
  .html     作为一个页面

输出（二选一，必须指定一个）：
  --capsule-out merged.capsule   合并为单个 capsule：多版本 v1..vN（可继续用 viewer / capsule.py 处理）
  --capsule-out merged.capsule --bound
                                 合订本：单个版本，翻页功能内嵌在 HTML 里（第三方 capsule 应用可直接翻页）
  --html-out merged.html         合并为单个 HTML：viewer 外壳 + 页面内嵌，浏览器直接打开

示例：
  python3 tools/merge.py a.capsule b.html --capsule-out merged.capsule --name "AI合集"
  python3 tools/merge.py a.capsule b.html --all-versions --html-out merged.html --title "AI合集"
"""
import argparse, datetime, json, os, sqlite3, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
from build import build_viewer

SCHEMA = '''
CREATE TABLE app_meta (key TEXT PRIMARY KEY, value TEXT) STRICT, WITHOUT ROWID;
CREATE TABLE app_ui (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    version INTEGER NOT NULL DEFAULT 1,
    html TEXT NOT NULL,
    source_bundle TEXT,
    source_framework TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    is_active INTEGER DEFAULT 1
) STRICT;
CREATE TABLE app_permissions (permission TEXT PRIMARY KEY, reason TEXT) STRICT, WITHOUT ROWID;
CREATE TABLE doc_records (collection TEXT NOT NULL, _id TEXT NOT NULL, data_json TEXT NOT NULL,
    PRIMARY KEY (collection, _id)) STRICT;
CREATE TABLE doc_storage (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
CREATE TABLE app_assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT, filename TEXT NOT NULL UNIQUE,
    mime_type TEXT NOT NULL, data BLOB NOT NULL, size_bytes INTEGER,
    hash_sha256 TEXT, created_at TEXT DEFAULT (datetime('now'))) STRICT;
CREATE TABLE doc_assets (
    id TEXT PRIMARY KEY, display_name TEXT, belongs_to TEXT, mime_type TEXT NOT NULL,
    size_bytes INTEGER, hash_sha256 TEXT, created_at TEXT DEFAULT (datetime('now'))) STRICT, WITHOUT ROWID;
CREATE TABLE doc_asset_blobs (id TEXT PRIMARY KEY, data BLOB NOT NULL) STRICT;
'''

def now():
    return datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')

def collect(inputs, all_versions=False):
    """-> [(label, html, created_at)]，按输入顺序"""
    pages = []
    for path in inputs:
        ext = os.path.splitext(path)[1].lower()
        if ext == '.capsule':
            con = sqlite3.connect(path)
            meta = dict(con.execute('SELECT key, value FROM app_meta'))
            app_name = meta.get('app_name') or os.path.splitext(os.path.basename(path))[0]
            rows = list(con.execute(
                'SELECT version, html, is_active, created_at FROM app_ui ORDER BY version'))
            con.close()
            if not rows:
                print(f'skip {path}: no versions', file=sys.stderr)
                continue
            if all_versions:
                for ver, html, act, ts in rows:
                    pages.append((f'{app_name} · v{ver}', html, ts))
            else:
                pick = next((r for r in rows if r[2]), rows[-1])
                ver, html, act, ts = pick
                pages.append((f'{app_name} · v{ver}', html, ts))
        elif ext in ('.html', '.htm'):
            html = open(path, encoding='utf-8').read()
            label = os.path.splitext(os.path.basename(path))[0]
            pages.append((label, html, now()))
        else:
            sys.exit(f'unsupported input: {path}（仅支持 .capsule / .html）')
    return pages

def write_capsule(out, name, pages):
    if os.path.exists(out):
        os.remove(out)
    con = sqlite3.connect(out)
    con.execute('PRAGMA application_id = 1128353875;')  # 'CAPS'
    con.executescript(SCHEMA)
    con.execute('CREATE UNIQUE INDEX idx_app_ui_single_active ON app_ui(is_active) WHERE is_active = 1;')
    con.execute('CREATE INDEX idx_doc_assets_belongs_to ON doc_assets(belongs_to);')
    ts = now()
    con.execute("INSERT INTO app_meta VALUES ('app_name', ?)", (name,))
    con.execute("INSERT INTO app_meta VALUES ('app_version', '1.0.0')")
    con.execute("INSERT INTO app_meta VALUES ('schema_version', '9')")
    con.execute("INSERT INTO app_meta VALUES ('created_at', ?)", (ts,))
    con.execute("INSERT INTO app_meta VALUES ('updated_at', ?)", (ts,))
    return con, ts

def write_capsule_multiversion(out, name, pages):
    """多版本：每页一个 version（供 viewer / 二次编辑）"""
    con, ts = write_capsule(out, name, pages)
    con.execute("INSERT INTO app_meta VALUES ('ui_version', ?)", (str(len(pages)),))
    for i, (label, html, created) in enumerate(pages, 1):
        con.execute('INSERT INTO app_ui (version, html, source_bundle, created_at, is_active)'
                    ' VALUES (?,?,?,?,?)',
                    (i, html, f'merge:{label}', created, 1 if i == 1 else 0))
    con.commit()
    ok = con.execute('PRAGMA integrity_check').fetchone()[0]
    con.close()
    print(f'capsule: {out}（{len(pages)} 个版本，integrity={ok}）')

FWD_JS = ('<script>document.addEventListener("keydown",function(e){'
          'try{parent.postMessage({__flip:e.key},"*");}catch(_){}});</script>')

def build_bound_html(pages, title):
    """合订本：全部页面内嵌进单个 HTML，自带翻页条 + PPT 式键盘"""
    import re as _re, json as _json, html as _html
    items = []
    for label, html, _ in pages:
        if not html:
            continue
        if _re.search(r'</body\s*>', html, _re.I):
            html = _re.sub(r'</body\s*>', FWD_JS + '</body>', html, count=1, flags=_re.I)
        else:
            html += FWD_JS
        items.append({'label': label, 'html': html})
    if not items:
        return None
    # < 转义为 \u003c，防止 </script> 截断
    json_str = _json.dumps(items, ensure_ascii=False).replace('<', '\\u003c')
    esc = _html.escape(title, quote=True)
    return f'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc}</title>
<style>
html,body{{margin:0;height:100%;overflow:hidden;font-family:system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;}}
#bar{{position:fixed;top:0;left:0;right:0;height:46px;display:flex;align-items:center;gap:8px;padding:0 12px;background:#111827;color:#f9fafb;font-size:14px;z-index:10;overflow-x:auto;white-space:nowrap;-webkit-overflow-scrolling:touch;}}
#bar button{{background:#1f2937;color:#f9fafb;border:1px solid #374151;border-radius:6px;padding:5px 10px;font-size:14px;cursor:pointer;flex-shrink:0;}}
#bar button:active{{background:#374151;}}
#pg{{color:#9ca3af;flex-shrink:0;}}#label{{color:#d1d5db;overflow:hidden;text-overflow:ellipsis;}}
#frame{{position:fixed;top:46px;left:0;width:100%;height:calc(100% - 46px);border:0;background:#fff;}}
</style>
</head>
<body>
<div id="bar"><button id="bFirst" title="第一页 (Home)">&#9198;</button><button id="bPrev" title="上一页 (&#8592;/&#8593;)">&#9664;</button><span id="pg"></span><button id="bNext" title="下一页 (&#8594;/&#8595;/空格)">&#9654;</button><button id="bLast" title="最后一页 (End)">&#9197;</button><span id="label"></span></div>
<iframe id="frame" title="page"></iframe>
<script>
var PAGES={json_str};
var cur=0;
function show(i){{if(i<0||i>=PAGES.length)return;cur=i;document.getElementById("frame").srcdoc=PAGES[i].html;document.getElementById("pg").textContent=(i+1)+" / "+PAGES.length;document.getElementById("label").textContent=PAGES[i].label;}}
function step(d){{var n=cur+d;if(n<0||n>=PAGES.length)return;show(n);}}
function flipKey(k){{if(k==="ArrowRight"||k==="ArrowDown"||k===" "||k==="PageDown"||k==="Enter"){{step(1);}}else if(k==="ArrowLeft"||k==="ArrowUp"||k==="PageUp"){{step(-1);}}else if(k==="Home"){{show(0);}}else if(k==="End"){{show(PAGES.length-1);}}}}
document.getElementById("bFirst").onclick=function(){{show(0);}};
document.getElementById("bPrev").onclick=function(){{step(-1);}};
document.getElementById("bNext").onclick=function(){{step(1);}};
document.getElementById("bLast").onclick=function(){{show(PAGES.length-1);}};
document.addEventListener("keydown",function(e){{var t=e.target&&e.target.tagName;if(t==="BUTTON"&&(e.key===" "||e.key==="Enter"))return;flipKey(e.key);}});
window.addEventListener("message",function(e){{if(e.data&&e.data.__flip)flipKey(e.data.__flip);}});
show(0);
</script>
</body>
</html>'''

def write_capsule_bound(out, name, pages):
    """合订本：单个版本，翻页功能内嵌在 HTML 里，任何 capsule 渲染器打开都能翻页"""
    con, ts = write_capsule(out, name + ' · 合订本', pages)
    con.execute("INSERT INTO app_meta VALUES ('ui_version', '1')")
    bound = build_bound_html(pages, name + ' · 合订本')
    if not bound:
        sys.exit('没有可导出的页面')
    con.execute('INSERT INTO app_ui (version, html, source_bundle, created_at, is_active)'
                ' VALUES (?,?,?,?,?)',
                (1, bound, f'bound:{len(pages)}页合订本', ts, 1))
    con.commit()
    ok = con.execute('PRAGMA integrity_check').fetchone()[0]
    con.close()
    print(f'capsule: {out}（合订本单版本，integrity={ok}）')

def write_html(out, title, pages):
    embedded = [{'label': label, 'html': html} for label, html, _ in pages]
    html = build_viewer(embedded_pages=embedded)
    html = html.replace('<title>capsule viewer</title>', f'<title>{title}</title>')
    open(out, 'w', encoding='utf-8').write(html)
    print(f'html: {out}（{len(pages)} 页，{os.path.getsize(out)} bytes）')

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('inputs', nargs='+', help='.capsule / .html 文件，按顺序合并')
    ap.add_argument('--all-versions', action='store_true', help='capsule 取全部版本（默认只取 active 版）')
    ap.add_argument('--capsule-out', help='输出合并后的 .capsule')
    ap.add_argument('--bound', action='store_true',
                    help='合订本模式：--capsule-out 输出单个版本，翻页功能内嵌在 HTML 里（第三方 capsule 应用可直接翻页）；默认多版本模式')
    ap.add_argument('--html-out', help='输出合并后的单个 .html')
    ap.add_argument('--name', default='', help='合并 capsule 的 app_name')
    ap.add_argument('--title', default='合并文档', help='合并 HTML 的标题')
    a = ap.parse_args()
    if not a.capsule_out and not a.html_out:
        sys.exit('请指定 --capsule-out 或 --html-out（可同时指定）')

    pages = collect(a.inputs, a.all_versions)
    if not pages:
        sys.exit('没有可用页面')
    print(f'共 {len(pages)} 页：')
    for i, (label, _, _) in enumerate(pages, 1):
        print(f'  {i}. {label}')

    if a.capsule_out:
        name = a.name or f"合并文档（{len(pages)}页）"
        if a.bound:
            write_capsule_bound(a.capsule_out, name, pages)
        else:
            write_capsule_multiversion(a.capsule_out, name, pages)
    if a.html_out:
        write_html(a.html_out, a.title, pages)

if __name__ == '__main__':
    main()
