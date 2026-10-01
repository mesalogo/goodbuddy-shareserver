# ShareServer 技术设计

## 文档信息

| 项目 | 内容 |
| --- | --- |
| 状态 | 设计中 |
| 版本 | 0.5 |
| 日期 | 2026-09-28 |
| 关联 PRD | [ShareServer PRD](./prd.md) |
| 功能逻辑 | [功能逻辑设计](./logic-design.md) |
| 共享协议 | [共享网络总体设计](../../../../goodbuddy/docs/architecture/share-network-architecture.md) |

## 1. 仓库与运行边界

ShareServer 在独立的 `goodbuddy-shareserver` 仓库根目录维护。当前可运行结构为：

```text
goodbuddy-shareserver/
  README.md
  package.json
  server/
    src/                 # Hono API、测试与同源静态资源服务
    tsconfig.json
  shared/                # 原型 fixture 与类型
  web/
    src/                 # React Web 控制台与测试
    index.html
    vite.config.ts
    tsconfig.json
  vitest.config.ts        # Web 与 API 测试统一入口
  tsconfig.json          # 引用 Web 与服务端配置
  dist/                  # 生成产物，不提交
    web/
    server/
  docs/features/share-server/
  docker/                # Dockerfile、Compose 与构建忽略规则
```

以下是后续生产实现的建议模块结构，尚未创建，不代表已实现：

```text
goodbuddy-shareserver/
  README.md
  package.json
  server/src/
    api/
    auth/
    organizations/
    devices/
    capabilities/
    policies/
    approvals/
    tasks/
    relay/
    packages/
    office/
    federation/
    audit/
  web/
  migrations/
  deploy/
  tests/
```

依赖与命令统一由根 `package.json` 管理，不拆分 workspace。Vite 输出到 `dist/web/`；
服务端 TypeScript 以仓库根为 `rootDir`，输出到 `dist/server/`，因此启动入口为
`dist/server/server/src/index.js`，共享模块位于 `dist/server/shared/`。根目录运行
`npm start` 或容器启动后，Hono 同源托管 `dist/web/`。Docker 配置仍在 `docker/`，
Compose 的 `../data` 仍映射仓库根 `data/` 到容器 `/app/data`。

仓库根目录包含全控制台交互原型和本地共享目录服务。Hono 提供健康、就绪、
界面快照、原型操作确认与真实元数据 API，并同源托管 React/Vite Web 控制台；它不依赖 Electron 的
`src/shared`。本地目录使用 JSON 文件持久化，契约见第 4.1 节。当前尚未建立生产数据库、认证、设备控制连接，因此也不提前创建空的
`packages/share-protocol`。进入真实 Desktop 协议实现时，服务端和 Desktop 共同依赖
独立发布的 `share-protocol` 协议包，具体归属在真实协议实现时确定；
ShareServer 仍不得导入 Electron 的 `src/shared`，也不得依赖相邻桌面仓库构建。

## 2. 技术选型约束

- 使用与仓库一致的 TypeScript/Node.js 工具链，具体 HTTP 框架在实现前根据维护性选择。
- PostgreSQL 是组织、策略、任务元数据和审计的权威数据库；工作空间消息、处理状态及可靠投递记录
  也以数据库为准，具体业务表与受控正文存储在协作模块实现时增加。
- Package、可选中继暂存和 Office 工作副本使用 S3 兼容对象存储；不开启对应功能时不要求
  对象存储，启用 Office 时对象存储是必需依赖。
- Web 控制台与 API 同源部署，采用严格 CSP，不在浏览器保存设备凭据。
- 单实例部署可完整工作，不为未验证规模预设复杂分布式协议。工作空间实时投递优先评估独立
  实时组件，与是否水平扩展分开决策；第 18 节记录候选方案，尚未确定采用。

## 3. 服务模块

