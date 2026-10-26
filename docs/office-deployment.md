# ONLYOFFICE 私有部署

ShareServer 自身采用前后端分离：`web/` 是 React 前端，`server/` 是统一 Node.js/Hono
后端，Office 位于 `server/src/office/`。Nginx 提供静态页面并将所有 `/api/` 代理到同一后端。
ONLYOFFICE 是独立编辑引擎；无需 Python/FastAPI 或 office-api 容器。
当前 Office 没有用户认证和组织隔离，仅适用于受控私有网络。

## GoodBuddy 文件入口与能力检查

GB 在“设置 → 平台功能 → ShareServer 连接”配置本服务的 Web origin，例如
`http://<主机IP>:8088`，点击“连接并检查能力”。客户端不配置 ONLYOFFICE JWT。
不是所有 ShareServer 都启用了 Office：`GET /api/v1/office/config` 返回
`enabled`、`formats`、`maxBytes` 和 `versionedDownload`。`directFormats` 为 DOCX、XLSX、PPTX；
`conversions` 声明 DOC → DOCX、XLS → XLSX、PPT → PPTX，`formats` 包含六种可上传格式。
文档 Tab 不再重复填写地址；未配置独立 Office 地址时，GB 复用设备共享连接。
`webUrl` 来自 `SHARESERVER_PUBLIC_URL`，供连接到 API 端口的 GB 自动定位 Web 编辑入口。
仅连接成功不代表编辑引擎健康，仍须验证真实文档打开与保存。

工作区文件、会话文件链接及附件的显式在线编辑动作复用同一连接。已有配置时检查能力后上传，
没有配置时保留文件来源并引导配置；普通文件阅读不创建服务器文档。
远程 Agent 文件由 GB 经所属 Workspace 通道读取，再上传编辑副本。
保存先生成服务端版本，再由 GB 下载确定 revision 并检查来源摘要后回写；不可覆盖的附件另存为。
旧格式通过 ONLYOFFICE `/converter` 转换，不需要业务 Python 或 LibreOffice 服务。
转换结果返回 `originalName` 和 `requiresSaveAs=true`，GB 另存为现代格式，原件不变。
嵌入页铺满文档区域，不显示重复的文件名、保存按钮或版本说明。ONLYOFFICE 自身保存进入服务器后，
新版 GB 自动回写源文件；Ctrl/Cmd+S 同样保存回源文件，Ctrl/Cmd+Shift+S 另存为，关闭时保留保存确认。
自动回写需要新版客户端的专用保存桥；旧客户端仍需保存快捷键。冲突或取消首次另存为后暂停自动回写，显式保存成功后恢复。
Word／PPT 文字选区和 Excel 单元格区域支持右键 AI 编辑，弹窗在编辑区域内显示。
需要包含专用 Office preload 的新版 GB，使用当前对话 Runtime；ShareServer 不接收模型凭据或直接调用模型。
Excel 结果以表格呈现，默认保护公式，可显式允许修改；单次最多 400 格和 32000 字，行列数必须一致。
请核对转换后的版式、公式和嵌入对象；不支持宏保留、密码文件或旧格式反向保存。
入口与客户端验收范围见 [GB Office 进度](../../goodbuddy/docs/features/office-document-editing/progress.md)。

## Docker Compose

当前默认引擎是本地构建的 Community 10.0.0-169，连接数上限 9999。
先在相邻 `goodbuddy-onlyoffice-server` 项目执行 `node scripts/build.mjs`；镜像尚未发布到远端仓库，
部署到其他主机时必须先构建或传输镜像。上游锁定及验证见
[独立构建说明](../../goodbuddy-onlyoffice-server/README.md)。

在仓库根目录准备目录（Office API 以 UID 1000 运行）：

```bash
mkdir -p data/office data/onlyoffice-community/{logs,data,lib,db}
sudo chown 1000:1000 data data/office
openssl rand -hex 32
```

将随机值和镜像写入本机 `.env.office`，不要提交此文件：

