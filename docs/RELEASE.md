# 发布收口记录 · 2026-09-11

逐步安装与运维操作见 [详细部署文档](DEPLOYMENT.md)。本文件保留版本修复与验收范围。

## 结论与边界

本版具备小规模公开试运行条件。不同浏览器独立运行游戏，共享探索榜，无需为每位玩家保持服务器会话。1C1G 是部署目标，尚未完成该规格的实际压测、Docker 镜像构建或 Linux nginx/systemd 上线演练，因此没有容量承诺。

无账号、云存档或防作弊通关验证。同一浏览器同一站点的多个标签页共享存档位；复制存档也会复制勇者编号。榜单最多保留 500 条，被淘汰记录不再保留历史最高层。浏览器存储不可用时进度仅在内存中，关闭页面可能丢失，请导出备份。

剧情测试以增强属性跑通普通和真结局，证明事件连通，不代表正常属性下的完整通关平衡已验收。极小窗口、系统超大字体和手机软键盘弹出时的布局尚未全面覆盖。

## 本轮修复

- 读取手动存档、导入文本后更新自动存档，刷新不会恢复到之前的冒险。
- 序章完成后保存初始身份；尚未完成序章的临时勇者不提交榜单。
- 切换冒险取消旧战斗、自动寻路和延迟结局；连续点选新目标取消旧寻路计时器。
- 排行榜提交按顺序执行，避免旧名称覆盖新名称；移除打开榜单时的重复提交。同步失败仍可显示已有榜单，API 可在重新打开时重新检测。
- 请求超时覆盖响应正文读取，并中止网络请求。
- 背包补齐 NPC 赠送与兑换装备，兼容旧存档的地图变化记录。
- Go 静态服务只暴露游戏资源；HTML、JS、CSS 统一重新验证缓存。开发服务器仅监听本机并拒绝无效 URL。
- nginx 覆盖客户端伪造的转发 IP；Docker 支持显式绑定回环地址。部署脚本补齐 curl 检查及上传后二进制执行权限。

## 验证

- `npm test`：53 项通过，覆盖引擎、地图、剧情、存档、控制器切换、同步顺序及请求超时。
- `go test ./...`、`go vet ./...`：通过；包括独立勇者、同名勇者、并发写入、持久化、输入校验和静态文件隔离。
- Linux amd64 静态交叉编译通过；`docker compose config --quiet` 配置校验通过。部署脚本未在 Linux 执行，本机无 Git Bash，未运行 Bash 语法检查。
- 浏览器交互：完成序章、改名、手动存档、再次改名、读回手动存档并刷新；名称与进度正确恢复，榜单同一记录更新。
- 320×568 背包、844×390 帮助翻页：文档尺寸等于视口，弹框内容没有溢出；本轮浏览器控制台无 error/warn。此前还检查过桌面及 390×844。
- Playwright 独立冒烟脚本未执行（未安装可选依赖），不将它记为通过。

## 推荐上线：预编译二进制

在构建机器运行（Linux shell 示例，ARM 服务器改 `GOARCH=arm64`）：

```bash
cd server
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o ../mota-server .
```

上传 `mota-server`、`index.html`、`src/`、`css/`、`deploy/`。在专用 Ubuntu/Debian 服务器的项目目录运行：

```bash
sudo bash deploy/deploy.sh binary
curl -fsS http://127.0.0.1:8001/api/health
curl -fsS http://127.0.0.1/api/progress
systemctl status mota --no-pager
```

脚本会安装 nginx、创建 mota 用户、写入 `/opt/mota` 和 `/var/www/mota`，并替换 mota 站点及移除默认站点链接。若已有网站，应手动配置独立域名，先备份原配置。配置域名与 HTTPS 后再邀请玩家；Go 端口保持 `127.0.0.1:8001`，仅开放 nginx 的 80/443。

## Docker 部署

```bash
docker compose up -d --build
docker compose ps
curl -fsS http://127.0.0.1:8001/api/health
docker stats --no-stream mota
```

默认公开监听 8001，且不信任客户端转发头。若使用主机 nginx 反代，在 `.env` 中设置：

```dotenv
MOTA_BIND=127.0.0.1
MOTA_PORT=8001
MOTA_TRUST_PROXY=1
```

只有 Go 端口不能被公网直接访问、且可信代理覆盖转发头时，才打开 `MOTA_TRUST_PROXY`。nginx 示例按单层代理设计；增加 CDN 或负载均衡时需重新配置真实 IP 信任链。nginx 静态根目录为 `/var/www/mota`，需同步上传前端资源。

在 1C1G 上优先使用已构建的镜像或二进制；构建阶段需要的资源高于运行阶段。先少量邀请用户，观察内存、延迟、429 与 5xx，再扩大人数。

## 升级、备份和回退

升级前保存旧二进制/镜像标签、整套前端资源、部署配置和榜单文件；前后端必须成套更新。不要执行 `docker compose down -v`，它会删除榜单数据卷。浏览器存档不在服务器备份中，玩家需自行导出。

二进制部署备份示例（短暂停服保证两个榜单文件一致）：

```bash
sudo systemctl stop mota
sudo tar -czf /opt/mota-backup-$(date +%Y%m%d-%H%M%S).tar.gz -C /opt/mota data
sudo systemctl start mota
```

Docker 部署可先 `docker compose stop`，再 `docker compose cp mota:/app/data ./mota-data-backup-日期`，最后 `docker compose start`。备份目录应使用未存在的日期名称。

回退时停止服务，恢复旧二进制/镜像及配套前端，然后启动；仅在数据损坏或格式不兼容时恢复榜单备份，避免丢失升级后的新记录。备份应包含 `leaderboard.json`（若存在）和 `leaderboard.json.progress.json`，存放在静态站点目录之外。

上线验收：健康检查正常；两台设备各建勇者且存档互不影响；改名和最高楼层同步正常；刷新和导入导出正常；手机弹框可操作；服务重启后榜单仍在。发布后查看 `journalctl -u mota` 或 `docker compose logs`，确认无持续保存失败。
