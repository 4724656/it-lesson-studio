# 🎓 IT Lesson Studio Web 工作台

专为中小学信息科技教研组设计的轻量备课 Web 应用。
输入教学内容，一键全自动生成四位一体教学资料（教案 Word、导学单 Word、课件 PPTX/PDF、随堂互动作业 HTML），开箱即用。

---

## 🌟 核心特性

- **极简界面**：下拉选年级、点选或输入课题，一键自动流式生成；
- **四位一体同源闭环**：基于特级教师 Master Skill，讲、学、做、评强咬合；
- **教研组私有保护**：支持注册邀请码（防外人滥刷 Token），数据基于纯单文件 SQLite，零外部数据库依赖；
- **一键打包交付**：支持单项下载（.docx / .pptx / .pdf / .html）或一键打包下载全部 ZIP 资源包；
- **在线试玩**：随堂单文件 HTML 作业支持直接在浏览器中打开试玩。

---

## 🚀 部署与运行方式

### 方式一：Docker 容器化部署（推荐，适用于 99 服务器或 NAS）

在包含 Docker 的服务器（如 99 主机）上：

```bash
# 1. 启动服务（自动构建并挂载持久化目录）
docker compose up -d --build

# 2. 查看日志
docker compose logs -f
```

服务将监听在 `http://<服务器IP>:3800`。
数据（用户数据库与生成的资料）将持久保存在 `./web/data` 目录。

### 方式二：本地直接运行 (Node 22+)

```bash
# 1. 安装 Web 依赖
cd web
npm install

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env 中的 AI_API_BASE、AI_API_KEY 与 INVITE_CODE

# 3. 启动服务
node server.js
```

---

## ⚙️ 环境变量说明 (`.env`)

| 变量名 | 说明 | 默认值 |
| :--- | :--- | :--- |
| `PORT` | Web 服务监听端口 | `3800` |
| `INVITE_CODE` | 教研组注册专属邀请码 | `ZJ2026` |
| `JWT_SECRET` | 登录令牌密钥 | 自定义随机字符串 |
| `AI_API_BASE` | 大模型 API 端点 (OpenAI 兼容) | `https://api.openai.com/v1` |
| `AI_API_KEY` | 大模型 API Key | `sk-your-key-here` |
| `AI_MODEL` | 调用的大模型代号 | `gpt-4o-mini` / `deepseek-chat` / `gemini-2.5-flash` |
