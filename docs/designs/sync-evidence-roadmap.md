<!-- ROADMAP_SECTION_START -->
## ZJ Roadmap

> 数据文件: `sync-evidence-roadmap.json` | 最后更新: 2026-07-01 00:50:55

[~][X+] 1. Sync Evidence 边界收拢架构优化
├── [x][X+] 1-1. 审计 zj-loop-sync 项目文件访问边界
├── [x][X+] 1-2. 设计 sync evidence adapter 最小迁移契约
├── [x][Y+] 1-3. 实现 sync ProjectFileSystem tracer bullet
└── [ ][Y+] 1-4. 合并设计记录并删除 sync evidence roadmap

### 当前施工：1. Sync Evidence 边界收拢架构优化

**决策：**
- Q: 下一段架构优化聚焦哪里？ → 聚焦 zj-loop-sync 的项目 evidence 访问边界，迁移到 @jununfly/zj-loop-core ProjectFileSystem。 (代码事实显示 sync 已经依赖 core 和共享 CLI harness，但 sync.ts 仍直接导入 fs/promises 并实现 fileExists/readFileContent/readdir/stat。架构文档规定 core 拥有 project evidence primitives，product tool 拥有 report formatting 和 side effects；这一刀能收窄边界且风险小。)

**当前子树：**
├── [x][X+] 1-1. 审计 zj-loop-sync 项目文件访问边界
├── [x][X+] 1-2. 设计 sync evidence adapter 最小迁移契约
├── [x][Y+] 1-3. 实现 sync ProjectFileSystem tracer bullet
└── [ ][Y+] 1-4. 合并设计记录并删除 sync evidence roadmap
<!-- ROADMAP_SECTION_END -->
