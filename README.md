# capsule-viewer

浏览器里直接打开、翻页、换肤的 **`.capsule`（SQLite 便携包）查看器**。

- 📦 读取 `.capsule`（SQLite via sql.js/WASM，离线可用）
- 📄 多文件多选 → 按"文件顺序 × 版本从旧到新"组成统一翻页序列，平衡翻页
- ⏮ ◀ ▶ ⏭ 第一页/上一页/下一页/最后一页按钮、PPT 式键盘（→/↓/空格/PageDown/回车=下一页，←/↑/PageUp=上一页，Home/End=首/末页）、下拉直选，滑动淡入淡出
- 🎨 主题框架：工具栏选择主题即时换肤（调色映射，对旧版本内容同样生效）
- 单文件发布版：一整个 viewer+数据打进一个 HTML，微信/企业微信单文件分发

## 目录结构

```
capsule-viewer/
├── src/
│   ├── template.html      # viewer 页面模板（__APP_JS__ / __SQLJS__ / __WASM_B64__ 占位）
│   └── vendor/            # sql.js（sql-wasm.wasm 缺失时构建脚本自动从 cdnjs 下载）
│   ├── app.js             # viewer 业务逻辑（__THEMES__ 占位）
│   └── vendor/            # sql.js（MIT License）
├── themes/                # 主题 JSON（default / nord / catppuccin-mocha / catppuccin-latte）
├── tools/
│   ├── build.py           # 构建 dist/
│   ├── capsule.py         # capsule 读写：info / ls / add（版本化写入）/ export
│   └── merge.py           # 合并多个 .capsule/.html → 单个 .capsule 或单个 .html
├── docs/
│   ├── THEMING.md         # 主题框架说明
│   └── MERGE.md           # 合并功能与两种输出的差异对比
└── dist/                  # 构建产物（gitignored）
```

## 构建

```bash
python3 tools/build.py
# dist/capsule_viewer.html —— 双文件 viewer（与 .capsule 放同目录，浏览器打开即看）

python3 tools/build.py --capsule app.capsule --singlefile dist/app_发布版.html
# 单文件发布版（viewer + sql.js + capsule 全内嵌）
```

## capsule 工具

```bash
python3 tools/capsule.py info app.capsule
python3 tools/capsule.py ls app.capsule
python3 tools/capsule.py add app.capsule page.html --bundle build_x.py   # 写新版本，历史保留
python3 tools/capsule.py export app.capsule --version 2 --out page.html
```

## 合并文档

```bash
# 多个 .capsule/.html 按顺序合并；输出二选一（可同时）
python3 tools/merge.py a.capsule b.html --capsule-out merged.capsule  # 版本化，可继续编辑
python3 tools/merge.py a.capsule b.html --html-out merged.html        # 单文件，浏览器直接打开
```

两种输出的差异对比见 `docs/MERGE.md`。一句话：要继续改 → 合成 capsule；要发出去给人看 → 合成 HTML。

## 主题

`themes/` 下每个 JSON 是一个主题（调色映射 + 工具栏配色），构建时自动内嵌，
viewer 工具栏下拉选择即时生效，选择记在 localStorage。新增主题只需加 JSON
并重新构建，详见 `docs/THEMING.md`。

内置主题配色来源：
- Nord：https://github.com/arcticicestudio/nord
- Catppuccin：https://github.com/catppuccin/catppuccin

## 使用场景

- **Obsidian**：vault 里放 viewer + capsule，md 笔记里 `<iframe src="capsule_viewer.html">`
- **OneDrive**：客户端同步到本地，浏览器打开 viewer，手动选择 capsule 文件
- **企业微信/微信**：用单文件发布版，一个 HTML 发出去，打开即看
