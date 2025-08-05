# Cloudflare Cron Triggers 实现说明

## 已完成的配置

### 1. Worker中的scheduled处理器
在 `src/index.tsx` 中已经实现了 `scheduled` 函数：

```javascript
export async function scheduled(
  event: ScheduledEvent,
  env: Env,
  ctx: ExecutionContext
): Promise<void> {
  console.log(`Cron trigger fired at ${event.cron}`);
  
  try {
    const result = await refreshAllStats(env);
    console.log(`Cron job completed successfully: ${JSON.stringify(result.data)}`);
  } catch (error) {
    console.error(`Cron job failed:`, error);
  }
}
```

### 2. Cron Triggers配置
在 `wrangler.toml` 中配置了两个定时任务：

```toml
[triggers]
crons = ["*/10 * * * *", "0 * * * *"]  # 每10分钟和每小时整点执行
```

### 3. 定时任务会自动执行的操作
- 遍历所有用户
- 获取每个用户的R2账户
- 查询每个账户的所有bucket
- 刷新bucket统计信息并缓存
- 结果保存在KV中，键名：`last-cron-refresh`

## 在Cloudflare后台查看

1. 登录 Cloudflare Dashboard
2. 进入 Workers & Pages
3. 选择 `r2-dashboard` Worker
4. 点击 "Triggers" 标签
5. 可以看到配置的 Cron Triggers：
   - `*/10 * * * *` - 每10分钟执行
   - `0 * * * *` - 每小时整点执行

## 查看执行日志

在 Cloudflare Dashboard 中：
1. 进入 Worker 页面
2. 点击 "Logs" 或 "Real-time logs"
3. 可以看到类似的日志：
   ```
   Cron trigger fired at */10 * * * *
   Cron job completed successfully: {"totalUsers":2,"totalAccounts":3,"totalBuckets":8,"refreshedStats":8,"errors":0,"timestamp":"2024-01-20T10:30:00.000Z"}
   ```

## 手动测试

除了等待定时触发，您还可以：

1. **使用wrangler测试**：
   ```bash
   wrangler tail
   ```
   然后等待cron触发，实时查看日志

2. **手动调用API**：
   ```bash
   curl -X POST https://r2-dashboard.icloudflare.workers.dev/api/cron/refresh-stats \
     -H "X-Cron-Secret: please-change-this-secret-key" \
     -H "Content-Type: application/json"
   ```

3. **查看最后执行结果**：
   ```bash
   wrangler kv:get --namespace-id=5941e00492c043e787978890cac43cb0 "last-cron-refresh"
   ```

## 调整执行频率

如果需要调整执行频率，修改 `wrangler.toml`：

```toml
[triggers]
crons = ["0 */3 * * *"]  # 每3小时执行一次
```

常用的cron表达式：
- `*/5 * * * *` - 每5分钟
- `0 * * * *` - 每小时
- `0 */6 * * *` - 每6小时
- `0 0 * * *` - 每天午夜
- `0 9 * * 1` - 每周一上午9点

## 注意事项

1. **执行限制**：
   - Free plan: 每天最多1000次触发
   - Paid plan: 每分钟最多1次触发

2. **执行时长**：
   - CPU时间限制：30秒（付费计划可更长）
   - 如果有大量bucket，可能需要优化逻辑

3. **监控建议**：
   - 定期检查 `last-cron-refresh` 中的错误计数
   - 使用 Cloudflare Analytics 监控执行情况
   - 设置告警（如果错误数量过多）

## 安全建议

记得更新生产环境的密钥：
```bash
wrangler secret put CRON_SECRET
# 输入一个强密码
```

这样可以防止未授权的API调用。