| 模块 | 职责 |
| --- | --- |
| `auth` | 本地身份、OIDC、Web session、服务和设备凭据 |
| `organizations` | 组织、成员、组、角色和范围解析 |
| `devices` | 注册挑战、设备记录、出站连接和在线状态 |
| `capabilities` | manifest、数字人 profile、provider、Publication 和目录投影 |
| `policies` | Grant、强制策略和确定性授权计算 |
| `approvals` | 内容绑定申请、决定、过期和通知 |
| `tasks` | task/attempt、provider 路由、状态和取消 |
| `workspaces`（待实现） | 共享关联、成员访问、资料同步、空间消息、线程与处理请求 |
| `delivery`（待实现） | 事务投递记录、实时组件适配、去重、离线补收与历史查询 |
| `relay` | 可选有界数据中继，不解释能力正文 |
| `packages` | 不可变对象、签名目录、通道和撤销 |
| `office` | 编辑会话、工作副本、ONLYOFFICE 配置、callback、checkpoint、保留和健康 |
| `federation` | 网关身份、offer、双边策略和跨组织映射 |
| `audit` | 事务内审计写入、查询、保留和导出 |

模块通过服务接口调用，API handler 不直接拼接跨组织 SQL 或自行计算权限。

## 4. API 边界

建议分为六类 audience：

```text
/api/v1/web/*         管理控制台与成员自助 API
/api/v1/device/*      设备注册、目录和任务控制 API
/api/v1/office/*      Desktop Office 会话、文件和事件 API
/api/v1/federation/*  ShareServer 间 API
/api/v1/public/*      服务描述、健康与登录入口
/internal/office/*    ONLYOFFICE 文件读取和 callback API
```

设备使用 WebSocket `/api/v1/device/connect` 建立出站控制通道。包下载使用短期、绑定主体和对象
摘要的 URL。联邦 API 使用网关身份，不接受普通用户 session。每类 token 使用不同 issuer/
audience/scope，不能互换。Office 启动 code、文件 token 和 callback token 也使用互不相同的
audience，并绑定单个 `DocumentEditSession`。

所有请求经 schema、认证、organization scope、授权、速率和大小边界。列表使用游标分页和固定
最大页；错误返回 request ID、稳定 code 和有界参数。

### 4.1 本地共享目录契约（已实现）

此接口供同机 GoodBuddy 与 Web Demo 联调，默认监听 `127.0.0.1:8787`。没有登录、组织隔离
或设备认证；可访问接口的客户端均可修改目录。设备 ID 仅标识记录，客户端只显示本机撤销按钮
不构成服务端所有权校验。`productionReady` 保持 `false`。上文 audience、组织授权及 WebSocket
规则是后续组织服务目标，不由这些本地接口实现。

| 方法与路径 | 输入 | 成功响应 |
| --- | --- | --- |
| `POST /api/v1/sharing/devices/register` | `id,name,platform,appVersion` | Device |
| `GET /api/v1/sharing/devices` | 无 | `{devices: Device[]}` |
| `GET /api/v1/sharing/publications` | 可选查询参数 `deviceId` | `{publications: Publication[]}` |
| `POST /api/v1/sharing/publications` | PublicationInput | Publication |
| `POST /api/v1/sharing/publications/:id/revoke` | 路径 ID | Publication |

