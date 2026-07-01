<!-- ROADMAP_SECTION_START -->
## ZJ Roadmap

> 数据文件: `release-readiness-roadmap.json` | 最后更新: 2026-07-01 16:57:39

[~][X+] 1. 正式发布准备路线图
├── [x][X+] 1-1. 审计正式发布缺口
│   ├── [x][Y+] 1-1-1. 清理旧发布 workflow 与旧命名引用
│   └── [x][X+] 1-1-2. 确认 npm 包名与首发顺序
├── [x][Y+] 1-2. 重写 README 发布入口
│   ├── [x][Y+] 1-2-1. 重写 README 首屏与安装路径
│   └── [x][Y+] 1-2-2. 同步 README 与 Quickstart 真实命令
├── [x][Y+] 1-3. 设置发布版本信息
│   ├── [x][X+] 1-3-1. 确定 core 首发版本与 dependent 版本策略
│   └── [x][Y+] 1-3-2. 更新 package 版本与 changelog 状态
├── [ ][Y+] 1-4. 配置 npm 发布任务
│   ├── [x][Y+] 1-4-1. 配置 GitHub Actions 发布权限与 npm secret
│   └── [ ][Y+] 1-4-2. 首发后设置 npm Trusted Publisher
├── [ ][Y+] 1-5. 通过最终发布门
│   ├── [x][Y+] 1-5-1. 通过 core 首发发布门
│   ├── [!][Y+] 1-5-2. 迁移 dependent packages 的 core registry 依赖
│   ├── [ ][Y+] 1-5-3. 发布 dependent packages 并执行 npx smoke tests
│   ├── [x][Y+] 1-5-4. 补充 core 首发执行清单
│   └── [x][Y+] 1-5-5. 执行 release-prep 提交前总验收
└── [x][Y+] 1-6. 迁移 goal-audit 包名与目录到 zj-goal-audit
    ├── [x][Y+] 1-6-1. 重命名 package 与目录
    ├── [x][Y+] 1-6-2. 同步 release manifest 与 GitHub workflow
    ├── [x][Y+] 1-6-3. 同步 README 与稳定文档表述
    └── [x][Y+] 1-6-4. 验证 zj-goal-audit 发布门

### 当前施工：1. 正式发布准备路线图

**决策：**
- Q: 正式发布目标边界是什么？ → 采用分层发布，但 roadmap 规划全链路。第一阶段把仓库准备到发布态并先发布 @jununfly/zj-loop-core@0.1.0；第二阶段在 core registry 可解析后迁移 dependent packages 的 core 依赖和 lockfile；第三阶段发布 zj-loop-audit/init/cost/sync/mcp-server；最后做 npx smoke tests、README/docs 收口和 release 状态记录。 (不一次性强发 6 个 zj-loop 包，因为当前 dependent packages 仍含 file:../zj-loop-core，release-ready gate 正确失败。)

**当前子树：**
├── [x][X+] 1-1. 审计正式发布缺口
│   ... 2 more child nodes; run tree 1-1 --depth 2 for full view
├── [x][Y+] 1-2. 重写 README 发布入口
│   ... 2 more child nodes; run tree 1-2 --depth 2 for full view
├── [x][Y+] 1-3. 设置发布版本信息
│   ... 2 more child nodes; run tree 1-3 --depth 2 for full view
├── [ ][Y+] 1-4. 配置 npm 发布任务
│   ... 2 more child nodes; run tree 1-4 --depth 2 for full view
├── [ ][Y+] 1-5. 通过最终发布门
│   ... 5 more child nodes; run tree 1-5 --depth 2 for full view
└── [x][Y+] 1-6. 迁移 goal-audit 包名与目录到 zj-goal-audit
    ... 4 more child nodes; run tree 1-6 --depth 2 for full view
<!-- ROADMAP_SECTION_END -->
