# 定时任务刷新API使用指南

## API端点信息

**URL**: `https://r2-dashboard.icloudflare.workers.dev/api/cron/refresh-stats`  
**方法**: `POST`  
**认证**: 需要在请求头中提供密钥

## 请求格式

```bash
curl -X POST https://r2-dashboard.icloudflare.workers.dev/api/cron/refresh-stats \
  -H "X-Cron-Secret: please-change-this-secret-key" \
  -H "Content-Type: application/json"
```

## 安全配置

1. **修改默认密钥**：
   ```bash
   wrangler secret put CRON_SECRET
   # 输入您的自定义密钥
   ```

2. **或在wrangler.toml中修改**：
   ```toml
   [vars]
   CRON_SECRET = "your-secure-secret-key"
   ```

## 设置Cloudflare Cron Trigger

1. 在`wrangler.toml`中添加：
   ```toml
   [[triggers.crons]]
   crons = ["0 */3 * * *"]  # 每3小时执行一次
   ```

2. 创建Cron处理函数（如果需要）：
   ```javascript
   export default {
     async scheduled(event, env, ctx) {
       const response = await fetch('https://r2-dashboard.icloudflare.workers.dev/api/cron/refresh-stats', {
         method: 'POST',
         headers: {
           'X-Cron-Secret': env.CRON_SECRET,
           'Content-Type': 'application/json'
         }
       });
       return response;
     }
   };
   ```

## 使用外部定时服务

### 使用cron-job.org
1. 访问 https://cron-job.org
2. 创建新任务：
   - URL: `https://r2-dashboard.icloudflare.workers.dev/api/cron/refresh-stats`
   - Method: POST
   - Headers: 
     - `X-Cron-Secret: your-secret-key`
     - `Content-Type: application/json`
   - Schedule: 每180秒（3分钟）

### 使用GitHub Actions
创建 `.github/workflows/refresh-stats.yml`：
```yaml
name: Refresh R2 Stats
on:
  schedule:
    - cron: '*/3 * * * *'  # 每3分钟
  workflow_dispatch:  # 允许手动触发

jobs:
  refresh:
    runs-on: ubuntu-latest
    steps:
      - name: Call Refresh API
        run: |
          curl -X POST https://r2-dashboard.icloudflare.workers.dev/api/cron/refresh-stats \
            -H "X-Cron-Secret: ${{ secrets.CRON_SECRET }}" \
            -H "Content-Type: application/json" \
            -f
```

## API响应示例

### 成功响应
```json
{
  "success": true,
  "message": "Statistics refresh completed",
  "data": {
    "totalUsers": 5,
    "totalAccounts": 8,
    "totalBuckets": 24,
    "refreshedStats": 24,
    "errors": 0,
    "timestamp": "2024-01-20T10:30:00.000Z"
  }
}
```

### 认证失败
```json
{
  "success": false,
  "error": "Unauthorized"
}
```

## 功能说明

这个API会：
1. 遍历所有注册用户
2. 获取每个用户配置的R2账户
3. 查询每个账户的所有bucket
4. 更新bucket的统计信息（对象数量、大小）
5. 将结果缓存在KV中，有效期1小时

## 注意事项

1. **性能考虑**：如果用户和bucket数量很多，这个操作可能需要较长时间
2. **API限制**：注意Cloudflare API的速率限制
3. **成本**：频繁调用会增加KV读写次数和API调用次数
4. **建议频率**：
   - 少量用户（<10）：每5-10分钟
   - 中等规模（10-50）：每15-30分钟
   - 大规模（>50）：每小时或更长

## 监控

查看最后一次刷新结果：
```bash
wrangler kv:get --namespace-id=5941e00492c043e787978890cac43cb0 "last-cron-refresh"
```