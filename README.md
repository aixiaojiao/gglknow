# Twitter推文收藏器 Chrome插件

一个简单易用的Chrome浏览器插件，用于在Twitter/X推文旁边添加收藏按钮，一键保存推文到本地。

## 功能特点

### 下载与 Obsidian
- 用户点击后保存当前页面已经加载的正文，支持普通推文、长文章和本页推文串。
- 导出 HTML、JSON、Markdown，保留换行、段落、列表、表格和文中图片顺序。
- Markdown 包含 Obsidian Properties：`title`、`type`、`source`、`author`、`author_handle`、`url`、`created`、`captured`、`published`、`tags`、`capture_scope`。
- 将整篇收藏目录（Markdown 和 `media` 子目录）一起移入 Obsidian 仓库，图片使用相对路径。只导出 Markdown 时，仍需保留原 `media` 目录。
- 下载路径相对于 Chrome 默认下载目录，例如 `Twitter`，不需要重复写 `Downloads/`。

### 本地阅读器
- 基于 [Tabler](https://github.com/tabler/tabler) 的三栏阅读界面，搜索正文、作者和标签，按作者、标签、收藏夹、图片和推文串筛选。
- 导入新旧 HTML / JSON 收藏，重复格式只显示一篇；图片从所选目录读取。
- 标签和收藏夹存于当前浏览器，支持两种旧版备份格式；刷新页面后需重新选择收藏文件夹。

### 收藏边界
- 不自动翻页、滚动、展开正文、轮询或调用 X 私有接口。正文折叠时先由用户手动展开。
- 全部标签页共享 5 秒收藏间隔，同一时间只允许一个保存任务；单次最多 25 条已加载推文、50 张图片；图片下载并发为 2。
- 推文串明确标注“仅本页已加载”，不保证覆盖未加载或被虚拟滚动移除的内容。
- 视频下载暂不支持。平台规则和页面结构可能变化；限频不能保证账号不会被限制。请遵守 [X 自动化规则](https://help.x.com/en/rules-and-policies/x-automation)。

## 安装与使用

### 1. 安装

商店已有公开版本。以下步骤用于本地测试版；生产更新需要经过 PR 审阅及商店审核。

1.  **克隆或下载代码**:
    ```bash
    git clone https://github.com/aixiaojiao/gglknow.git
    cd gglknow
    ```
2.  **安装依赖**:
    需要 [Node.js](https://nodejs.org/) (v18 或更高版本)。
    ```bash
    npm install
    ```
3.  **构建项目**:
    此命令会编译 TypeScript 代码、打包文件，并将所有必要的资源复制到 `dist` 目录中。
    ```bash
    npm run build
    ```
4.  **加载扩展**:
    - 打开 Chrome 浏览器，访问 `chrome://extensions/`。
    - 开启右上角的 **“开发者模式”**。
    - 点击 **“加载已解压的扩展程序”**。
    - 选择项目根目录下的 `dist` 文件夹。
    - 插件安装完成！

### 2. 使用

1.  **配置设置**:
    - 点击浏览器工具栏中的插件图标，打开设置弹窗。
    - 首次使用时，请务必设置一个用于保存推文的 **“保存路径”**。
    - 根据需要选择保存格式、是否下载媒体文件等。
2.  **收藏推文**:
    - 访问 Twitter/X 网站，在任意推文下方即可看到新增的 **“收藏”** 按钮。
    - 点击按钮，推文及其媒体文件将根据您的设置自动下载到指定路径。
3.  **浏览收藏**:
    - 点击插件弹窗中的 **“打开推文浏览器”**，即可查看和管理已保存的推文。

## 开发说明

### 技术栈

- **Manifest V3**
- **TypeScript**
- **Vite** & **Rollup** (用于构建)
- **Node.js**
- Chrome Extension APIs
- CSS3

### 项目结构

项目源代码位于 `src` 目录，并被构建到 `dist` 目录中。

```
gglknow/
├── dist/                # 构建输出目录 (加载到Chrome)
├── src/                 # 源代码
│   ├── background/      # 后台服务脚本 (Service Worker)
│   ├── content/         # 内容脚本 (注入到页面)
│   ├── popup/           # 弹出窗口UI
│   ├── types/           # TypeScript 类型定义
│   └── utils/           # 通用工具函数
├── package.json         # 项目依赖与脚本
├── manifest.json        # 扩展清单文件
├── tsconfig.json        # TypeScript 配置文件
├── rollup.sw.config.js  # Rollup 后台脚本配置
├── rollup.popup.config.js # Rollup 弹窗脚本配置
└── rollup.content.config.js # Rollup 内容脚本配置
```

### 开发脚本

- `npm run dev`: 启动 Vite 开发服务器（主要用于 UI 开发）。
- `npm run build`: 执行完整的生产构建。
- `npm run lint`: 检查代码风格。
- `npm run type-check`: 进行 TypeScript 类型检查。

## 更新日志

详细的更新历史请查看 [CHANGELOG.md](CHANGELOG.md)。

## 贡献

欢迎通过提交 Issue 和 Pull Request 来为项目做出贡献！

## 许可证

[MIT License](LICENSE)