<!-- ROADMAP_SECTION_START -->
## ZJ Roadmap

> 数据文件: `automation-default-first-run-experience-roadmap.json` | 最后更新: 2026-07-12 13:40:21

[~][X+] 1. Automation-Default First Run Experience
├── [x][X+] 1-1. 用户目标导向的 First Run 入口
│   ├── [x][X+] 1-1-1. 目标选择式启动命令
│   ├── [x][X+] 1-1-2. Route 菜单与推荐首选路径
│   └── [x][X+] 1-1-3. 端到端用户故事示例
├── [x][X+] 1-2. 自动化前提条件审查与成本包络
│   ├── [x][X+] 1-2-1. 自动运行资格检查矩阵
│   ├── [x][X+] 1-2-2. 权限凭证与 Provider 能力检查
│   ├── [x][X+] 1-2-3. 预算与 max_slices 成本控制
│   └── [x][X+] 1-2-4. 工作区安全与验证门槛检查
├── [ ][X+] 1-3. 结构化 Stop Signal 体系
│   ├── [ ][X+] 1-3-1. Stop Signal 固定协议字段
│   ├── [ ][X+] 1-3-2. 停机原因分类与责任层归属
│   ├── [ ][X+] 1-3-3. 下一步动作与确认位置输出
│   └── [ ][X+] 1-3-4. 可重试策略与新请求边界
├── [ ][X+] 1-4. Route 到 Consumer 的自动推进编排
│   ├── [ ][X+] 1-4-1. Route Decision 到 Request Carrier 自动衔接
│   ├── [ ][X+] 1-4-2. Request Carrier 到 Consumer 自动消费
│   ├── [ ][X+] 1-4-3. Roadmap-Sliced 多 slice 自动执行
│   └── [ ][X+] 1-4-4. Review Artifact 与 Closeout 自动衔接
├── [ ][X+] 1-5. 证据回放与状态可解释性
│   ├── [ ][X+] 1-5-1. 统一执行摘要与证据索引
│   ├── [ ][X+] 1-5-2. Route 状态解释与能力等级展示
│   └── [ ][X+] 1-5-3. 失败回放与定位报告
├── [ ][X+] 1-6. 用户项目安装与升级体验
│   ├── [ ][X+] 1-6-1. 安装后推荐路径生成
│   ├── [ ][X+] 1-6-2. Provider 适配后的 Smoke 到 Auto Run
│   └── [ ][X+] 1-6-3. 升级时保留自动化意图
└── [ ][X+] 1-7. Dogfood 验证与发布门槛
    ├── [ ][X+] 1-7-1. 本仓自动化 First Run Dogfood
    ├── [ ][X+] 1-7-2. GitHub 与 GitLab 双 Provider 验证
    └── [ ][X+] 1-7-3. 发布前自动化体验验收门槛

### 当前施工：1. Automation-Default First Run Experience

**决策：**
- Q: 本轮产品升级的主目标是什么？ → Automation-Default First Run Experience：用户选择一个目标 route 后，系统默认尽可能自动跑到 review artifact；只有遇到真实 stop signal 才停。 (参照 docs/prds/value-oriented-product-design-principles.md 的 Default Toward Automated Loops。)
- Q: Stop Signal 是否作为独立主线？ → 是，但作为 Automation-Default First Run 的必要底座来做，而不是孤立协议工程。 (停下来的体验必须一等化：reason、responsible layer、evidence、next step、retry policy、human required。)
- Q: 本轮是否优先增加更多 route？ → 否。优先把现有关键 route 的 first-run 自动推进体验打通，再评估新增 route 或继续 live promotion。 (避免继续堆组件，先解决用户需要多次切换、多次确认、容易不知道在哪里继续的问题。)

**当前子树：**
├── [x][X+] 1-1. 用户目标导向的 First Run 入口
│   ... 3 more child nodes; run tree 1-1 --depth 2 for full view
├── [x][X+] 1-2. 自动化前提条件审查与成本包络
│   ... 4 more child nodes; run tree 1-2 --depth 2 for full view
├── [ ][X+] 1-3. 结构化 Stop Signal 体系
│   ... 4 more child nodes; run tree 1-3 --depth 2 for full view
├── [ ][X+] 1-4. Route 到 Consumer 的自动推进编排
│   ... 4 more child nodes; run tree 1-4 --depth 2 for full view
├── [ ][X+] 1-5. 证据回放与状态可解释性
│   ... 3 more child nodes; run tree 1-5 --depth 2 for full view
├── [ ][X+] 1-6. 用户项目安装与升级体验
│   ... 3 more child nodes; run tree 1-6 --depth 2 for full view
└── [ ][X+] 1-7. Dogfood 验证与发布门槛
    ... 3 more child nodes; run tree 1-7 --depth 2 for full view
<!-- ROADMAP_SECTION_END -->
