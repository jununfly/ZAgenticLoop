<!-- ROADMAP_SECTION_START -->
## ZJ Roadmap

> 数据文件: `readiness-policy-roadmap.json` | 最后更新: 2026-07-01 00:13:07

[~][X+] 1. Readiness Policy 规则化架构优化
├── [x][X+] 1-1. 审计现有 readiness policy 硬编码边界
├── [x][X+] 1-2. 设计 readiness.v1.yaml 最小规则契约
├── [x][Y+] 1-3. 实现规则引擎 tracer bullet
├── [ ][Y+] 1-4. 迁移 findings 和 recommendations 到规则文件
└── [ ][Y+] 1-5. 合并设计记录并删除 readiness policy roadmap

### 当前施工：1. Readiness Policy 规则化架构优化

**决策：**
- Q: 下一段架构优化聚焦哪里？ → 聚焦 zj-loop-audit readiness policy 规则化。 (稳定架构文档已经把 CLI harness 收口；剩余明确 future slice 是 tools/zj-loop-audit/rules/readiness.v1.yaml。代码事实显示 computeScore/findings/recommendations 仍硬编码在 auditor.ts，且架构文档要求 rule engine 消费 evidence、不直接读项目文件。)

**当前子树：**
├── [x][X+] 1-1. 审计现有 readiness policy 硬编码边界
├── [x][X+] 1-2. 设计 readiness.v1.yaml 最小规则契约
├── [x][Y+] 1-3. 实现规则引擎 tracer bullet
├── [ ][Y+] 1-4. 迁移 findings 和 recommendations 到规则文件
└── [ ][Y+] 1-5. 合并设计记录并删除 readiness policy roadmap
<!-- ROADMAP_SECTION_END -->
