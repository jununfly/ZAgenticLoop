<!-- ROADMAP_SECTION_START -->
## ZJ Roadmap

> 数据文件: `issue-89-gitlab-provider-hardening-roadmap.json` | 最后更新: 2026-07-10 18:50:02

[~][X+] 1. Issue #89 GitLab provider hardening
├── [x][Y+] 1-1. 消费 #89 request 并建立 roadmap 分支
│   └── [x][Y+] 1-1-1. 记录 Issue Fix Request 消费证据
├── [x][Y+] 1-2. GitLab 安装可运行性硬化
│   ├── [x][Y+] 1-2-1. GitLab CI stage 配置化
│   ├── [x][Y+] 1-2-2. GitLab runner tags 配置化
│   └── [x][Y+] 1-2-3. GitLab CI image 与 Node 版本前置检查
├── [x][Y+] 1-3. GitLab vendored 包与离线边界硬化
│   ├── [x][Y+] 1-3-1. vendored tgz git 跟踪预检
│   ├── [x][Y+] 1-3-2. GitLab smoke audit 离线边界显式化
│   └── [x][Y+] 1-3-3. core tarball transitive dependency 边界说明
├── [x][Y+] 1-4. Provider-aware 文案与路径协议对齐
│   ├── [x][Y+] 1-4-1. route-table maturity vocabulary 对齐
│   └── [x][Y+] 1-4-2. ci-sweeper GitLab 路径建议 provider-aware
├── [x][Y+] 1-5. GitLab consumer 合约与 closeout 兼容
│   ├── [x][Y+] 1-5-1. roadmap activation MR 到 post-merge closeout 合约桥接
│   └── [x][Y+] 1-5-2. pr-steward report 与 fix-request 命令边界澄清
└── [ ][Y+] 1-6. GitLab 全链路验证与 closeout
    ├── [x][Y+] 1-6-1. GitLab provider dogfood 回放测试补强
    └── [ ][Y+] 1-6-2. durable docs 与 PR closeout 吸收 GitLab 决策

### 当前施工：1. Issue #89 GitLab provider hardening

**决策：**
- Q: 当前 roadmap 的发布边界是什么？ → 以 GitHub 侧当前实现为事实 baseline，对齐 GitLab provider 的全量可用链路；无法回避的平台差异记录为窄例外。 (目标不是第一版/第二版式切断，而是用有序 slice 分阶段实现同一个完整目标，避免后续 agent 误判为 job done。)

**当前子树：**
├── [x][Y+] 1-1. 消费 #89 request 并建立 roadmap 分支
│   ... 1 more child nodes; run tree 1-1 --depth 2 for full view
├── [x][Y+] 1-2. GitLab 安装可运行性硬化
│   ... 3 more child nodes; run tree 1-2 --depth 2 for full view
├── [x][Y+] 1-3. GitLab vendored 包与离线边界硬化
│   ... 3 more child nodes; run tree 1-3 --depth 2 for full view
├── [x][Y+] 1-4. Provider-aware 文案与路径协议对齐
│   ... 2 more child nodes; run tree 1-4 --depth 2 for full view
├── [x][Y+] 1-5. GitLab consumer 合约与 closeout 兼容
│   ... 2 more child nodes; run tree 1-5 --depth 2 for full view
└── [ ][Y+] 1-6. GitLab 全链路验证与 closeout
    ... 2 more child nodes; run tree 1-6 --depth 2 for full view
<!-- ROADMAP_SECTION_END -->
