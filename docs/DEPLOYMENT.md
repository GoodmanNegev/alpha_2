# Docker Compose 源码部署

本项目只支持 Docker Compose 从源码部署。固定 Compose 项目名为 `mota`，容器名为 `mota`，数据卷为 `mota-data`。上传完整源码（Dockerfile、docker-compose.yml、.dockerignore、index.html、css/、src/、server/）后，在项目根目录操作。

默认访问 `http://服务器IP:8001/`，安全组放行 TCP 8001。可在 `.env` 设置 `MOTA_BIND`、`MOTA_PORT`。玩家存档在浏览器，排行榜在容器内 `/app/data`，对应命名卷 `mota-data`。

**禁止** `docker compose down -v` 以及 `docker volume rm mota_mota-data`，否则会删除排行榜。

## 1. 先停旧服务

新容器也叫 `mota`，也占用 8001。不先停旧进程，构建后会因名称或端口冲突起不来。

```bash
cd /path/to/mota          # 换成实际源码目录
docker compose -p mota ps
sudo ss -tlnp | grep 8001 || true
```

若本目录已经用 `-p mota` 跑过：

```bash
docker compose -p mota stop
```

`stop` 只停容器，不删数据卷。随后用第 3 节重新构建启动。

## 2. 清理旧容器与占用

升级或换目录部署前，先处理残留。只删容器和旧镜像，**不要**删卷。

查看残留：

```bash
docker ps -a --filter name=mota
docker images mota-web
docker volume ls | grep mota
sudo systemctl is-active mota 2>/dev/null || true
```

### 2.1 本项目的旧 Compose 容器

容器还在、但要换成新镜像时：

```bash
docker compose -p mota down        # 删容器和网络，保留 mota-data 卷
```

不要加 `-v`。

若以前没用 `-p mota`（项目名会变成目录名），旧容器可能不叫这套名字：

```bash
docker ps -a
docker rm -f mota                  # 名称冲突时先删这个容器
```

确认没有别的 Compose 项目还挂着同一份源码后，再执行第 3 节。

### 2.2 以前的 systemd / 二进制占用 8001

较早文档曾支持宿主机二进制。若还在跑：

```bash
sudo systemctl stop mota
sudo systemctl disable mota
sudo ss -tlnp | grep 8001
```

有进程占着 8001 再结束该进程，不要杀到无关服务。

### 2.3 旧镜像

`up --build` 会留下旧的 `mota-web` 镜像，可在新容器起来并验收后再删：

```bash
docker image prune -f
docker images mota-web
docker rmi <旧镜像ID>             # 只删已无容器使用的旧 ID
```

不要对仍被 `mota` 容器使用的 `mota-web:latest` 执行 `rmi`。

## 3. 构建并启动

```bash
docker compose -p mota config --quiet
docker compose -p mota up -d --build
docker compose -p mota ps
curl -fsS http://127.0.0.1:8001/api/health
```

`up -d --build` 会用新镜像重建名为 `mota` 的容器；数据卷原样挂载，排行榜保留。

## 4. 升级

1. 备份卷（换机或重大升级时）：`docker run --rm -v mota_mota-data:/data -v "$PWD":/backup alpine tar czf /backup/mota-data.tgz -C /data .`
2. 更新完整源码。
3. 按第 1 节 `stop`（或第 2.1 节 `down`，不要加 `-v`）。
4. 按第 3 节 `up -d --build`。
5. 验收通过后再按第 2.3 节删旧镜像。

卷名以 `docker volume ls` 为准，固定项目名 `mota` 时通常是 `mota_mota-data`。

## 5. 验收与排障

上线前验证健康接口、页面、改名、背包、排行榜、存读档、双设备独立游玩，以及容器重启后榜单仍在。

```bash
docker compose -p mota logs --tail=100
docker stats --no-stream mota
docker inspect mota
```

| 现象 | 先查 |
| --- | --- |
| 容器名已被占用 | `docker ps -a --filter name=mota`，按 2.1 删旧容器后再 `up` |
| 8001 起不来 | `ss -tlnp \| grep 8001`，停掉旧 Compose / systemd / 二进制 |
| 退出码 137 | 内存不足，`docker stats` |
| 榜单空了 | 是否误用 `down -v`；Compose 项目名是否仍是 `mota`；`docker volume ls` |
| 页面仍是旧版 | 浏览器强制刷新；确认重建的是当前目录的镜像 |
