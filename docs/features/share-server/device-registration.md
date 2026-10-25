# 设备注册策略与审批

## 使用方式

管理员登录后打开 **GoodBuddy 接入（`/devices`）→ 注册设置**。
注册模式默认“免验证”：新设备注册自动接纳，无需管理员账号、注册码或人工确认。
“需要审批”会产生待审批设备，管理员可以批准或拒绝；已接纳设备可以停用，再次批准可恢复。
切换模式只影响新的注册，不改变原有设备和待审批申请。重复注册保留原来的审批结果。

GB 在设备共享页面保存 ShareServer 地址（支持 `http://主机IP:8088`），点击“注册本机”。
待审批、拒绝、停用状态有明确提示；管理员批准后点击“刷新列表”即可连接。
必须同时更新 GB 和 ShareServer。旧客户端使用管理员目录接口，开启控制台登录后会返回 401。
Office 与模型网关继续使用各自既有协议，本功能不会把设备凭据变成全局管理员身份。

## 接口与存储

| 接口 | 认证及行为 |
| --- | --- |
| `GET/PUT /api/v1/sharing/registration` | 管理员读取或设置 `{mode: "open" / "approval"}`，读取返回设备与注册状态 |
| `POST /api/v1/sharing/devices/:id/decision` | 管理员提交 `{status: "approved" / "rejected" / "disabled"}` |
| `POST /api/v1/device-sharing/devices/register` | GB 提交原有设备元数据及 Bearer 凭据，返回设备和 `registrationStatus` |
| `GET /api/v1/device-sharing/status` | 凭据验证后仅查询自身状态，待审批和停用设备也可查询 |
| `GET /api/v1/device-sharing/devices` | 已接纳设备读取目录，仅返回已接纳设备 |
| `GET/POST /api/v1/device-sharing/publications` | 已接纳设备读取／发布元数据；只能发布属于自身的条目 |
| `POST /api/v1/device-sharing/publications/:id/revoke` | 已接纳设备只能撤销自身条目 |

GB 在首次请求前生成 32 字节随机凭据并原子保存，服务器注册时将其摘要绑定设备身份。
这样注册响应丢失后仍可用同一凭据重试；服务器从不凭设备 ID 单独允许覆盖已有凭据。
设备请求携带 `Authorization: Bearer …` 和 `X-Device-Id`，注册请求的身份以请求体 `id` 为准。
模式、凭据 SHA-256 摘要、审批状态与目录一起写入现有 SharingStore，沿用单进程写入队列及
PostgreSQL JSONB／本地 JSON 存储。凭据摘要不出现在目录或管理员响应中。
旧元数据缺少注册字段时默认免验证，原有设备与发布保留；旧设备等待更新后的 GB 注册凭据。

未注册／错误凭据返回 401；待审批、拒绝、停用及非本机资源写操作返回 403，并提供中文原因。
被停用设备发布的条目仍留在管理目录中，但不向设备目录提供，恢复接纳后重新可见。
注册接纳不等于在线状态，不提供组织成员身份、知识正文传输或远程能力执行。

## 验证

自动化覆盖默认模式、切换后保留待审批、重复注册、重启、凭据错误、跨设备写入拒绝及停用。
真实 IP 浏览器与 GB Main 服务往返：构建后运行
`python3 scripts/verify-device-registration.py --host <主机IP> --browser <Chromium路径>`。
脚本需要可选 Python Playwright，使用隔离的 18097/18098 服务和临时数据，结束后清理。
默认验证本地 JSON；设置 `PROBE_DATABASE_URL` 可针对专用的隔离测试数据库执行相同流程，勿指向业务数据库。
Python 不参与业务部署。GB 的 Electron 回归入口与实测范围见相邻设备共享进度文档。
