<!-- ROADMAP_SECTION_START -->
## ZJ Roadmap

> 数据文件: `recommendation-policy-roadmap.json` | 最后更新: 2026-07-01 00:35:50

[~][X+] 1. Recommendation Policy 规则化架构优化
├── [x][X+] 1-1. 审计 recommendPatterns 硬编码策略边界
├── [x][X+] 1-2. 设计 recommendation policy 最小契约
├── [x][Y+] 1-3. 实现推荐策略 tracer bullet
└── [ ][Y+] 1-4. 合并设计记录并删除 recommendation policy roadmap

### 当前施工：1. Recommendation Policy 规则化架构优化

**决策：**
- Q: 下一段架构优化聚焦哪里？ → 聚焦 @jununfly/zj-loop-core 的 pattern recommendation policy 规则化。 (代码事实显示 recommendPatterns 在 semantic.ts 中混合了字段匹配、boost 权重、reason code 和 ranking；architecture.md 已把 duplicated recommendation policy 列为 product tool 反边界。相比 sync 漂移检测，这一刀更贴近已确立的 core semantic contract，切面更小。)

**当前子树：**
├── [x][X+] 1-1. 审计 recommendPatterns 硬编码策略边界
├── [x][X+] 1-2. 设计 recommendation policy 最小契约
├── [x][Y+] 1-3. 实现推荐策略 tracer bullet
└── [ ][Y+] 1-4. 合并设计记录并删除 recommendation policy roadmap
<!-- ROADMAP_SECTION_END -->
