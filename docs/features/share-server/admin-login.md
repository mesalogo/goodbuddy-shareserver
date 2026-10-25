# 实例管理员登录第一版

此版本提供一个实例管理员账号及 Web 管理会话，是 B2 的首个子集。尚未实现成员登录、组织
隔离、账号恢复或多人角色权限。设备凭据与审批已另行接入，见[设备注册与审批](./device-registration.md)。管理登记仍不等同于领域授权或远程执行。

## 部署与首次初始化

Compose 默认启用认证。在部署环境文件中配置浏览器实际访问的地址，例如：

```dotenv
SHARESERVER_PUBLIC_URL=http://192.168.0.23:8088
```

支持 IP 和端口，不需要域名。浏览器提交请求的 Origin 必须与该地址一致；使用 HTTPS
时配置 HTTPS 地址，服务将设置 Secure Cookie。HTTP 仅用于受控内网，账号和会话没有传输加密。

首次启动在 `SHARESERVER_DATA_DIR/admin-setup-token` 生成随机初始化码，文件权限为 0600。
在服务器上读取，然后打开控制台，填写初始化码、自选账号和密码：

```sh
docker exec goodbuddy-shareserver-shareserver-1 node -e "console.log(require('fs').readFileSync('/app/data/admin-setup-token','utf8'))"
```

账号为 3–64 位字母、数字或 `_.@-`，密码为 12–1024 位。创建成功后自动登录、删除初始化码，
后续初始化请求返回 409；已有管理员时重启不会重新开放初始化。没有默认账号或默认密码。

源码运行时设置 `SHARESERVER_AUTH_ENABLED=true` 和 `SHARESERVER_PUBLIC_URL` 启用认证。
未启用时保留原 direct-loopback 开发模式，不支持 LAN 管理。Compose 明确启用认证。

## 会话与访问范围

- 密码使用随机盐与 scrypt 派生，存储中没有明文密码。
- 配置数据库时账号保存在 `shareserver_state` 的 `admin` 键；无数据库时原子保存为
  `admin.json`。两种后端之间不自动迁移账号，部署时需保留所选存储。
- 浏览器使用 HttpOnly、SameSite=Strict Cookie；HTTPS 配置还启用 Secure。
- 服务器内存保存会话随机值的摘要，最长 12 小时，最多 100 个会话。
  退出立即撤销当前会话；进程重启使所有会话失效，账号仍然保留。
- 认证模式下共享目录、模型网关管理、管理登记及旧原型 API 均要求登录，回环请求也没有豁免。
  未登录返回 401。写操作必须带匹配的 Origin，跨来源请求返回 403。
- 登录／初始化请求最多 8 KiB，每实例每分钟最多 20 次尝试，超限返回 429。
- 模型推理继续使用原有 scoped Bearer Key，管理员 Cookie 不能代替客户端 Key。
- Office API、嵌入式编辑器与 Docs 回调保留现有协议，本次登录不为文档建立用户所有权保护。
  `/documents` 控制台页面受登录页保护，不能据此推导 Office API 已完成组织授权。
- 认证启用后，旧 Desktop 共享元数据客户端不能匿名调用管理接口；更新后的 GB 使用独立设备接口和凭据，默认免验证接纳或按管理员策略等待审批。
  管理变更记录暂未增加操作者字段，不能据此宣称已完成身份审计。

登录页支持错误提示、重试与首次密码确认。登录后显示账号和退出按钮；管理请求返回 401
时重新显示登录表单；页面聚焦及每分钟检查会话。恢复登录后重新加载当前页面的数据。

## 接口

| 方法 | 路径 | 行为 |
| --- | --- | --- |
| GET | `/api/v1/auth/session` | 认证启用状态、是否初始化及当前会话账号；禁止缓存 |
| POST | `/api/v1/auth/setup` | `username/password/setupToken` 创建首位管理员并登录 |
| POST | `/api/v1/auth/login` | `username/password` 验证并签发会话 |
| POST | `/api/v1/auth/logout` | 撤销当前会话并清除 Cookie |

保持单进程写入约束；初始化写入串行化，失败不返回登录成功。存储损坏返回服务错误，不重新
开放初始化。具体已验证结果见[实施进度](./progress.md)。
