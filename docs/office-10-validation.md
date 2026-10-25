# ONLYOFFICE 10.0 与 GB 接入前验证

后续 Desktop 本地 DOCX 接入验证见
[GB 实施进度](../../goodbuddy/docs/features/office-document-editing/progress.md)：已通过真实 Electron
修改回写、冲突保护与另存为。服务端新增指定版本下载回归，Python 测试现为 15 项；下文是
接入前的独立浏览器测试记录，不覆盖后来新增的完整桌面需求。

2026-10-25，在独立 Docker 网络和测试数据目录完成。测试对象是当前 ShareServer React 构建、
FastAPI 源码及用户指定的 `onlyoffice/documentserver:10.0`，未修改相邻 GoodBuddy 源码。

## 环境与结果

- 镜像 digest：`sha256:ca17889f10b11141cc6441836aebdd2835cf3e1b49681b2fd6e155c94b7850b3`。
- 容器包版本：`onlyoffice-documentserver 10.0.0-169`，Community 镜像，未安装 Developer 许可证。
- 浏览器：Linux Chromium，由 Python Playwright 驱动；Web `127.0.0.1:18088`，Docs
  `127.0.0.1:18080`，内部使用 `office-api:8000` 和 `onlyoffice:80`。
- FastAPI 主文档目录使用宿主挂载；现有服务和项目默认数据未参与测试。

| 实际场景 | 结果与证据 |
| --- | --- |
| Web 上传 DOCX，打开真实编辑器 | 通过；Docs 成功取得受 JWT 验证的源文件 |
| 键盘输入后手动保存 | 通过；revision 2，下载 DOCX 解压后包含输入的文字 |
| 关闭后最终保存 | 通过；revision 3、`state=saved` |
| API 容器重启后读取及重开 | 通过；源文件仍存在，重新打开内容一致 |
| 普通插件读取当前未保存选区 | 通过；`GetSelectedText` 返回 `GB_UNSAVED_SELECTION_10`，此时服务器下载版本不含该文字 |
| 仅替换局部选区 | 通过；`PasteText` 替换选中的文字，未选择的 `original ` 前缀保留 |
| 一次撤销插件修改 | 通过；键盘 Ctrl+Z 恢复插件执行前的人工输入 |
| 插件中文修改的保存闭环 | 通过；`GB_PLUGIN_FINAL_10 中文修改` 经 forcesave、最终回调、API 重启、编辑器重开后仍一致 |
| 无新修改关闭 | 通过；重开只读选区后关闭，状态收束为 `closed` |

保留脚本的完整成功执行文档 ID：`75574294f29648618be34a2ceeed4ca0`，forcesave revision 2，
final revision 3。这些 ID 仅属于本轮隔离测试，不是可供业务使用的文档。

基础检查：Python 14 项、Web/Hono 104 项测试通过；lint、类型检查和生产构建通过。
宿主未提供 npm，因此 JavaScript 检查使用本地 Node 24.16.0 容器。Vitest 退出期间有既有
Vite 依赖扫描日志噪声，退出码为 0；没有将此描述成无告警运行。FastAPI 镜像重新构建通过。

## 可复现脚本

入口：[scripts/office-e2e/browser_probe.py](../scripts/office-e2e/browser_probe.py)。它是真实服务集成测试，
不会被普通 Vitest 自动执行。可选测试依赖为 Python 的 httpx、PyJWT、Playwright 和 Chromium。
服务运行无需 Python。上方 FastAPI 记录是迁移前的历史测试；当前架构见部署文档。
先按 [部署说明](office-deployment.md) 启动一套**独立测试栈**，Web/Docs 公开地址必须与参数一致。
可以使用自己的测试端口，不要指向存有用户文档的服务。

```bash
# 在运行测试的终端提供测试栈的同一个 ONLYOFFICE_JWT_SECRET；不要写入源码。
python scripts/office-e2e/browser_probe.py \
  --web http://127.0.0.1:18088 \
  --docs http://127.0.0.1:18080 \
  --plugin-port 18089 \
  --restart-container <独立测试栈的ShareServer容器名>
```

`--browser` 可指定已安装的 Chromium；不指定则使用 Playwright 的默认 Chromium。
`--restart-container` 是可选参数；未提供时不会执行容器重启，也不计作重启验证。
脚本自动启动并关闭回环插件静态服务，创建带随机文件名的测试文档；文档保留在测试栈中，
由操作者在结束测试后统一清理独立测试数据。脚本的固定视口和键盘操作针对 Linux Chromium，
不能直接作为三个桌面平台的交互验收。

测试插件位于 `scripts/office-e2e/plugin/`。脚本在本次浏览器的 editor API 响应中添加插件配置，
使用测试栈秘密重新签名；没有替换编辑器、源文件下载、保存命令、回调或持久化实现。
插件通过真实 `Asc.plugin.executeMethod` 操作当前编辑器。测试不调用任何模型，没有 AI 调用费用。

## 对 GB 接入的直接结论

GB 最新提交 `c8ef4ed4` 新增了独立本地预览 Demo（DOCX／XLSX／PPTX／PDF），其 ONLYOFFICE
按钮仍未接通。本地阅读不创建编辑会话，显式编辑才进入本服务；GB 的接入设计与状态见
[Office 入口](../../goodbuddy/docs/features/office-document-editing/README.md)及
[实施进度](../../goodbuddy/docs/features/office-document-editing/progress.md)。Demo 的 Windows 验证
与本记录的 Linux Docs 验证是不同链路，不相互替代。

1. 当前 Community 10.0 上，普通插件已能完成 DOCX 当前选区读取、文本替换及用户单步撤销。
   这条链路可用于下一步实现 GB AI 编辑桥，不必先依赖未验证的 Automation API。
2. 插件配置由 Docs 编辑器 origin 跨域读取。初次实验未设置 CORS 时插件未加载；为插件静态
   服务返回精确的 `Access-Control-Allow-Origin` 后完成验证。正式托管时需覆盖配置及所需资源，
   不能把 Office 业务 API 全面开放跨域来代替插件资源配置。
3. GB 仍需实现当前文档／选区与聊天请求的绑定、模型返回期间的选区变化处理、专用文档页签、
   保存回源文件、冲突反馈和关闭流程。这次插件测试不代表上述产品能力已经实现。
4. 本次仅证明简单 DOCX 文本选区路径。富文本格式保持、表格／图片范围、XLSX、PPTX、多人
   协同、断网、中文输入法、真实 Electron WebContentsView、跨平台剪贴板与应用退出均未验收。
   插件写入中文成功也不能等同于操作系统中文输入法验证。
5. Automation API、完整 AI 模型往返和 GB 本地／远程源文件回写没有测试，不能依据镜像版本或
   普通插件成功推断这些能力可用。

默认 Compose 和环境模板已同步为此次验证的 10.0 digest。测试容器与网络在本轮结束后清理；
未升级正在运行的业务容器。
