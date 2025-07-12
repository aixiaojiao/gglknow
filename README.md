# Twitter推文收藏器 Chrome插件

一个简单易用的Chrome浏览器插件，用于在Twitter/X推文旁边添加收藏按钮，一键保存推文到本地。

## 功能特点

- 🐦 **一键收藏**: 在每条推文旁添加收藏按钮
- 📁 **本地保存**: 将推文完整保存到用户指定的本地文件夹
- 🎨 **多种格式**: 支持JSON、HTML、Markdown三种保存格式
- 🖼️ **媒体下载**: 自动下载推文中的图片和视频
- ⚡ **实时更新**: 自动适配新发布的推文
- 🌙 **深色模式**: 完美适配Twitter的深色主题
- 📖 **本地浏览器**: 内置推文浏览器，可批量查看和管理收藏的推文
- 🔍 **搜索筛选**: 支持按内容、用户名搜索，按图片、时间筛选

## 安装与使用

### 1. 安装

由于此扩展尚未发布到 Chrome 网上应用店，您需要通过开发者模式进行安装。

1.  **克隆或下载代码**:
    ```bash
    git clone https://github.com/your-repo/gglknow.git
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