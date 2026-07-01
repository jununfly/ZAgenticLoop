<!-- ROADMAP_SECTION_START -->
## ZJ Roadmap

> 数据文件: `release-dependency-roadmap.json` | 最后更新: 2026-07-01 11:54:42

[~][X+] 1. 发布依赖可发布化路线图
├── [x][Y+] 1-1. 确认发布依赖迁移边界
├── [ ][Y+] 1-2. 迁移 release-managed packages 的 core 依赖
├── [ ][Y+] 1-3. 更新发布验证与文档 blocker 状态
├── [ ][X+] 1-4. 评估下一批产品 feature 候选
├── [~][X+] 1-5. 定义可发布标准与发布包宇宙
│   ├── [x][Y+] 1-5-1. 盘点 release manifest 与 package publish 信号差异
│   ├── [x][X+] 1-5-2. 决定 zj-loop-sync 与 zj-loop-mcp-server 发布身份
│   └── [ ][Y+] 1-5-3. 固定发布宇宙验收标准
├── [ ][X+] 1-6. 设计 core 依赖发布策略
│   ├── [ ][Y+] 1-6-1. 用 npm pack 验证版本依赖候选
│   ├── [ ][X+] 1-6-2. 确认本地开发安装策略
│   └── [ ][Y+] 1-6-3. 选择版本范围与发布顺序策略
├── [ ][Y+] 1-7. 执行发布依赖迁移与锁文件收敛
│   ├── [ ][Y+] 1-7-1. 替换发布包 package.json 中的 core file 依赖
│   ├── [ ][Y+] 1-7-2. 收敛 package-lock 与 package-local npm ci
│   └── [ ][Y+] 1-7-3. 验证所有发布包 tarball 不含本地 file 依赖
├── [ ][Y+] 1-8. 升级发布验证为可发布标准门
│   ├── [ ][Y+] 1-8-1. 将 validator 从允许已知 blocker 改为拒绝发布 blocker
│   ├── [ ][Y+] 1-8-2. 增加 pack-level 可发布契约测试
│   └── [ ][X+] 1-8-3. 把 release gate 接入现有 test:tools 与 CI 语义
└── [ ][Y+] 1-9. 收尾发布文档与架构决策
    ├── [ ][Y+] 1-9-1. 更新 RELEASE 文档为无 blocker 状态
    ├── [ ][Y+] 1-9-2. 更新 architecture 发布边界结论
    └── [ ][X+] 1-9-3. 决定是否进入下一批产品 feature

### 当前施工：1-5. 定义可发布标准与发布包宇宙

**决策：**
- Q: 发布包宇宙如何划定？ → 先以可发布信号划分，而不是只沿用旧 release manifest：已在 release manifest 的 core/audit/init/cost/goal-audit 必须达标；zj-loop-mcp-server 有 publishConfig 和 bin 且依赖 core，需要 explore 是否纳入发布宇宙；zj-loop-sync 有 bin/files 且依赖 core，但没有 publishConfig 和 release workflow，需要决定是纳入发布还是明确 internal。 (代码证据：release manifest 目前 5 包；mcp-server 与 sync 的 package.json 都有 @jununfly/zj-loop-core: file:../zj-loop-core。)

**当前子树：**
├── [x][Y+] 1-5-1. 盘点 release manifest 与 package publish 信号差异
├── [x][X+] 1-5-2. 决定 zj-loop-sync 与 zj-loop-mcp-server 发布身份
└── [ ][Y+] 1-5-3. 固定发布宇宙验收标准
<!-- ROADMAP_SECTION_END -->
