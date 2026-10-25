# 管理登记第一版

此版本提供实例范围内的管理准备工作，不改变跨端架构中的身份、Grant、Task、Package 或
FederationTrust 定义。记录是人工维护的管理资料，不是这些生产领域对象。

## 可用行为

配置下发、组织与成员、权限策略、审批、资源与更新、网关互联、任务中心和系统设置均可创建
登记草稿、编辑、搜索、按状态筛选并导出当前结果。系统设置目前保存实例资料备注，不修改
部署参数或功能开关。配置导出为管理登记 JSON，尚不是 Desktop 自动导入格式。

新记录从 `draft` 开始。状态转换为：

- `draft` → `pending` 或 `archived`
- `pending` → `approved`、`rejected` 或 `archived`
- `approved` → `archived`
- `rejected` → `draft` 或 `archived`
- `archived` → `draft`

只有草稿允许修改名称和详细说明；恢复草稿与编辑是两个操作。变更前提供确认对话框。
审核决定只记录人工判断，不自动授予权限、创建用户、安装资源、推送配置或执行任务。
记录暂未包含操作者字段，也不是组织合规审计。实例登录不改变登记内容的业务含义。

运行概览的待处理项读取所有模块的 `pending` 记录，最近活动显示最新 10 条管理变更。
操作审计支持搜索、查看与导出最近 1000 条管理元数据。模型调用审计继续由模型网关提供。

## HTTP 与存储

认证启用时，所有接口要求管理员会话；可通过 LAN Nginx 代理管理，写操作校验配置的 Origin。
未启用认证的开发模式保留 direct-loopback 管理边界。详见[管理员登录第一版](./admin-login.md)。

| 方法 | 路径 | 行为 |
| --- | --- | --- |
| GET | `/api/v1/console` | 返回 `{records, audits}` |
| POST | `/api/v1/console/:module` | 创建草稿；成功 201 |
| PUT | `/api/v1/console/:module/:id` | 带 `revision` 更新内容或状态；成功 200 |

`module` 为 `distribution / members / policies / approvals / releases / federation / tasks / settings`。
请求接受 `name`（1–200 字）、`detail`（最多 12000 字），更新还需要当前正整数 `revision`，
可选 `status`。新建不能指定已有版本或非草稿状态。单次请求限制 64 KiB。
版本冲突、非法状态转换返回 409，模块或记录不存在返回 404，输入无效返回 400。

记录包含 UUID、module、name、detail、status、revision、createdAt、updatedAt。
变更元数据包含 UUID、module、recordId、action、at、revision，不复制详细说明。
每实例最多 5000 条登记，变更记录最多 1000 条；归档保留原记录。

无数据库时原子保存到 `SHARESERVER_DATA_DIR/console.json`；配置 PostgreSQL 时使用
现有 `shareserver_state` 表的 `console` 键，初次读取可加载本地 JSON，下一次写入迁入数据库。
每次记录与变更历史在同一状态写入中保存。依赖单进程、单 Store 的串行写入约束，
不支持多个实例同时写相同存储。保存失败不会回报成功。

## 后续领域实现

成员登录和组织授权、结构化策略与执行端校验、资源文件与签名验证、设备配置回执、
任务调度和双边联邦握手仍需要专门实现。`/me/*` 因缺少已认证个人身份继续保留边界提示。
这些能力不能由登记记录的“审核通过”推导为已完成。
