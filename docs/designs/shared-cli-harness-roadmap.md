<!-- ROADMAP_SECTION_START -->
## ZJ Roadmap

> 数据文件: `shared-cli-harness-roadmap.json` | 最后更新: 2026-06-30 23:39:34

[~][X+] 1. Shared CLI Harness 架构优化
├── [x][X+] 1-1. 审计 zj-loop CLI 外壳重复与兼容风险
├── [x][X+] 1-2. 设计 shared CLI harness 最小契约
├── [x][Y+] 1-3. 迁移 zj-loop-cost 消费 shared CLI harness
├── [~][X+] 1-4. 评估 sync-audit-init 后续迁移顺序
│   ├── [x][Y+] 1-4-1. 迁移 zj-loop-sync 消费 shared CLI harness
│   ├── [ ][Y+] 1-4-2. 迁移 zj-loop-audit 消费 shared CLI harness
│   └── [ ][Y+] 1-4-3. 迁移 zj-loop-init 消费 shared CLI harness
└── [ ][Y+] 1-5. 合并设计记录并删除 shared CLI harness roadmap

### 当前施工：1-4. 评估 sync-audit-init 后续迁移顺序

**决策：**
- Q: sync/audit/init 后续迁移顺序是什么？ → 先迁 zj-loop-sync，再迁 zj-loop-audit，最后迁 zj-loop-init。 (sync 是最接近单命令 harness 的 CLI，且 SyncOptions 已含 json 字段但 parseArgs 未返回，迁移可修复已承诺的 --json；audit 输出块较长但无文件副作用，适合第二个；init 文件写入和进度输出最多，最后迁以避免过早扩大 harness。)

**当前子树：**
├── [x][Y+] 1-4-1. 迁移 zj-loop-sync 消费 shared CLI harness
├── [ ][Y+] 1-4-2. 迁移 zj-loop-audit 消费 shared CLI harness
└── [ ][Y+] 1-4-3. 迁移 zj-loop-init 消费 shared CLI harness
<!-- ROADMAP_SECTION_END -->
