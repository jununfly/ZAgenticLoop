<!-- ROADMAP_SECTION_START -->
## ZJ Roadmap

> 数据文件: `release-dependency-roadmap.json` | 最后更新: 2026-07-01 15:09:20

[~][X+] 1. 发布依赖可发布化路线图
├── [x][Y+] 1-1. 确认发布依赖迁移边界
├── [!][Y+] 1-2. 迁移 release-managed packages 的 core 依赖
├── [x][Y+] 1-3. 更新发布验证与文档 blocker 状态
├── [x][X+] 1-4. 评估下一批产品 feature 候选
├── [x][X+] 1-5. 定义可发布标准与发布包宇宙
│   ├── [x][Y+] 1-5-1. 盘点 release manifest 与 package publish 信号差异
│   ├── [x][X+] 1-5-2. 决定 zj-loop-sync 与 zj-loop-mcp-server 发布身份
│   └── [x][Y+] 1-5-3. 固定发布宇宙验收标准
├── [x][X+] 1-6. 设计 core 依赖发布策略
│   ├── [x][Y+] 1-6-1. 用 npm pack 验证版本依赖候选
│   ├── [x][X+] 1-6-2. 确认本地开发安装策略
│   └── [x][Y+] 1-6-3. 选择版本范围与发布顺序策略
├── [x][Y+] 1-7. 建立发布前依赖迁移门
│   ├── [x][Y+] 1-7-1. 替换发布包 package.json 中的 core file 依赖
│   ├── [x][Y+] 1-7-2. 收敛 package-lock 与 package-local npm ci
│   └── [x][Y+] 1-7-3. 验证所有发布包 tarball 不含本地 file 依赖
├── [x][Y+] 1-8. 升级发布验证为可发布标准门
│   ├── [x][Y+] 1-8-1. 将 validator 从允许已知 blocker 改为拒绝发布 blocker
│   ├── [x][Y+] 1-8-2. 增加 pack-level 可发布契约测试
│   └── [x][X+] 1-8-3. 把 release gate 接入现有 test:tools 与 CI 语义
└── [x][Y+] 1-9. 收尾发布文档与架构决策
    ├── [x][Y+] 1-9-1. 更新 RELEASE 文档 blocker 状态
    ├── [x][Y+] 1-9-2. 更新 architecture 发布边界结论
    └── [x][X+] 1-9-3. 决定是否进入下一批产品 feature

### 当前施工：1. 发布依赖可发布化路线图

**决策：**
- Q: 继续架构优化还是开发新 feature？ → 先继续架构优化，聚焦发布依赖可发布化。当前稳定文档明确记录 @jununfly/zj-loop-audit/init/cost 仍通过 file:../zj-loop-core 依赖 core，npm pack 会保留不可发布的本地路径；这是 release blocker。 (推荐先清 blocker，再评估新 feature；否则新 feature 会继续建立在不可发布依赖状态上。)
- Q: 这次架构优化的发布标准是什么？ → 以 public npm 可发布为标准，而不是以本地 monorepo build 通过为标准。一个包进入发布宇宙后，必须满足：package.json 依赖可被 npm 消费者解析、npm pack 不泄漏本地 file: 依赖、files allowlist 中的产物存在且策略明确、release workflow/tag/docs/validator 一致、核心 gates 通过。 (这把目标从局部依赖替换提升为发布标准门；后续 feature 只有在该门稳定后再排。)
- Q: 本轮发布依赖架构优化是否可以进入 closeout？ → 可以进入 closeout，但不能标记为全绿完成。已完成的是本地可落地的可发布标准、发布宇宙、validator、release-ready gate、文档沉淀；未完成且应保留为 blocker 的是 core 发布后才能执行的 dependent package registry 依赖迁移。 (下一步不是继续扩展细节，而是把过程 roadmap 的结论合并进稳定文档后删除过程文件；真正依赖迁移应在 @jununfly/zj-loop-core@0.1.0 registry-resolvable 后另行执行。)

**当前子树：**
├── [x][Y+] 1-1. 确认发布依赖迁移边界
├── [!][Y+] 1-2. 迁移 release-managed packages 的 core 依赖
├── [x][Y+] 1-3. 更新发布验证与文档 blocker 状态
├── [x][X+] 1-4. 评估下一批产品 feature 候选
├── [x][X+] 1-5. 定义可发布标准与发布包宇宙
│   ... 3 more child nodes; run tree 1-5 --depth 2 for full view
├── [x][X+] 1-6. 设计 core 依赖发布策略
│   ... 3 more child nodes; run tree 1-6 --depth 2 for full view
├── [x][Y+] 1-7. 建立发布前依赖迁移门
│   ... 3 more child nodes; run tree 1-7 --depth 2 for full view
├── [x][Y+] 1-8. 升级发布验证为可发布标准门
│   ... 3 more child nodes; run tree 1-8 --depth 2 for full view
└── [x][Y+] 1-9. 收尾发布文档与架构决策
    ... 3 more child nodes; run tree 1-9 --depth 2 for full view
<!-- ROADMAP_SECTION_END -->
