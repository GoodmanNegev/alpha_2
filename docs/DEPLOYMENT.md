# 魔塔网页版：详细部署与运维指南

适用版本：当前项目代码，更新日期 2026-09-11。目标环境：一台 1 核 CPU、1 GB 内存的 Linux 服务器，供多位玩家独立游玩，并共享探索排行榜。

本文中的命令是部署操作说明，尚未在你的真实服务器执行。当前已通过前端测试、Go 测试与静态检查、Linux amd64 交叉编译和 Compose 配置校验；Docker 镜像构建、Linux 安装流程及真实 1C1G 容量仍需在目标环境验收。

## 目录

1. [方案选择与功能边界](#1-方案选择与功能边界)
2. [部署前准备](#2-部署前准备)
3. [推荐方案：预编译二进制与 systemd](#3-推荐方案预编译二进制与-systemd)
4. [域名、HTTPS 与网络访问](#4-域名https-与网络访问)
5. [Docker 方案](#5-docker-方案)
6. [纯静态方案](#6-纯静态方案)
7. [配置、目录与数据说明](#7-配置目录与数据说明)
8. [上线验收](#8-上线验收)
9. [升级与回退](#9-升级与回退)
10. [备份与恢复](#10-备份与恢复)
11. [资源观察与日常维护](#11-资源观察与日常维护)
12. [故障排查](#12-故障排查)

## 1. 方案选择与功能边界

### 1.1 选哪一种

| 方案 | 排行榜 | 服务器要求 | 建议用途 |
| --- | --- | --- | --- |
| 预编译 Go 二进制 + systemd + nginx | 支持 | Linux、systemd、nginx；服务器不需要 Go 或 Node.js | **1C1G 首选**，避免在服务器编译 |
| Docker Compose | 支持 | Docker Engine、Compose 插件 | 已有 Docker 环境，方便管理镜像 |
| nginx 纯静态 | 不支持 | nginx | 只提供单机游戏，不共享排名 |

三种方案择一部署即可。不要让二进制服务和 Docker 容器同时占用同一个 8001 端口。

### 1.2 当前多人玩法

游戏计算、地图渲染与存档发生在玩家浏览器中。服务器提供前端文件和榜单 API，不为每位玩家持续运行一个游戏进程，不需要数据库、Redis 或 WebSocket 服务。

- 不同浏览器或设备的冒险互相独立。
- 排行榜只公开排名、勇者名称和最高到达楼层；同层并列，同名不同编号的勇者独立记录。
- 无账号系统、云存档、联机互动或服务端通关校验，榜单定位为趣味榜。
- 存档包含勇者编号；导入同一份存档会延续同一勇者，不会自动创建另一位独立玩家。
- 同一浏览器配置文件、同一站点的多个标签页共享存档位，建议每个站点只开一个游玩标签页。
- 每个浏览器有 5 个手动存档位和 1 个自动存档位。清理站点数据、使用无痕模式或更换设备可能丢失本地进度，需使用文本导出备份。

1C1G 适合这种轻量架构，但尚未实测同时在线人数。先小规模邀请玩家，结合第 11 节的指标决定是否扩大开放范围。

## 2. 部署前准备

### 2.1 推荐环境

推荐 Ubuntu 24.04 LTS 或仍受支持的 Debian，使用具有 sudo 权限的 SSH 用户。项目安装脚本使用 `apt-get`、systemd 和 Debian 风格 nginx 目录，不适用于直接在 CentOS、Alpine 或 Windows 上运行。

在服务器执行：

```bash
uname -m
cat /etc/os-release
free -h
df -h /
sudo ss -lntp
```

架构对应关系：

| `uname -m` 输出 | 编译目标 | Docker 平台 |
| --- | --- | --- |
| `x86_64` | `GOARCH=amd64` | `linux/amd64` |
| `aarch64` / `arm64` | `GOARCH=arm64` | `linux/arm64` |

为系统更新、安装包和日志保留至少约 2 GB 可用磁盘；Docker 构建与镜像缓存通常还需要更多空间。这是操作余量建议，不是游戏本体大小。

### 2.2 地址约定

本文用以下示例，请替换为你的实际值：

| 示例 | 含义 |
| --- | --- |
| `203.0.113.10` | 服务器公网 IP，文档示例地址不可实际使用 |
| `ubuntu` | SSH 用户名 |
| `mota.example.com` | 游戏域名 |
| `/home/ubuntu/mota-upload` | 首次上传的项目目录 |

推荐使用独立域名或子域名的根路径，例如 `https://mota.example.com/`。前端 API 使用 `/api/...` 绝对路径，本文不覆盖在其他网站的 `/games/mota/` 子目录下部署。

### 2.3 安装脚本的影响范围

`deploy/deploy.sh binary` 和 `static` 会写入自己的 nginx 站点配置，并移除 `/etc/nginx/sites-enabled/default` 链接。`binary` 还会创建 `mota` 系统用户、覆盖对应 systemd 单元、复制前端资源并重启服务。

**新服务器可使用自动脚本；已有网站的服务器优先使用第 3.5 节的手动安装方式。** 不要从 `/opt/mota/public` 或 `/var/www/mota` 中运行安装脚本：脚本复制资源时会替换目标 `src/`、`css/` 目录。

首次部署和以后升级采用不同流程。尤其是在 Certbot 配置 HTTPS 后，不要直接重跑安装脚本覆盖已修改的 nginx 配置。

## 3. 推荐方案：预编译二进制与 systemd

### 3.1 在 Windows 本地编译

本机安装 Go 1.26 或更新版本。只需要在构建机器安装，服务器不必安装。以下命令在 **PowerShell** 中执行；建议使用单独的终端窗口，构建环境变量只影响该窗口中的后续进程。

```powershell
Set-Location 'F:\P_code\explore_ai_native\alpha_2'
go version

$env:CGO_ENABLED = '0'
$env:GOOS = 'linux'
$env:GOARCH = 'amd64'
$env:GOCACHE = 'F:\P_code\explore_ai_native\alpha_2\.gocache'

Push-Location server
try {
    go build -trimpath -ldflags='-s -w' -o ../mota-server .
    if ($LASTEXITCODE -ne 0) { throw 'Go 编译失败，请先处理错误。' }
} finally {
    Pop-Location
}

Get-Item .\mota-server | Select-Object Name,Length
Get-FileHash .\mota-server -Algorithm SHA256
```

ARM 服务器将 `GOARCH` 改为 `arm64`。输出文件名必须是 `mota-server`，它是 Linux 程序，不能在 Windows 上直接双击运行。

本轮曾成功编译 Linux amd64 二进制，大小约 6.2 MiB；实际以这次构建结果为准。它不是服务器运行内存用量。

如果在 Linux/macOS 构建，可在项目根目录执行：

```bash
(cd server && CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags='-s -w' -o ../mota-server .)
```

### 3.2 打包和上传

继续在项目根目录的 PowerShell 中执行：

```powershell
tar -czf mota-release-linux-amd64.tar.gz mota-server index.html css src deploy docs README.md
if ($LASTEXITCODE -ne 0) { throw '打包失败。' }

scp .\mota-release-linux-amd64.tar.gz ubuntu@203.0.113.10:/home/ubuntu/
```

若 SSH 不是 22 端口，给 `scp` 加 `-P 端口号`；连接服务器的 `ssh` 使用小写 `-p`。生成的压缩包不包含本地 `.gocache`、预览榜单或浏览器存档。

连接服务器后，以下均为 **Linux Bash** 命令：

```bash
ssh ubuntu@203.0.113.10
mkdir -p /home/ubuntu/mota-upload
tar -xzf /home/ubuntu/mota-release-linux-amd64.tar.gz -C /home/ubuntu/mota-upload
cd /home/ubuntu/mota-upload
ls -l mota-server index.html deploy/deploy.sh
sha256sum mota-server
```

SHA256 应与本地 `Get-FileHash` 输出一致，大小写不影响比较。首次安装使用空的上传目录；以后升级解压到新的版本目录，避免混入旧资源。

### 3.3 新服务器首次自动安装

确认当前目录是 `/home/ubuntu/mota-upload`，且其中包含 `mota-server`、`index.html`、`css/`、`src/` 和 `deploy/`。

```bash
sudo apt-get update
sudo apt-get install -y curl ca-certificates

# 消除 Windows 编辑器可能引入的 CRLF 行尾
sed -i 's/\r$//' deploy/deploy.sh deploy/mota.service deploy/nginx.conf
bash -n deploy/deploy.sh

sudo bash deploy/deploy.sh binary
```

命令失败时先处理报错，不要跳过继续执行。预编译包已含 `mota-server`，脚本不会再要求服务器有 Go。

脚本安装后的结构：

```text
/opt/mota/
  mota-server                 Go 可执行文件
  public/index.html           Go 静态资源副本
  public/css/
  public/src/
  data/                       榜单文件，mota 用户可写
/var/www/mota/                nginx 实际提供的前端资源
/etc/systemd/system/mota.service
/etc/nginx/sites-available/mota
/etc/nginx/sites-enabled/mota -> ../sites-available/mota
```

前端存在两份副本，这是当前脚本的设计；升级时两份都要同步。数据目录只存在于 `/opt/mota/data`，不要放入公开静态目录。

### 3.4 检查服务

```bash
sudo systemctl status mota --no-pager
sudo systemctl is-enabled mota
sudo journalctl -u mota -n 50 --no-pager
sudo nginx -t
curl -fsS http://127.0.0.1:8001/api/health
curl -fsS http://127.0.0.1/api/progress
```

健康检查应返回 HTTP 200 和类似内容：

```json
{"success":true,"data":{"status":"ok","version":"1.0.0"},"error":null}
```

新榜单返回 `data: []` 是正常结果；完成序章并同步后才会产生玩家记录。健康接口只检查 HTTP 服务可达，不代替榜单写盘验证。`version` 目前是固定字符串，也不能单独作为确认发布版本的依据。

如果服务器已有多个 nginx 站点，使用第 4 节配置的域名访问；不要仅凭 `http://127.0.0.1/` 的结果判断游戏站点。

### 3.5 已有网站：手动安装

**本节替代第 3.3 节，不需要两者都做。** 在上传目录中执行，下面操作只创建魔塔自己的服务和目录，不移除其他 nginx 站点。

```bash
sudo apt-get update
sudo apt-get install -y nginx curl ca-certificates
id -u mota >/dev/null 2>&1 || sudo useradd --system --no-create-home --shell /usr/sbin/nologin mota

sudo install -d -m 755 /opt/mota /opt/mota/public /var/www/mota
sudo install -d -o mota -g mota -m 750 /opt/mota/data
sudo install -m 755 mota-server /opt/mota/mota-server
sudo cp -a index.html css src /opt/mota/public/
sudo cp -a index.html css src /var/www/mota/
sudo chmod -R a+rX /opt/mota/public /var/www/mota

sudo install -m 644 deploy/mota.service /etc/systemd/system/mota.service
sudo systemctl daemon-reload
sudo systemctl enable --now mota

sudo install -m 644 deploy/nginx.conf /etc/nginx/sites-available/mota
sudoedit /etc/nginx/sites-available/mota
```

将 `server_name _;` 改为 `server_name mota.example.com;`，确认该域名未被其他站点使用。然后启用：

```bash
sudo ln -s /etc/nginx/sites-available/mota /etc/nginx/sites-enabled/mota
sudo nginx -t
sudo systemctl enable --now nginx
sudo systemctl reload nginx
curl -fsS -H 'Host: mota.example.com' http://127.0.0.1/api/health
```

如果链接已存在，检查它指向的配置，不必再次创建。若 8001 已被占用，需同时修改 `mota.service` 中 `-addr` 与 nginx 中的 `proxy_pass`，之后执行 `daemon-reload`、重启 mota 并重新检查 nginx。

## 4. 域名、HTTPS 与网络访问

### 4.1 域名解析

在 DNS 服务商添加 `mota.example.com` 的 A 记录，指向服务器公网 IPv4。仅在服务器确实配置好 IPv6 时添加 AAAA 记录，否则部分玩家可能连接到不可用的 IPv6 地址。

修改自动安装生成的 nginx 配置：

```bash
sudoedit /etc/nginx/sites-available/mota
```

把 `server_name _;` 改为实际域名，例如：

```nginx
server_name mota.example.com;
```

```bash
sudo nginx -t
sudo systemctl reload nginx
curl -fsS -H 'Host: mota.example.com' http://127.0.0.1/api/health
```

### 4.2 端口与防火墙

| 端口 | 允许范围 | 用途 |
| --- | --- | --- |
| SSH 端口，通常 22 | 优先限制为你的管理 IP | 远程管理 |
| TCP 80 | 公网 | HTTP、证书签发及跳转 |
| TCP 443 | 公网 | 正式 HTTPS 游戏站点 |
| TCP 8001 | 仅本机 | Go 后端，不对公网开放 |

云控制台安全组与服务器防火墙都需要检查。若使用 UFW，在启用之前先放行实际 SSH 端口，避免断开远程管理：

```bash
# 若 SSH 改过端口，请将 22 替换为实际端口
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw status verbose
```

仅在确认这些规则符合现有服务器用途后启用 UFW。已有防火墙应在原有规则上调整，不要清空重建。

### 4.3 开启 HTTPS

先确认域名已解析、80 端口可从公网访问、nginx 域名配置正确，再执行：

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d mota.example.com
```

按向导填写证书联系邮箱、阅读相关条款，并选择将 HTTP 跳转 HTTPS。完成后检查：

```bash
sudo nginx -t
curl -fsS https://mota.example.com/api/health
sudo certbot renew --dry-run
systemctl list-timers --all | grep certbot
```

无定时任务时检查安装方式对应的续期服务。证书签发失败通常是 DNS 尚未生效、AAAA 记录错误、端口被拦截或 nginx 域名未匹配。

### 4.4 HTTPS 切换会影响浏览器存档位置

浏览器存储按“协议 + 域名 + 端口”区分。以下是不同站点存储空间：

```text
http://203.0.113.10:8001
http://mota.example.com
https://mota.example.com
```

若玩家已在旧地址游玩，应在跳转生效前从旧地址“保存进度 → 导出当前进度为文本”，然后在新地址“读取进度 → 从文本导入”。服务器榜单仍保留，但浏览器不会自动把旧地址的存档迁移到新地址。

建议先确定 HTTPS 正式地址，再邀请其他人开始游玩。

### 4.5 反向代理与真实 IP

提供的 nginx 配置按单层代理设计，覆盖而不是追加客户端发送的 `X-Forwarded-For`：

```nginx
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $remote_addr;
```

systemd 服务启用了 `-trust-proxy`，因此后端必须保持仅监听回环地址。直接对公网暴露一个信任任意转发头的后端，会使基于 IP 的限流失去作用。

初次上线可以不加 CDN。以后加 CDN 或负载均衡时，需按服务商公布的代理地址范围配置 nginx 真实 IP 信任关系，否则多人可能被算成同一个代理 IP，共享限流额度。

## 5. Docker 方案

### 5.1 安装与目录约定

安装 Docker Engine 及 Compose 插件可参考 [Docker 官方 Ubuntu 安装说明](https://docs.docker.com/engine/install/ubuntu/) 或 [Debian 安装说明](https://docs.docker.com/engine/install/debian/)。

```bash
sudo docker version
sudo docker compose version
```

本方案使用完整项目目录 `/home/ubuntu/mota-docker`，其中需要 `Dockerfile`、`docker-compose.yml`、`.dockerignore`、`server/`、`index.html`、`src/`、`css/`。第 3.2 节的**二进制发行包不包含 Docker 构建源码**，不能直接拿来执行镜像构建。请使用下面的源码包。

以下命令固定项目名为 `mota`，以后启动、升级、备份都保持这个名字。当前 Compose 设置了固定容器名 `mota`，同一主机只能直接运行一套该配置。

如果之前已部署，不要直接改项目名。先查看实际项目名并沿用：

```bash
sudo docker inspect mota --format '{{index .Config.Labels "com.docker.compose.project"}}'
```

更换项目名会选择另一组数据卷，看起来像榜单丢失，旧卷通常仍然存在。

源码包在服务器 A 上构建并监听 `0.0.0.0:8001`。域名、证书和 nginx 放在服务器 B，反代配置稍后再做；A 上不要运行 `deploy.sh binary` 或 `static`。

### 5.2 本机打包源码，在服务器 A 用 Compose 构建

在项目根目录执行（需要 Node.js 20+；Windows 10 自带 `tar`）：

```powershell
Set-Location 'F:\P_code\explore_ai_native\alpha_2'
npm run pack:docker
```

脚本生成 `dist/mota-docker-src-日期时间.tar.gz`，只包含 Docker 构建所需文件，不含 `.gocache`、`node_modules`、本机榜单和二进制。记下输出中的文件名和 SHA256。上传：

```powershell
scp .\dist\mota-docker-src-实际文件名.tar.gz ubuntu@203.0.113.10:/home/ubuntu/
```

SSH 不是 22 端口时，`scp` 用 `-P`，`ssh` 用 `-p`。

在服务器 A 上解压到固定目录（顶层目录名是 `mota-docker`）：

```bash
sha256sum /home/ubuntu/mota-docker-src-实际文件名.tar.gz
tar -tzf /home/ubuntu/mota-docker-src-实际文件名.tar.gz
tar -xzf /home/ubuntu/mota-docker-src-实际文件名.tar.gz -C /home/ubuntu
cd /home/ubuntu/mota-docker
ls Dockerfile docker-compose.yml server/go.mod index.html
cp -n .env.example .env
```

`.env` 默认是 `MOTA_BIND=0.0.0.0`、`MOTA_PORT=8001`、`MOTA_TRUST_PROXY=0`。先用服务器 A 的公网 IP 验收；等服务器 B 反代就绪后再收紧 8001 的防火墙，并视情况打开 `MOTA_TRUST_PROXY`。

首次安装（没有 Docker 时会安装引擎和 Compose 插件，然后构建并启动）：

```bash
sed -i 's/\r$//' deploy/deploy.sh
bash -n deploy/deploy.sh
sudo bash deploy/deploy.sh docker
```

已安装 Docker 时也可直接：

```bash
cd /home/ubuntu/mota-docker
sudo docker compose -p mota config --quiet
sudo docker compose -p mota up -d --build
sudo docker compose -p mota ps
curl -fsS http://127.0.0.1:8001/api/health
```

默认端口为 `0.0.0.0:8001`，默认不信任转发头。可临时通过 `http://服务器IP:8001/` 验收，此时安全组需放行 8001。不要把这个地址当作长期对外入口。

1 GB 内存服务器现场编译镜像可能被杀死。出现 OOM、长时间无响应或其他服务受影响时，改用下一节在其他机器构建镜像再导入，不要只看运行容器的 64 MB 上限估算构建资源。

`deploy.sh docker` 现在固定 Compose 项目名为 `mota`，不安装 nginx。不要和二进制方案同时占用 8001。升级时解压到同一目录后再次 `up -d --build`，**不要** `docker compose down -v`。

### 5.3 在其他机器构建，再导入镜像

在有 Docker 的构建机器、完整项目根目录中执行；Windows Docker Desktop 需要使用 Linux 容器模式：

```bash
docker build --platform linux/amd64 -t mota-web:release1 .
docker save -o mota-image-release1.tar mota-web:release1
scp mota-image-release1.tar ubuntu@203.0.113.10:/home/ubuntu/
```

ARM 服务器改为 `--platform linux/arm64`；跨架构构建需要构建机支持对应平台。

服务器上执行：

```bash
sudo docker load -i /home/ubuntu/mota-image-release1.tar
sudo docker tag mota-web:release1 mota-web:latest
cd /home/ubuntu/mota-docker
sudo docker compose -p mota up -d --no-build --pull never
sudo docker compose -p mota ps
```

`--no-build --pull never` 确保使用已导入镜像。`release1` 是示例版本标签；以后每版使用不同名称，保留旧镜像用于回退。Compose 中运行的镜像名仍为 `mota-web:latest`，因此启动前需要上面的 tag 步骤。

### 5.4 配置 nginx 和 HTTPS

在 `/home/ubuntu/mota-docker/.env` 中填写：

```dotenv
MOTA_BIND=127.0.0.1
MOTA_PORT=8001
MOTA_TRUST_PROXY=1
```

这些值不涉及密码。修改后重建容器配置：

```bash
sudo docker compose -p mota up -d --no-build --pull never
sudo docker compose -p mota ps
```

宿主机安装 nginx，并将与镜像同一版本的前端文件复制到 nginx 静态目录：

```bash
sudo apt-get update
sudo apt-get install -y nginx curl ca-certificates
sudo install -d -m 755 /var/www/mota
sudo cp -a index.html css src /var/www/mota/
sudo chmod -R a+rX /var/www/mota
sudo install -m 644 deploy/nginx.conf /etc/nginx/sites-available/mota
sudoedit /etc/nginx/sites-available/mota
```

设置独立 `server_name`，保持 `proxy_pass http://127.0.0.1:8001;`，然后按第 3.5 节启用本站链接，再执行第 4 节的 DNS、端口和 HTTPS 配置。宿主机没有对应源码时，也可从已创建容器提取公开资源：

```bash
sudo docker cp mota:/app/public/. /var/www/mota/
sudo chmod -R a+rX /var/www/mota
```

不要同时启动 systemd 的 `mota` 服务。Docker 的 8001 端口通过 `MOTA_BIND` 限制到本机；不要只依赖 UFW 阻止 Docker 公开映射的端口。

### 5.5 数据与健康状态

```bash
sudo docker compose -p mota logs --tail=100
sudo docker inspect mota --format '{{json .State.Health}}'
sudo docker inspect mota --format '{{range .Mounts}}{{println .Name "->" .Destination}}{{end}}'
sudo docker stats --no-stream mota
```

固定项目名 `mota` 时，默认卷名通常为 `mota_mota-data`，以 `inspect` 为准。容器挂载位置为 `/app/data`，它包含榜单文件。普通 `docker compose down` 保留命名卷；**不要使用 `down -v` 或删除这个卷来“重新部署”**。

容器健康检查每 30 秒执行一次，首次启动后需稍等才会出现 healthy。检查只访问 `/api/health`，仍需要实际验证榜单写入。

## 6. 纯静态方案

本方案支持独立游玩、勇者改名、本地存档和背包，不提供共享排行榜。页面点击排行榜会显示暂时不可用。

在专用服务器上的完整项目目录或第 3.2 节发行包目录执行：

```bash
sudo bash deploy/deploy.sh static
```

脚本把 `index.html`、`css/`、`src/` 复制到 `/var/www/mota`，安装 nginx 并移除 API 代理块。域名和 HTTPS 仍按第 4 节配置。已有网站可手动复制这三项并建立独立 nginx 站点。

不要用 `npm run serve` 作为公网正式服务：它是仅监听 `127.0.0.1` 的开发服务器，也没有排行榜。

## 7. 配置、目录与数据说明

### 7.1 Go 配置

| 环境变量 | 命令行参数 | 直接运行二进制的默认值 | 说明 |
| --- | --- | --- | --- |
| `MOTA_ADDR` | `-addr` | `:8001` | 监听地址 |
| `MOTA_STATIC` | `-static` | `./public` | 包含 index.html 的前端根目录 |
| `MOTA_DATA` | `-data` | `./data/leaderboard.json` | 旧榜单文件路径，同时决定探索榜路径 |
| `MOTA_TRUST_PROXY` | `-trust-proxy` | 关闭 | 环境变量为 `1` 时信任代理转发 IP |

命令行显式参数优先于环境变量。提供的 systemd 单元已经写死了 `-addr`、`-static`、`-data` 和 `-trust-proxy`，单独添加同名环境变量不会覆盖这些参数。

Compose 的 `MOTA_BIND` 和 `MOTA_PORT` 控制宿主机端口映射，不是 Go 程序变量；`deploy.sh` 的 `MOTA_PORT` 仅用于 Docker 分支，不会自动修改二进制服务端口。

### 7.2 需要持久保存什么

| 内容 | 二进制方案位置 | Docker 方案位置 | 是否随服务器备份 |
| --- | --- | --- | --- |
| 探索排行榜 | `/opt/mota/data/leaderboard.json.progress.json` | `/app/data/leaderboard.json.progress.json` | 是 |
| 旧通关排行榜 | `/opt/mota/data/leaderboard.json` | `/app/data/leaderboard.json` | 是，文件可能尚未生成 |
| 玩家存档、勇者编号、名称 | 玩家浏览器 localStorage | 玩家浏览器 localStorage | 否，玩家自行导出 |
| nginx/HTTPS 配置 | `/etc/nginx`、`/etc/letsencrypt` | 宿主机相同位置 | 是，按服务器整体备份管理 |

若修改 `MOTA_DATA` 为 `/some/path/board.json`，探索榜文件名就是 `/some/path/board.json.progress.json`。文件首次成功提交后才创建；服务器未收到任何记录时目录为空是正常现象。

榜单文件含有不在公共 GET 接口展示的勇者编号，不应放入静态网站根目录或公开下载链接。运行期间不要手动编辑 JSON，修改可能被内存中的下一次写入覆盖。

当前 JSON 存储只支持一套进程管理同一组文件。**不要启动多个 Go 实例共同写同一目录或同一个数据卷**；进程内部的并发保护不能协调不同进程。

### 7.3 API 和限流

| 请求 | 用途 | 限制 |
| --- | --- | --- |
| `GET /api/health` | 可达性检查 | 不使用榜单请求配额 |
| `GET /api/progress` | 公开探索榜 | 与探索榜 POST、旧榜 GET 共用每 IP 每分钟 60 次 |
| `POST /api/progress` | `{id,name,floor}` 更新勇者记录 | 名称最多 16 个字，楼层索引 0–26 |
| `GET /api/leaderboard` | 旧用时榜 | 使用上述读取配额 |
| `POST /api/leaderboard` | 旧通关提交 | 每 IP 每分钟 5 次 |

POST 请求需要 `Content-Type: application/json`，Go 端请求体最多 4 KiB。所有 API 统一返回 `success`、`data`、`error`。

探索榜只保留前 500 条。同一编号更新已有记录时保留更高层数；被淘汰的记录不再保留其历史最高层。同一校园、公司或家庭的多个玩家可能共享公网 IP，也就共享请求额度。HTTP 429 不会停止本地游戏，可等待下一窗口后重新打开榜单。

## 8. 上线验收

### 8.1 服务器检查

```bash
curl -fsS https://mota.example.com/api/health
curl -fsS https://mota.example.com/api/progress
curl -I https://mota.example.com/
curl -I https://mota.example.com/src/main.js
curl -I https://mota.example.com/css/style.css
```

页面、JS 和 CSS 应正常返回，静态资源带 `Cache-Control: no-cache`。`no-cache` 表示使用缓存前重新验证，不是完全不允许浏览器存储。

在公网访问 `https://mota.example.com/data/leaderboard.json.progress.json` 应为 404。从另一台机器访问正式部署的 8001 端口应失败，网站通过 443 正常可用。

### 8.2 玩家流程

1. 在浏览器 A 打开正式地址，完成序章；点勇者头像改名为“测试勇者甲”。
2. 打开背包、帮助和排行榜，确认可关闭、可翻页，手机页面没有整页滚动条。
3. 保存到手动存档 1，改名为另一名称，再读取存档 1 并刷新，确认恢复保存时的名称和进度。
4. 导出存档文本，在另一浏览器导入，确认勇者编号对应的榜单记录继续使用，而不是新增记录。
5. 再用未导入该存档的浏览器 B 从头开始，取名“测试勇者乙”；确认两者冒险独立、榜单分别记录。
6. 推进到更高楼层，重新打开排行榜确认最高层更新；返回低层后记录不降低。
7. 重启 Go 服务或容器，刷新榜单，确认记录仍存在。

同一浏览器两个普通标签页不能代替独立浏览器测试。可以使用另一设备或浏览器配置文件。未完成序章时没有榜单记录是当前设计。

正式开放之前，还应安排正常属性下的全程试玩和目标服务器负载观察。自动化剧情测试使用增强属性，不能据此声称正常数值下的所有路线都已验证。

## 9. 升级与回退

### 9.1 升级原则

先备份，再成套更新前端和 Go 服务。更新前给发行包或镜像明确版本名并保留上一版，不要把旧目录直接覆盖成无法恢复的唯一副本。升级期间短暂维护，避免玩家从 nginx 获取到一半新、一半旧的文件。

保持正式域名、协议和端口不变，可继续使用浏览器本地存档。已打开页面的玩家升级后应刷新页面；刷新前先存档。若此前发布过一小时缓存版本，首次迁移时可能需要强制刷新或等待旧缓存过期。

### 9.2 二进制方案升级

先按第 10.1 节备份。将新发行包解压到新的目录，例如 `/home/ubuntu/mota-release2`，检查新包包含二进制及三项前端资源。安装 rsync：

```bash
sudo apt-get install -y rsync
```

以下脚本是**维护窗口操作**：停止后端，只修改明确的程序和前端路径，不碰数据目录。`rsync --delete` 会删除目标前端目录中新版不再包含的资源，因此源目录必须是完整新版本。过程中任一步失败时停止操作，按本节回退。

```bash
sudo bash <<'BASH'
set -euo pipefail
release_dir=/home/ubuntu/mota-release2
test -f "$release_dir/mota-server"
test -f "$release_dir/index.html"
test -f "$release_dir/src/main.js"
test -f "$release_dir/css/style.css"

systemctl stop mota
install -m 755 "$release_dir/mota-server" /opt/mota/mota-server.next
mv /opt/mota/mota-server.next /opt/mota/mota-server

for public_dir in /opt/mota/public /var/www/mota; do
    rsync -a --delete "$release_dir/src/" "$public_dir/src/"
    rsync -a --delete "$release_dir/css/" "$public_dir/css/"
    install -m 644 "$release_dir/index.html" "$public_dir/index.html"
    chmod -R a+rX "$public_dir"
done

systemctl start mota
BASH
```

nginx 在这段时间仍可服务文件。若需要避免新用户在复制期间进入，可在维护窗口前暂时将本站 nginx 切换为维护响应，完成后恢复，勿停止承载其他网站的整个 nginx。

检查 `systemctl status mota`、API 和页面资源。通常不需要重新载入 nginx，也不需要 `daemon-reload`；只有变更对应配置文件才需要。

**代码回退**：把 `release_dir` 改为保留的上一版完整目录，再执行同样的程序与资源更新步骤。默认保留 `/opt/mota/data`，避免抹去升级后的新榜单。只有格式不兼容或数据损坏时才恢复历史数据备份。

### 9.3 Docker 升级与回退

升级前按第 10.2 节备份数据，在完整项目目录执行并保留旧镜像：

```bash
sudo docker tag mota-web:latest mota-web:before-release2
sudo docker load -i /home/ubuntu/mota-image-release2.tar
sudo docker tag mota-web:release2 mota-web:latest
sudo docker compose -p mota up -d --no-build --pull never --force-recreate
sudo docker compose -p mota ps
```

如果 nginx 单独提供 `/var/www/mota` 的资源，还要用同版发行包同步 `src/`、`css/`、`index.html`，或在维护窗口从新容器复制 `/app/public/.`。复制方式不会删除废弃文件；需要精确清理时使用上一节限定目录的 rsync 方式。

回退镜像：

```bash
sudo docker tag mota-web:before-release2 mota-web:latest
sudo docker compose -p mota up -d --no-build --pull never --force-recreate
```

同时恢复 nginx 的上一版前端，保留原数据卷。不要在此过程中更换 Compose 项目名、挂载位置或数据卷名。

## 10. 备份与恢复

### 10.1 二进制方案：完整本站快照

以下备份包含程序、两份前端、榜单、mota 的 systemd 单元及 nginx 站点配置。会短暂停止 Go 服务，并在脚本退出时尝试重新启动。备份目录仅 root 可读，证书私钥不包含在该压缩包中。

```bash
sudo bash <<'BASH'
set -euo pipefail
install -d -m 700 /var/backups/mota
backup_file="/var/backups/mota/mota-$(date +%Y%m%d-%H%M%S).tar.gz"
test ! -e "$backup_file"
systemctl stop mota
trap 'systemctl start mota' EXIT
tar -czf "$backup_file" -C / \
    opt/mota var/www/mota \
    etc/systemd/system/mota.service \
    etc/nginx/sites-available/mota
chmod 600 "$backup_file"
tar -tzf "$backup_file" >/dev/null
printf 'Backup saved: %s\n' "$backup_file"
BASH
```

确认备份存在且服务已恢复，另将备份复制到服务器之外的位置。证书与其他网站配置应纳入你现有的服务器整体备份。建议至少每日备份榜单、每次升级前备份完整本站，保留多份历史版本。

恢复应先解压到一个新的临时目录检查，而不是未经确认直接覆盖 `/`：

```bash
sudo mkdir -p /var/backups/mota/restore-review
sudo tar -xzf /var/backups/mota/实际备份文件.tar.gz -C /var/backups/mota/restore-review
sudo ls -l /var/backups/mota/restore-review/opt/mota/data
```

使用未存在的检查目录，确保来源是自己的可信备份。只回退代码时不要恢复 `data`。确实需要把榜单恢复到备份时刻时，执行下列步骤；当前数据被改名保留，可以再次恢复。脚本中途失败时服务保持停止，先检查目录与错误再继续。

```bash
sudo bash <<'BASH'
set -euo pipefail
restore_dir=/var/backups/mota/restore-review/opt/mota/data
test -d "$restore_dir"
previous_data="/opt/mota/data.before-restore-$(date +%Y%m%d-%H%M%S)"
test ! -e "$previous_data"
systemctl stop mota
mv /opt/mota/data "$previous_data"
cp -a "$restore_dir" /opt/mota/data
chown -R mota:mota /opt/mota/data
chmod 750 /opt/mota/data
systemctl start mota
BASH
curl -fsS http://127.0.0.1:8001/api/progress
```

如果 Go 因备份损坏而无法启动，可停止服务，将失败的恢复目录另行改名保留，再把 `data.before-restore-实际时间` 改回 `/opt/mota/data`，恢复原来的榜单状态。

恢复 systemd/nginx 配置时分别执行 `daemon-reload` 和 `nginx -t`。已有新证书配置时，不要用旧的 HTTP 站点配置覆盖当前 HTTPS 配置。

### 10.2 Docker：备份数据卷内容

在固定项目目录执行。停止容器后 `docker compose cp` 仍可复制文件；停止期间使用唯一的新备份目录名：

```bash
cd /home/ubuntu/mota-docker
sudo bash <<'BASH'
set -euo pipefail
install -d -m 700 /var/backups/mota
backup_dir="/var/backups/mota/docker-data-$(date +%Y%m%d-%H%M%S)"
test ! -e "$backup_dir"
install -d -m 700 "$backup_dir"
docker compose -p mota stop
trap 'docker compose -p mota start' EXIT
docker compose -p mota cp mota:/app/data/. "$backup_dir/"
printf 'Backup saved: %s\n' "$backup_dir"
BASH
```

此外保留 `.env`、Compose 文件、实际项目名、镜像版本标签和 nginx 配置，避免只有数据却无法重建原环境。

恢复到已存在的容器时，先按上面的流程额外备份当前数据。以下操作会用选定备份替换两个已知榜单文件；若备份中没有某个文件，会清除该文件的现有版本，以免混入另一时间点的记录。其他卷内文件不受影响。先把 `restore_dir` 改为实际备份目录，再执行：

```bash
cd /home/ubuntu/mota-docker
sudo bash <<'BASH'
set -euo pipefail
restore_dir=/var/backups/mota/docker-data-实际备份时间
test -d "$restore_dir"
docker compose -p mota stop
docker compose -p mota run --rm --no-deps --user root \
    --volume "$restore_dir:/restore:ro" --entrypoint sh mota -c '
set -eu
for name in leaderboard.json leaderboard.json.progress.json; do
    if [ -f "/restore/$name" ]; then
        cp "/restore/$name" "/app/data/$name"
    else
        rm -f "/app/data/$name"
    fi
done
chown -R mota:mota /app/data
'
docker compose -p mota start
BASH
curl -fsS http://127.0.0.1:8001/api/progress
```

这里使用一次性管理容器挂载同一个数据卷，正式服务在恢复完成前保持停止。新服务器导入匹配镜像及配置后，可先运行 `docker compose -p mota create --no-build` 创建服务容器和数据卷，再恢复后启动。以容器实际挂载为准，不要把数据复制到宿主机某个同名但未挂载的目录。

### 10.3 玩家存档备份

服务器无法替玩家备份完整冒险。玩家应在游戏内点击“存档 → 导出当前进度为文本”，自行保存该文本；恢复时点击“读档 → 从文本导入存档”。

服务器排行榜不是云存档，从榜单记录无法还原背包、地图或角色属性。

## 11. 资源观察与日常维护

当前 systemd 与 Compose 示例都把 Go 服务限制为 64 MB 内存和约半个 CPU 核心。这不包含操作系统、nginx、Docker 守护进程和构建工具的开销，也不代表已经验证所有负载都能在 64 MB 内完成。

二进制方案：

```bash
sudo systemctl show mota -p MemoryCurrent -p MemoryPeak -p NRestarts
sudo journalctl -u mota --since '1 hour ago' --no-pager
free -h
df -h /
```

Docker 方案：

```bash
sudo docker stats --no-stream mota
sudo docker inspect mota --format 'OOMKilled={{.State.OOMKilled}} RestartCount={{.RestartCount}}'
sudo docker compose -p mota logs --since=1h
sudo docker system df
```

nginx 错误与访问情况：

```bash
sudo tail -n 50 /var/log/nginx/error.log
sudo tail -n 50 /var/log/nginx/access.log
```

在“少量用户 → 小规模邀请 → 更大范围开放”几个阶段观察：页面和榜单响应延迟、持续 5xx、429 比例、进程重启次数、内存峰值与磁盘余量。限流测试和压测应使用隔离数据，不向正式榜单制造大量假记录。

若频繁 OOM，先检查日志和实际负载，再决定是否调整资源上限或升级机器。不要把全机 1 GB 都分配给游戏服务。容量测试需要同时涵盖静态资源请求和榜单同步；单独测 `/api/health` 得不到实际游玩容量。

Compose 的容器日志已限制单文件 5 MB、最多 2 个轮转文件。仍需管理系统日志、nginx 日志、备份与旧镜像的总磁盘占用。清理镜像时保留回退版本；不要连数据卷一起清理。

## 12. 故障排查

| 现象 | 优先检查 | 处理方向 |
| --- | --- | --- |
| IP/域名打不开 | 安全组、80/443、nginx 是否监听、DNS | 先在服务器本机 curl，再从外部访问，区分程序和网络问题 |
| nginx 显示默认欢迎页 | 请求 Host、server_name、站点启用链接 | 使用正式域名；检查同名域名是否被其他站点占用 |
| 页面正常但榜单不可用 | 是否纯静态部署、`/api/health`、`/api/progress` | 确认 Go 服务运行及 API 反代正确，重新打开榜单会重试 |
| API 返回 502 | 后端未运行或端口不匹配 | 检查 systemd/容器日志与 nginx proxy_pass |
| API 返回 429 | 同一 IP 共享配额、代理 IP 配置 | 等待约一分钟后重试；确认可信代理传递真实 IP |
| API 返回 500 / 保存失败 | 数据目录所有权、磁盘满、挂载只读 | 检查 mota 用户写权限；不要使用 `chmod 777` 代替正确所有权 |
| `static dir ... does not contain index.html` | `-static` 路径和文件 | 上传完整前端；注意 service 中命令行参数优先 |
| `exec format error` | Linux/Windows 编译目标、amd64/arm64 | 重新为服务器实际架构交叉编译 |
| `Permission denied` / `203/EXEC` | 可执行权限、路径、挂载 noexec | 检查文件为 Linux 程序、拥有执行权限、所在目录允许执行 |
| `Text file busy` | 直接覆盖运行中的二进制 | 按维护窗口流程停止服务，使用 `.next` 文件替换 |
| 容器重启、退出码 137 | OOM 与内存上限 | 查看 OOMKilled、宿主机内存及日志，避免在小机上构建 |
| 重新部署后榜单为空 | 项目名、卷名、MOTA_DATA 是否改变 | inspect 原挂载；旧数据卷可能仍在，不要继续创建新卷 |
| 换域名或开 HTTPS 后存档消失 | 浏览器 origin 改变 | 从旧地址导出并在新地址导入，服务器榜单不能恢复冒险 |
| 刷新后丢失最近同层移动 | 自动存档时机 | 自动存档不是每走一步写入；重要进度手动保存 |
| 修改名字后榜单没有立即更新 | 序章是否结束、同步延时、限流 | 完成序章后重新打开榜单；失败不会影响本地名称 |
| 更新后白屏或 JS 加载失败 | 新旧资源混用、MIME、404 | 成套更新前后端，检查浏览器控制台和缓存后刷新 |
| 脚本报 `$'\r'` 或 bad interpreter | Windows CRLF 行尾 | 转换行尾后先执行 `bash -n deploy/deploy.sh` |
| Go 启动报 JSON 解析错误 | 榜单文件损坏 | 停止服务保留现场文件，恢复已验证备份后再启动 |
| HTTPS 签发或续期失败 | DNS、AAAA、80 端口、站点域名 | 修正后重试 dry-run，确认续期定时任务存在 |

排查时收集：发生时间、访问地址、浏览器报错、对应服务日志、部署方式与版本标签。提供日志给他人前去除服务器凭据、完整存档文本和其他非公开信息。

## 配套文件

- [发布验收记录](RELEASE.md)
- [项目说明](../README.md)
- [首次安装脚本](../deploy/deploy.sh)
- [systemd 单元](../deploy/mota.service)
- [nginx 站点配置](../deploy/nginx.conf)
- [Dockerfile](../Dockerfile)
- [Compose 配置](../docker-compose.yml)
