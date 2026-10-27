# ONLYOFFICE Developer 品牌与内网配置

当前部署已改为 `goodbuddy/onlyoffice-server:10.0.0-169-ce9999`（Community），
运行时 `customization=false`、`branding=false`、`advanced_api=false`，没有 DE 试用截止日期。
本页以下 Developer 品牌效果是此前部署的验证记录，不代表当前 Community 具有相同能力。
ShareServer 仍提供品牌资源和编辑配置，但具体显示以 Community 的实际支持为准，白标开关保持关闭。
当前部署与回滚见 [部署说明](office-deployment.md)。

## 已配置的选项（品牌效果曾在 DE 验证）

| 项目 | 配置与行为 |
| --- | --- |
| 编辑器 Logo | GoodBuddy 图标和名称，浅色／深色分别提供；点击 Logo 不跳转外部网站 |
| 品牌资源 | `/api/v1/office/branding/` 由 ShareServer 提供，不依赖 CDN，支持 IP 和跨端口加载 |
| 聊天室 | `document.permissions.chat=false`，隐藏并关闭 Docs 聊天，GB 对话不受影响 |
| 反馈与建议 | `feedback=false`、`suggestFeature=false` |
| 帮助入口 | `help=false`，避免内网用户进入未配置的外部帮助入口 |
| 新功能提示 | `features.featuresTips=false` |
| 匿名姓名弹窗 | `anonymous.request=false`；不据此声明已有用户或设备身份映射 |
| Docs 自带 AI | `ai.disabled=true`，只关闭官方 AI 插件；GB 的三格式右键 AI 保留 |
| 关于中的客户信息 | 标准 Developer 品牌信息为 GoodBuddy；引擎法律／许可信息仍由 Docs 控制 |

保存、撤销、批注、审阅、导航、属性面板及状态栏保留。关闭这些编辑功能不是品牌替换的必要条件。
未设置 `customization.plugins=false`，因为它会连 GB 右键插件一起禁用。

品牌配置由 `server/src/office/branding.ts` 维护，并包含在签名后的编辑配置中。
图标来自 GoodBuddy 现有素材，已经存入本仓库 `server/src/office/branding/`；正常构建不依赖相邻 GB 检出。
更新素材时可运行 `node scripts/import-office-branding.mjs ../goodbuddy/src/renderer/src/assets`。

## 扩展 White Label

官方将加载 Logo、加载文字、隐藏“关于”以及更细的布局隐藏列为扩展 White Label 功能。
本项目已准备以下配置，默认不开启：

```dotenv
OFFICE_WHITE_LABEL_ENABLED=false
```

具备对应权限的许可证安装后，设为 `true` 将请求：

- `loaderLogo` 使用本地 GoodBuddy 图标，`loaderName` 使用 GoodBuddy。
- `about=false` 隐藏“关于”入口。
- `layout.toolbar.plugins=false` 隐藏插件页签，保留后台自动启动和右键插件功能。

该开关不会授予许可证权限，也不会修改或移除编辑器源码中的版权／试用标识。
加载页版权和试用提示不能视为普通文本资源随意替换；是否隐藏由合法白标授权和引擎能力决定。
同一白标接口还可定制界面字体，隐藏用户头像、用户列表或部分布局入口，但当前没有默认隐藏这些元素。

许可证文件放到宿主机 `data/onlyoffice/data/license.lic`，现有卷映射会将其提供给
`/var/www/onlyoffice/Data/license.lic`。不要将许可证提交 Git。保存并关闭编辑会话后更新／重启 Docs，
再更新 ShareServer 的白标开关；检查实际界面和许可证状态，而不只是检查环境变量。

官方参考：

- [标准品牌配置](https://api.onlyoffice.com/docs/docs-api/usage-api/config/editor/customization/customization-standard-branding/)
- [扩展 White Label](https://api.onlyoffice.com/docs/docs-api/usage-api/config/editor/customization/customization-white-label/)

## 2026-10-26 历史记录：Community 切换至 DE

- 官方源索引摘要：`sha256:7bb561b7e22e9df4bebd73a9146e83c0e422fabc29c09a36aa4b2f4b28e04e61`；amd64 清单摘要：
  `sha256:df36b101233bb71e1125dc88e13bff7e9168663fc25096b4ebc463d8e5920b32`。
- 主机 Docker 镜像代理返回压缩层错误，通过本机代理及 Skopeo 从官方仓库导入；未改 Docker 守护进程配置。
  导入会改变本地清单表示，不能把导入后的 Docker ID 当成上述官方源摘要。
- 切换前无 editing/saving 轮次。停机备份编辑引擎 Data、lib、db 到
  `data/office-backups/docs-community-10-before-de-20261026.tgz`，原 Community 镜像保留。
- 切换后 21 份既有文档的 revision 与实际下载 SHA-256 全部一致，Docs 与 API 健康检查通过。
- 当时 DE 引擎报告 `trial=true`、`customization=true`、`branding=false`，试用截止日期为 **2026-11-26**。
  标准 Logo 已实测生效，扩展白标未授权，白标开关保持关闭。正式部署需对应的有效许可证。
- 六格式的浏览器加载、原生保存、下载内容检查通过；GoodBuddy Logo 已加载，聊天／帮助／反馈入口隐藏。
  本次浏览器初始化、编辑和文件菜单检查未观察到外部域名请求，不代表对容器所有后台网络行为做了审计。

复核主文件可使用 `scripts/office-e2e/check-migration.mjs capture|check <Web地址> <快照文件>`。
品牌截图及六格式测试可运行 `formats_probe.py --host <IP> --browser <Chromium> --branding-screenshots <输出目录>`。
# 插件图标与保存入口

GoodBuddy AI 插件使用 ShareServer 本地提供的 GoodBuddy 图标，不依赖外部图片服务。普通和高分屏图标入口复用现有 PNG 品牌资源。

Web 编辑页不再提供外层“保存到服务器”按钮，使用 ONLYOFFICE 内置保存；服务器持久化状态仍以保存回调完成后的版本记录为准。新版 GB 嵌入页在服务器生成新版本后自动通知桌面回写本地或远程源文件，回写成功才提示“已保存到文件”。只读或旧格式来源首次选择另存路径；冲突或取消后暂停自动回写，可用保存／另存为快捷键恢复。普通浏览器只保存服务器文档。
# 自建 Community 界面定制验证（2026-10-26）

自建镜像支持 `OFFICE_CUSTOM_UI_ENABLED=true`，由 ShareServer 下发
`customization.goodbuddyUi`。桌面 Word、Excel、PPT 可读取 GoodBuddy Logo、
加载名称/图片以及布局配置。此路径使用 `OFFICE_WHITE_LABEL_ENABLED=false`；
引擎仍报告 Community 的原始品牌许可状态。关于及法律声明入口保留。

本轮在独立 Docs `18080` 和 Web `18088` 端口完成六格式实际编辑保存，
确认 GoodBuddy 左上角图标、隐藏插件页签/聊天/帮助/反馈、局域网资源加载。
加载名称和图片验证到 iframe 参数，未对所有瞬态加载画面逐帧验收。
未观察到外部域名请求。194 项 ShareServer 测试、lint、类型检查与构建通过。
本轮未切换常驻容器，未重跑完整 GB AI 调用。构建与镜像记录见
[独立项目说明](../../goodbuddy-onlyoffice-server/UI-CUSTOMIZATION.md)。
