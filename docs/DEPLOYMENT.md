# Docker Compose 源码部署

本项目唯一支持 Docker Compose 从源码部署。上传完整源码（Dockerfile、docker-compose.yml、.dockerignore、index.html、css/、src/、server/），在项目根目录执行：

```bash
docker compose -p mota config --quiet
docker compose -p mota up -d --build
docker compose -p mota ps
curl -fsS http://127.0.0.1:8001/api/health
```

默认访问 `http://服务器IP:8001/`，安全组放行 TCP 8001。可在 `.env` 设置 `MOTA_BIND`、`MOTA_PORT`；固定项目名 `mota`，禁止 `docker compose down -v`，否则会删除排行榜数据卷 `mota-data`。升级前备份卷，更新完整源码后重新 `up -d --build`。玩家存档在浏览器，排行榜在 `/app/data`。

上线前验证健康接口、页面、改名、背包、排行榜、存读档、双设备独立游玩和容器重启后数据仍在。常用检查：`docker compose -p mota logs --tail=100`、`docker stats --no-stream mota`、`docker inspect mota`。退出 137 表示内存不足；榜单丢失优先检查 Compose 项目名和数据卷名。

