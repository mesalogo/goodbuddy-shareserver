# ShareServer

ShareServer 是 GoodBuddy 设备共享网络的独立 Web 服务。它为一个或多个组织提供身份与设备
目录、能力发布、授权策略、任务路由、可选数据中继、能力包更新、网关联邦、Office 编辑和
审计管理。目标范围还包括共享工作空间的实时消息、成员处理请求和资料同步。

成员的日常操作在 GoodBuddy 中完成，ShareServer 提供组织后台。模型网关向其他模型服务转发
请求，不托管模型或运行推理。文档主要存储在 ShareServer；个人创建者可删除自己的文档或将
所有权转移给组织，转移后删除由组织权限决定，原创建者不再保留个人删除权。

Office 区分服务端主存文档与显式的本地来源导入／回写模式。既有 Desktop 源文件、检查点和
冲突契约用于后者；编辑会话结束不删除服务端主文档，检查点可用也不等于本地或 SSH 源文件已回写。

Office 私有部署第一阶段仍待实现：先验证浏览器 DOCX 上传、编辑、保存与重新打开，默认本地
文件存储，独立 Document Server 容器；范围见 [PRD](./prd.md#office-私有部署第一阶段待实现)，
部署与协议以[技术设计第 10.1 节](./technical-design.md#101-私有部署第一阶段待实现)为准。
拟议 `docker/compose.office.yaml` 尚不存在，现有 Compose 不包含 ONLYOFFICE。

ShareServer 不属于 Electron Main，不负责桌面端局域网发现，也不自动取得设备上的能力、
文件、凭据或 SSH Host。

## 文档导航

| 文档 | 权威职责 |
| --- | --- |
| [产品功能列表](./feature-list.md) | 按模块、页面和 Tab 汇总功能范围、状态和当前交付边界 |
| [PRD](./prd.md) | 管理角色、产品范围、功能需求和验收 |
| [用户故事](./user-stories.md) | 工作空间、实时消息、资料同步及数字分身处理的验收场景与逻辑审查 |
| [功能逻辑](./logic-design.md) | 组织隔离、设备、发布、策略、任务和联邦状态规则 |
| [管理界面设计](./ui-design.md) | ShareServer Web 控制台的信息架构与交互 |
| [技术设计](./technical-design.md) | 服务模块、API、数据、部署、运维和验证 |
| [后端基础设计](./backend-foundation-design.md) | GoodBuddy 适配依据；B1 已实现、验收部分完成，B2 至 B6 待实现 |
| [实施进度](./progress.md) | 已验证实现、剩余生产工作与验证证据 |
| [共享网络总体设计](../../../../goodbuddy/docs/architecture/share-network-architecture.md) | 跨端身份、能力、授权、任务、更新和协议权威（GoodBuddy 仓库） |
| [Desktop Office 协同编辑](../../../../goodbuddy/docs/features/office-document-editing/README.md) | 文档 Tab、源文件回写、冲突和 AI 选区编辑（GoodBuddy 仓库） |

工作空间协作场景由用户故事追踪；管理员、能力发布者、审计员等既有场景继续由 PRD 与逻辑
设计覆盖。仓库已有控制台交互原型、本地共享目录服务和真实转发的本地模型网关；目录持久化
GoodBuddy 注册和发布的元数据，网关独立保存上游、模型映射和有界调用元数据。
组织生产服务尚未实现。当前边界和运行方法见[实施进度](./progress.md)与
[`README.md`](../../../README.md)。历史演示与测试记录保留其原有范围，当前实现说明不追溯扩大验证结论。
跨仓库文档链接要求将 `goodbuddy` 与
`goodbuddy-shareserver` 克隆到同一级目录；服务构建和运行不依赖桌面端仓库。

当前源码按 `web/src/`、`server/src/` 和根 `shared/` 组织，构建、测试与依赖仍由根目录统一管理。
目录和产物路径见[技术设计第 1 节](./technical-design.md#1-仓库与运行边界)。

## GoodBuddy 服务入口

`/model-gateway` 提供上游与模型映射保存、服务端加密凭据、模型访问 Key、真实模型发现、请求测试
和调用元数据审计。管理仅限直连回环，客户端通过 Bearer Key 访问获授权的模型；组织认证、组织
隔离及配额控制仍待实现。旧环境引用保留存储兼容，前缀导入界面和接口已移除。
网关独立于 GoodBuddy 运行，无桌面源码依赖；个人既有配置仅可用于明确授权的环境测试，不自动读取或迁移。
启动方法及客户端 Base URL 见[根 README](../../../README.md#local-model-gateway)，接口、存储和限制见
[技术设计第 4.2 节](./technical-design.md#42-本地模型网关契约已实现)。

`/documents` 显示待接入说明，没有示例文档或 OnlyOffice 模拟检查。`/distribution` 同样为待接入占位，
无配置草稿、设备回执、发布或回滚；保存网关模型
不会自动下发到 GoodBuddy。交互见 [UI 设计第 16.1 节](./ui-design.md#161-goodbuddy-服务入口)。

`/devices` 和共享中心沿用真实本地 API：前者展示登记设备及其发布数量，后者直接读取设备与发布记录，支持筛选、设备跳转和撤销已发布元数据；已移除组织示例页签。
来源模式与知识权限仅为声明，尚无正文服务。交互约定见
[UI 设计](./ui-design.md)，本地 API 见[技术设计第 4.1 节](./technical-design.md#41-本地共享目录契约已实现)。

本地体验：在本仓库运行 `npm run dev`，在 GoodBuddy 仓库运行 `npm run dev`，从桌面应用中心
进入设备共享，连接 `http://127.0.0.1:8787`，注册、发布，再打开
`http://127.0.0.1:5174/capabilities?view=local` 查看。服务数据默认保存到 `data/sharing.json`。
完整桌面范围与验证见[设备共享文档](../../../../goodbuddy/docs/features/device-sharing/README.md)。

[后端基础设计 B1](./backend-foundation-design.md#4-b1正常模型网关接入)代码已实现，验收部分完成：
已记录 103 项自动化测试及部分真实 API 验证；完整工具结果回传、GoodBuddy Desktop 和浏览器界面
验收仍未完成。Vite `/api` 只允许回环 socket，容器／反向代理管理须等待 B2 登录。

## 角色

- **系统管理员**：维护实例、身份源、域名、证书、存储和全局限制。
- **组织管理员**：管理本组织成员、设备、组、策略、能力、Office 编辑政策和联邦关系。
- **能力发布者**：在获准范围内发布设备能力或签名能力包。
- **审批人**：处理调用、发布、更新和联邦申请。
- **审计员**：只读查看和导出获准范围内的审计事件。
- **成员**：主要通过 GoodBuddy Desktop 协作和使用能力；在 Web 端管理个人设备、授权、申请及自己发布的数字人。
