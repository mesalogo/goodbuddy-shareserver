# ShareServer

ShareServer 是 GoodBuddy 设备共享网络的独立 Web 服务。它为一个或多个组织提供身份与设备
目录、能力发布、授权策略、任务路由、可选数据中继、能力包更新、网关联邦、Office 编辑和
审计管理。目标范围还包括共享工作空间的实时消息、成员处理请求和资料同步。

成员的日常操作在 GoodBuddy 中完成，ShareServer 提供组织后台。模型网关向其他模型服务转发
请求，不托管模型或运行推理。文档主要存储在 ShareServer；个人创建者可删除自己的文档或将
所有权转移给组织，转移后删除由组织权限决定，原创建者不再保留个人删除权。

Office 区分服务端主存文档与显式的本地来源导入／回写模式。既有 Desktop 源文件、检查点和
冲突契约用于后者；编辑会话结束不删除服务端主文档，检查点可用也不等于本地或 SSH 源文件已回写。

ShareServer 不属于 Electron Main，不负责桌面端局域网发现，也不自动取得设备上的能力、
文件、凭据或 SSH Host。

## 文档导航

| 文档 | 权威职责 |
| --- | --- |
| [PRD](./prd.md) | 管理角色、产品范围、功能需求和验收 |
| [用户故事](./user-stories.md) | 工作空间、实时消息、资料同步及数字分身处理的验收场景与逻辑审查 |
| [功能逻辑](./logic-design.md) | 组织隔离、设备、发布、策略、任务和联邦状态规则 |
| [管理界面设计](./ui-design.md) | ShareServer Web 控制台的信息架构与交互 |
| [技术设计](./technical-design.md) | 服务模块、API、数据、部署、运维和验证 |
| [实施进度](./progress.md) | 已验证实现、剩余生产工作与验证证据 |
| [共享网络总体设计](../../../../goodbuddy/docs/architecture/share-network-architecture.md) | 跨端身份、能力、授权、任务、更新和协议权威（GoodBuddy 仓库） |
| [Desktop Office 协同编辑](../../../../goodbuddy/docs/features/office-document-editing/README.md) | 文档 Tab、源文件回写、冲突和 AI 选区编辑（GoodBuddy 仓库） |

工作空间协作场景由用户故事追踪；管理员、能力发布者、审计员等既有场景继续由 PRD 与逻辑
设计覆盖。仓库已有全控制台交互原型及本地共享目录服务，后者持久化 GoodBuddy 注册和发布的元数据。
组织生产服务尚未实现。当前边界和运行方法见[实施进度](./progress.md)与
[`README.md`](../../../README.md)。跨仓库文档链接要求将 `goodbuddy` 与
`goodbuddy-shareserver` 克隆到同一级目录；服务构建和运行不依赖桌面端仓库。

当前源码按 `web/src/`、`server/src/` 和根 `shared/` 组织，构建、测试与依赖仍由根目录统一管理。
目录和产物路径见[技术设计第 1 节](./technical-design.md#1-仓库与运行边界)。

## GoodBuddy 服务演示

当前新增 `/model-gateway`（模型网关）、`/documents`（文档与协作）、`/distribution`（配置下发）
三个路由，演示策略判断、文档归属与回收站、OnlyOffice 实例配置和检查、按组发布与回退。
三页导航共享会话内存，刷新重置；服务演示操作不发网络请求、不写本地存储。角色开关、检查
结果和在线设备应用状态均为模拟，未实现推理、真实转发、Office 编辑保存或设备交付。
具体交互见 [UI 设计第 16.1 节](./ui-design.md#161-goodbuddy-服务演示)。

共享中心沿用 `/capabilities`。能力目录、共享知识库、按用户查看和按设备查看使用示例数据；
“本地服务目录”页签读取真实本地记录。来源模式、权限展示与跳转约定见
[UI 设计](./ui-design.md)，本地 API 见[技术设计第 4.1 节](./technical-design.md#41-本地共享目录契约已实现)。

本地体验：在本仓库运行 `npm run dev`，在 GoodBuddy 仓库运行 `npm run dev`，从桌面应用中心
进入设备共享，连接 `http://127.0.0.1:8787`，注册、发布，再打开
`http://127.0.0.1:5174/capabilities?view=local` 查看。服务数据默认保存到 `data/sharing.json`。
完整桌面范围与验证见[设备共享文档](../../../../goodbuddy/docs/features/device-sharing/README.md)。

## 角色

- **系统管理员**：维护实例、身份源、域名、证书、存储和全局限制。
- **组织管理员**：管理本组织成员、设备、组、策略、能力、Office 编辑政策和联邦关系。
- **能力发布者**：在获准范围内发布设备能力或签名能力包。
- **审批人**：处理调用、发布、更新和联邦申请。
- **审计员**：只读查看和导出获准范围内的审计事件。
- **成员**：主要通过 GoodBuddy Desktop 协作和使用能力；在 Web 端管理个人设备、授权、申请及自己发布的数字人。
