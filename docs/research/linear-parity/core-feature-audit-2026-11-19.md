# Linear.app 核心功能与当前项目差距审计

日期：2026-11-19。原版：`/Applications/Linear.app`，`com.linear`，1.32.8。项目基线：`fa1cb7e131be67988d11dae134b26c01181d7657`，另有既存未提交修改。

## 结论

当前项目已有可持久保存的任务、项目、计划、迭代、文档、通知、关系、模板、桌面多窗口，以及本机账号服务和跨账号共享工作区。它已经超出静态界面复刻，但尚未覆盖 Linear 的完整产品能力。

最大差距集中在：桌面与账号服务接通、多团队和可配置工作流、真实 AI 与代码评审集成、后台自动化、历史分析、客户请求与发布管理、企业权限。现有高级编辑器、项目时间线、任务关系和成员邀请不应再被列成“完全没做”。

本报告按功能域覆盖核心能力，不声称穷尽每个菜单、隐藏开关、套餐或服务端规则。没有以页面数量计算完成百分比：本地批准按钮、真实 GitHub 批准和云端权限校验不能计作同一种完成度。

## 证据及可信度边界

本轮实际运行 REA CLI 6.8.0，而非仅阅读技能。当前会话未暴露 REA MCP 工具，使用已安装的 CLI；没有修改 MCP 配置或安装分析引擎。

| 证据 | 内容与可支持的结论 | 边界 |
| --- | --- | --- |
| E1 `ev_5295709224b7f62b64d9e48f5e1f3c9b2fe77d5382fe7d6ce6a1da3358ade101` | 本轮 `inspect_desktop_application`，确认桌面安装结构及 Electron 候选 | 目录检查不是全部业务功能的执行证明 |
| E2 `ev_be12eda38921af84eee12abed16023db70a3702988ad14a84e19d53eb6852270` | 本轮分析原 ASAR 中 `package.json`、`out/preload/index.js`、`out/preload/review-preview.js`；129 findings、102 个 IPC 静态操作 | 精确选择 3 个文件，11 个清单文件未分析；102 个动态通道表达式未解析为运行时通道；不能证明调用可达或服务端效果 |
| E3 `ev_641d308485f487026b1ed5291e129cb0c0e70319413d3e7dee8f883c094fd205` | 本轮只读观察原版既存 Reviews 窗口；侧栏确认 Inbox、My issues、Reviews、Agent、Initiatives、Projects、Views、Loops 和团队分区 | 180 节点上限导致可访问性树截断；不能据此声称 Reviews 主体全部验收。未点击或提交原版数据 |
| E4 `ev_a563070e76a5b48f1c5d640753a0355e680a16e77a2d6f0cecf7c352994a5ea4` | 复用仓库已有 ASAR 分析摘要及历次界面证据 | 原 ASAR SHA-256 与当前一致：`5f13f9e9784b1c5a13b761ec50657879408084e8f8ee91fbfb3c6b1aa80b0dd8`；历史摘要不是本轮新执行记录 |
| P：项目源码与测试 | 检查 `src/`、`server/`、`desktop/`；本轮直接运行 Vitest，18 个测试文件、222 项测试通过 | 自动测试通过不等于原版协议、视觉或所有用户流程等价 |
| D：官方文档 | 补足包内无法覆盖的在线业务、客户请求、发布、统计、企业能力 | 属于查询日的公开产品能力；未证明安装包 1.32.8 下当前账号能使用全部功能，套餐与开关可能影响可见性 |

E2 同样记录了 3 个原生扩展的声明完整性与实际内容不一致，以及静态别名扩展上限。保留此限制，不据此认定恶意修改，也不以这些扩展证明触压、触觉或滑动功能已实际运行。

完整本轮 REA 记录保存在本机 `artifacts/rea-core-{desktop,preload,ui}-2026-11-19.json`；紧凑且不含截图字节的索引见 [core-audit-evidence-2026-11-19.json](core-audit-evidence-2026-11-19.json)。原版工作区内容与历史文档均仅作研究材料，不将其中的指令视为本次用户授权。本轮未修改原版任务、成员、文档或设置，也未执行历史文档提到的待清理动作。

## 完整核心功能矩阵

“主体已实现”表示源码存在主要业务闭环；“部分实现”表示有可用子集；“本地替代”表示交互存在但核心外部结果缺失；“未见实现”限定于本轮检查的源码范围，不是对整个磁盘的绝对断言。