```dotenv
ONLYOFFICE_IMAGE=goodbuddy/onlyoffice-server:10.0.0-169-ce9999
ONLYOFFICE_DATA_ROOT=../data/onlyoffice-community
ONLYOFFICE_JWT_SECRET=<上面生成的随机值>
ONLYOFFICE_PUBLIC_URL=http://<主机IP>:8080
SHARESERVER_BIND_ADDRESS=0.0.0.0
SHARESERVER_WEB_PORT=8088
SHARESERVER_PUBLIC_URL=http://<主机IP>:8088
OFFICE_BIND_ADDRESS=0.0.0.0
OFFICE_WHITE_LABEL_ENABLED=false
```

也可从 `docker/office.env.example` 复制配置。Community 保持原生 `end_date=null`、`trial=false`，
不提供 DE 品牌或高级 API 授权。白标开关保持 false；之前的 DE Logo 验证不能作为当前 Community 的品牌能力证明。
历史验证见 [品牌与许可证说明](office-branding.md) 与 [10.0 验证记录](office-10-validation.md)。
已有 `.env.office` 若仍指定旧镜像，需要同步修改；环境变量优先于 Compose 默认值。
`ONLYOFFICE_DATA_ROOT` 相对于 Compose 文件所在的 `docker/` 目录，DE 与 Community 应使用独立目录。

```bash
docker compose --env-file .env.office -f docker/compose.yaml -f docker/compose.office.yaml config --quiet
docker compose --env-file .env.office -f docker/compose.yaml -f docker/compose.office.yaml up -d --build
docker compose --env-file .env.office -f docker/compose.yaml -f docker/compose.office.yaml ps
```

浏览器打开 **http://<主机IP>:8088/documents**。8088 是整个 ShareServer 的 Web 入口；
8787 是统一 API，不再提供静态页面。开发模式 Vite 将所有 `/api` 转发至 8787。
Compose 已启用实例管理员认证，首次打开需按[管理员初始化说明](features/share-server/admin-login.md)
创建账号；登录后可以通过 Nginx 管理模型网关、共享目录和登记记录。Office API 与 Docs 回调
仍沿用现有私有网络协议，尚未建立文档级用户授权。

| 地址 | 默认值 | 访问者 |
| --- | --- | --- |
| Web | `http://<主机IP>:8088` | 浏览器 / GoodBuddy |
| `ONLYOFFICE_PUBLIC_URL` | 内网填 `http://<主机IP>:8080`，默认 localhost 仅供本机 | 浏览器加载编辑器 |
| `OFFICE_INTERNAL_URL` | `http://shareserver:8787` | Docs 取源文件、发送回调 |
| `ONLYOFFICE_INTERNAL_URL` | `http://onlyoffice` | ShareServer 下载保存结果和发送命令 |

后三项必须是 origin，不能带路径、用户信息或查询参数。内部地址由 overlay 固定设置，独立部署
可在自己的 override 中修改。编辑结果仅允许来自配置的 Docs 公网／内网 origin，公网地址映射
到内部地址后下载；不跟随重定向。

内网只有 IP、没有域名是正常部署方式，不要求配置 DNS。GB 与浏览器使用客户端可达的
`http://<主机IP>:8088`，Docs 配置为同一主机的 8080 端口。不要把 Docker 服务名或客户端
localhost 填成远程服务地址。模板中 Docs 默认只绑定回环，内网部署须按上例改为 0.0.0.0。
若使用 HTTPS 入口，Web 和 Docs 都须使用 HTTPS，Docs 反向代理需支持 WebSocket upgrade、
HTTP/1.1 和足够的读超时。Docker 私网下载开启 `ALLOW_PRIVATE_IP_ADDRESS`。
JWT 固定使用 HS256 和共享秘密；源文件验证 `Authorization: Bearer` 出站头，回调兼容 header
及 body token（9.1.0 实测使用 body token），严格比对签名 payload。原始秘密不进入前端。