成功状态码为 200。Device 增加 `registeredAt,updatedAt`，均为服务端 ISO UTC 时间。
PublicationInput 包含 `id,deviceId,name,kind,description,sourceMode,permissions`；
`kind` 为 `capability|knowledge`，`sourceMode` 为 `device|server`，`permissions` 包含
独立布尔字段 `search,read,download`。Publication 增加 `status: published|revoked` 及
`createdAt,updatedAt`。来源和权限目前只保存声明，不传输正文、不执行授权或能力调用。
源码类型见 `shared/sharing.ts`，状态规则见[本地目录逻辑](./logic-design.md#本地目录首期状态规则)。

创建与注册要求 `application/json`，不接收额外字段。ID 长度 1–128，首位为 ASCII 字母或数字，
其余允许字母、数字、点、下划线、连字符。名称最多 200 字符，平台与版本最多 64 字符，描述
最多 4000 字符且可为空。请求体上限 32768 字节。

错误响应为 `{code,message,requestId}`：输入或 JSON 无效返回 400，设备或条目不存在返回 404，
发布 ID 内容冲突返回 409，超限返回 413，媒体类型错误返回 415，存储故障返回 503。
未知 API 路径返回 JSON 404，不进入 SPA 回退。列表暂不分页，适用于本地小规模验证。

`SHARESERVER_DATA_DIR` 指定数据目录，默认 `./data`；其中 `sharing.json` 保存设备和发布记录。
每个目录只供一个进程中的一个 Store 使用。读写排队，写入临时文件并同步后 rename，写失败不更新
内存。坏文件返回存储错误，不自动清空。服务重启重新加载文件；就绪接口不验证存储是否可写。
生产组织服务仍计划使用 PostgreSQL，当前没有文件到 PostgreSQL 的迁移实现。

GoodBuddy 通过 `页面 → preload → 可信 IPC → Main HTTP 服务` 调用，Main 保存稳定设备 ID、
服务地址与设备名称，并设置请求超时。Web 同源读取目录，不保存桌面设备凭据。
两仓独立构建；桌面实现与验证见[设备共享文档](../../../../goodbuddy/docs/features/device-sharing/README.md)。

## 5. 数据模型

下列数据库模型属于组织服务目标设计。本地目录首期使用第 4.1 节的文件存储，不将本地设备 ID 当作组织身份。

核心表建议为：

```text
instances
identity_providers
users
organizations
memberships
groups
group_members
role_bindings
registered_devices
device_credentials
device_connections
capabilities
capability_versions
agent_profiles
providers
publications
grants
policies
approval_requests
approval_decisions
tasks
task_attempts
task_events
package_objects
package_releases
release_channels
update_policies
document_edit_sessions
document_checkpoints
federation_trusts
federation_capability_exports
audit_events
revocations
```

要求：

- 所有组织数据表包含不可为空的 `organization_id`，并由 repository 层强制作用域。
- 唯一约束同时包含 organization，避免跨组织名称冲突泄漏。
- 密钥保存为单向摘要或经外部主密钥加密的密文；数据库不保存明文 token。
- 在线连接和短期 nonce 主要在内存；表中只保存恢复所需元数据，不把 socket 当持久对象。
- task event 只存控制状态和有界统计；正文流不进入普通关系表。
- `agent_profiles` 只保存组织内唯一 handle、显示元数据和其能力版本引用。数字人复用
  Publication、Grant、Approval 和 Task，不创建第二套授权或路由模型；本地 Agent 记忆条目、
  分区目录和来源正文不进入 ShareServer 数据库。
- 数字人 Publication revision 保存有界 `memory_source_policy`，只允许 `agent`、`global`、
  `project` 和 `automation` 种类及 Provider 验证后的本地关联 ID 摘要。Provider 执行时按该
  revision 在本地重新解析分区并检索；服务端不接收记忆文本、来源正文、Embedding 或检索
  结果。新增来源是权限扩大，移除来源是单向收紧。
- 上述记忆限制针对 Provider 私有记忆授权。FR-18 明确发布的知识或回顾副本走独立共享内容
  授权与存储，不借 Publication 内存策略上传私有记忆或开放记忆浏览。
- `document_edit_sessions` 只保存组织、用户、设备、公开来源 ID、显示名、格式、对象键、摘要、
  访问模式、策略 revision、状态和保留期限，不保存 Desktop 绝对路径。
- `document_checkpoints` 以 session 内单调 revision 保存对象键、大小、SHA-256、callback 幂等键
  和时间；`source_commit_confirmed` 只表示 Desktop 回报结果，不由 callback 自动填写。

## 6. 事务与一致性

- 业务变更与对应审计事件在同一 PostgreSQL 事务提交。
- Publication/Grant/Policy 使用 revision 做乐观并发，Web 草稿不能覆盖他人更新。
- 授权决定创建 task 时再次读取当前 revision，并将命中策略摘要冻结到 task。
- 设备在线状态允许短暂最终一致；身份、撤销、授权和任务接受必须走权威存储。
- 重复注册挑战、联邦 offer 和 task create 使用唯一幂等键。
- 无法确认 provider 副作用时只更新 `outcome_unknown`，不靠消息队列自动重放。
- 工作空间消息／状态与 outbox 待投递事件在同一数据库事务提交，提交成功才确认已发送。
  投递重试与客户端补收只传播已有事件，不重建 Task 或重放 Provider 副作用。
- Office callback 的临时对象、checkpoint 行和审计事件在同一提交边界发布。数据库提交失败时
  临时对象保持不可下载并由清理任务删除；重复 callback 依赖会话内幂等键返回已有 revision。

## 7. 设备连接与任务

连接建立后完成设备 credential、organization、客户端协议和当前 registration 校验。服务端为
每个连接设置心跳、空闲、帧、发送队列和并发上限。

任务流程：

```text
authorize -> create task -> resolve exact provider connection
-> send declaration -> provider accepts/rejects
-> establish direct or relay route -> stream progress
-> provider terminal result -> caller delivery -> audit terminal state
```

同一设备重复连接时使用 connection generation；新连接接管未来任务，旧连接仍只允许完成或
查询已归属 task，随后有界关闭。不能把新任务随机发到身份相同但 generation 过期的 socket。

## 8. 中继

中继是可选模块：

- 控制面与中继可部署在不同进程，但共享 task 授权验证。
- 每个 relay ticket 绑定 task、调用方、provider、方向、期限和最大字节。
- 实现背压和全局/组织/设备并发及带宽上限。
- 不解析能力正文，不写普通日志；需要临时落盘时使用加密 GoodBuddy-owned 暂存并按 task 清理。
- 中继关闭、过载或策略禁止时返回准确路由错误，不静默转到其他节点。

## 9. Package 存储

上传先进入不可公开暂存：流式计算大小和 SHA-256，验证签名、manifest、版本、平台和权限后，
以 digest 发布为不可变对象。相同 digest 可去重，但组织授权和 Release 分别保存。

Release catalog 使用独立签名域。服务器不能重打包已签名 payload；镜像目标必须保持相同字节、
大小和 SHA-256。撤销更新目录和授权，不覆盖或原地删除仍受审计保留的对象。

## 10. Office 编辑服务

### 10.1 部署边界

文档以 ShareServer 为主存储，GoodBuddy 承担日常操作。个人创建者可删除或转移给组织，转移
后删除按组织权限判断；管理元数据可见性不授予个人正文访问权。服务端主文档与编辑会话分开
管理，主文档纳入备份及自身删除／保留规则，不随会话过期清理。

第 10.2、10.3 节既有上传、检查点下载和 `source-commit` 契约描述显式的本地来源导入／回写
模式，继续保留 Desktop／SSH 源文件基准校验和冲突处理。服务端主存模式不要求本地回写确认；
其具体存取接口未在本次演示中实现，不由会话 API 推定已经具备文档持久化。

目标设计集成 ONLYOFFICE Docs Developer Edition，但不把 Document Server 代码并入 Hono
进程。生产部署使用独立容器和内部网络：

```text
GoodBuddy Desktop -> TLS reverse proxy -> ShareServer Office API
                                          |-> S3 compatible object storage
                                          |-> ONLYOFFICE Document Server
                                          `-> Office callback worker
```

Desktop 只知道 ShareServer 公开 origin。Document Server 内部地址、JWT 密钥、对象存储凭据和
callback 内部地址只存在于部署配置或密钥管理系统。正式采用前必须完成许可证和桌面分发审核。

### 10.2 Desktop API

```text
POST   /api/v1/office/sessions
PUT    /api/v1/office/sessions/{id}/source
POST   /api/v1/office/sessions/{id}/launch
GET    /api/v1/office/sessions/{id}
GET    /api/v1/office/sessions/{id}/events
GET    /api/v1/office/sessions/{id}/checkpoints/{revision}
POST   /api/v1/office/sessions/{id}/source-commit
DELETE /api/v1/office/sessions/{id}

GET    /internal/office/files/{objectToken}
POST   /internal/office/callback/{callbackToken}
```

Desktop 使用设备凭据创建会话，只提交公开来源 ID、显示名、MIME、声明大小和 SHA-256。上传按
流读取并校验真实格式，不接受 Desktop 指定对象键。`launch` 返回一次性 code；编辑页面交换为
HttpOnly、Secure、SameSite Cookie 后 code 立即失效。

ONLYOFFICE 文件 URL 和 callback URL 由 ShareServer 生成固定 origin，token 绑定 session、
revision、动作、大小和期限。接口不接受调用方提供的任意 callback URL。

### 10.3 保存检查点

callback 输出先写入随机临时对象，完成大小、摘要、格式和普通对象检查后发布不可变 checkpoint。
ShareServer 随后通过设备事件通道通知 Desktop。只有 Desktop 下载复核并回报
`source_commit_confirmed` 后，服务端审计才记录源文件已回写；冲突、超时和未知结果使用独立
状态，不能把“编辑器保存成功”翻译为“本地文件已保存”。

### 10.4 编辑器插件和 AI

ShareServer 托管固定版本的 GoodBuddy ONLYOFFICE 插件，并在会话配置中精确启用。插件只交换
有界选区描述、文档 revision、白名单编辑操作和非正文状态事件。它不能接收 JavaScript、宏、
任意 ONLYOFFICE 方法名或 ShareServer 管理 token。

AI 请求仍由 GoodBuddy Desktop 的 Conversation 和 Runtime 执行。Ask 只能生成建议；Execute
成功取得绑定 session、revision 和选区的短期 Grant 后，插件才可在单个撤销上下文中应用修改。
ShareServer 负责中继有界事件，不持久化选区正文、Prompt 或模型输出。

### 10.5 生命周期和清理

- 会话、工作副本、checkpoint、启动 Cookie 和对象 token 分别设置明确期限。
- 服务端主文档独立保留，清理临时会话对象不得连带删除主文档。
- 关闭、撤销或到期立即拒绝新读取、保存和 AI 操作。
- 清理使用对象标签和数据库状态，重复执行保持幂等，不根据用户文件名构造删除前缀。
- 法定保留只能延长明确匹配的工作副本、checkpoint 或审计元数据，不能恢复访问授权。
- 备份恢复不恢复编辑 Cookie、启动 code、文件 token、callback token 或活动编辑连接。

## 11. 联邦协议

- 每个实例生成网关身份和可轮换证书，私钥不进入数据库备份明文。
- offer 包含双方可人工核对的组织名、端点、指纹、协议和 nonce。
- 双方确认后交换有界 capability projection 和本地映射 ID。
- 跨组织 task 带双方关联 ID 和短期签名声明；每端独立授权并各写审计。
- 不接受调用方提供的任意回调 URL、第三方 hop 或内部主体 ID。
- 证书轮换需要旧身份签名或双方重新确认；身份突变直接暂停关系。

## 12. Web 安全

- 使用 HttpOnly、Secure、SameSite cookie 和 CSRF 防护管理 Web session。
- OIDC 使用 state、nonce、PKCE 和固定回调地址。
- 富文本字段按纯文本显示；manifest/schema 使用安全代码查看器，不执行 HTML。
- 权限隐藏仅改善界面，所有 API 在服务端重新校验。
- 登录、设备注册、目录、审批、导出和联邦接口分别限速。
- 密钥字段只能替换、轮换和测试，永不回显。
- 编辑页面使用独立 CSP 和 Cookie scope；ONLYOFFICE origin 不能访问管理控制台 session。
- Document Server 默认禁止任意出站网络、宏和未批准插件。编辑文件视为不可信内容。

## 13. 部署与配置

最小生产部署：

```text
TLS reverse proxy/load balancer
ShareServer API + Web
PostgreSQL
可选：S3 compatible object storage
可选：Relay worker
可选套件：ONLYOFFICE Document Server + Office callback worker（需要对象存储）
```

部署配置通过环境变量或挂载文件提供数据库、主密钥、公开 URL、OIDC、邮件、对象存储和限制。
普通 Web 管理员不能修改基础设施秘密。提供数据库迁移命令、不可变镜像、非 root 容器、健康
与就绪端点、优雅停止和部署示例。

Office 配置包括启用状态、Document Server 内部地址、公开编辑 origin、JWT 密钥引用、对象
存储 bucket、允许格式、文件大小、组织/用户并发、会话期限和 checkpoint 保留。管理界面不能
回显密钥。Office readiness 必须完成最小文档创建、编辑器加载、callback 和输出摘要验证，不能
只检查 Document Server HTTP 端口。

## 14. 可观测性与备份

- 结构化日志只包含 request/task/organization 关联 ID、稳定事件和错误码。
- 指标覆盖请求、WebSocket、授权结果、任务状态、中继、Package、Office 会话/callback 和联邦，
  不包含能力正文、文档正文或选区。
- tracing 跨内部服务传播关联 ID，跨联邦只传播双方同意的关联标识。
- 备份 PostgreSQL、服务端主文档、Package 对象、策略要求保留的 Office checkpoint 和网关身份；不备份缓存、
  Web session、nonce、Office 短期 token 或中继暂存。
- 恢复后撤销列表、组织 ID、签名目录和审计序列保持有效，所有设备重新连接。

## 15. 测试策略

### 15.1 自动化

- schema、认证 audience、CSRF、OIDC 和设备挑战。
- 每个 repository/API 的跨组织隔离与枚举防护。
- 拒绝优先授权、审批内容绑定、预算和并发。
- device generation、离线、撤销、重连和 provider 冻结。
- task 幂等、取消、结果未知和不自动重放。
- Package 流式校验、不可变性、权限 diff 和撤销。
- 联邦双方确认、策略交集、暂停、证书变化和禁止第三 hop。
- 审计事务、过滤、分页、导出和正文缺失。
- Office token audience、上传格式/摘要、callback 幂等、checkpoint 不可变、保留和清理。
- Ask 拒绝编辑写入，Execute Grant 绑定 session、revision 和选区且不能跨文档复用。

### 15.2 集成与部署

- Desktop 与真实 ShareServer 完成注册、目录、调用、文件和取消。
- 两个隔离组织验证搜索、计数、错误、对象和审计不泄漏。
- 两个 ShareServer 完成联邦建立、跨组织调用和单方撤销。
- 中继关闭与开启、容量耗尽、连接中断和大文件背压。
- 数据库备份恢复、版本升级、滚动停止和设备重连。
- 生产 TLS、OIDC 和对象存储组合的端到端验证。
- Windows、macOS、Linux Desktop 与同一 ShareServer 打开、编辑和保存 DOCX、XLSX、PPTX。
- 多文档会话隔离、同一源文件多开只读、源文件冲突、断线恢复、callback 失败和过期清理。
- ONLYOFFICE 真实版本、许可证允许的并发矩阵、浏览器兼容、CPU/内存和大文件边界。

设计完成不代表服务已实现；只有独立部署和真实 Desktop 端到端路径通过后才能更新实施状态。

## 16. 当前原型实现

2026-09-05 建立的交互原型固定以下技术基线：

- API：Hono + `@hono/node-server`，保留 `/api/v1/public/*` 与
  `/api/v1/web/*` audience 路径。
- Web：React、Vite、TypeScript、Tailwind CSS 和 Radix primitives，按 shadcn/ui 组件模式
  维护本地可修改组件。
- 路由与范围：管理员和成员自助使用不同可见导航；当前组织持续显示。
- 部署：生产构建由同源 Hono 服务托管，并提供非 root 多阶段 Docker 镜像。

`/api/v1/public/ready` 返回 `mode=interactive-prototype` 和
`productionReady=false`。原型 fixture、角色切换和操作确认只用于评审信息架构，不得被
Desktop 或部署脚本当作真实身份、策略、任务或审计 API。下一实施阶段必须从 FR-1
初始化、本地身份、PostgreSQL 组织作用域和事务审计开始，不在 fixture 上叠加生产状态。
当前 `/documents` 已有 OnlyOffice 实例配置与预设检查模拟；Office 会话 API、对象存储、
ONLYOFFICE 编辑、callback、文档保存和 Desktop 文档 Tab 集成仍未实现。

`web/src/app-config.ts` 将 `/model-gateway`、`/documents`、`/distribution` 放入管理员的
“GoodBuddy 服务”分组。`web/src/components/services-demo.tsx` 使用 `ServicesDemo` 的 React
Context 与 `useState` 共享演示状态，跨路由导航保留、刷新重置。服务演示操作不使用 Hono
操作确认 API、不发网络请求、不写本地存储，也不保存凭据；页面角色与权限判断均为内存模拟。
控制台启动仍通过既有快照 API 加载示例数据，此边界仅指三个服务页的模拟操作。

模型网关只模拟上游／映射启用与用户组策略判断及最近 50 条有界调用审计；产品职责是转发
其他模型服务，不托管模型或执行推理。文档仅保存示例名称、归属及回收站标记；转移清除个人
删除权，组织删除／恢复依赖显式模拟角色，恢复保留归属。OnlyOffice 检查使用预设结果。

配置演示保存单个草稿和按组发布历史，发布与回退均重新检查模型可用性；回退取上一条记录并
移除当前末项，恢复版本及默认模型。仅目标组在线示例设备更新 `applied`，离线设备保持原值与
待下发状态。这里没有设备连接、重连投递或持久化版本记录，不能作为真实配置交付证据。

共享中心原型由 `web/src/components/sharing-center.tsx` 和 `web/src/lib/sharing-fixtures.ts` 提供。
条目使用现有快照中的成员、设备 ID 建立关联，本地 fixture 仅含元数据和显式权限标记。
既有 `/capabilities` 路由不变；查询参数 `view=catalog|knowledge|users|devices` 选择页签，
`user`／`device` 定位主体，`item` 打开详情，`q`、`status=ready|unavailable`、
`source=synced|remote`、`audience` 保存筛选。刷新恢复 URL 状态；内容链接保留筛选，
跨主体链接清除旧条件，无效条目链接显示可关闭的错误详情。除启动快照外不新增 API 请求，
不保存正文、不模拟下载；真实授权和同步仍属后续实现。

## 17. 工作空间协作的待实现契约

本节记录 FR-15 至 FR-18 对服务端的最低契约要求，尚未确定具体 API 路径、数据库迁移和协议
包版本；跨产品网络架构继续以关联总体设计为准，进入开发前须完成 Desktop/Server 联合评审。

| 对象或契约 | 服务端要求 |
| --- | --- |
| 共享关联 | 本地 workspace ID 与服务端共享 ID 分开；绑定 organization、owner、成员和 revision；本地未共享空间不注册到服务端 |
| 资料同步请求 | 携带共享关联、客户端操作 ID、基准 revision 和增量游标；逐项返回接受、拒绝或冲突，不使用客户端时间决定权限 |
| 空间消息 | 保存发送者、message ID、thread ID、提及身份、上下文版本与受众；普通消息不创建处理任务 |
| 处理请求 | 显式意图关联一条消息，保存唯一处理人、本人确认标记和接受时的偏好版本；提及与处理人分开 |
| 处理偏好 | 按空间和成员保存模式、分身绑定、来源授权引用及 revision；只应用于处理请求，绑定 Publication 沿用能力权限检查 |
| 消息事件与历史 | 稳定事件身份、服务端顺序及对象 revision；支持增量补收和历史分页，资料暂停不停止消息事件 |
| 执行与回复 | 对消息处理版本、任务关联和回复 ID 建立幂等约束；接手与发布以同一权威版本比较，防止迟到结果发布 |
| 回顾与知识 | 引用来源身份、版本、受众和动作授权；明确共享的内容副本存入受控内容存储，原始私有分区不入库 |

ShareServer 必须持久化获准共享的消息和资料，才能提供消息离线补收及资料同步。此功能使用受控
业务内容存储，不能复用普通审计或只转发不持久化的 task relay；仅部署控制面的实例应报告
空间协作不可用，不假装接受消息。具体正文存储介质、额度、加密与保留配置在协议实现前确定。
管理员仅凭管理身份不能通过内容接口读取正文，备份策略须覆盖启用后的共享业务内容。

授权撤销、成员状态与同步接收使用服务端当前事实。在同一事务中接受一次操作并记录幂等结果，
重试只能获得同一结果；冲突不能静默覆盖成员名单、内容范围或回复。分身运行环境仍在
Provider，工作空间消息不使 ShareServer 自动成为模型运行节点。草稿确认须原子消费待确认的
处理版本；同操作重试返回原结果，不同正文的重复确认或接手后的旧确认返回版本冲突。

验收须覆盖 US 中的离线发送、确认丢失、部分成功、跨空间隔离、移除成员、关闭共享后旧队列、
同时接手与发布、不同正文的重复确认、待开启时关闭共享、新成员读取历史的限制，以及回顾
两种权限的单独撤销。静态 demo 的 localStorage 和
角色切换不能作为这些服务端契约的实现。

## 18. 实时通信组件选型提案

状态：待验证，未定版、未安装组件、未新增运行依赖。优先评估 **ShareServer + PostgreSQL +
Centrifugo**。此处是组件职责比较，不代表已核验当前版本、许可证、部署成本或生产可靠性；
选型须以固定版本的文档核对与端到端试验为依据。

| 候选 | 采用范围 | 需要 GoodBuddy 完成的部分 | 当前判断 |
| --- | --- | --- | --- |
| [Centrifugo](https://centrifugal.dev/) | 实时频道、连接及恢复相关机制 | 权威消息存储、历史、权限、成员通知和协作处理 | 优先验证，可保留 ShareServer 业务模型 |
| [Matrix / Synapse](https://matrix.org/) | 房间、成员、消息及同步体系 | 身份、空间与房间映射、界面及分身协作扩展 | 采用完整通信体系的备选 |
| [OpenIM](https://openim.io/) | IM 服务与客户端 SDK | 组织和空间集成、协作处理及来源授权 | IM 范围扩大时比较 |
| [Socket.IO](https://socket.io/) | 连接、事件及房间广播 | 持久化、可靠交付、历史、补收和业务权限 | 可作传输层，不按完整 IM 服务评估 |

### 18.1 职责与投递流程

ShareServer 接收客户端消息并执行组织、空间、受众和附件授权检查。Centrifugo 候选方案只负责
实时传输，不能由客户端绕过 ShareServer 直接广播一条被视为权威的消息。

1. 客户端携带稳定操作 ID 提交普通消息、线程回复或显式处理请求；附件版本先准备完成。
2. ShareServer 在一个事务内写入消息／状态、必要的处理请求及 outbox 事件，提交后返回接受结果。
3. 后台投递器读取 outbox，将已提交事件发布到实时组件；成功后记录投递结果。发布后未能记录
   成功可能导致重复投递，因此采用至少一次投递，客户端按事件身份与对象版本合并。
4. 在线客户端收到更新通知后，按授权读取新增消息和状态。断线后按服务端游标补收；组件的
   短期历史只作加速，不能替代数据库中的权威消息历史。
5. 仅显式处理请求的执行调度可创建分身 Task，创建受幂等约束；历史重放、事件重投或成员多设备
   在线不会重复启动执行。

实时组件故障时，只要数据库和业务接收条件正常，ShareServer 可确认消息已保存，并说明实时
投递延迟；outbox 恢复后继续投递。数据库事务失败则不确认已发送。过期历史或游标失效时返回
明确的重新同步路径，在现有保留范围内重建进度，不伪造完整历史。

### 18.2 访问与事件范围

首期优先使用不含正文、草稿或敏感摘要的更新通知，具体订阅标识由服务端授权生成；客户端
经当前授权的内容 API 拉取正文。移除成员或关闭共享后，内容、历史及补收接口立即拒绝新
读取，并撤销其订阅／连接资格，不能仅依赖长效订阅凭据自然过期。

频道按组织、空间及受众隔离。AI 草稿使用独立私有范围，公开频道、历史、outbox 公开事件和
普通成员补收中均不含草稿正文。本人确认后的最终回复作为新的公开消息提交。已在撤销前取得
的正文无法通过断开连接擦除；旧通知也不能帮助客户端绕过当前内容授权。

### 18.3 验证与定版条件

- 两个真实客户端验证普通消息、提及、线程回复、请求处理和状态更新；暂停资料自动同步时消息仍及时到达。
- 数据库提交后、实时发布前终止投递器，恢复后消息不丢失；发布后确认丢失允许重复事件但不重复显示或执行。
- 多设备断线重连验证顺序、去重、历史分页和游标恢复；组件历史不可用时可从数据库补收。
- 移除成员后旧连接不能获取新正文，旧 token 不能读取历史或补收；验证跨组织、跨空间与草稿隔离。
- 本人接手和分身完成竞争、两个设备确认不同草稿时，只发布规则允许的结果。
- 核验候选固定版本的许可证、维护状态、SDK 与 Desktop 兼容性，以及部署、备份恢复和资源需求。

上述验证通过后再确定组件、版本、接口与部署拓扑。消息目标延迟、规模及保留期限仍待产品和
部署评审；当前不作吞吐或实时性数值承诺。运维需记录 outbox 积压、投递重试及补收失败，备份
消息与事件进度；连接、短期凭据不恢复。新增组件的配置、凭据和健康检查进入部署设计后才能上线。