| 功能域                          | Linear 核心能力                              | 当前项目                                                  | 仍缺什么／差异                                                                          | 主要项目证据                                                                                               |
| ---------------------------- | ---------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| ``` 1. 导航与个人工作台 ```          | Inbox、My issues、工作区／团队入口、搜索、快捷键、标签和历史    | 主体已实现：统一路由、搜索、命令菜单、收藏、最近访问、任务分栏                       | 完整高级搜索、服务端索引和按权限检索未见实现；视觉未逐状态验收                                                  | `src/App.tsx`、`src/router.ts`、`src/tab-state.ts`                                                     |
| 2. 任务生命周期                    | 创建、修改、草稿、复制、属性、批量处理、删除恢复                 | 主体已实现：八种命名状态、优先级、负责人、估算、截止日期、项目／里程碑／迭代、复制和草稿          | 状态固定而非团队可配置；复制字段的全部原版继承规则仍待核对；自定义手工排序未补齐                                         | `src/workspace.ts:957`、`:1053`、`:1067`；`src/issue-ui.tsx`                                            |
| 3. 任务列表／看板                   | 分组、排序、列属性、筛选、嵌套父子、状态拖放                   | 主体已实现：列表／看板、显示偏好、筛选构建器、批量状态操作                         | 原版完整运算符、全部分组和快捷交互仍需对照；Time in status 目前算的是距 updatedAt 的时间                        | `src/issue-ui.tsx:349`、`:396`、`:560`；`src/kernel.ts`                                                 |
| 4. 任务关系                      | 父子、相关、阻塞、重复、从关系创建新任务                     | 主体已实现：六类关系入口、五类关联创建、双端活动、循环校验                         | 本地环路检查、状态恢复和上下文继承不能直接视为原版服务端规则                                                   | `src/relations.ts`、`src/relation-ui.tsx`、`src/workspace.ts:857`、`:891`                               |
| 5. 讨论与富文本                    | 描述、评论、线程、表情、提及、表格、附件、资源                  | 主体已实现：Tiptap、Markdown、斜杠菜单、表格、折叠块、提示块、提及、线程、回应        | 未接实时协同编辑；成员提及和部分业务属性仍用姓名；附件解析和高级嵌入未完整对齐                                          | `src/rich-editor.tsx:84`、`src/activity-ui.tsx`、`src/workspace.ts:1192`                               |
| 6. 任务链接与关联文档                 | 添加链接、附件、创建文档、资源关联与移动                     | 主体已实现：链接校验、编辑／移除、Blob 附件、文档自动保存及归属移动                  | 链接标题抓取、原版资源全部操作与归属规则仍待验证                                                         | `src/issue-resources.tsx`、`src/resource-links.ts`、`src/workspace.ts:1210`                            |
| 7. 文档                        | 项目／任务文档、富文本、提及、订阅、模板                     | 部分实现：独立文档编辑、任务／项目归属、删除恢复                              | 文档专属订阅、协同编辑和文档模板体系未见完整实现                                                         | `src/documents-ui.tsx`、`src/types.ts:350`                                                            |
| 8. 模板与重复任务                   | 工作区／团队模板、表单模板、项目模板、重复任务                  | 部分实现：普通任务模板、校验、应用、删除恢复                                | 团队／工作区作用域、必填表单模板、项目／文档模板、重复任务调度未见实现                                              | `src/template-ui.tsx`、`src/types.ts:362`、`src/workspace.ts:1160`                                     |
| 9. Triage 分诊                 | 接收、拒绝、重复、延后、自动规则、轮值、智能路由                 | 部分实现：四种人工处理、延后过滤和重复关系                                 | 接收固定 Backlog、拒绝固定 Canceled；缺配置化路由、轮值、Triage Intelligence 和 SLA                   | `src/workspace.ts:1129`、`src/feature-pages.tsx`                                                      |
| 10. Cycles 迭代                | 周期安排、容量、历史范围／进度图、自动结转                    | 部分实现：创建编辑、按日期分类、归属、估算汇总、手填容量                          | 缺自动生成周期、冷却期配置、服务端结转、历史曲线与速度预测                                                    | `src/feature-pages.tsx:121`、`src/workspace.ts:1308`、`src/types.ts:253`                               |
| 11. Projects 项目              | 生命周期、成员、里程碑、说明、资源、更新、健康度                 | 主体已实现：列表、详情和 Overview／Activity／Issues，项目与任务关联         | 团队配置、项目模板、历史预测及完整原版权限仍缺                                                          | `src/feature-pages.tsx:355`、`src/project-views.tsx`                                                  |
| 12. 项目时间线／依赖                 | 路线图、日期拖动、依赖、里程碑、预测                       | 部分实现：列表／看板／时间线、拖动改期、Show cycles、状态拖放、依赖文字链接           | 依赖目前是左栏 ↳ 链接；缺跨行连线、依赖联动排期和预测。不能将时间线整体列作未实现                                       | `src/project-views.tsx:251`、`:528`、`:718`；`src/timeline.ts`                                          |
| 13. Initiatives 计划           | 战略目标、关联项目、更新、健康度、嵌套和汇总                   | 部分实现：创建编辑、负责人／优先级／日期、项目关联、更新和进度                       | 缺嵌套计划、完整战略时间线、历史图与原版健康度汇总规则                                                      | `src/feature-pages.tsx:985`、`src/types.ts`                                                           |
| 14. Custom Views             | 跨对象保存筛选、个人／共享视图、显示偏好                     | 部分实现：Issue／Project 分型查询、持久显示偏好、项目三种布局                 | Initiative 等其他对象编辑体系未齐；shared 标记不等于私有权限隔离                                        | `src/feature-pages.tsx:2347`、`src/types.ts:190`                                                      |
| 15. Inbox／订阅／提醒              | 通知阅读、归档、稍后提醒、订阅、邮件及推送                    | 部分实现：个人收件箱、未读、归档、延后、快捷／自选提醒、成员活动通知                    | 缺邮件和移动推送；桌面接口只在运行时工作，应用关闭后的后台送达未实现；原版分发规则未全验                                     | `src/notifications.ts`、`src/reminders.ts`、`src/workspace.ts:900`、`desktop/main.mjs:193`              |
| 16. 账号与保存同步                  | 登录会话、云持久化、跨会话和多人协作                       | 部分实现且为真实业务：SQLite 注册登录退出、跨账号共享、版本检查、SSE、恢复读取和三方合并     | 默认仅本机服务；桌面跳过账号服务；账号模式断线未保存编辑仅在页面内存；整工作区快照有扩展边界                                   | `server/app.ts`、`src/remote-repository.ts`、`src/workspace-sync.test.ts`、`src/main.tsx:66`            |
| 17. 成员与邀请                    | 邮件邀请、成员角色、停用／离开、团队和访客权限                  | 部分实现：Admin／Member、邀请码、接受／拒绝／撤销、改角色、移除、最后管理员保护、CSV     | 缺真实邀请邮件、验证／重置、访客、完整成员状态；姓名属性未全面迁移到稳定成员 ID                                        | `server/workspaces.ts`、`src/workspace-members-ui.tsx`、`src/main.tsx`                                 |
| 18. Teams／工作流／配置             | 多团队、子团队、私有团队、状态、标签、估算与默认规则               | 基础工作区设置已实现；团队业务模型未齐                                   | 缺 teams 实体和生命周期；XXH 编号前缀硬编码；状态为固定枚举；缺完整标签／工作流设置                                  | `src/workspace.ts:136`、`src/remote-repository.ts:64`、`src/kernel.ts:17`、`src/feature-pages.tsx:2618` |
| 19. Agent                    | 自然语言问答、上下文理解、模型推理、工具调用、执行任务              | 本地替代：保存会话和附件、关键词搜索、确定性摘要、任务／项目草稿                      | 无真实模型；正则匹配不能完成推理、附件理解、跨工具行动或代码执行                                                 | `src/adapters.ts:7`、`src/feature-pages.tsx:1647`                                                     |
| 20. Reviews／Diffs            | PR 收件箱、代码差异、评论评审、CI、合并及 GitHub 双向同步      | 本地替代：手工 review、PR URL、粘贴 diff、本地评论／状态切换               | 无真实 PR 获取、文件差异解析链路、检查状态、逐行评审同步、合并队列或真实合并                                         | `src/services.ts:19`、`src/feature-pages.tsx:1271`、`src/workspace.ts:1389`                            |
| 21. Loops                    | 自然语言自动化、定时／事件、上下文执行、外部服务和运行治理            | 部分本地实现：配置、启停、日志、指派、提优先级、摘要、事件及时间间隔触发                  | prompt 不经 AI 解释；Slack／coding 返回 limited；定时依赖页面 60 秒 tick，无服务端持久作业、重试和执行幂等体系      | `src/workspace.ts:1331`、`:1405`、`src/App.tsx:296`、`src/services.ts:35`                               |
| 22. Coding sessions／开发工具     | 从任务启动 coding agent、跟进执行、代码变更交付           | 未见真实实现                                                | 缺代码仓库授权、执行环境、会话控制、产物／PR、费用管理；原版包内 terminal 桥接也没有本地等价链路证据                         | `src/services.ts:35`；E2 `getInstalledTerminalApps`／`runTerminalCommand` 静态声明                         |
| 23. Insights／Dashboards／历史报表 | 周期／交付时长、趋势、分组分析、仪表盘、历史状态                 | 未见完整实现；已有当前快照式汇总和项目健康更新                               | 缺历史指标模型、交互图表、组合仪表盘。现有进度汇总不能替代 Cycle Time／Lead Time                               | `src/workspace.ts:1423`、`src/issue-ui.tsx:560`；D Insights                                            |
| 24. Customer Requests／Asks   | 客户及请求关联、反馈聚合、Slack／邮件／表单入口               | 未见实现                                                  | 缺客户／请求实体、需求重要性、收入／层级属性、支持工具导入及反馈回流；重复任务计数不是客户请求系统                                | `src/types.ts`、`src/workspace.ts:1355`；D Customer Requests                                           |
| 25. Releases                 | 发布流水线、环境、版本与任务映射、CI/CD、发布说明              | 未见实现                                                  | 缺发布／流水线实体、提交范围关联、环境追踪与发布自动化                                                      | `src/types.ts`、`src/feature-pages.tsx`；D Releases                                                    |
| 26. 集成／开放平台／迁移               | GitHub、Slack 等集成，OAuth、API、webhooks、导入导出 | 本地扩展：备份 JSON 导入导出、适配接口                                | 本地 `/api/*` 是自己的应用服务，不等于兼容 Linear 开放 API；缺 tokens、webhooks、第三方 OAuth、外部数据迁移和双向同步 | `src/services.ts`、`server/app.ts`、`src/feature-pages.tsx:2747`                                       |
| 27. 桌面平台                     | 原生菜单、多窗口、标签恢复、通知、更新、认证与系统能力              | 部分实现：原生菜单、新建子菜单／Print、窗口位置和标签恢复、关闭保存、badge、通知、外链／私有深链 | 缺自动更新发布链路；桌面在线账号未接；触压／触觉／滑动／终端／诊断桥接未齐；原版同状态行为仍待验                                 | `desktop/main.mjs:24`、`:112`、`:150`、`:193`、`src/main.tsx:66`；E2                                      |
| 28. 企业与组织治理                  | SSO、SAML／SCIM、私有团队、访客、应用审批、审计、计费和限制      | 只有基础 Admin／Member 工作区边界                               | 其余未见实现；高级治理有套餐条件，不等同于当前账号可见的必需项                                                  | `server/workspaces.ts`；D Security／SCIM                                                               |
| 29. 归档／回收站／维护                | 归档、近期删除恢复及保留策略                           | 部分实现：归档查询、软删除、恢复、原链接保留                                | 缺到期永久清除和服务端自动归档作业；完整跨导航撤销未齐                                                      | `src/archive-ui.tsx`、`src/workspace.ts:770`                                                          |