## 本地开发

Node.js 22+：

```bash
npm ci
export OFFICE_ENABLED=true
export ONLYOFFICE_JWT_SECRET='<与 Document Server 一致的随机秘密>'
export ONLYOFFICE_PUBLIC_URL='http://localhost:8080'
export ONLYOFFICE_INTERNAL_URL='http://localhost:8080'
export OFFICE_INTERNAL_URL='http://<Document Server 可达的宿主IP>:8787'
export SHARESERVER_HOST=0.0.0.0
npm run dev
```

访问 `http://127.0.0.1:5174/documents`。内网开发可用 `npm run dev:web -- --host 0.0.0.0`。
`OFFICE_INTERNAL_URL` 不能填容器自己的 localhost。Docs 需另行启动。后端测试已合并到 Vitest：

```bash
npm test
```

## 配置与保存

| 变量 | 默认值 |
| --- | --- |
| `OFFICE_ENABLED` | `false`（overlay 启用） |
| `OFFICE_DATA_DIR` | `./data/office`（容器 `/app/data/office`） |
| `OFFICE_MAX_BYTES` | 20971520，20 MiB |
| `OFFICE_QUOTA_BYTES` | 1073741824，1 GiB，含保留版本与未引用文件 |
| `OFFICE_TIMEOUT_SECONDS` | 30 秒 |

修改上传上限时须同步 `docker/web.conf` 的 `client_max_body_size`。
文件按上限读入内存后检查 ZIP、对应 OOXML 主内容类型、文档 XML、重复条目和解压大小。
旧格式检查复合文件头后交由 Docs 转换，转换结果按同一规则校验。
不可变 `.docx/.xlsx/.pptx` 版本和文档 `.json` 元数据都位于 `data/office`；元数据原子替换是版本发布点。
先同步文件，再提交元数据，成功后才确认保存。只运行一个 ShareServer 写进程／容器；
Office 在进程内串行提交，不支持多实例共写同一目录。
备份需要暂停编辑和服务后复制整个目录，不能只备份 ONLYOFFICE 缓存。

“保存到服务器”发送 forcesave，回调落盘后更新已持久化版本；编辑中的后续修改可能尚未保存。
关闭编辑器后回到列表，等待最终保存完成，再重新打开。重启时尚未收束的轮次显示“重启后待确认”，
点击“核对编辑轮次”请求 Docs 的 info 回调；服务确认后重试连接。缓存丢失或无法确认时返回冲突，
保留最近成功版本，不自动抛弃未保存编辑。可先下载已保存版本；故障轮次的人工恢复工具尚未实现。
没有自动版本回收；达到额度后保存会失败，需扩容并重试，不能直接删除元数据引用的文件。

GoodBuddy 在共享连接设置中填写本服务的 Web origin，文件入口或“+ → 文档”打开
`/office/editor?document=<文档ID>`。需要同时更新 ShareServer 和 Web，
客户端要求 `/config` 的 `versionedDownload=true`，按确定 revision 下载并校验摘要后回写本地。
普通浏览器继续使用 `/documents` 或 `/documents?document=<文档ID>`。
JWT 秘密只由服务端持有。生产选区插件已提供；登录尚未实现。Desktop 实际范围与证据见
[GB 实施进度](../../goodbuddy/docs/features/office-document-editing/progress.md)。

## 实际验收

2026-10-26 本机已从 DE 切换到 Community 9999：先保存并通过官方维护关闭接口结束现有 PPT 会话，
备份到 `data/office-before-community-20261026.tar.gz`（含本机配置，勿提交或公开）。
切换前后 21 份主文档的 revision 和下载 SHA-256 一致，内网 IP 健康检查及运行时 9999/null 状态通过。
原 DE 数据保留在 `data/onlyoffice/`，新引擎使用 `data/onlyoffice-community/`。
切换后六格式的真实浏览器打开、键盘修改、保存回调及下载内容核对全部通过；探针使用隔离 API/Web
连接已部署的新引擎。常驻 8088 页面也已重新打开原有 PPT，验证历史文件可正常加载。
本轮未重跑完整 GB Electron AI 流程或 9999 并发压测。

