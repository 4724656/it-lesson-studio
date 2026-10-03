FROM node:22-bookworm-slim

# 设置非交互式安装与中文编码环境
ENV DEBIAN_FRONTEND=noninteractive \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8 \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    CHROME_PATH=/usr/bin/chromium

# 换源加速并安装核心编译工具链：Pandoc、Python、Chromium、中文字体
RUN apt-get update && apt-get install -y --no-install-recommends \
    pandoc \
    python3 \
    python3-pip \
    python3-docx \
    chromium \
    fonts-noto-cjk \
    fonts-wqy-zenhei \
    fonts-wqy-microhei \
    ca-certificates \
    curl \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 先复制 package.json 安装依赖利用 Docker 缓存
COPY package*.json ./
RUN npm install --omit=dev && npm install @marp-team/marp-cli

COPY web/package*.json ./web/
RUN cd web && npm install --omit=dev

# 复制整个项目资产（模板、脚本、图谱、Master Skill 等）
COPY . .

# 暴露 Web 端口
EXPOSE 3800

# 启动命令
CMD ["node", "web/server.js"]
