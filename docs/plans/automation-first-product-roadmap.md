<!-- ROADMAP_SECTION_START -->
## ZJ Roadmap

> 数据文件: `automation-first-product-roadmap.json` | 最后更新: 2026-07-14 14:15:36

[~][X+] 1. Automation-First Product Goal Roadmap
├── [~][Y+] 1-1. 双目标完成标准与动态对齐评分
├── [ ][X+] 1-2. 当前 Route 能力与用户体验缺口盘点
├── [ ][Y+] 1-3. 默认自动执行到 review artifact 或 hard stop
├── [ ][Y+] 1-4. 结构化 stop signal 与 human handoff 体验
├── [ ][Y+] 1-5. GitHub 与 GitLab 的 live 能力对齐
├── [ ][Y+] 1-6. 确定性脚本 gate 与 replay 证据闭环
└── [ ][X+] 1-7. Dogfood 仪表盘与发布前完成判定

### 当前施工：1-1. 双目标完成标准与动态对齐评分

Define a scorecard that pairs architecture readiness with user-experience readiness for each route family. A route is not product-complete unless both sides pass: deterministic architecture evidence and a smooth user-facing loop path.

**决策：**
- Q: 完成标准应该按架构目标还是用户体验目标？ → 两者同时作为 hard completion criteria：架构上必须有 Route Table truth、runner/preflight/replay/gate 证据；体验上必须能从用户信号自动推进到 review artifact 或结构化 hard stop，且用户不需要在多个位置反复猜下一步。 (这是动态对齐评分，不是二选一。A 先进时拉 B，B 落后时约束 A 的宣称。)
<!-- ROADMAP_SECTION_END -->
