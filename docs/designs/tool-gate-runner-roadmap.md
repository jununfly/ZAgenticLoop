<!-- ROADMAP_SECTION_START -->
## ZJ Roadmap

> 数据文件: `tool-gate-runner-roadmap.json` | 最后更新: 2026-07-01 01:35:12

[~][X+] 1. 工具质量门清单收敛
├── [x][X+] 1-1. 审计根工具质量门清单漂移
├── [x][Y+] 1-2. 实现 repo-local 工具质量门 runner
├── [x][Y+] 1-3. 迁移根 build:tools 与 test:tools 入口
└── [ ][Y+] 1-4. 合并工具质量门 runner 设计记录并删除 roadmap

### 当前施工：1. 工具质量门清单收敛

**决策：**
- Q: 下一刀架构优化聚焦哪里？ → 聚焦根工具质量门清单收敛：把 build/test 工具包顺序和 companion package 覆盖从 package.json 长链迁到 repo-local runner。 (代码证据：package.json 的 build:tools/test:tools 手写完整工具链；ci-validate-gates.sh 也维护部分工具测试清单。先不动 release workflows，避免扩大发布边界。)

**当前子树：**
├── [x][X+] 1-1. 审计根工具质量门清单漂移
├── [x][Y+] 1-2. 实现 repo-local 工具质量门 runner
├── [x][Y+] 1-3. 迁移根 build:tools 与 test:tools 入口
└── [ ][Y+] 1-4. 合并工具质量门 runner 设计记录并删除 roadmap
<!-- ROADMAP_SECTION_END -->
