# 主题框架（THEMING）

capsule-viewer 的主题 = **调色映射**，在渲染前对 capsule HTML 做字符串级颜色替换。
因此主题对**已打包的旧版本内容同样生效**，无需重新生成 capsule。

## 主题文件格式（`themes/*.json`）

```jsonc
{
  "id": "nord",                    // 唯一标识
  "name": "Nord 极夜",             // 显示名
  "dark": true,                    // 是否深色
  "source": "https://github.com/arcticicestudio/nord",  // 配色出处
  "description": "…",
  "chrome": {                      // viewer 工具栏 CSS 变量
    "--bar-bg": "#2e3440",
    "--bar-fg": "#eceff4",
    "--bar-muted": "#d8dee9",
    "--bar-btn-bg": "#3b4252",
    "--bar-border": "#4c566a",
    "--bar-danger": "#bf616a"
  },
  "remap": {                       // 内容调色：旧 hex -> 新 hex
    "#f1f5f9": "#2e3440",
    "#2563eb": "#88c0d0"
  }
}
```

## 替换规则（`applyRemap`）

1. 按 key 长度**降序**替换，避免 `#fff` 误伤 `#ffffff`；
2. 大小写不敏感（内容里混有 `#111827` / `#374151` 大写写法）；
3. `#fff` 这类短 key 带负前瞻 `(?![0-9a-fA-F])`，不会吞掉更长的 hex；
4. `default` 主题的 `remap` 为空 = 原样渲染。

## 新增主题

1. 在 `themes/` 下新建 `<id>.json`（参考 `nord.json`）；
2. `python3 tools/build.py` 重新构建；
3. viewer 工具栏的主题下拉框会自动出现新主题；选择后即时换肤，选择记忆在 `localStorage`。

## 内容作者约定

想让主题对你的 capsule 页生效，HTML 请使用**标准调色板**里的 hex（`tools/build.py` 不做校验，只做替换）：

页面：`#f1f5f9` 背景、`#f8fafc` 横幅、`#ffffff`/`#fff` 卡片、
`#e5e7eb` `#d1d5db` `#e2e8f0` 边框、`#111827` `#4b5563` `#6b7280` `#374151` 文字、
`#f3f4f6` 标签底。

五阶段色（主 / 浅底 / 深字）：
蓝 `#2563eb` `#dbeafe` `#1e40af`、
青 `#0d9488` `#ccfbf1` `#0f766e`、
紫 `#7c3aed` `#ede9fe` `#5b21b6`、
橙 `#ea580c` `#ffedd5` `#9a3412`、
玫 `#e11d48` `#ffe4e6` `#9f1239`。

深色主题的惯例映射：浅底 → 深面色、深字 → 亮点缀色，主色 → 亮点缀色，保证对比度。
