#!/usr/bin/env python3
"""capsule (*.capsule, SQLite) 读写工具：版本化写入，不破坏历史。

用法：
    python3 tools/capsule.py info app.capsule            # 基本信息
    python3 tools/capsule.py ls app.capsule               # 列出 UI 版本
    python3 tools/capsule.py add app.capsule page.html    # 写入新版本（旧版本自动 deactivate）
    python3 tools/capsule.py export app.capsule --version 2 --out page.html
"""
import argparse, datetime, os, shutil, sqlite3, sys

def connect(path):
    if not os.path.exists(path):
        sys.exit('file not found: ' + path)
    con = sqlite3.connect(path)
    con.execute('PRAGMA integrity_check')
    return con

def cmd_info(path):
    con = connect(path)
    meta = dict(con.execute('SELECT key, value FROM app_meta'))
    n_ver = con.execute('SELECT count(*) FROM app_ui').fetchone()[0]
    n_assets = con.execute('SELECT count(*) FROM app_assets').fetchone()[0]
    print('app_name   :', meta.get('app_name'))
    print('app_version:', meta.get('app_version'), '| ui_version:', meta.get('ui_version'))
    print('updated_at :', meta.get('updated_at'))
    print('ui versions:', n_ver, '| assets:', n_assets)
    print('integrity  :', con.execute('PRAGMA integrity_check').fetchone()[0])

def cmd_ls(path):
    con = connect(path)
    for v, act, ts, ln in con.execute(
            'SELECT version, is_active, created_at, length(html) FROM app_ui ORDER BY version'):
        print(f"v{v}  {'ACTIVE' if act else '      '}  {ts}  {ln} bytes")

def cmd_add(path, html_path, bundle=''):
    con = connect(path)
    html = open(html_path, encoding='utf-8').read()
    now = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    cur = con.cursor()
    cur.execute('UPDATE app_ui SET is_active=0 WHERE is_active=1')
    nxt = (cur.execute('SELECT max(version) FROM app_ui').fetchone()[0] or 0) + 1
    cur.execute('INSERT INTO app_ui (version, html, source_bundle, created_at, is_active)'
                ' VALUES (?,?,?,?,1)', (nxt, html, bundle, now))
    cur.execute("UPDATE app_meta SET value=? WHERE key='ui_version'", (str(nxt),))
    cur.execute("UPDATE app_meta SET value=? WHERE key='updated_at'", (now,))
    # app_version 主版本跟随 ui 大版本
    cur.execute("UPDATE app_meta SET value=? WHERE key='app_version'", (f'{nxt}.0.0',))
    con.commit()
    print(f'added v{nxt} from {html_path} (previous versions kept)')

def cmd_export(path, version, out):
    con = connect(path)
    row = con.execute('SELECT html FROM app_ui WHERE version=?', (version,)).fetchone()
    if not row:
        sys.exit('version not found: ' + str(version))
    open(out, 'w', encoding='utf-8').write(row[0])
    print(f'exported v{version} -> {out} ({len(row[0])} bytes)')

def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest='cmd', required=True)
    p = sub.add_parser('info'); p.add_argument('capsule')
    p = sub.add_parser('ls'); p.add_argument('capsule')
    p = sub.add_parser('add'); p.add_argument('capsule'); p.add_argument('html'); p.add_argument('--bundle', default='')
    p = sub.add_parser('export'); p.add_argument('capsule'); p.add_argument('--version', type=int, required=True); p.add_argument('--out', required=True)
    a = ap.parse_args()
    if a.cmd == 'info': cmd_info(a.capsule)
    elif a.cmd == 'ls': cmd_ls(a.capsule)
    elif a.cmd == 'add': cmd_add(a.capsule, a.html, a.bundle)
    elif a.cmd == 'export': cmd_export(a.capsule, a.version, a.out)

if __name__ == '__main__':
    main()