回滚时先完成当前编辑会话的保存并执行维护关闭，再指定旧镜像和旧引擎目录：

```bash
docker exec goodbuddy-shareserver-onlyoffice-1 documentserver-prepare4shutdown.sh
ONLYOFFICE_IMAGE=onlyoffice/documentserver-de:10.0 ONLYOFFICE_DATA_ROOT=../data/onlyoffice \
  docker compose --env-file .env.office -f docker/compose.yaml -f docker/compose.office.yaml \
  up -d --no-deps --pull never onlyoffice
```

维护关闭后应确认文档没有 editing/saving 轮次再执行替换。主文档 `data/office` 保留当前版本，
不要为回滚引擎直接覆盖为旧备份。需要长期保留回滚配置时，将对应值写入本机 `.env.office`。

单元测试使用可控上游；2026-10-25 另完成真实浏览器往返，证据见
[实施进度](features/share-server/progress.md)。新部署须按实际主机 IP（或域名）和网络验收：

1. 分别上传三种现代格式和三种旧格式，确认直接打开／转换后打开成功。
2. 修改内容并保存到服务器，看到 revision 更新；继续编辑时 key 保持不变。
3. 关闭编辑器，等待最终保存；重新打开并下载，确认修改一致。
4. 重启 ShareServer 后端，再次打开并下载，确认持久化内容仍在。
5. 多窗口共同编辑、断网重连和待确认轮次恢复需要单独验证。

可复现六格式探针：先 `npm run build`，准备可选测试依赖 Playwright、python-docx、openpyxl、
python-pptx 和 LibreOffice，然后运行 `python scripts/office-e2e/formats_probe.py --host <主机IP>`。
`--browser <Chromium路径>` 可指定现有浏览器，`--desktop` 追加相邻 GB 仓库的真实 Electron DOC 另存为测试。
脚本使用隔离的 18087/18088 API/Web 和临时数据，复用主机 8080 Docs 与 `.env.office` JWT，
不重启常驻服务。LibreOffice 仅用于生成旧格式测试样本，不参与产品转换。

`/api/v1/public/health` 只代表后端存活，不能说明 Docs 可用或编辑往返通过。

从先前 FastAPI 开发部署升级时，先关闭编辑器并等待最终回调，再停止旧 `office-api` 和
`office-web` 容器，启动统一 `shareserver` 和 `web`。保留整个 `data/office/`，不要删除数据卷。
已发布文档 ID、revision、摘要与文件格式保持一致；旧编辑轮次中的 `office-api:8000` 地址
不再保留，不能在编辑器仍打开时直接迁移。Python 只用于可选浏览器验证脚本，不参与服务运行。

## 2026-10-26 本机定制镜像部署记录

常驻 ONLYOFFICE 已切换到 `goodbuddy/onlyoffice-server:10.0.0-169-ce9999-ui1`。
统一后端已重新构建，启用 `OFFICE_CUSTOM_UI_ENABLED=true`，保持
`OFFICE_WHITE_LABEL_ENABLED=false`。Web 地址仍为 `http://192.168.0.23:8088`，
编辑引擎地址仍为 `http://192.168.0.23:8080`。

用户确认文档正常后继续切换，保留原 editing/recovering 状态，没有强行关闭元数据。
25 份原有文档的已保存版本和下载摘要切换前后完全一致；这不代表未确认编辑缓存的恢复。
六格式浏览器编辑、转换、保存及品牌布局回归通过；常驻页面原 PPT 重新打开并加载
GoodBuddy 品牌配置。完整 GB AI 本次未重跑。

回滚镜像、备份位置和后续升级流程见
[构建项目维护文档](../../goodbuddy-onlyoffice-server/MAINTENANCE.md#2026-10-26-继续部署结果)。
