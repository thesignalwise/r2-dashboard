# 告别逐个登录：R2 Dashboard 让多账号存储管理一目了然

如果你和我一样，手上有多个Cloudflare账号，并有多个存储桶在用。有时候就是想瞟一眼，看看空间是否还够用，但又不想逐个登录账号，可以考虑R2 Dashboard这款开源免费工具。

## 🎯 解决的痛点

作为开发者，我们经常会遇到这样的场景：
- **多账号管理烦恼**：公司账号、个人账号、测试账号...切换登录很麻烦
- **存储监控盲区**：不知道哪个bucket快满了，直到收到账单才发现
- **数据分散难统计**：想要了解整体存储使用情况需要手动汇总
- **缺少可视化**：Cloudflare控制台的数据展示相对简单

## 🚀 R2 Dashboard 是什么？

R2 Dashboard 是一个基于 Cloudflare Workers 构建的开源存储管理仪表板，专门为解决多账号 R2 存储管理而生。它提供了统一的界面来监控和管理分布在不同 Cloudflare 账号下的所有 R2 存储桶。

**在线体验：** [https://r2.thesignalwise.com/](https://r2.thesignalwise.com/)
- 演示账号：`demo@thesignalwise.com`
- 演示密码：`demo`

## ✨ 主要功能亮点

### 📊 **统一数据面板**
- 一个界面查看所有账号的存储使用情况
- 直观的图表展示存储分布和趋势
- 实时显示对象数量、存储大小等关键指标

### 🔐 **安全可靠**
- 账号ID自动脱敏显示，保护隐私
- API Token 加密存储在 Cloudflare KV 中
- 只需要只读权限，不会修改你的数据

### ⚡ **性能优异**
- 基于 Cloudflare Workers，全球边缘节点加速
- 智能缓存策略，避免频繁 API 调用
- 缓存优先加载，秒开数据面板

### 📱 **响应式设计**
- 现代化的用户界面，支持深色模式
- 完美适配桌面端和移动设备
- 加载骨架屏，提升用户体验

## 🛠️ 如何使用？

### 1. 快速体验
访问 [演示地址](https://r2.thesignalwise.com/)，使用演示账号即可立即体验所有功能。

### 2. 部署自己的实例
```bash
# 克隆项目
git clone https://github.com/thesignalwise/r2-dashboard
cd r2-dashboard

# 安装依赖
npm install

# 配置 Wrangler
wrangler login

# 设置密钥
wrangler secret put CRON_SECRET

# 部署
wrangler deploy
```

### 3. 获取 R2 API Token
前往 Cloudflare 控制台创建 API Token，需要以下权限：
- Account:Analytics (读取)
- Workers R2:Data Catalog (读取)  
- Workers R2:Storage (读取)

## 💡 使用体验

我使用 R2 Dashboard 管理 3 个不同的 Cloudflare 账号，包含 15+ 个存储桶。以前需要：
- 登录账号A → 查看存储 → 登出
- 登录账号B → 查看存储 → 登出  
- 登录账号C → 查看存储

现在只需要：
- 打开 R2 Dashboard → 一眼看完所有数据

最让我印象深刻的是：
1. **加载速度极快**：缓存策略很智能，数据秒开
2. **界面很舒服**：图表清晰，数据一目了然
3. **手机也能用**：出门在外也能快速检查存储状态

## 🔥 技术特色

### 边缘计算架构
- 运行在 Cloudflare Workers 上，全球 200+ 数据中心
- 冷启动时间 < 10ms，响应速度超快
- 天然支持全球负载均衡

### 智能缓存策略
- Bucket 列表缓存 1 小时，减少 API 调用
- 统计数据缓存 1 小时，平衡性能与实时性
- 缓存优先加载 + 后台异步刷新

### 现代化技术栈
- **前端**：React 18 + TypeScript + Tailwind CSS
- **后端**：Cloudflare Workers + Hono 框架
- **存储**：Cloudflare KV
- **图表**：Chart.js

## 🌟 适合谁使用？

- **多账号用户**：管理多个 Cloudflare 账号的开发者
- **团队协作**：需要统一监控存储使用的团队
- **成本控制**：希望及时了解存储费用的用户
- **数据分析**：需要存储使用趋势分析的场景

## 🎉 总结

R2 Dashboard 完美解决了多账号 R2 存储管理的痛点。作为一个开源项目，它不仅功能完善，而且部署简单，性能优异。如果你也有多账号存储管理的需求，强烈推荐试试这个工具。

**项目地址：** [GitHub](https://github.com/thesignalwise/r2-dashboard)  
**在线体验：** [https://r2.thesignalwise.com/](https://r2.thesignalwise.com/)

---

*这个工具完全免费开源，如果觉得有用，别忘了给项目点个 ⭐ 哦！*