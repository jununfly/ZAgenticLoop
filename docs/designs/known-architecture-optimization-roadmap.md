<!-- ROADMAP_SECTION_START -->
## ZJ Roadmap

> 数据文件: `known-architecture-optimization-roadmap.json` | 最后更新: 2026-07-01 11:12:40

[~][X+] 1. 已知架构优化路线图
├── [x][Y+] 1-1. 收敛 CI validate gates 工具清单
├── [x][Y+] 1-2. 收敛 release workflow 发布清单
├── [x][X+] 1-3. 下沉 zj-loop-init registry 同步检查
├── [x][Y+] 1-4. 统一 sync 与 audit evidence 模型边界
├── [x][Y+] 1-5. 设计 MCP raw resources 结构化替代路线
├── [x][Y+] 1-6. 加强 readiness policy fixture 测试矩阵
└── [ ][X+] 1-7. 明确 dist 与 generated artifacts 提交策略

### 当前施工：1. 已知架构优化路线图

**决策：**
- Q: 已知架构优化如何排序？ → 按质量门漂移风险优先：先继续收敛 CI validate gates，再处理 release workflow 清单、init registry 同步、sync/audit evidence 边界、MCP raw resource 替代、readiness policy 测试矩阵、generated artifact 策略。 (依据当前代码证据：根 tool gate runner 已完成，但 CI shell、release workflows、字符串同步检查、evidence 模型、raw resources 和生成物策略仍是已知漂移点。)

**当前子树：**
├── [x][Y+] 1-1. 收敛 CI validate gates 工具清单
├── [x][Y+] 1-2. 收敛 release workflow 发布清单
├── [x][X+] 1-3. 下沉 zj-loop-init registry 同步检查
├── [x][Y+] 1-4. 统一 sync 与 audit evidence 模型边界
├── [x][Y+] 1-5. 设计 MCP raw resources 结构化替代路线
├── [x][Y+] 1-6. 加强 readiness policy fixture 测试矩阵
└── [ ][X+] 1-7. 明确 dist 与 generated artifacts 提交策略
<!-- ROADMAP_SECTION_END -->
