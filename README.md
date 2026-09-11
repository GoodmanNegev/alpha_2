# 魔塔 · 24 层 网页版

经典《魔塔 v1.12（胖老鼠版，24 层）》的 HTML5 重制。游戏在浏览器运行，配套 Go 服务提供静态资源与探索排行榜，无前端构建步骤、无运行时第三方依赖。

当前版本完成发布前代码收口，可用于小规模公开试运行。部署步骤、验收范围与已知边界见 [发布说明](docs/RELEASE.md)。尚未在真实 1C1G 服务器上压测，不承诺具体同时在线人数。

## 当前功能

- 27 张地图，主塔、隐藏层与深渊；33 种怪物、NPC、商店及普通/真结局剧情。
- 回合制战斗、钥匙开门、拾取成长、怪物强化、特殊伤害、怪物手册与楼层传送。
- 一屏地图及工具栏，背包和排行榜点击打开弹框，长列表分页；支持键盘、点击寻路与触屏操作。
- 点击勇者头像查看属性详情并改名；背包显示钥匙、当前持有的剧情道具和已生效装备（含 NPC 赠送/兑换）。
- 5 个手动存档位和 1 个自动存档位、文本导入导出；旧版存档可读取，勇者名称和编号随存档保存。
- 不同浏览器独立游玩；共享榜单只公开排名、名称、最高到达楼层，同层并列。相同名称不会合并不同勇者。
- 程序生成像素美术、WebAudio 音效和背景音乐，无外部图片或音频资源。

存档保存在本机浏览器，没有账号和云存档；同一浏览器同一站点的标签页共享存档位。重要进度请导出备份，勿公开分享存档文本。排行榜为趣味榜，没有服务端通关证明，仅保留前 500 条记录。

## 本地运行与测试

需要 Node.js 20+；Go 服务需要 Go 1.26+。

```bash
npm run serve                # http://localhost:8080，仅本机静态试玩，无排行榜
npm test                     # 53 个测试
cd server
go test ./...
go vet ./...
go run . -addr 127.0.0.1:8081 -static .. -data ../data/leaderboard.json
```

访问 `http://localhost:8081/` 可试玩带排行榜的版本。ES Module 请通过 HTTP 服务加载，不建议直接双击 HTML。项目没有离线缓存机制，断网后能否重新打开取决于浏览器缓存。

## 操作

| 按键 | 作用 |
| --- | --- |
| 方向键 | 移动、开门、拾取、战斗或对话 |
| Enter / 空格 / Z | 确认对话或菜单 |
| Esc | 关闭弹框或停止寻路 |
| B / C | 背包 / 勇者详情与改名 |
| X / F | 怪物手册 / 楼层传送（需对应道具） |
| S / L | 保存 / 读取进度 |
| O / H / M / R | 设置 / 帮助 / 静音 / 重新开始 |

菜单用上下键选择、左右键翻页；输入名称时快捷键不触发游戏操作。手机竖屏显示方向键，横屏可点击地图移动。21 层与隐藏层不能传送；进入不可返回区域前会保留进入前的自动存档。

## 部署到 1C1G

完整操作步骤见 [详细部署与运维指南](docs/DEPLOYMENT.md)，包含 Windows 编译上传、Linux 安装、Docker、HTTPS、验收、备份恢复和故障排查。

计算和画面渲染在玩家浏览器完成，服务器只提供静态文件及低频榜单请求，适合轻量部署。容器和 systemd 示例限制服务为 64 MB 内存、0.5 核；这是资源上限，不是实测用量。建议在其他机器构建，再上传到小服务器。

源码 + Docker Compose（推荐先在本机打包再传到服务器 A）：

```powershell
npm run pack:docker          # 生成 dist/mota-docker-src-*.tar.gz
```

在服务器 A 解压到 `/home/ubuntu/mota-docker` 后执行 `sudo bash deploy/deploy.sh docker`。详细步骤见 [部署指南第 5.2 节](docs/DEPLOYMENT.md)。服务监听 `8001`；数据在 Compose 命名卷中，升级时不要删除该卷。

其他方式：`sudo bash deploy/deploy.sh binary` 安装 Go 二进制、systemd 与 nginx；`sudo bash deploy/deploy.sh static` 只安装静态站点（无榜单）。脚本会安装软件并替换本站 nginx 配置、移除默认站点链接；已有业务的服务器请按 [发布说明](docs/RELEASE.md) 手工配置。

## API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查 |
| GET | `/api/progress` | 探索榜：名称、楼层索引、排名，最多 500 条 |
| POST | `/api/progress` | `{id, name, floor}`；更新名称并保留最高楼层 |
| GET | `/api/leaderboard?ending=normal\|true&limit=20` | 旧通关用时榜，保留兼容 |
| POST | `/api/leaderboard` | 旧通关成绩提交，保留兼容 |

统一响应：`{"success":true,"data":...,"error":null}`。探索榜 GET/POST 与旧榜 GET 共用每 IP 每分钟 60 次限流；旧榜提交每 IP 每分钟 5 次。同一网络出口的玩家共享限额，限流或短暂断线不影响本地游戏。

`MOTA_DATA` 默认是 `./data/leaderboard.json`，探索榜存于其追加 `.progress.json` 的文件中。当前 UI 使用 `/api/progress`，升级需同时更新前端和 Go 服务。

## 项目结构

```text
index.html / css/     页面与一屏布局
src/data/            地图、怪物、物品、商店、剧情
src/engine/          不可变状态与纯函数游戏引擎
src/render/          Canvas 地图、像素精灵、地形纹理
src/ui/              状态栏、背包、档案、弹框与菜单
src/game.js          控制器、存读档、动画与进度同步
tests/               引擎、剧情、存档、控制器与 API 客户端回归
server/              Go 静态服务、榜单、限流与测试
deploy/              nginx、systemd 与部署脚本
tools/               地图生成、开发服务、可选浏览器冒烟脚本
```

引擎入口为 `dispatch(state, action) → {state, effects}`。剧情全流程测试使用增强属性验证路线与事件连通性，不能代替正常数值下的平衡性试玩。

`npm run gen:floors` 从 `tools/reference/` 生成地图。可选 `node tools/smoke.mjs http://localhost:8081/ ./shots` 需要另装 Playwright 和本机 Chrome；本轮未执行该脚本，浏览器验收通过交互试玩完成。

## 数据来源与差异

- 地图和怪物表参考 [gdut-yy/MagicTower](https://github.com/gdut-yy/MagicTower) 的 Flash 反编译数据，并参考 [arcxingye/MagicTower](https://github.com/arcxingye/MagicTower)；剧情、商店和事件亦参考 [ckcz123/mota](https://github.com/ckcz123/mota)。
- 特殊伤害、怪物强化和装备数值采用参考复刻版本；不同版本存在差异，可在 `src/data/items.js` 和 `src/data/story.js` 调整。
- 未实现原版“25 分钟内到 16 层”限制。美术和音乐为本项目程序生成。
- [历史截图](docs/screenshots/)仅用于美术对照，当前界面以运行版本为准。

## 许可

代码 MIT。原版《魔塔》版权归原作者所有，本项目用于学习与怀旧。
