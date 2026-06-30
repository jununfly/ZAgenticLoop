<!-- ROADMAP_SECTION_START -->
## ZJ Roadmap

> 数据文件: `architecture-improvement-roadmap.json` | 最后更新: 2026-06-30 19:27:30

[~][X+] 1. ZAgenticLoop 架构设计与技术选型深化
├── [x][X+] 1-1. 绘制当前 Agentic Loop Working 系统地图
├── [~][Y+] 1-2. 抽取 zj-loop-core 共享领域内核
│   ├── [x][Y+] 1-2-1. 定义 zj-loop-core 包边界与公共类型
│   ├── [~][Y+] 1-2-2. 抽取 registry loader 与领域模型
│   ├── [x][Y+] 1-2-3. 抽取项目证据探测与文件系统适配器
│   └── [x][Y+] 1-2-4. 按 cost-init-audit-sync-MCP 顺序接入 core
├── [ ][Y+] 1-3. 提升 patterns/registry.yaml 为单一事实源
│   ├── [~][Y+] 1-3-1. 扩展 registry schema 承载 starter-state-budget-command
│   ├── [ ][Y+] 1-3-2. 迁移 init-cost-MCP 的硬编码 pattern 事实
│   └── [ ][Y+] 1-3-3. 补齐 registry 校验与兼容性测试
├── [ ][X+] 1-4. 设计 readiness 策略规则引擎
│   ├── [ ][X+] 1-4-1. 盘点现有 readiness signals 与分数来源
│   └── [ ][X+] 1-4-2. 设计声明式 readiness rule schema 草案
├── [ ][X+] 1-5. 统一 zj-loop CLI 产品族外壳
│   ├── [ ][X+] 1-5-1. 盘点 zj-loop CLI 参数与输出体验重复
│   └── [ ][X+] 1-5-2. 设计共享 CLI harness 的最小 API
├── [ ][X+] 1-6. 升级 MCP 为 Agentic Loop Working 语义 API
│   ├── [ ][X+] 1-6-1. 审计 MCP resources-tools 的语义边界
│   └── [ ][X+] 1-6-2. 设计基于 core 的语义查询 API
└── [x][Y+] 1-7. 制定验证与迁移切片
    ├── [x][Y+] 1-7-1. 规划 audit-init 最小纵切迁移
    └── [x][Y+] 1-7-2. 更新质量门禁与 before-after demo 证据

### 当前施工：1-2-2. 抽取 registry loader 与领域模型

registry loader/domain model 与 registry schema 作为同一 tracer bullet：registry 增字段，core loader 使用 zod 校验 schemaVersion=1 并输出稳定领域类型，zj-loop-cost 最小消费 budget/cost 字段。

**决策：**
- Q: registry.yaml 是否在第一阶段承载 init 当前硬编码的 pattern 事实？ → 要，但分层承载。registry.yaml 承载 starter mapping、state file、budget defaults、first loop command、tool variants；稳定领域事实放 pattern 根层，工具特定体验放 tools.codex/grok/claude 等子结构。 (目标是让 registry 成为单一事实源，同时避免把某个工具的命令文案、路径约定和交互体验污染到 pattern 根字段。)
- Q: registry loader 第一版是否引入运行时 schema 校验库？ → 要。@jununfly/zj-loop-core 的 registry loader 第一版引入 zod 做运行时 schema 校验。 (patterns/registry.yaml 是外部 YAML 数据，TypeScript 类型不能保护文件内容；zod 用于 fail-fast、清晰错误和从 schema 推导领域类型。)
- Q: registry loader/domain model 与 registry schema 是否作为同一实现切片完成？ → 要一起完成。1-2-2 和 1-3-1 作为同一个 tracer bullet：registry 增字段、core loader 校验、至少 zj-loop-cost 消费一小块。 (schema 没有 loader 校验会退化成文档式约定；loader 没有 schema 扩展没有真实价值；用 cost 作为低风险消费者验证切片端到端成立。)
<!-- ROADMAP_SECTION_END -->
