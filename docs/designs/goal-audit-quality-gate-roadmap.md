<!-- ROADMAP_SECTION_START -->
## ZJ Roadmap

> 数据文件: `goal-audit-quality-gate-roadmap.json` | 最后更新: 2026-07-01 01:23:19

[~][X+] 1. Goal Audit 质量门纳入架构优化
├── [x][X+] 1-1. 审计 goal-audit 根质量门覆盖缺口
├── [x][X+] 1-2. 设计 goal-audit 最小质量门接入
├── [x][Y+] 1-3. 实现 goal-audit build/test 根质量门接入
└── [ ][Y+] 1-4. 合并设计记录并删除 goal-audit 质量门 roadmap

### 当前施工：1. Goal Audit 质量门纳入架构优化

**决策：**
- Q: 下一段架构优化聚焦哪里？ → 聚焦 goal-audit 纳入根 build:tools/test:tools 质量门，而不是迁移它到 core。 (goal-audit 是 repo 内 companion package，拥有独立 @cobusgreyling 发布流和 release workflow；但根 package.json 的 build:tools/test:tools 未覆盖它。先补质量门可降低发布漂移风险，且不引入跨品牌 package 依赖。)

**当前子树：**
├── [x][X+] 1-1. 审计 goal-audit 根质量门覆盖缺口
├── [x][X+] 1-2. 设计 goal-audit 最小质量门接入
├── [x][Y+] 1-3. 实现 goal-audit build/test 根质量门接入
└── [ ][Y+] 1-4. 合并设计记录并删除 goal-audit 质量门 roadmap
<!-- ROADMAP_SECTION_END -->