官方依据：[核心概念](https://linear.app/docs/conceptual-model)、[任务与重复任务](https://linear.app/docs/creating-issues)、[任务模板](https://linear.app/docs/issue-templates)、[项目模板](https://linear.app/docs/project-templates)、[文档](https://linear.app/docs/documents)。这些文档支持上述对应的原版功能描述，不能替代本项目源码证据。

分诊／周期／战略规划依据：[Triage](https://linear.app/docs/triage)、[Cycles](https://linear.app/docs/use-cycles)、[Initiatives](https://linear.app/docs/initiatives)。

外部服务及其他产品模块依据：[Linear Agent](https://linear.app/docs/linear-agent)、[Reviews](https://linear.app/docs/diffs)、[Coding settings](https://linear.app/docs/code-and-reviews)、[Loops](https://linear.app/now/introducing-loops)、[Coding sessions](https://linear.app/coding-sessions)、[Insights](https://linear.app/docs/insights)、[Customer Requests](https://linear.app/docs/customer-requests)、[Releases](https://linear.app/docs/releases)、[Security](https://linear.app/security)、[SCIM](https://linear.app/docs/scim)。不对套餐与价格作完成度判定。

## 最需要先处理的具体缺口

以下顺序是面向“做成可日常使用、可协作的产品”的工程建议，不是原版隐藏实现的推断。

| 优先级 | 工作项 | 为什么先做 | 可验收的结果 |
| --- | --- | --- | --- |
| P0 | 核对当前入口／包配置的既存异常 | 当前源码能力和可启动状态已分离 | 恢复正确项目入口和脚本后，干净安装、构建、启动及桌面打包可重复；本次仅记录，不覆盖既存改动 |
| P1 | 桌面接现有账号服务 | 浏览器共享与桌面离线目前走两条数据路径 | 同一账号／工作区在桌面和浏览器互改可见；切换、撤权、断线恢复均能处理 |
| P1 | 稳定成员 ID、多团队、动态工作流 | 姓名、XXH 和固定状态限制多人业务扩展 | 同名成员不混淆；团队独立编号／状态；私有团队检查落到服务端 |
| P1 | 后台作业与提醒 | 关闭页面后，当前定时能力停止 | 服务存活时关闭所有客户端仍能执行；有运行记录、失败处理和防重复执行 |
| P1 | 账号恢复及持久未发送编辑 | 邮件／找回能力和断线编辑保护影响实际使用 | 邮箱验证、重置、邀请送达；断线刷新后能找回尚未提交的修改 |
| P2 | 真实 Reviews／GitHub 链路 | 当前“批准／合并”仅改变本地对象 | 显示真实 diff 和 CI；评审／合并结果能在代码托管端核对 |
| P2 | 真实 AI、工具权限与 coding session | Agent／Loops 的核心结果尚未接通 | 模型响应、工具调用和产物可追踪；失败不会伪报成功；外部动作受用户权限约束 |
| P2 | 历史事件和统计 | 当前快照不能准确推导历史状态时长和燃尽 | 状态进入／退出时间独立记录；改标题不重置驻留时间；历史曲线能从事件重建 |
| P2 | 配置化迭代／Triage／模板 | 现有实现多为固定的本地子集 | 团队可定义周期、结转、轮值、路由、表单必填和默认模板 |
| P3 | 客户请求、Asks、发布、仪表盘 | 属于当前缺失的完整业务域 | 先建真实实体和数据链路，再实现页面；不能用现有重复任务／汇总冒充 |
| P3 | 企业治理与全量交互对齐 | 依赖前面的身份、团队、历史和集成基础 | 按需要增加 SSO／SCIM／审计；逐屏验证视觉、键盘、窄屏及辅助功能 |

## 本轮验证结果与未决问题

本轮实际执行 `./node_modules/.bin/vitest run`：**18 个测试文件、222 项测试通过**，用时 1.82 秒。没有直接沿用历史文档的测试数量。

审计开始时 `git status` 已显示 `index.html`、`package.json` 为未提交修改；前者大小为 0，后者是原版 `@linear/desktop` 1.32.8 清单，缺本项目脚本及依赖配置。HEAD 中仍能读到本项目正确清单。测试是通过现有 `node_modules` 中的测试执行器直接运行，这不证明当前配置可以全新安装或正常生产构建。本轮未改动这两个文件，也未重跑打包或声称当前构建成功。

| 原问题 | 本轮状态 |
| --- | --- |
| 原版桌面身份、结构和桥接能力 | 已回答：本轮 REA + 既存同哈希证据；动态执行和三个原生扩展仍有限制 |
| Linear 核心功能版图 | 已在功能域层面覆盖；原版账号／套餐／服务端全部规则未穷尽 |
| 当前项目哪些真正存在 | 已对源码及测试复核；区分了本地闭环与真实外部结果 |
| 当前项目哪些没实现 | 已按 29 个功能域记录缺口和补齐顺序；“未见”限定于本次源码范围 |
| 全流程、同状态视觉及多设备验收 | 未完成：本轮不是全应用逐菜单操作或多台物理设备联调 |

旧的对齐 README 同时保留多个日期的增量记录，存在“旧段落说未做、后续已补齐”的情况。后续规划应以本报告的当前源码核对为入口，回查旧证据确认原版规则，避免重复实现已有能力。
