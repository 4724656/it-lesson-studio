#!/usr/bin/env bash
# ==============================================================================
# IT Lesson Studio - Docker 镜像构建与拉取管理脚本
#
# 核心目的：
#   免去本地耗时且繁重的 Docker build，优先利用 GitHub Actions 云端构建，
#   在本地或服务器只需一键拉取 (Pull) 即可秒级启动！
#
# 用法：
#   ./scripts/build-docker.sh             # 默认：从云端拉取最新预构建镜像，免本地构建
#   ./scripts/build-docker.sh --cloud     # 触发 GitHub Actions 云端自动构建新镜像
#   ./scripts/build-docker.sh --pull      # 仅拉取云端预构建镜像并打上本地标签
#   ./scripts/build-docker.sh --up        # 拉取云端镜像并直接启动 (docker compose up -d)
#   ./scripts/build-docker.sh --local     # 强制在本地编译构建镜像 (耗时较长)
# ==============================================================================

set -eo pipefail

IMAGE_REPO="ghcr.io/4724656/it-lesson-studio"
IMAGE_TAG="latest"
FULL_IMAGE="${IMAGE_REPO}:${IMAGE_TAG}"
LOCAL_TAG="it-lesson-studio:latest"

COLOR_GREEN="\033[0;32m"
COLOR_YELLOW="\033[1;33m"
COLOR_CYAN="\033[0;36m"
COLOR_RED="\033[0;31m"
COLOR_RESET="\033[0m"

log_info() {
    echo -e "${COLOR_CYAN}ℹ️  $1${COLOR_RESET}"
}

log_ok() {
    echo -e "${COLOR_GREEN}✔  $1${COLOR_RESET}"
}

log_warn() {
    echo -e "${COLOR_YELLOW}⚠️  $1${COLOR_RESET}"
}

log_err() {
    echo -e "${COLOR_RED}❌ $1${COLOR_RESET}"
}

print_header() {
    echo -e "${COLOR_GREEN}================================================================${COLOR_RESET}"
    echo -e "${COLOR_GREEN}   🎓 IT Lesson Studio · Docker 镜像快速部署与构建工具          ${COLOR_RESET}"
    echo -e "${COLOR_GREEN}================================================================${COLOR_RESET}"
}

cmd_pull() {
    log_info "正在从 GitHub Container Registry (ghcr.io) 拉取最新预构建镜像..."
    log_info "镜像地址: ${FULL_IMAGE}"
    
    if docker pull "${FULL_IMAGE}"; then
        docker tag "${FULL_IMAGE}" "${LOCAL_TAG}"
        log_ok "镜像拉取成功！已自动关联本地标签: ${LOCAL_TAG}"
        echo ""
        log_ok "您现在可以秒级启动服务（无需本地重新编译）："
        echo -e "   ${COLOR_YELLOW}docker compose up -d${COLOR_RESET}"
    else
        log_warn "未能拉取到云端预构建镜像（可能是网络原因或云端正在构建中）。"
        echo ""
        read -p "是否尝试在本地编译构建 Docker 镜像？(y/N): " choice
        case "$choice" in
            y|Y ) cmd_local_build ;;
            * ) log_info "已取消构建。" ;;
        esac
    fi
}

cmd_cloud_trigger() {
    log_info "正在检查 GitHub CLI (gh) 工具..."
    if command -v gh >/dev/null 2>&1; then
        log_info "正在通过 GitHub CLI 触发云端自动构建工作流 (docker-build.yml)..."
        if gh workflow run docker-build.yml -r main; then
            log_ok "已成功在 GitHub Actions 启动云端镜像构建任务！"
            echo ""
            log_info "查看云端构建进度命令："
            echo -e "   ${COLOR_YELLOW}gh run watch${COLOR_RESET}"
            log_info "或访问网页查看："
            echo -e "   ${COLOR_CYAN}https://github.com/4724656/it-lesson-studio/actions/workflows/docker-build.yml${COLOR_RESET}"
            return 0
        fi
    fi

    log_warn "未检测到 gh 命令行工具或当前未登录。"
    echo ""
    log_info "您可以在浏览器中直接一键触发云端构建："
    echo -e "   👉 ${COLOR_YELLOW}https://github.com/4724656/it-lesson-studio/actions/workflows/docker-build.yml${COLOR_RESET}"
    echo -e "   点击右上角的【Run workflow】按钮即可触发全自动云端构建！"
}

cmd_local_build() {
    log_warn "正在本地环境中直接构建 Docker 镜像（包含 Node.js、Pandoc、Python、Chromium 与中文字体，耗时约 5~10 分钟）..."
    docker build -t "${LOCAL_TAG}" -t "${FULL_IMAGE}" .
    log_ok "本地镜像构建成功: ${LOCAL_TAG}"
}

cmd_up() {
    cmd_pull
    log_info "正在启动 Docker 容器服务..."
    docker compose up -d
    echo ""
    log_ok "服务启动成功！浏览器访问: http://localhost:3800"
}

print_header

case "$1" in
    --cloud|cloud)
        cmd_cloud_trigger
        ;;
    --local|local)
        cmd_local_build
        ;;
    --pull|pull)
        cmd_pull
        ;;
    --up|up)
        cmd_up
        ;;
    --help|-h)
        echo "用法:"
        echo "  $0             # 默认：优先拉取云端预构建镜像，免去本地 build"
        echo "  $0 --cloud     # 触发 GitHub Actions 云端自动构建工作流"
        echo "  $0 --pull      # 仅拉取云端镜像并标记为本地镜像"
        echo "  $0 --up        # 拉取云端最新镜像并后台启动服务"
        echo "  $0 --local     # 在本地机器强制执行 docker build"
        ;;
    *)
        cmd_pull
        ;;
esac
