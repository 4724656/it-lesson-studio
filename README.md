# 🎓 IT Lesson Studio (浙教版2026中小学信息科技备课工坊)

> 课文内容一次输入，自动同源合成 4 份成套教学资源：  
> **4页A4公文教案 · 严格单面导学单 · Marp 16:9纯净课件 · 离线单文件互动作业**

---

## 🌟 四大成套产物

- 📄 **备课教案 (`.docx`)**：严格 ≤4 页 A4，首行缩进两格公文精排，无板书，含生活通俗比喻、启发设问台词与实操避坑三支架。
- 📋 **探究导学单 (`.docx`)**：学生第一视角趣味任务口令，低学段严格单面 A4 封顶（杜绝跨页），含显式留白槽位与微型记录表。
- 🖥️ **演示课件 (`.pptx` / `.pdf`)**：Marp 16:9 现代大屏卡片主题，纯净学生视角，大字号、沉浸导学。
- 🎮 **随堂作业 (`.html`)**：单文件离线断网秒开，含微型仿真器、随堂测验与通关奖状，一键极简下载凭单直传教学平台。

---

## 🚀 运行方式

### 方式 1：Windows 绿色免安装单机便携版（推荐一线教师个人使用）

便携包已自包含精简版 Node.js、Pandoc 与 Python 公文精排引擎，**无需安装任何编程开发环境**：

1. 解压便携包，双击目录下的 **`启动备课工坊.bat`**；
2. 浏览器将自动打开 `http://localhost:3800`；
3. 首次使用点击右上角 **【AI 引擎】** 填入 API Key（支持 DeepSeek 官方、阿里云百炼或自定义兼容端点）即可一键备课。

#### ☁️ 方式 A：GitHub Actions 云端全自动打包（强烈推荐配置较低的电脑）
无需在本机安装任何工具或消耗电脑资源：
1. 访问 GitHub 仓库页面，点击顶部 **Actions** 标签；
2. 在左侧选择 **Build Windows Portable Package** 工作流，点击右上角 **Run workflow** 按钮；
3. GitHub 云端自动化服务器将自动完成依赖安装、运行时注入与压缩打包（约 2 分钟）；
4. 构建完成后，在页面下方的 **Artifacts** 区域即可一键秒级下载便携版压缩包！

#### 📦 方式 B：本地一键构建便携包
如需基于当前源码制作免安装便携版：
```bash
npm run build:portable
# 产物输出至 dist/IT-Lesson-Studio-便携版/ 与 dist/IT-Lesson-Studio-便携版.zip
```

---

### 方式 2：Docker 容器化启动（推荐学校/教研组集中部署 · 免本地编译）

```bash
# 1. 一键拉取云端已构建镜像（免去本地 5~10 分钟漫长编译）：
docker compose pull
# 或使用提供的管理脚本：
./scripts/build-docker.sh

# 2. 秒级启动服务：
docker compose up -d
```
打开浏览器访问：`http://localhost:3800`

> 💡 **云端自动化构建**：主分支每次更新，GitHub Actions 均会自动构建最新镜像并推送到 `ghcr.io/4724656/it-lesson-studio:latest`。您也可以运行 `./scripts/build-docker.sh --cloud` 随时触发云端重新打包。

---

### 方式 3：开发者本地直接运行 (Node.js >= 20)

```bash
# 安装依赖
npm install

# 以热重载开发模式启动 Web 工作台
npm run web:dev
```
打开浏览器访问：`http://127.0.0.1:3800`

---

## ⚙️ 核心参数与配置说明

系统采用**开箱即用**设计，默认启动即可自动运行。若需自定义，可在环境变量或 `.env` 中声明：

| 参数名 | 默认值 | 作用说明 | 配置建议 |
| :--- | :--- | :--- | :--- |
| `APP_MODE` | `standalone` (原生) / `team` (Docker) | 运行模式：`standalone` 单机免登录，`team` 团队多用户登录 | 便携版默认为 `standalone`，容器默认为 `team` |
| `PORT` | `3800` | Web 界面与 API 监听端口 | 宿主机按需映射即可 |
| `INVITE_CODE` | `ZJ2026` | 教师注册专属邀请码（仅团队模式） | 首位注册用户自动成为超管免邀请码；管理员可在后台修改 |
| `JWT_SECRET` | 首次运行自动生成 | 登录 Token 鉴权签名密钥（仅团队模式） | 每台部署首次启动自动生成 256 位安全随机密钥并持久化于 SQLite（容器重启不失效）；多机集群时可显式配置统一密钥 |
| `AI_API_BASE` | `https://api.deepseek.com/v1` | 大模型 API 端点 (OpenAI 兼容) | 可在网页端随时修改，优先级高于环境变量 |
| `AI_API_KEY` | *(留空)* | 大模型 API 密钥 | 可在网页端输入，持久化保存在本地 SQLite |
| `AI_MODEL` | `deepseek-chat` | 生成四件套使用的大模型名称 | 支持任意 OpenAI 兼容模型（如 DeepSeek、通义千问等） |
| `./web/data` | *(挂载/本地目录)* | 数据持久化存储目录 | 存放用户账号、SQLite 数据库 (`studio.db`) 以及生成的全套课件与打包文件 |

---

## 🛠️ CLI 常用命令

```bash
# 一键编译导出指定课例（生成 Word / PPT / PDF）
npm run export:lesson examples/三年级上/第02课_了解智能工具/

# 课例合规自动化质检（新课标规范与同源性门禁）
npm run check:lesson examples/三年级上/第02课_了解智能工具/

# 单元测试
npm test
```

---

## 📄 关联文档与开源许可

- **AI 助手接手上下文与开发规范**：👉 [AGENTS.md](AGENTS.md)
- **开源许可**：MIT License
