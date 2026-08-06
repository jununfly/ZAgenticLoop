<!-- ROADMAP_SECTION_START -->
## ZJ Roadmap

> 数据文件: `opn-development-runtime-artifact-roadmap.json` | 最后更新: 2026-08-06 14:45:12

[x][X+] 1. OPN 长期开发测试版 Runtime Artifact 信任链
├── [x][Y+] 1-1. 设计 HumanSigner artifact approval envelope
├── [x][Y+] 1-2. 确定开发测试版信任根与多设备授权边界
├── [x][Y+] 1-3. 确定 approval 生命周期、撤销与 artifact 更新规则
├── [x][Y+] 1-4. 实现 artifact approval 与 Runtime 启动门禁
│   ├── [x][Y+] 1-4-1. 实现 approval contract 与 P-256 签名验证
│   ├── [x][Y+] 1-4-2. 接入 manifest digest、实际文件 digest 与进程身份校验
│   └── [x][Y+] 1-4-3. 实现开发测试版 artifact bootstrap
└── [x][Y+] 1-5. 验证长期开发测试版真实使用闭环
    ├── [x][Y+] 1-5-1. 覆盖签名漂移、撤销、过期和跨设备场景
    └── [x][Y+] 1-5-2. 运行真实 signed Runtime dogfood
<!-- ROADMAP_SECTION_END -->
