# Linear local replica

以已安装的 Linear 1.32.8 为参考的离线 React／Electron 应用。包含任务与关联关系／关联创建、可恢复删除、分诊、迭代、项目、计划、视图、收件箱、评审、Agent 和 Loops。完整 1:1 对齐尚未验收通过；已观察、已实现和待验证项分别记录在[对齐清单](docs/research/linear-parity/README.md)与[视觉验收](design-qa.md)。

## 运行

需要 Node.js 和 pnpm。

```sh
pnpm install
pnpm dev --host 127.0.0.1 --port 5174
```

打开 <http://127.0.0.1:5174/>。初次启动使用示例数据；后续从当前浏览器的 IndexedDB 恢复。更换浏览器、地址或端口会使用不同的本地存储。

在 Settings 中导出备份后可移至其他浏览器，再通过导入预览恢复。备份包含任务、关联记录、附件内容、草稿、会话和运行历史。请保管备份中的本地内容。

常用操作：`C` 创建任务，`⌘/Ctrl K` 命令菜单，`J/K` 移动列表选择，`Space` 预览，`Enter` 打开详情，`Esc` 关闭浮层。帮助菜单列出已实现的快捷键。

## 桌面版

需要 Node.js 22.12 或更新版本。运行 `pnpm desktop` 可构建并启动独立桌面应用；`pnpm desktop:package` 生成当前系统的应用包。macOS arm64 产物位于 `artifacts/desktop/Linear Replica-darwin-arm64/Linear Replica.app`。

`pnpm desktop:smoke` 检查桌面本地页面加载与工作区就绪；额外传入 `--smoke-two-windows` 可验证两个窗口的就绪与保存退出回执。开发时先运行浏览器预览，再运行 `pnpm desktop:dev`。

桌面版数据与浏览器存储分开，通过 Settings 导出／导入备份迁移。包含原生菜单、窗口装饰、Dock 未读徽标与保存后关闭；支持新建窗口及同一来源内的共享保存；并发同字段修改会提示冲突。系统通知、自动更新和发布签名仍待实现。标签独立保存会话内路由，重启后不恢复标签集合。

## 验证

```sh
pnpm test
pnpm build
```

当前 165 项测试通过，生产构建包含 TypeScript 检查。浏览器验收覆盖创建、分诊、状态切换、跨页面联动、刷新恢复、附件、视图、评审、会话、自动化及备份恢复。

## 离线边界

原版账号仅作只读观察，运行此项目不会访问或修改该账号。所有业务记录保存在本地；无服务器端账号、跨设备多人同步或权限系统。

Agent 使用确定性的本地查询、摘要和待确认草稿；不调用 AI 模型。评审使用本地记录，不读取 GitHub 或执行合并。Loops 通过独立适配层执行受支持的本地动作；Slack 和 coding session 标明受限，不产生外部操作。定时任务仅在应用打开时检查，不提供后台调度承诺。

项目进度、容量和部分分诊转换是明确标记的本地规则，未当作已验证的 Linear 服务端规则。任务选项提供相关、父、子及两种阻塞方向的创建入口，任务与关系一起保存；创建表单支持里程碑。任务描述、评论和项目说明已支持富文本；已补充项目列表／看板／时间线及日期排期；提及、表格、折叠块、全部菜单、历史图表和部分高级交互仍待对齐。

## 实现入口

- `src/workspace.ts`：实体仓库、业务命令、迁移和 IndexedDB。
- `src/issue-ui.tsx`：列表、筛选、创建与详情。
- `src/relations.ts`、`src/relation-ui.tsx`：任务关系、阻塞图和关系选择器。
- `src/feature-pages.tsx`：其余模块。
- `src/project-views.tsx`、`src/timeline.ts`：项目列表、看板、时间线和日期排期。
- `src/adapters.ts`、`src/services.ts`：外部能力的离线适配边界。
- `src/replica.css`：界面样式。

可通过任务选项删除本地任务，在团队 Archive 恢复。备份保留已删除记录；当前没有实现原版 30 天后的永久清除。

新的领域约定见 [ADR 0005](docs/adr/0005-reference-parity-and-offline-workspace.md)。截图证据存于本机 `artifacts/qa/`，已忽略提交。
