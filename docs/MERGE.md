# 文档合并（MERGE）

`tools/merge.py` 把多个文档按顺序合并为**单个输出**，输入同时支持 `.capsule` 和 `.html`。

```bash
# 合并为单个 capsule（版本化）
python3 tools/merge.py a.capsule b.html --capsule-out merged.capsule --name "AI合集"

# 合并为单个 HTML（浏览器直接打开）
python3 tools/merge.py a.capsule b.html --html-out merged.html --title "AI合集"

# capsule 取全部版本（默认只取 active 版）；两个输出可同时指定
python3 tools/merge.py a.capsule --all-versions --capsule-out m.capsule --html-out m.html
```

## 输入差异

| 输入类型 | 取页规则 | 页面标签示例 |
|---|---|---|
| `.capsule` | 默认取 active 版本；`--all-versions` 取全部版本（从旧到新） | `FY26 AI能力建设 · v2` |
| `.html` | 整个文件作为一页 | `SJN_学习型组织_单页关系图_中文版`（文件名去扩展名） |

页面顺序 = 命令行输入顺序。

## 输出差异：`--capsule-out` vs `--html-out`

| 维度 | 合并为 capsule | 合并为单个 HTML |
|---|---|---|
| 文件本质 | SQLite 数据库，纯数据 | 自包含网页（viewer 外壳 + 内嵌页面） |
| 体积 | 小（约等于各页面 HTML 之和） | 大（+约 880KB viewer/sql.js 底） |
| 打开方式 | 需要 viewer（双文件版：viewer.html + merged.capsule） | 任意浏览器直接打开，无需其他文件 |
| 页面组织 | 版本化（v1…vN，v1 为 active） | 扁平内嵌页（照样翻页/换肤/下拉直选） |
| 二次编辑 | ✅ `capsule.py add/export` 可继续版本化修改 | ❌ 内容改了要重新合并 |
| 再合并 | ✅ 可作为下一次合并的输入 | ⚠️ 可作为输入（当作普通 HTML 页） |
| 主题框架 | ✅ 通用 | ✅ 通用 |
| 适用场景 | 归档、可继续编辑的源文件 | 微信/邮件分发、汇报演示 |

**一句话：要继续改 → 合成 capsule；要发出去给人看 → 合成 HTML。**

## viewer 内直接合并导出

viewer 工具栏新增两个按钮（对当前加载的**所有页面**按当前顺序操作）：

- **⤓ 导出capsule**：合订本单版本——全部页面内嵌进一个 HTML（v1/active），自带翻页条 ⏮◀▶⏭＋PPT 式键盘（空格/方向键/PageUp/PageDown/回车/Home/End，焦点在页面内时通过 postMessage 转发），任何 capsule 渲染器打开都能翻页
 （浏览器内 sql.js 构建完整 schema：8 表 STRICT/WITHOUT ROWID、`application_id='CAPS'`、单 active 部分唯一索引）
- **⤓ 导出HTML**：把当前文档序列化并注入合并后的内嵌页面，下载 `merged.html`
 （单文件，浏览器直接打开；JSON 中的 `<` 转义为 `\u003c` 防止截断 script）

## 实现说明

- `--html-out` 复用 viewer 外壳，通过 `__EMBEDDED_PAGES__` 内嵌 `[{label, html}]`，
  viewer 检测到内嵌页面后跳过 sql.js，直接渲染（`src/app.js` 的 `embeddedPages` 分支）。
  内嵌模式下仍可通过「选择 capsule 文件」追加外部 capsule 页面。
- `--capsule-out` 生成标准 capsule 结构（与 `tools/capsule.py` 兼容），`integrity_check` 通过。
