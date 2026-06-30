<!-- ROADMAP_SECTION_START -->
## ZJ Roadmap

> 数据文件: `mcp-resolver-evidence-roadmap.json` | 最后更新: 2026-07-01 01:07:13

[~][X+] 1. MCP Resolver Evidence 边界收拢架构优化
├── [x][X+] 1-1. 审计 MCP resolver 项目文件访问边界
├── [x][X+] 1-2. 设计 MCP resolver ProjectFileSystem 最小契约
├── [x][Y+] 1-3. 实现 MCP resolver ProjectFileSystem tracer bullet
└── [ ][Y+] 1-4. 合并设计记录并删除 MCP resolver roadmap

### 当前施工：1. MCP Resolver Evidence 边界收拢架构优化

**决策：**
- Q: 下一段架构优化聚焦哪里？ → 聚焦 zj-loop-mcp-server resolver 的项目 evidence 访问边界，迁移到 @jununfly/zj-loop-core ProjectFileSystem。 (代码事实显示 resolver.ts 仍直接使用 readdir/readFile/stat 和 root path join，但架构文档要求 core 拥有 project filesystem primitives，MCP 保持协议适配和 raw resource 兼容。刚完成 sync evidence 收拢后，这是一条同构且风险可控的下一刀。)

**当前子树：**
├── [x][X+] 1-1. 审计 MCP resolver 项目文件访问边界
├── [x][X+] 1-2. 设计 MCP resolver ProjectFileSystem 最小契约
├── [x][Y+] 1-3. 实现 MCP resolver ProjectFileSystem tracer bullet
└── [ ][Y+] 1-4. 合并设计记录并删除 MCP resolver roadmap
<!-- ROADMAP_SECTION_END -->
