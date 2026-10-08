#!/usr/bin/env python3
"""构建 capsule-viewer 发行文件。

用法：
    python3 tools/build.py
        构建 dist/capsule_viewer.html（双文件 viewer：viewer.html + .capsule 同目录）

    python3 tools/build.py --capsule path/to/app.capsule --singlefile dist/app_发布版.html
        构建单文件发布版（viewer + sql.js + capsule 全部内嵌，一个 HTML 走天下）
"""
import argparse, base64, json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def read(p):
    with open(os.path.join(ROOT, p), encoding='utf-8') as f:
        return f.read()

def load_themes():
    tdir = os.path.join(ROOT, 'themes')
    themes = []
    for fn in sorted(os.listdir(tdir)):
        if fn.endswith('.json'):
            themes.append(json.load(open(os.path.join(tdir, fn), encoding='utf-8')))
    # default 永远排第一
    themes.sort(key=lambda t: (t['id'] != 'default', t['id']))
    return themes

def wasm_bytes():
    p = os.path.join(ROOT, 'src/vendor/sql-wasm.wasm')
    if os.path.exists(p):
        return open(p, 'rb').read()
    # 缺失时从 CDN 下载（sql.js MIT License）
    import urllib.request
    url = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/sql-wasm.wasm'
    print('downloading sql-wasm.wasm from CDN...')
    data = urllib.request.urlopen(url, timeout=60).read()
    assert data[:4] == b'\0asm', 'bad wasm download'
    open(p, 'wb').write(data)
    return data

def build_viewer(embedded_pages=None):
    tpl = read('src/template.html')
    app_js = read('src/app.js')
    sql_js = read('src/vendor/sql-wasm.js')
    wasm_b64 = base64.b64encode(wasm_bytes()).decode()
    themes = load_themes()
    app_js = app_js.replace('__THEMES__', json.dumps(themes, ensure_ascii=False))
    app_js = app_js.replace('__EMBEDDED_PAGES__',
                            json.dumps(embedded_pages, ensure_ascii=False) if embedded_pages else 'null')
    # app.js 内不允许出现字面的 </script>，否则 HTML 解析会提前截断 script 块
    assert '</script' not in app_js.lower(), 'app.js contains literal </script>'
    html = tpl.replace('__SQLJS__', sql_js).replace('__APP_JS__', app_js).replace('__WASM_B64__', wasm_b64)
    assert '__SQLJS__' not in html and '__APP_JS__' not in html and '__WASM_B64__' not in html
    assert '__THEMES__' not in html and '__EMBEDDED_PAGES__' not in html
    return html

def build_singlefile(capsule_path):
    """单文件发布版：读取 capsule 的全部版本，转为内嵌页面后构建。"""
    import sqlite3
    con = sqlite3.connect(capsule_path)
    meta = dict(con.execute('SELECT key, value FROM app_meta'))
    app_name = meta.get('app_name') or os.path.splitext(os.path.basename(capsule_path))[0]
    rows = list(con.execute(
        'SELECT version, html, is_active, created_at FROM app_ui ORDER BY version'))
    con.close()
    if not rows:
        raise SystemExit('capsule 中没有可用版本：' + capsule_path)
    embedded = [{'label': f"{app_name} · v{ver}{'（当前）' if act else ''}",
                 'html': html, 'ts': ts}
                for ver, html, act, ts in rows]
    html = build_viewer(embedded_pages=embedded)
    html = html.replace('<title>capsule viewer</title>',
                        f'<title>{app_name} · capsule 发布版</title>')
    return html

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--capsule', help='capsule 文件路径（用于单文件版：内嵌其全部版本）')
    ap.add_argument('--singlefile', help='单文件版输出路径')
    ap.add_argument('--out', default='dist/capsule_viewer.html', help='viewer 输出路径')
    args = ap.parse_args()

    os.makedirs(os.path.join(ROOT, 'dist'), exist_ok=True)
    html = build_viewer()
    out = os.path.join(ROOT, args.out)
    open(out, 'w', encoding='utf-8').write(html)
    print('viewer:', out, os.path.getsize(out), 'bytes')

    if args.capsule and args.singlefile:
        single = build_singlefile(args.capsule)
        sout = os.path.join(ROOT, args.singlefile)
        open(sout, 'w', encoding='utf-8').write(single)
        print('singlefile:', sout, os.path.getsize(sout), 'bytes')

if __name__ == '__main__':
    main()
