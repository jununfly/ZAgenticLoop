<!-- ROADMAP_SECTION_START -->
## ZJ Roadmap

> 数据文件: `shared-cli-harness-roadmap.json` | 最后更新: 2026-06-30 23:29:43

[~][X+] 1. Shared CLI Harness 架构优化
├── [x][X+] 1-1. 审计 zj-loop CLI 外壳重复与兼容风险
├── [x][X+] 1-2. 设计 shared CLI harness 最小契约
├── [x][Y+] 1-3. 迁移 zj-loop-cost 消费 shared CLI harness
├── [ ][X+] 1-4. 评估 sync-audit-init 后续迁移顺序
└── [ ][Y+] 1-5. 合并设计记录并删除 shared CLI harness roadmap

### 当前施工：1. Shared CLI Harness 架构优化

**决策：**
- Q: 下一阶段做架构优化还是新 feature？ → 继续架构优化。第一段聚焦 shared CLI harness，以 zj-loop-cost 作为最小纵切。 (仓库事实显示 core/semantic/MCP 已收口，下一块重复主要在 CLI parse/help/error/exit；新 feature 应建立在统一 CLI 外壳和 readiness policy 稳定之后。)

**当前子树：**
├── [x][X+] 1-1. 审计 zj-loop CLI 外壳重复与兼容风险
├── [x][X+] 1-2. 设计 shared CLI harness 最小契约
├── [x][Y+] 1-3. 迁移 zj-loop-cost 消费 shared CLI harness
├── [ ][X+] 1-4. 评估 sync-audit-init 后续迁移顺序
└── [ ][Y+] 1-5. 合并设计记录并删除 shared CLI harness roadmap
<!-- ROADMAP_SECTION_END -->
