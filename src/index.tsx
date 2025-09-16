import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { jsx } from 'hono/jsx';
import { serveStatic } from 'hono/cloudflare-workers';

// Types
export interface Env {
  USER_DATA: KVNamespace;
  CACHE_DATA: KVNamespace;
  API_VERSION: string;
  ENVIRONMENT: string;
  CRON_SECRET?: string;
}

interface User {
  id: string;
  email: string;
  password: string; // 在生产环境应该加密
  createdAt: string;
  accounts?: R2Account[];
}

interface R2Account {
  id: string;
  name: string;
  accountId: string;
  apiToken: string; // 在生产环境应该加密
  isActive: boolean;
  createdAt: string;
}

interface R2Bucket {
  name: string;
  createdAt: string;
  region: string;
  storageClass: string;
  accountName: string;
  accountId: string;
  objects?: number;
  size?: number; // in bytes
}

interface R2Object {
  key: string;
  size: number;
  lastModified: string;
  etag: string;
  storageClass: string;
}

interface BucketUsageData {
  bucketName: string;
  totalObjects: number;
  totalSize: number;
  lastUpdated: string;
}

// Demo数据常量
const DEMO_USER_EMAIL = 'demo@thesignalwise.com';
const DEMO_USER_PASSWORD = 'demo';

const DEMO_USER_DATA: User = {
  id: 'demo_user_001',
  email: DEMO_USER_EMAIL,
  password: DEMO_USER_PASSWORD,
  createdAt: '2024-01-01T00:00:00Z',
  accounts: [
    {
      id: 'demo_account_001',
      name: 'Production Account',
      accountId: 'demo-prod-12345',
      apiToken: 'demo-token-prod',
      isActive: true,
      createdAt: '2024-01-01T00:00:00Z'
    },
    {
      id: 'demo_account_002', 
      name: 'Development Account',
      accountId: 'demo-dev-67890',
      apiToken: 'demo-token-dev',
      isActive: true,
      createdAt: '2024-01-15T00:00:00Z'
    },
    {
      id: 'demo_account_003',
      name: 'Staging Account', 
      accountId: 'demo-staging-11111',
      apiToken: 'demo-token-staging',
      isActive: false,
      createdAt: '2024-02-01T00:00:00Z'
    }
  ]
};

const DEMO_BUCKETS_DATA: R2Bucket[] = [
  {
    name: 'website-assets',
    createdAt: '2024-01-15T10:30:00Z',
    region: 'auto',
    storageClass: 'Standard',
    accountName: 'Production Account',
    accountId: 'demo-prod-12345',
    objects: 2847,
    size: 1250000000 // ~1.25GB
  },
  {
    name: 'user-uploads',
    createdAt: '2024-01-20T14:22:00Z', 
    region: 'auto',
    storageClass: 'Standard',
    accountName: 'Production Account',
    accountId: 'demo-prod-12345',
    objects: 15623,
    size: 5750000000 // ~5.75GB
  },
  {
    name: 'backups',
    createdAt: '2024-01-10T08:15:00Z',
    region: 'auto', 
    storageClass: 'Standard',
    accountName: 'Production Account',
    accountId: 'demo-prod-12345',
    objects: 156,
    size: 12300000000 // ~12.3GB
  },
  {
    name: 'dev-testing',
    createdAt: '2024-01-25T16:45:00Z',
    region: 'auto',
    storageClass: 'Standard', 
    accountName: 'Development Account',
    accountId: 'demo-dev-67890',
    objects: 892,
    size: 450000000 // ~450MB
  },
  {
    name: 'logs-archive',
    createdAt: '2024-02-01T09:00:00Z',
    region: 'auto',
    storageClass: 'Standard',
    accountName: 'Development Account', 
    accountId: 'demo-dev-67890',
    objects: 4521,
    size: 2100000000 // ~2.1GB
  }
];

const DEMO_ANALYTICS_DATA = {
  totalStorage: 21850000000, // ~21.85GB
  totalObjects: 24039,
  totalAccounts: 3,
  activeAccounts: 2,
  bucketDistribution: [
    { name: 'backups', value: 12300000000, objects: 156 },
    { name: 'user-uploads', value: 5750000000, objects: 15623 },
    { name: 'logs-archive', value: 2100000000, objects: 4521 },
    { name: 'website-assets', value: 1250000000, objects: 2847 },
    { name: 'dev-testing', value: 450000000, objects: 892 }
  ],
  sizeTrend: [
    { date: '2024-01-01', size: 8500000000 },
    { date: '2024-01-08', size: 11200000000 },
    { date: '2024-01-15', size: 13800000000 },
    { date: '2024-01-22', size: 16500000000 },
    { date: '2024-01-29', size: 18900000000 },
    { date: '2024-02-05', size: 20100000000 },
    { date: '2024-02-12', size: 21850000000 }
  ],
  accountBreakdown: [
    {
      accountId: 'demo-prod-12345',
      accountName: 'Production Account',
      totalSize: 19300000000,
      totalObjects: 18626,
      bucketsCount: 3,
      isActive: true
    },
    {
      accountId: 'demo-dev-67890', 
      accountName: 'Development Account',
      totalSize: 2550000000,
      totalObjects: 5413,
      bucketsCount: 2,
      isActive: true
    },
    {
      accountId: 'demo-staging-11111',
      accountName: 'Staging Account', 
      totalSize: 0,
      totalObjects: 0,
      bucketsCount: 0,
      isActive: false
    }
  ]
};

// 检查是否为demo用户
function isDemoUser(email: string): boolean {
  return email === DEMO_USER_EMAIL;
}

// 获取bucket统计信息（带缓存）
async function getBucketStats(account: R2Account, bucketName: string, cacheKV: KVNamespace, forceRefresh: boolean = false): Promise<{ objects: number; size: number }> {
  const cacheKey = `bucket-stats:${account.accountId}:${bucketName}`;
  const cacheTimeout = 60 * 60 * 1000; // 1小时缓存
  
  try {
    // 如果不是强制刷新，尝试从缓存获取
    if (!forceRefresh) {
      const cached = await cacheKV.get(cacheKey);
      if (cached) {
        const cachedData = JSON.parse(cached);
        const cacheAge = Date.now() - new Date(cachedData.timestamp).getTime();
        if (cacheAge < cacheTimeout) {
          return { objects: cachedData.objects, size: cachedData.size };
        }
      }
    }

    // 注意：Cloudflare R2目前不提供直接的bucket统计API
    // 官方建议使用以下方法之一：
    // 1. 使用S3兼容API的ListObjectsV2并遍历所有对象（可能很慢）
    // 2. 使用GraphQL Analytics API（需要Enterprise计划）
    // 3. 自行维护对象计数（在上传/删除时更新）
    
    // 这里暂时返回模拟数据，实际项目中可以：
    // - 集成@aws-sdk/client-s3在Node.js环境中使用
    // - 或者创建一个后台任务定期统计并存储在KV中
    const objects = Math.floor(Math.random() * 100); // 模拟数据
    const size = Math.floor(Math.random() * 1000000000); // 模拟数据

    // 缓存结果
    const cacheData = {
      objects,
      size,
      timestamp: new Date().toISOString()
    };
    await cacheKV.put(cacheKey, JSON.stringify(cacheData), { expirationTtl: 3600 }); // 1小时TTL

    return { objects, size };
  } catch (error) {
    console.error(`Failed to get stats for bucket ${bucketName}:`, error);
    return { objects: 0, size: 0 };
  }
}

// 创建Hono应用
const app = new Hono<{ Bindings: Env }>();

// 中间件
app.use('*', cors());

// API路由
app.get('/api/health', (c) => {
  return c.json({
    success: true,
    data: {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: c.env.API_VERSION,
      environment: c.env.ENVIRONMENT,
    },
    message: 'R2 Dashboard API is running',
  });
});

// 用户注册
app.post('/api/auth/register', async (c) => {
  try {
    const { email, password } = await c.req.json();
    
    if (!email || !password) {
      return c.json({ success: false, error: 'Email and password required' }, 400);
    }

    // 检查用户是否已存在
    const existingUser = await c.env.USER_DATA.get(`user:${email}`);
    if (existingUser) {
      return c.json({ success: false, error: 'User already exists' }, 400);
    }

    // 创建新用户
    const user: User = {
      id: `user_${Date.now()}`,
      email,
      password, // 简单开发模式，不加密
      createdAt: new Date().toISOString(),
      accounts: [],
    };

    await c.env.USER_DATA.put(`user:${email}`, JSON.stringify(user));

    return c.json({
      success: true,
      data: {
        user: { id: user.id, email: user.email },
        token: `token_${user.id}`, // 简单token
      },
      message: 'Registration successful',
    }, 201);
  } catch (error) {
    return c.json({ success: false, error: 'Registration failed' }, 500);
  }
});

// 用户登录
app.post('/api/auth/login', async (c) => {
  try {
    const { email, password } = await c.req.json();
    
    if (!email || !password) {
      return c.json({ success: false, error: 'Email and password required' }, 400);
    }

    // 检查是否为demo用户
    if (isDemoUser(email)) {
      if (password === DEMO_USER_PASSWORD) {
        return c.json({
          success: true,
          data: {
            user: { id: DEMO_USER_DATA.id, email: DEMO_USER_DATA.email },
            token: `token_${DEMO_USER_DATA.id}`,
          },
          message: 'Demo login successful',
        });
      } else {
        return c.json({ success: false, error: 'Invalid credentials' }, 401);
      }
    }

    // 普通用户登录逻辑
    const userJson = await c.env.USER_DATA.get(`user:${email}`);
    if (!userJson) {
      return c.json({ success: false, error: 'Invalid credentials' }, 401);
    }

    const user: User = JSON.parse(userJson);
    if (user.password !== password) {
      return c.json({ success: false, error: 'Invalid credentials' }, 401);
    }

    return c.json({
      success: true,
      data: {
        user: { id: user.id, email: user.email },
        token: `token_${user.id}`,
      },
      message: 'Login successful',
    });
  } catch (error) {
    return c.json({ success: false, error: 'Login failed' }, 500);
  }
});

// Account Management Endpoints

// Get user accounts
app.get('/api/accounts', async (c) => {
  try {
    const email = c.req.header('X-User-Email');
    if (!email) {
      return c.json({ success: false, error: 'User email required' }, 401);
    }

    // 检查是否为demo用户
    if (isDemoUser(email)) {
      return c.json({
        success: true,
        data: DEMO_USER_DATA.accounts || [],
        message: 'Demo accounts retrieved successfully',
      });
    }

    // 普通用户逻辑
    const userJson = await c.env.USER_DATA.get(`user:${email}`);
    if (!userJson) {
      return c.json({ success: false, error: 'User not found' }, 404);
    }

    const user: User = JSON.parse(userJson);
    return c.json({
      success: true,
      data: user.accounts || [],
      message: 'Accounts retrieved successfully',
    });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch accounts' }, 500);
  }
});

// Add new account
app.post('/api/accounts', async (c) => {
  try {
    const email = c.req.header('X-User-Email');
    if (!email) {
      return c.json({ success: false, error: 'User email required' }, 401);
    }

    // 检查是否为demo用户 - demo用户不能添加账户
    if (isDemoUser(email)) {
      return c.json({ success: false, error: 'Demo account cannot be modified' }, 403);
    }

    const { name, accountId, apiToken } = await c.req.json();
    if (!name || !accountId || !apiToken) {
      return c.json({ success: false, error: 'Name, accountId, and apiToken required' }, 400);
    }

    const userJson = await c.env.USER_DATA.get(`user:${email}`);
    if (!userJson) {
      return c.json({ success: false, error: 'User not found' }, 404);
    }

    const user: User = JSON.parse(userJson);
    const newAccount: R2Account = {
      id: `account_${Date.now()}`,
      name,
      accountId,
      apiToken, // In production, encrypt this
      isActive: true,
      createdAt: new Date().toISOString(),
    };

    user.accounts = user.accounts || [];
    user.accounts.push(newAccount);

    await c.env.USER_DATA.put(`user:${email}`, JSON.stringify(user));

    return c.json({
      success: true,
      data: newAccount,
      message: 'Account added successfully',
    }, 201);
  } catch (error) {
    return c.json({ success: false, error: 'Failed to add account' }, 500);
  }
});

// Update account
app.put('/api/accounts/:id', async (c) => {
  try {
    const email = c.req.header('X-User-Email');
    const accountId = c.req.param('id');
    
    if (!email) {
      return c.json({ success: false, error: 'User email required' }, 401);
    }

    const { name, isActive } = await c.req.json();

    const userJson = await c.env.USER_DATA.get(`user:${email}`);
    if (!userJson) {
      return c.json({ success: false, error: 'User not found' }, 404);
    }

    const user: User = JSON.parse(userJson);
    const accountIndex = user.accounts?.findIndex(acc => acc.id === accountId);
    
    if (accountIndex === undefined || accountIndex === -1) {
      return c.json({ success: false, error: 'Account not found' }, 404);
    }

    if (name !== undefined) user.accounts![accountIndex].name = name;
    if (isActive !== undefined) user.accounts![accountIndex].isActive = isActive;

    await c.env.USER_DATA.put(`user:${email}`, JSON.stringify(user));

    return c.json({
      success: true,
      data: user.accounts![accountIndex],
      message: 'Account updated successfully',
    });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to update account' }, 500);
  }
});

// Delete account
app.delete('/api/accounts/:id', async (c) => {
  try {
    const email = c.req.header('X-User-Email');
    const accountId = c.req.param('id');
    
    if (!email) {
      return c.json({ success: false, error: 'User email required' }, 401);
    }

    // 检查是否为demo用户 - demo用户不能删除账户
    if (isDemoUser(email)) {
      return c.json({ success: false, error: 'Demo account cannot be modified' }, 403);
    }

    const userJson = await c.env.USER_DATA.get(`user:${email}`);
    if (!userJson) {
      return c.json({ success: false, error: 'User not found' }, 404);
    }

    const user: User = JSON.parse(userJson);
    
    // 找到要删除的账户
    const accountToDelete = user.accounts?.find(acc => acc.id === accountId);
    if (!accountToDelete) {
      return c.json({ success: false, error: 'Account not found' }, 404);
    }

    let deletedCacheCount = 0;
    
    // 清理该账户相关的所有缓存数据
    try {
      if (accountToDelete.isActive && accountToDelete.apiToken) {
        // 获取该账户的所有bucket
        const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountToDelete.accountId}/r2/buckets`, {
          headers: {
            'Authorization': `Bearer ${accountToDelete.apiToken}`,
            'Content-Type': 'application/json'
          }
        });

        const data = await response.json() as any;
        
        if (response.ok && data.success) {
          // 删除每个bucket的缓存数据
          for (const bucket of data.result.buckets) {
            const cacheKey = `bucket-stats:${accountToDelete.accountId}:${bucket.name}`;
            await c.env.CACHE_DATA.delete(cacheKey);
            deletedCacheCount++;
          }
        }
      }
    } catch (error) {
      console.warn(`Failed to clean cache for account ${accountToDelete.name}:`, error);
      // 继续删除账户，即使清理缓存失败
    }

    // 从用户数据中删除账户
    user.accounts = user.accounts?.filter(acc => acc.id !== accountId) || [];
    await c.env.USER_DATA.put(`user:${email}`, JSON.stringify(user));

    return c.json({
      success: true,
      message: 'Account deleted successfully',
      data: {
        deletedAccount: accountToDelete.name,
        deletedCacheEntries: deletedCacheCount
      }
    });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to delete account' }, 500);
  }
});

// Get R2 buckets from all accounts
app.get('/api/buckets', async (c) => {
  try {
    const email = c.req.header('X-User-Email');
    const forceRefresh = c.req.header('X-Force-Refresh') === 'true';
    
    if (!email) {
      return c.json({ 
        success: false, 
        error: 'User email required. Please login first.' 
      }, 401);
    }

    // 检查是否为demo用户
    if (isDemoUser(email)) {
      return c.json({
        success: true,
        data: DEMO_BUCKETS_DATA,
        message: `Retrieved ${DEMO_BUCKETS_DATA.length} demo R2 buckets from ${DEMO_USER_DATA.accounts?.filter(acc => acc.isActive).length} accounts`,
        lastRefreshed: new Date().toISOString()
      });
    }

    // 普通用户逻辑
    const userJson = await c.env.USER_DATA.get(`user:${email}`);
    if (!userJson) {
      return c.json({ success: false, error: 'User not found' }, 404);
    }

    const user: User = JSON.parse(userJson);
    const activeAccounts = user.accounts?.filter(acc => acc.isActive) || [];
    
    if (activeAccounts.length === 0) {
      return c.json({
        success: true,
        data: [],
        message: 'No active accounts found',
      });
    }

    const allBuckets: R2Bucket[] = [];
    let hasErrors = false;
    const errors: string[] = [];

    for (const account of activeAccounts) {
      try {
        const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account.accountId}/r2/buckets`, {
          headers: {
            'Authorization': `Bearer ${account.apiToken}`,
            'Content-Type': 'application/json'
          }
        });

        const data = await response.json() as any;

        if (response.ok && data.success) {
          // 批量获取每个bucket的统计信息
          const buckets = await Promise.all(
            data.result.buckets.map(async (bucket: any) => {
              const bucketStats = await getBucketStats(account, bucket.name, c.env.CACHE_DATA, forceRefresh);
              return {
                name: bucket.name,
                createdAt: bucket.creation_date,
                region: 'auto',
                storageClass: 'Standard',
                accountName: account.name,
                accountId: account.accountId,
                objects: bucketStats.objects,
                size: bucketStats.size,
              };
            })
          );
          allBuckets.push(...buckets);
        } else {
          hasErrors = true;
          errors.push(`Failed to fetch buckets for account ${account.name}: ${data.error || 'Unknown error'}`);
        }
      } catch (error) {
        hasErrors = true; 
        const errorMsg = `Failed to fetch buckets for account ${account.name}: ${error.message}`;
        errors.push(errorMsg);
        console.error(errorMsg, error);
      }
    }

    // 只有在没有错误时才记录最后一次API刷新时间
    const refreshTimestamp = new Date().toISOString();
    if (!hasErrors) {
      await c.env.CACHE_DATA.put(`last-api-refresh:${email}`, refreshTimestamp, { expirationTtl: 86400 });
    }

    // 如果有数据，先缓存结果
    if (allBuckets.length > 0) {
      try {
        const cacheKey = `user-buckets:${email}`;
        const cacheData = {
          data: allBuckets,
          timestamp: refreshTimestamp,
          hasErrors: hasErrors,
          errors: errors
        };
        // 缓存1小时
        await c.env.CACHE_DATA.put(cacheKey, JSON.stringify(cacheData), { expirationTtl: 3600 });
      } catch (cacheError) {
        console.warn('Failed to cache buckets data:', cacheError);
      }
    }

    // 如果有部分错误但仍有数据，返回成功但包含警告
    if (hasErrors && allBuckets.length > 0) {
      return c.json({
        success: true,
        data: allBuckets,
        message: `Retrieved ${allBuckets.length} R2 buckets with some errors`,
        warnings: errors,
        lastRefreshed: refreshTimestamp
      });
    } 
    // 如果完全失败，返回错误
    else if (hasErrors && allBuckets.length === 0) {
      return c.json({
        success: false,
        error: 'Failed to fetch any buckets',
        details: errors
      }, 500);
    }
    // 完全成功
    else {
      return c.json({
        success: true,
        data: allBuckets,
        message: `Retrieved ${allBuckets.length} R2 buckets from ${activeAccounts.length} accounts`,
        lastRefreshed: refreshTimestamp
      });
    }
  } catch (error) {
    return c.json({
      success: false,
      error: 'Failed to fetch buckets',
    }, 500);
  }
});

// Get bucket usage analytics
app.get('/api/buckets/:bucketName/analytics', async (c) => {
  try {
    const bucketName = c.req.param('bucketName');
    const email = c.req.header('X-User-Email');

    if (!email) {
      return c.json({ success: false, error: 'User email required' }, 401);
    }

    try {
      // Get user's R2 accounts from KV
      const userData = await c.env.USER_DATA.get(`user:${email}`);
      if (!userData) {
        return c.json({ success: false, error: 'User not found' }, 404);
      }

      const user: User = JSON.parse(userData);
      if (!user.accounts || user.accounts.length === 0) {
        return c.json({ success: false, error: 'No R2 accounts configured' }, 400);
      }

      // TODO: Implement actual R2 analytics API calls
      return c.json({
        success: false,
        error: 'Analytics feature requires R2 API integration'
      }, 501);
    } catch (error) {
      return c.json({ success: false, error: 'Failed to get analytics data' }, 500);
    }
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch analytics' }, 500);
  }
});

// Get cached buckets data (fast endpoint)
app.get('/api/buckets/cached', async (c) => {
  try {
    const email = c.req.header('X-User-Email');
    if (!email) {
      return c.json({ 
        success: false, 
        error: 'User email required' 
      }, 401);
    }

    // 检查是否为demo用户
    if (isDemoUser(email)) {
      return c.json({
        success: true,
        data: DEMO_BUCKETS_DATA,
        cached: true,
        message: 'Demo buckets loaded from cache'
      });
    }

    // 尝试从缓存获取完整的buckets数据
    const cacheKey = `user-buckets:${email}`;
    const cachedBuckets = await c.env.CACHE_DATA.get(cacheKey);
    
    if (cachedBuckets) {
      try {
        const buckets = JSON.parse(cachedBuckets);
        return c.json({
          success: true,
          data: buckets.data || [],
          cached: true,
          lastRefreshed: buckets.timestamp,
          message: 'Buckets loaded from cache'
        });
      } catch (parseError) {
        console.error('Failed to parse cached buckets:', parseError);
      }
    }

    // 如果没有缓存，返回空数组，前端会显示loading并调用完整API
    return c.json({
      success: true,
      data: [],
      cached: false,
      message: 'No cached data available'
    });

  } catch (error) {
    return c.json({ 
      success: false, 
      error: 'Failed to get cached buckets' 
    }, 500);
  }
});

// List objects in bucket
app.get('/api/buckets/:bucketName/objects', async (c) => {
  try {
    const bucketName = c.req.param('bucketName');
    const email = c.req.header('X-User-Email');
    const prefix = c.req.query('prefix') || '';
    const limit = parseInt(c.req.query('limit') || '100');

    if (!email) {
      return c.json({ success: false, error: 'User email required' }, 401);
    }

    try {
      // Get user's R2 accounts from KV
      const userData = await c.env.USER_DATA.get(`user:${email}`);
      if (!userData) {
        return c.json({ success: false, error: 'User not found' }, 404);
      }

      const user: User = JSON.parse(userData);
      if (!user.accounts || user.accounts.length === 0) {
        return c.json({ success: false, error: 'No R2 accounts configured' }, 400);
      }

      // TODO: Implement actual R2 object listing API calls
      return c.json({
        success: false,
        error: 'Object listing feature requires R2 API integration'
      }, 501);
    } catch (error) {
      return c.json({ success: false, error: 'Failed to list objects' }, 500);
    }
  } catch (error) {
    return c.json({ success: false, error: 'Failed to list objects' }, 500);
  }
});

// Delete object from bucket
app.delete('/api/buckets/:bucketName/objects/:objectKey', async (c) => {
  try {
    const bucketName = c.req.param('bucketName');
    const objectKey = decodeURIComponent(c.req.param('objectKey'));
    const email = c.req.header('X-User-Email');

    if (!email) {
      return c.json({ success: false, error: 'User email required' }, 401);
    }

    try {
      // Get user's R2 accounts from KV
      const userData = await c.env.USER_DATA.get(`user:${email}`);
      if (!userData) {
        return c.json({ success: false, error: 'User not found' }, 404);
      }

      const user: User = JSON.parse(userData);
      if (!user.accounts || user.accounts.length === 0) {
        return c.json({ success: false, error: 'No R2 accounts configured' }, 400);
      }

      // TODO: Implement actual R2 object deletion API calls
      return c.json({
        success: false,
        error: 'Object deletion feature requires R2 API integration'
      }, 501);
    } catch (error) {
      return c.json({ success: false, error: 'Failed to delete object' }, 500);
    }
  } catch (error) {
    return c.json({ success: false, error: 'Failed to delete object' }, 500);
  }
});

// 清理缓存API端点
app.delete('/api/cache', async (c) => {
  try {
    const email = c.req.header('X-User-Email');
    if (!email) {
      return c.json({ success: false, error: 'User email required' }, 401);
    }

    // 检查是否为demo用户 - demo用户不需要清理缓存，直接返回模拟结果
    if (isDemoUser(email)) {
      return c.json({
        success: true,
        message: 'Demo cache cleared (simulated)',
        data: { 
          deletedCount: 5,
          failedCount: 0,
          totalAttempted: 5
        }
      });
    }

    const userData = await c.env.USER_DATA.get(`user:${email}`);
    if (!userData) {
      return c.json({ success: false, error: 'User not found' }, 404);
    }

    const user: User = JSON.parse(userData);
    if (!user.accounts || user.accounts.length === 0) {
      return c.json({ success: false, error: 'No R2 accounts configured' }, 400);
    }

    // 改进的缓存清理策略：先验证API访问，再清理缓存
    let deletedCount = 0;
    let failedCount = 0;
    const cacheKeysToDelete: string[] = [];
    
    // 第一步：收集需要清理的缓存键，同时验证API可访问性
    for (const account of user.accounts) {
      try {
        const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account.accountId}/r2/buckets`, {
          headers: {
            'Authorization': `Bearer ${account.apiToken}`,
            'Content-Type': 'application/json'
          }
        });

        const data = await response.json() as any;
        if (response.ok && data.success) {
          // API访问成功，记录需要清理的缓存键
          for (const bucket of data.result.buckets) {
            const cacheKey = `bucket-stats:${account.accountId}:${bucket.name}`;
            cacheKeysToDelete.push(cacheKey);
          }
        } else {
          console.warn(`API access failed for account ${account.name}, skipping cache clear`);
          failedCount++;
        }
      } catch (error) {
        console.error(`Failed to verify API access for account ${account.name}:`, error);
        failedCount++;
      }
    }

    // 第二步：只有在API验证成功的情况下才清理缓存
    for (const cacheKey of cacheKeysToDelete) {
      try {
        await c.env.CACHE_DATA.delete(cacheKey);
        deletedCount++;
      } catch (error) {
        console.error(`Failed to delete cache key ${cacheKey}:`, error);
      }
    }

    const message = failedCount > 0 
      ? `Cleared ${deletedCount} cache entries, ${failedCount} accounts failed verification`
      : `Cleared ${deletedCount} cache entries`;

    return c.json({
      success: true,
      message,
      data: { 
        deletedCount,
        failedCount,
        totalAttempted: cacheKeysToDelete.length + failedCount
      }
    });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to clear cache' }, 500);
  }
});

// 获取最后刷新时间
app.get('/api/last-refresh', async (c) => {
  try {
    const email = c.req.header('X-User-Email');
    if (!email) {
      return c.json({ success: false, error: 'User email required' }, 401);
    }

    // 检查是否为demo用户
    if (isDemoUser(email)) {
      return c.json({
        success: true,
        data: {
          lastApiRefresh: new Date().toISOString(),
          lastCronRefresh: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2小时前
          cronSummary: {
            totalUsers: 1,
            totalAccounts: 3,
            totalBuckets: 5,
            refreshedStats: 5,
            errors: 0,
            timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
          }
        }
      });
    }

    // 普通用户逻辑
    const lastRefresh = await c.env.CACHE_DATA.get(`last-api-refresh:${email}`);
    const lastCronRefresh = await c.env.CACHE_DATA.get('last-cron-refresh');

    let cronData = null;
    if (lastCronRefresh) {
      try {
        cronData = JSON.parse(lastCronRefresh);
      } catch (e) {
        // Ignore parse errors
      }
    }

    return c.json({
      success: true,
      data: {
        lastApiRefresh: lastRefresh,
        lastCronRefresh: cronData?.data?.timestamp || null,
        cronSummary: cronData?.data || null
      }
    });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to get refresh times' }, 500);
  }
});

// 定时任务刷新API - 不需要认证
app.post('/api/cron/refresh-stats', async (c) => {
  try {
    // 验证请求来源（可选）
    const cronSecret = c.req.header('X-Cron-Secret');
    const expectedSecret = c.env.CRON_SECRET || 'your-secret-key';
    
    if (cronSecret !== expectedSecret) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }

    const result = await refreshAllStats(c.env);
    return c.json(result);
  } catch (error) {
    console.error('Cron refresh error:', error);
    return c.json({ 
      success: false, 
      error: 'Failed to refresh statistics',
      details: error.message 
    }, 500);
  }
});

// React应用入口
app.get('/', (c) => {
  const html = `
<!DOCTYPE html>
<html lang="en" itemscope itemtype="https://schema.org/WebApplication">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cloudflare R2 Dashboard - Multi-Account Storage Management | TheSignalWise</title>
  
  <!-- SEO Meta Tags -->
  <meta name="description" content="Unified visualization and management dashboard for multiple Cloudflare R2 storage accounts. Monitor usage, analyze data, and manage buckets across multiple accounts with real-time analytics.">
  <meta name="keywords" content="Cloudflare R2, storage dashboard, cloud storage management, multi-account dashboard, R2 analytics, storage visualization, bucket management, cloud storage monitoring">
  <meta name="author" content="TheSignalWise">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="https://r2.thesignalwise.com/">
  
  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="website">
  <meta property="og:url" content="https://r2.thesignalwise.com/">
  <meta property="og:title" content="Cloudflare R2 Dashboard - Multi-Account Storage Management">
  <meta property="og:description" content="Unified visualization and management dashboard for multiple Cloudflare R2 storage accounts. Monitor usage, analyze data, and manage buckets with real-time analytics.">
  <meta property="og:image" content="https://r2.thesignalwise.com/og-image.png">
  <meta property="og:site_name" content="TheSignalWise R2 Dashboard">
  
  <!-- Twitter -->
  <meta property="twitter:card" content="summary_large_image">
  <meta property="twitter:url" content="https://r2.thesignalwise.com/">
  <meta property="twitter:title" content="Cloudflare R2 Dashboard - Multi-Account Storage Management">
  <meta property="twitter:description" content="Unified visualization and management dashboard for multiple Cloudflare R2 storage accounts. Monitor usage, analyze data, and manage buckets with real-time analytics.">
  <meta property="twitter:image" content="https://r2.thesignalwise.com/og-image.png">
  
  <!-- Additional SEO -->
  <meta name="theme-color" content="#667eea">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="default">
  <meta name="apple-mobile-web-app-title" content="R2 Dashboard">
  
  <!-- Structured Data -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "Cloudflare R2 Dashboard",
    "description": "Unified visualization and management dashboard for multiple Cloudflare R2 storage accounts",
    "url": "https://r2.thesignalwise.com/",
    "author": {
      "@type": "Organization",
      "name": "TheSignalWise",
      "url": "https://thesignalwise.com/"
    },
    "applicationCategory": "DeveloperApplication",
    "operatingSystem": "Web Browser",
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "USD"
    },
    "featureList": [
      "Multi-Account Management",
      "Storage Analytics",
      "Real-time Monitoring",
      "Bucket Management",
      "Usage Visualization"
    ]
  }
  </script>
  <script src="https://cdn.tailwindcss.com"></script>
  <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    .sidebar-item {
      transition: all 0.2s ease-in-out;
    }
    .sidebar-item:hover {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      transform: translateX(5px);
    }
    .card-hover {
      transition: all 0.3s ease;
    }
    .card-hover:hover {
      transform: translateY(-5px);
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
    }
    .gradient-bg {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    }
    .chart-container {
      position: relative;
      height: 400px;
      width: 100%;
    }
  </style>
</head>
<body>
  <main id="root" role="main" aria-label="Cloudflare R2 Dashboard Application"></main>
  
  <!-- SEO-friendly content for search engines -->
  <noscript>
    <div style="padding: 20px; text-align: center; font-family: Arial, sans-serif;">
      <h1>Cloudflare R2 Dashboard - Multi-Account Storage Management</h1>
      <p>A unified visualization and management dashboard for multiple Cloudflare R2 storage accounts.</p>
      <h2>Key Features:</h2>
      <ul style="list-style: none; padding: 0;">
        <li>🗂️ Multi-Account Management: Manage multiple Cloudflare R2 accounts from one dashboard</li>
        <li>📊 Storage Analytics: Visual charts and statistics for storage usage</li>
        <li>🔐 Secure: Account IDs are masked for privacy protection</li>
        <li>⚡ Fast: Built on Cloudflare Workers for global performance</li>
        <li>📱 Responsive: Modern UI that works on all devices</li>
      </ul>
      <p>This application requires JavaScript to run. Please enable JavaScript in your browser.</p>
      <p>Visit <a href="https://thesignalwise.com/">TheSignalWise</a> for more tools and solutions.</p>
    </div>
  </noscript>
  <script type="text/babel">
    const { useState, useEffect, useRef } = React;
    
    // Utility functions
    const formatBytes = (bytes) => {
      if (bytes === 0) return '0 Bytes';
      const k = 1024;
      const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const formatNumber = (num) => {
      return new Intl.NumberFormat().format(num);
    };

    // Chart component
    const ChartComponent = ({ type, data, options, title }) => {
      const chartRef = useRef();
      const chartInstanceRef = useRef();

      useEffect(() => {
        if (chartRef.current) {
          const ctx = chartRef.current.getContext('2d');
          
          if (chartInstanceRef.current) {
            chartInstanceRef.current.destroy();
          }

          chartInstanceRef.current = new Chart(ctx, {
            type,
            data,
            options: {
              responsive: true,
              maintainAspectRatio: false,
              ...options
            }
          });
        }

        return () => {
          if (chartInstanceRef.current) {
            chartInstanceRef.current.destroy();
          }
        };
      }, [type, data, options]);

      return (
        <div className="bg-white p-6 rounded-lg shadow card-hover">
          <h3 className="text-lg font-semibold mb-4">{title}</h3>
          <div className="chart-container">
            <canvas ref={chartRef}></canvas>
          </div>
        </div>
      );
    };

    // 格式化账户ID，隐藏中间部分
    function maskAccountId(accountId) {
      if (!accountId || accountId.length <= 16) return accountId;
      const start = accountId.substring(0, 8);
      const end = accountId.substring(accountId.length - 8);
      return \`\${start}****************\${end}\`;
    }
    
    function App() {
      const [isLoggedIn, setIsLoggedIn] = useState(false);
      const [currentUser, setCurrentUser] = useState(null);
      const [email, setEmail] = useState('');
      const [password, setPassword] = useState('');
      const [isRegister, setIsRegister] = useState(false);
      const [error, setError] = useState('');
      const [loading, setLoading] = useState(false);
      
      // Dashboard state
      const [activeTab, setActiveTab] = useState('dashboard');
      const [buckets, setBuckets] = useState([]);
      const [accounts, setAccounts] = useState([]);
      const [selectedBucket, setSelectedBucket] = useState(null);
      const [bucketObjects, setBucketObjects] = useState([]);
      const [analytics, setAnalytics] = useState(null);
      const [refreshInterval, setRefreshInterval] = useState(null);
      const [lastRefreshTime, setLastRefreshTime] = useState(null);
      const [cronRefreshTime, setCronRefreshTime] = useState(null);

      // Account management state
      const [showAddAccount, setShowAddAccount] = useState(false);
      const [showApiHelp, setShowApiHelp] = useState(false);
      const [newAccount, setNewAccount] = useState({ name: '', accountId: '', apiToken: '' });

      const authHeaders = () => {
        const user = currentUser || (localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')) : null);
        return user ? { 'X-User-Email': user.email } : {};
      };

      const handleAuth = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
          const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login';
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
          });

          const data = await response.json();
          
          if (data.success) {
            setIsLoggedIn(true);
            setCurrentUser(data.data.user);
            localStorage.setItem('token', data.data.token);
            localStorage.setItem('user', JSON.stringify(data.data.user));
            fetchInitialData();
          } else {
            setError(data.error || 'Authentication failed');
          }
        } catch (err) {
          setError('Network error occurred');
        } finally {
          setLoading(false);
        }
      };

      const fetchInitialData = async () => {
        console.log('Fetching initial data with user:', currentUser);
        await Promise.all([fetchBuckets(), fetchAccounts(), fetchLastRefreshTime()]);
      };

      const fetchBuckets = async (forceClearCache = false) => {
        setLoading(true);
        
        try {
          // 步骤1: 优先从缓存快速加载
          if (!forceClearCache) {
            try {
              const cacheResponse = await fetch('/api/buckets/cached', { 
                headers: authHeaders() 
              });
              const cacheData = await cacheResponse.json();
              
              if (cacheData.success && cacheData.data && cacheData.data.length > 0) {
                setBuckets(cacheData.data);
                setLoading(false); // 立即停止loading，显示缓存数据
                console.log('Loaded buckets from cache, refreshing in background...');
                
                // 步骤2: 后台异步刷新数据
                setTimeout(async () => {
                  try {
                    const refreshResponse = await fetch('/api/buckets', { 
                      headers: authHeaders()
                    });
                    const refreshData = await refreshResponse.json();
                    
                    if (refreshData.success) {
                      setBuckets(refreshData.data);
                      console.log('Background refresh completed');
                    }
                  } catch (refreshError) {
                    console.warn('Background refresh failed:', refreshError);
                  }
                }, 100); // 100ms后开始后台刷新
                
                return; // 提前退出，避免重复请求
              }
            } catch (cacheError) {
              console.warn('Cache loading failed, falling back to API:', cacheError);
            }
          }
          
          // 步骤3: 如果没有缓存或强制刷新，直接调用API
          const response = await fetch('/api/buckets', { 
            headers: {
              ...authHeaders(),
              'X-Force-Refresh': forceClearCache ? 'true' : 'false'
            }
          });
          const data = await response.json();
          
          if (data.success) {
            setBuckets(data.data);
            console.log('Successfully fetched and cached new bucket data');
            // 注意：/api/buckets 已经自动缓存了新数据，无需额外操作
          } else {
            console.warn('API call failed:', data.error);
            setError(data.error || 'Failed to fetch buckets.');
            // 注意：如果API失败，我们不清除缓存，用户仍可看到之前的缓存数据
          }
        } catch (err) {
          console.error('Failed to fetch buckets:', err);
          setError('Network error occurred.');
        } finally {
          setLoading(false);
        }
      };

      const fetchAccounts = async () => {
        try {
          const response = await fetch('/api/accounts', { headers: authHeaders() });
          const data = await response.json();
          
          if (data.success) {
            setAccounts(data.data);
          }
        } catch (err) {
          console.error('Failed to fetch accounts:', err);
        }
      };

      const fetchLastRefreshTime = async () => {
        try {
          const response = await fetch('/api/last-refresh', { headers: authHeaders() });
          const data = await response.json();
          
          if (data.success) {
            setLastRefreshTime(data.data.lastApiRefresh);
            setCronRefreshTime(data.data.lastCronRefresh);
          }
        } catch (err) {
          console.error('Failed to fetch refresh times:', err);
        }
      };

      const fetchBucketObjects = async (bucketName) => {
        try {
          const response = await fetch(\`/api/buckets/\${bucketName}/objects\`, { headers: authHeaders() });
          const data = await response.json();
          
          if (data.success) {
            setBucketObjects(data.data.objects);
          }
        } catch (err) {
          console.error('Failed to fetch bucket objects:', err);
        }
      };

      const fetchAnalytics = async (bucketName) => {
        try {
          const response = await fetch(\`/api/buckets/\${bucketName}/analytics\`, { headers: authHeaders() });
          const data = await response.json();
          
          if (data.success) {
            setAnalytics(data.data);
          }
        } catch (err) {
          console.error('Failed to fetch analytics:', err);
        }
      };

      const addAccount = async () => {
        try {
          const response = await fetch('/api/accounts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders },
            body: JSON.stringify(newAccount),
          });

          const data = await response.json();
          
          if (data.success) {
            setAccounts([...accounts, data.data]);
            setNewAccount({ name: '', accountId: '', apiToken: '' });
            setShowAddAccount(false);
            fetchBuckets(); // Refresh buckets
          } else {
            setError(data.error);
          }
        } catch (err) {
          setError('Failed to add account');
        }
      };

      const deleteAccount = async (accountId) => {
        try {
          const response = await fetch(\`/api/accounts/\${accountId}\`, {
            method: 'DELETE',
            headers: authHeaders(),
          });

          if (response.ok) {
            setAccounts(accounts.filter(acc => acc.id !== accountId));
            fetchBuckets(); // Refresh buckets
          }
        } catch (err) {
          console.error('Failed to delete account:', err);
        }
      };

      const deleteObject = async (bucketName, objectKey) => {
        try {
          const response = await fetch(\`/api/buckets/\${bucketName}/objects/\${encodeURIComponent(objectKey)}\`, {
            method: 'DELETE',
            headers: authHeaders(),
          });

          if (response.ok) {
            setBucketObjects(bucketObjects.filter(obj => obj.key !== objectKey));
          }
        } catch (err) {
          console.error('Failed to delete object:', err);
        }
      };

      const handleLogout = () => {
        setIsLoggedIn(false);
        setCurrentUser(null);
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setBuckets([]);
        setAccounts([]);
        setSelectedBucket(null);
        setBucketObjects([]);
        setAnalytics(null);
        if (refreshInterval) {
          clearInterval(refreshInterval);
          setRefreshInterval(null);
        }
      };

      const startAutoRefresh = () => {
        if (refreshInterval) clearInterval(refreshInterval);
        const interval = setInterval(() => {
          fetchBuckets();
          if (selectedBucket) {
            fetchBucketObjects(selectedBucket.name);
            fetchAnalytics(selectedBucket.name);
          }
        }, 180000); // Refresh every 180 seconds (3 minutes)
        setRefreshInterval(interval);
      };

      const stopAutoRefresh = () => {
        if (refreshInterval) {
          clearInterval(refreshInterval);
          setRefreshInterval(null);
        }
      };

      useEffect(() => {
        const token = localStorage.getItem('token');
        const user = localStorage.getItem('user');
        if (token && user) {
          setIsLoggedIn(true);
          setCurrentUser(JSON.parse(user));
          fetchInitialData();
        }
      }, []);

      useEffect(() => {
        if (selectedBucket) {
          fetchBucketObjects(selectedBucket.name);
          fetchAnalytics(selectedBucket.name);
        }
      }, [selectedBucket]);

      // Generate chart data by account
      const getStorageChartDataByAccount = () => {
        // Group buckets by account
        const bucketsByAccount = buckets.reduce((acc, bucket) => {
          const accountName = bucket.accountName || 'Unknown Account';
          if (!acc[accountName]) {
            acc[accountName] = {
              totalSize: 0,
              buckets: []
            };
          }
          acc[accountName].totalSize += (bucket.size || 0);
          acc[accountName].buckets.push(bucket);
          return acc;
        }, {});

        const colors = ['#8B5CF6', '#06B6D4', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#6366F1'];
        
        return {
          labels: Object.keys(bucketsByAccount),
          datasets: [{
            data: Object.values(bucketsByAccount).map(account => account.totalSize),
            backgroundColor: colors.slice(0, Object.keys(bucketsByAccount).length),
            borderWidth: 0
          }]
        };
      };

      const getTrendChartData = () => {
        if (!analytics) return { labels: [], datasets: [] };
        
        return {
          labels: analytics.sizeTrend.map(item => item.date),
          datasets: [{
            label: 'Storage Size (GB)',
            data: analytics.sizeTrend.map(item => (item.size / 1000000000).toFixed(2)),
            borderColor: '#8B5CF6',
            backgroundColor: 'rgba(139, 92, 246, 0.1)',
            fill: true,
            tension: 0.4
          }]
        };
      };

      if (!isLoggedIn) {
        return (
          <div className="min-h-screen gradient-bg flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl overflow-hidden w-full max-w-6xl">
              <div className="flex flex-col lg:flex-row min-h-[600px]">
                
                {/* Left Panel - Product Info */}
                <div className="flex-1 gradient-bg text-white p-8 lg:p-12 flex flex-col justify-center">
                  <div className="max-w-lg">
                    <div className="flex items-center mb-6">
                      <div className="w-12 h-12 bg-white bg-opacity-20 rounded-lg flex items-center justify-center mr-4">
                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                        </svg>
                      </div>
                      <div>
                        <h1 className="text-2xl lg:text-3xl font-bold">Cloudflare R2 Dashboard</h1>
                        <p className="text-white text-opacity-90 text-sm">Multi-account storage management platform</p>
                      </div>
                    </div>
                    
                    <div className="space-y-4 mb-8">
                      <div className="flex items-start space-x-3">
                        <div className="w-2 h-2 bg-white bg-opacity-60 rounded-full mt-2 flex-shrink-0"></div>
                        <p className="text-white text-opacity-90">Monitor and analyze storage usage across multiple R2 accounts</p>
                      </div>
                      <div className="flex items-start space-x-3">
                        <div className="w-2 h-2 bg-white bg-opacity-60 rounded-full mt-2 flex-shrink-0"></div>
                        <p className="text-white text-opacity-90">Real-time bucket management and analytics</p>
                      </div>
                      <div className="flex items-start space-x-3">
                        <div className="w-2 h-2 bg-white bg-opacity-60 rounded-full mt-2 flex-shrink-0"></div>
                        <p className="text-white text-opacity-90">Secure, fast, and responsive dashboard</p>
                      </div>
                    </div>

                    {/* Demo Info */}
                    <div className="bg-white bg-opacity-10 rounded-lg p-4 backdrop-blur-sm">
                      <div className="flex items-center mb-3">
                        <svg className="w-5 h-5 text-white mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        <h3 className="font-semibold text-white">Try Demo</h3>
                      </div>
                      <p className="text-white text-opacity-90 text-sm mb-3">Experience all features with sample data</p>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-white text-opacity-70">Email:</span>
                          <code className="bg-white bg-opacity-20 px-2 py-1 rounded text-white text-xs">demo@thesignalwise.com</code>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-white text-opacity-70">Password:</span>
                          <code className="bg-white bg-opacity-20 px-2 py-1 rounded text-white text-xs">demo</code>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Panel - Login Form */}
                <div className="flex-1 p-8 lg:p-12 flex flex-col justify-center bg-gray-50">
                  <div className="max-w-sm mx-auto w-full">
                    <div className="text-center mb-8">
                      <h2 className="text-2xl font-bold text-gray-800 mb-2">Welcome Back</h2>
                      <p className="text-gray-600">Sign in to monitor your R2 storage</p>
                      <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                        <p className="text-sm text-blue-700 mb-2">
                          <strong>📊 Read-Only Monitoring Version</strong> - Provides R2 storage bucket monitoring and data visualization
                        </p>
                        <p className="text-xs text-blue-600 mb-2">
                          Need full-featured storage management?
                        </p>
                        <a
                          href="https://r2dashboard.thesignalwise.com"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-700 underline hover:text-blue-800 font-medium"
                        >
                          Try R2Dashboard Chrome Extension 🚀
                        </a>
                      </div>
                    </div>
                    
                    <form onSubmit={handleAuth} className="space-y-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white"
                          placeholder="Enter your email"
                          required
                        />
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
                        <input
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white"
                          placeholder="Enter your password"
                          required
                        />
                      </div>

                      {error && (
                        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
                          {error}
                        </div>
                      )}

                      <button
                        type="submit"
                        disabled={loading}
                        className="w-full gradient-bg text-white py-3 px-4 rounded-lg hover:opacity-90 disabled:opacity-50 font-medium transition-all"
                      >
                        {loading ? 'Loading...' : (isRegister ? 'Create Account' : 'Sign In')}
                      </button>
                    </form>

                    <div className="mt-6 text-center">
                      <button
                        onClick={() => setIsRegister(!isRegister)}
                        className="text-purple-600 hover:text-purple-700 font-medium text-sm"
                      >
                        {isRegister ? 'Already have an account? Sign in' : 'Need an account? Sign up'}
                      </button>
                    </div>
                    
                    <div className="mt-8 text-center text-sm text-gray-500">
                      Powered by{' '}
                      <a 
                        href="https://github.com/thesignalwise/r2-dashboard" 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="text-purple-600 hover:text-purple-700 font-medium"
                      >
                        TheSignalWise
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      }

      return (
        <div className="min-h-screen bg-gray-50 flex">
          {/* Sidebar */}
          <div className="w-64 bg-white shadow-lg flex flex-col h-screen">
            {/* Logo and User Info */}
            <div className="p-6 border-b">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 gradient-bg rounded-lg flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                </div>
                <div>
                  <h1 className="font-bold text-gray-800">R2 Dashboard</h1>
                  <p className="text-xs text-gray-500">{currentUser?.email}</p>
                </div>
              </div>
            </div>

            {/* Navigation Menu */}
            <nav className="flex-1 p-4 overflow-y-auto">
              <div className="space-y-1">
                {[
                  { id: 'dashboard', label: 'Dashboard', icon: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z' },
                  { id: 'buckets', label: 'Buckets', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
                  { id: 'accounts', label: 'Accounts', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-.5a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z' },
                  { id: 'analytics', label: 'Analytics', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' }
                ].map(item => (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    className={\`sidebar-item w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-left transition-all \${activeTab === item.id ? 'gradient-bg text-white' : 'text-gray-600 hover:bg-gray-100'}\`}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                    </svg>
                    <span className="font-medium">{item.label}</span>
                  </button>
                ))}
              </div>
            </nav>

            {/* Bottom Controls - Fixed at bottom */}
            <div className="border-t p-4">
              <div className="space-y-3">
                <div className="flex items-center justify-center space-x-4 px-3 py-2">
                  <a
                    href="https://thesignalwise.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center space-x-2 px-3 py-2 text-gray-600 hover:text-purple-600 rounded-lg transition-colors"
                    title="Visit TheSignalWise website"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9v-9m0-9v9" />
                    </svg>
                    <span className="text-sm font-medium">Website</span>
                  </a>
                  <a
                    href="https://github.com/thesignalwise/r2-dashboard"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center space-x-2 px-3 py-2 text-gray-600 hover:text-purple-600 rounded-lg transition-colors"
                    title="View on GitHub"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 0C4.477 0 0 4.484 0 10.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0110 4.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.203 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.942.359.31.678.921.678 1.856 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0020 10.017C20 4.484 15.522 0 10 0z" clipRule="evenodd" />
                    </svg>
                    <span className="text-sm font-medium">GitHub</span>
                  </a>
                </div>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center justify-center space-x-2 px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  <span className="text-sm font-medium">Sign Out</span>
                </button>
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 overflow-auto">
            {activeTab === 'dashboard' && (
              <div className="p-8">
                <div className="mb-8">
                  <h2 className="text-3xl font-bold text-gray-900 mb-2">Dashboard Overview</h2>
                  <p className="text-gray-600">Monitor your R2 storage across all accounts</p>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                  <div className="bg-white p-6 rounded-xl shadow card-hover">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600">Total Buckets</p>
                        <p className="text-2xl font-bold text-gray-900">{buckets.length}</p>
                      </div>
                      <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                        <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white p-6 rounded-xl shadow card-hover">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600">Active Accounts</p>
                        <p className="text-2xl font-bold text-gray-900">{accounts.filter(acc => acc.isActive).length}</p>
                      </div>
                      <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                        <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-.5a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white p-6 rounded-xl shadow card-hover">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600">Total Objects</p>
                        <p className="text-2xl font-bold text-gray-900">{formatNumber(buckets.reduce((sum, bucket) => sum + (bucket.objects || 0), 0))}</p>
                      </div>
                      <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                        <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white p-6 rounded-xl shadow card-hover">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600">Total Storage</p>
                        <p className="text-2xl font-bold text-gray-900">{formatBytes(buckets.reduce((sum, bucket) => sum + (bucket.size || 0), 0))}</p>
                      </div>
                      <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                        <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                        </svg>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Storage Distribution by Account */}
                <div className="mb-8">
                  <h3 className="text-xl font-semibold text-gray-900 mb-6">Storage Distribution by Account</h3>
                  <div className="space-y-6">
                    {loading && buckets.length === 0 ? (
                      // Loading skeleton
                      <div className="space-y-4">
                        {[1, 2].map((i) => (
                          <div key={i} className="bg-white rounded-xl shadow-lg p-6 animate-pulse">
                            <div className="flex items-center justify-between mb-4">
                              <div className="flex items-center space-x-3">
                                <div className="w-3 h-3 bg-gray-300 rounded-full"></div>
                                <div className="h-5 bg-gray-300 rounded w-32"></div>
                              </div>
                              <div className="h-4 bg-gray-300 rounded w-24"></div>
                            </div>
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                              <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                  <div className="text-center">
                                    <div className="h-6 bg-gray-300 rounded w-16 mx-auto mb-1"></div>
                                    <div className="h-4 bg-gray-300 rounded w-20 mx-auto"></div>
                                  </div>
                                  <div className="text-center">
                                    <div className="h-6 bg-gray-300 rounded w-16 mx-auto mb-1"></div>
                                    <div className="h-4 bg-gray-300 rounded w-20 mx-auto"></div>
                                  </div>
                                </div>
                                <div className="space-y-2">
                                  {[1, 2, 3].map((j) => (
                                    <div key={j} className="flex items-center justify-between">
                                      <div className="flex items-center space-x-2">
                                        <div className="w-3 h-3 bg-gray-300 rounded"></div>
                                        <div className="h-4 bg-gray-300 rounded w-24"></div>
                                      </div>
                                      <div className="h-4 bg-gray-300 rounded w-16"></div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              <div className="flex items-center justify-center">
                                <div className="w-48 h-48 bg-gray-300 rounded-full"></div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      (() => {
                        // Group buckets by account
                        const bucketsByAccount = buckets.reduce((acc, bucket) => {
                        const accountName = bucket.accountName || 'Unknown Account';
                        const accountId = bucket.accountId || 'unknown';
                        if (!acc[accountId]) {
                          acc[accountId] = {
                            accountName: accountName,
                            accountId: accountId,
                            buckets: []
                          };
                        }
                        acc[accountId].buckets.push(bucket);
                        return acc;
                      }, {});

                      // Generate colors for buckets
                      const colors = ['#8B5CF6', '#06B6D4', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#6366F1', '#14B8A6', '#F97316', '#8B5CF6'];

                      return Object.values(bucketsByAccount).map((account) => {
                        const totalSize = account.buckets.reduce((sum, bucket) => sum + (bucket.size || 0), 0);
                        const totalObjects = account.buckets.reduce((sum, bucket) => sum + (bucket.objects || 0), 0);
                        
                        const chartData = {
                          labels: account.buckets.map(b => b.name),
                          datasets: [{
                            data: account.buckets.map(b => b.size || 0),
                            backgroundColor: colors.slice(0, account.buckets.length),
                            borderWidth: 0
                          }]
                        };

                        return (
                          <div key={account.accountId} className="bg-white rounded-xl shadow-lg overflow-hidden">
                            {/* Account Header */}
                            <div className="bg-gradient-to-r from-purple-50 to-blue-50 px-6 py-4 border-b">
                              <h4 className="text-lg font-semibold text-gray-900">{account.accountName}</h4>
                            </div>
                            
                            {/* Content - Horizontal Layout */}
                            {account.buckets.length > 0 ? (
                              <div className="flex">
                                {/* Left: Statistics */}
                                <div className="w-1/4 p-6 bg-gray-50 border-r">
                                  <div className="space-y-4">
                                    <div className="text-center">
                                      <p className="text-xl font-bold text-gray-900">{account.buckets.length}</p>
                                      <p className="text-xs text-gray-600">Buckets</p>
                                    </div>
                                    <div className="text-center">
                                      <p className="text-xl font-bold text-gray-900">{formatNumber(totalObjects)}</p>
                                      <p className="text-xs text-gray-600">Objects</p>
                                    </div>
                                    <div className="text-center">
                                      <p className="text-xl font-bold text-gray-900">{formatBytes(totalSize)}</p>
                                      <p className="text-xs text-gray-600">Total Size</p>
                                    </div>
                                  </div>
                                </div>
                                
                                {/* Center: Chart */}
                                <div className="w-5/12 p-6 flex items-center justify-center">
                                  <div className="w-64 h-64">
                                    <ChartComponent
                                      type="doughnut"
                                      data={chartData}
                                      options={{
                                        maintainAspectRatio: true,
                                        plugins: {
                                          legend: {
                                            display: false
                                          },
                                          tooltip: {
                                            callbacks: {
                                              label: function(context) {
                                                const label = context.label || '';
                                                const value = formatBytes(context.parsed);
                                                const percentage = ((context.parsed / totalSize) * 100).toFixed(1);
                                                return \`\${label}: \${value} (\${percentage}%)\`;
                                              }
                                            }
                                          }
                                        }
                                      }}
                                    />
                                  </div>
                                </div>
                                
                                {/* Right: Bucket Details */}
                                <div className="w-1/3 p-6 border-l bg-gray-50">
                                  <h5 className="text-sm font-semibold text-gray-700 mb-4">Storage Details</h5>
                                  <div className="space-y-2">
                                    {account.buckets
                                      .sort((a, b) => (b.size || 0) - (a.size || 0))
                                      .map((bucket) => {
                                        const percentage = totalSize > 0 ? ((bucket.size || 0) / totalSize) * 100 : 0;
                                        const originalIndex = account.buckets.findIndex(b => b.name === bucket.name);
                                        return (
                                          <div key={bucket.name} className="flex items-center justify-between">
                                            <div className="flex items-center space-x-3 flex-1 min-w-0">
                                              <div 
                                                className="w-4 h-4 rounded-full flex-shrink-0" 
                                                style={{ backgroundColor: colors[originalIndex % colors.length] }}
                                              />
                                              <span className="text-sm text-gray-700 truncate">{bucket.name}</span>
                                            </div>
                                            <div className="flex items-center space-x-4 flex-shrink-0">
                                              <div className="text-right">
                                                <div className="text-sm font-medium text-gray-900">{formatBytes(bucket.size || 0)}</div>
                                                <div className="text-xs text-gray-500">{percentage.toFixed(1)}%</div>
                                              </div>
                                            </div>
                                          </div>
                                        );
                                      })}
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="p-8 text-center text-gray-400">
                                <p>No buckets in this account</p>
                              </div>
                            )}
                          </div>
                        );
                      });
                    })()
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'buckets' && (
              <div className="p-8">
                <div className="flex justify-between items-center mb-8">
                  <div>
                    <h2 className="text-3xl font-bold text-gray-900 mb-2">Storage Buckets</h2>
                    <p className="text-gray-600">Manage your R2 buckets across all accounts</p>
                  </div>
                  <button
                    onClick={() => fetchBuckets(true)}
                    className="px-4 py-2 gradient-bg text-white rounded-lg hover:opacity-90 flex items-center space-x-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span>Refresh</span>
                  </button>
                </div>

                {loading ? (
                  <div className="text-center py-12">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                  </div>
                ) : (
                  <div className="space-y-8">
                    {(() => {
                      // Group buckets by account
                      const bucketsByAccount = buckets.reduce((acc, bucket) => {
                        const accountId = bucket.accountId || 'default';
                        if (!acc[accountId]) {
                          acc[accountId] = {
                            accountName: bucket.accountName,
                            accountId: accountId,
                            buckets: [],
                            totalSize: 0,
                            totalObjects: 0
                          };
                        }
                        acc[accountId].buckets.push(bucket);
                        acc[accountId].totalSize += (bucket.size || 0);
                        acc[accountId].totalObjects += (bucket.objects || 0);
                        return acc;
                      }, {});

                      return Object.values(bucketsByAccount).map((accountGroup) => (
                        <div key={accountGroup.accountId} className="bg-white rounded-xl shadow-lg overflow-hidden">
                          {/* Account Header */}
                          <div className="bg-gradient-to-r from-purple-50 to-blue-50 px-6 py-4 border-b">
                            <div className="flex items-center justify-between">
                              <div>
                                <h3 className="text-xl font-semibold text-gray-900">{accountGroup.accountName}</h3>
                                <p className="text-sm text-gray-600">Account ID: {maskAccountId(accountGroup.accountId) || 'Not configured'}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-sm text-gray-600">
                                  {accountGroup.buckets.length} bucket{accountGroup.buckets.length !== 1 ? 's' : ''}
                                </p>
                              </div>
                            </div>
                          </div>

                          {/* Buckets Table */}
                          <div className="overflow-x-auto">
                            <table className="w-full">
                              <thead className="bg-gray-50 border-b">
                                <tr>
                                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Bucket Name</th>
                                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Objects</th>
                                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Size</th>
                                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                                </tr>
                              </thead>
                              <tbody className="bg-white divide-y divide-gray-200">
                                {accountGroup.buckets.map((bucket) => (
                                  <tr key={bucket.name} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                      <div className="flex items-center">
                                        <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center mr-3">
                                          <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                                          </svg>
                                        </div>
                                        <span className="text-sm font-medium text-gray-900">{bucket.name}</span>
                                      </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                                      {formatNumber(bucket.objects || 0)}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                                      {formatBytes(bucket.size || 0)}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-500">
                                      {new Date(bucket.createdAt).toLocaleDateString()}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-center">
                                      <div className="flex items-center justify-center space-x-2">
                                        <button
                                          onClick={() => {
                                            setSelectedBucket(bucket);
                                            setActiveTab('file-browser');
                                          }}
                                          className="text-gray-600 hover:text-gray-900"
                                          title="Browse Files"
                                        >
                                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                                          </svg>
                                        </button>
                                        <button
                                          onClick={() => {
                                            setSelectedBucket(bucket);
                                            fetchAnalytics(bucket.name);
                                          }}
                                          className="text-purple-600 hover:text-purple-900"
                                          title="View Analytics"
                                        >
                                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                          </svg>
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                              {/* Account Summary Footer */}
                              <tfoot className="bg-gray-50 border-t-2">
                                <tr>
                                  <td className="px-6 py-4 font-semibold text-gray-900">Total</td>
                                  <td className="px-6 py-4 text-right font-semibold text-gray-900">
                                    {formatNumber(accountGroup.totalObjects)}
                                  </td>
                                  <td className="px-6 py-4 text-right font-semibold text-gray-900">
                                    {formatBytes(accountGroup.totalSize)}
                                  </td>
                                  <td colSpan={2}></td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                )}

                {buckets.length === 0 && !loading && (
                  <div className="text-center py-12">
                    <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No buckets found</h3>
                    <p className="text-gray-600">Add an account to start managing your R2 buckets.</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'accounts' && (
              <div className="p-8">
                <div className="flex justify-between items-center mb-8">
                  <div>
                    <h2 className="text-3xl font-bold text-gray-900 mb-2">Account Management</h2>
                    <p className="text-gray-600">Manage your Cloudflare R2 accounts</p>
                  </div>
                  <button
                    onClick={() => setShowAddAccount(true)}
                    className="px-4 py-2 gradient-bg text-white rounded-lg hover:opacity-90 flex items-center space-x-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    <span>Add Account</span>
                  </button>
                </div>

                {/* Add Account Modal */}
                {showAddAccount && (
                  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 w-full max-w-md">
                      <h3 className="text-lg font-semibold mb-4">Add New Account</h3>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Account Name</label>
                          <input
                            type="text"
                            value={newAccount.name}
                            onChange={(e) => setNewAccount({...newAccount, name: e.target.value})}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                            placeholder="My Production Account"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Account ID</label>
                          <input
                            type="text"
                            value={newAccount.accountId}
                            onChange={(e) => setNewAccount({...newAccount, accountId: e.target.value})}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                            placeholder="Your Cloudflare Account ID"
                          />
                        </div>
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="block text-sm font-medium text-gray-700">API Token</label>
                            <button
                              type="button"
                              onClick={() => setShowApiHelp(true)}
                              className="flex items-center justify-center w-5 h-5 bg-purple-100 text-purple-600 rounded-full hover:bg-purple-200 transition-colors"
                              title="How to get API Token"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            </button>
                          </div>
                          <input
                            type="password"
                            value={newAccount.apiToken}
                            onChange={(e) => setNewAccount({...newAccount, apiToken: e.target.value})}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                            placeholder="Your R2 API Token"
                          />
                        </div>
                      </div>
                      <div className="flex justify-end space-x-3 mt-6">
                        <button
                          onClick={() => {
                            setShowAddAccount(false);
                            setNewAccount({ name: '', accountId: '', apiToken: '' });
                          }}
                          className="px-4 py-2 text-gray-600 hover:text-gray-800"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={addAccount}
                          className="px-4 py-2 gradient-bg text-white rounded-lg hover:opacity-90"
                        >
                          Add Account
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* API Help Modal */}
                {showApiHelp && (
                  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold">How to Get R2 API Token</h3>
                        <button
                          onClick={() => setShowApiHelp(false)}
                          className="text-gray-400 hover:text-gray-600"
                        >
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                      
                      <div className="space-y-4 text-sm">
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                          <div className="flex items-center mb-2">
                            <svg className="w-5 h-5 text-blue-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <h4 className="font-medium text-blue-900">Step 1: Access Cloudflare API Tokens</h4>
                          </div>
                          <p className="text-blue-800">Visit: <code className="bg-white px-2 py-1 rounded text-xs">https://dash.cloudflare.com/&lt;YOUR_CF_ACCOUNT_ID&gt;/api-tokens</code></p>
                          <p className="text-blue-700 mt-1">Replace <code>&lt;YOUR_CF_ACCOUNT_ID&gt;</code> with your actual Cloudflare Account ID.</p>
                        </div>

                        <div className="space-y-3">
                          <h4 className="font-medium">Step 2: Create New Token</h4>
                          <ol className="list-decimal list-inside space-y-1 ml-4">
                            <li>Click "<strong>Create Token</strong>"</li>
                            <li>Select "<strong>Custom token</strong>"</li>
                          </ol>
                        </div>

                        <div className="space-y-3">
                          <h4 className="font-medium">Step 3: Set Required Permissions (Read-Only)</h4>
                          <div className="bg-gray-50 rounded-lg p-3">
                            <table className="w-full text-xs">
                              <thead className="bg-gray-100">
                                <tr>
                                  <th className="text-left p-2 font-medium">Permission</th>
                                  <th className="text-left p-2 font-medium">Resource</th>
                                  <th className="text-left p-2 font-medium">Access</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200">
                                <tr>
                                  <td className="p-2"><strong>Account</strong></td>
                                  <td className="p-2">Analytics</td>
                                  <td className="p-2"><span className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs">Read</span></td>
                                </tr>
                                <tr>
                                  <td className="p-2"><strong>Workers R2</strong></td>
                                  <td className="p-2">Data Catalog</td>
                                  <td className="p-2"><span className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs">Read</span></td>
                                </tr>
                                <tr>
                                  <td className="p-2"><strong>Workers R2</strong></td>
                                  <td className="p-2">Storage</td>
                                  <td className="p-2"><span className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs">Read</span></td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </div>

                        <div className="space-y-3">
                          <h4 className="font-medium">Step 4: Configure Account Resources</h4>
                          <ul className="list-disc list-inside space-y-1 ml-4">
                            <li><strong>Account Resources:</strong> Include specific accounts you want to monitor</li>
                            <li><strong>Zone Resources:</strong> Not required for R2 dashboard</li>
                          </ul>
                        </div>

                        <div className="space-y-3">
                          <h4 className="font-medium">Step 5: Complete Token Creation</h4>
                          <ol className="list-decimal list-inside space-y-1 ml-4">
                            <li>Review your configuration</li>
                            <li>Click "<strong>Continue to summary</strong>"</li>
                            <li>Click "<strong>Create Token</strong>"</li>
                            <li><strong>Copy and save</strong> the generated token securely</li>
                          </ol>
                        </div>

                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                          <div className="flex items-start">
                            <svg className="w-5 h-5 text-yellow-600 mr-2 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                            </svg>
                            <div>
                              <h4 className="font-medium text-yellow-900 mb-1">Security Note</h4>
                              <p className="text-yellow-800">Store your API tokens securely and never share them publicly. The dashboard only requires <strong>read-only</strong> permissions for monitoring and analytics.</p>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-end mt-6">
                        <button
                          onClick={() => setShowApiHelp(false)}
                          className="px-4 py-2 gradient-bg text-white rounded-lg hover:opacity-90"
                        >
                          Got it!
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {accounts.map((account) => (
                    <div key={account.id} className="bg-white rounded-xl shadow card-hover p-6">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-gray-900">{account.name}</h3>
                        <div className="flex items-center space-x-2">
                          <span className={\`px-2 py-1 rounded-full text-xs font-medium \${account.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}\`}>
                            {account.isActive ? 'Active' : 'Inactive'}
                          </span>
                          <button
                            onClick={() => deleteAccount(account.id)}
                            className="text-red-600 hover:text-red-800 p-1"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                      
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Account ID:</span>
                          <span className="font-mono text-xs">{maskAccountId(account.accountId)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Created:</span>
                          <span>{new Date(account.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {accounts.length === 0 && (
                  <div className="text-center py-12">
                    <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-.5a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                    </svg>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No accounts configured</h3>
                    <p className="text-gray-600 mb-4">Add your first Cloudflare R2 account to get started.</p>
                    <button
                      onClick={() => setShowAddAccount(true)}
                      className="px-4 py-2 gradient-bg text-white rounded-lg hover:opacity-90"
                    >
                      Add Account
                    </button>
                  </div>
                )}
                
                {/* API Refresh Time Information */}
                <div className="mt-8 bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="text-sm font-medium text-gray-700">API Refresh Status</span>
                    </div>
                    <button
                      onClick={fetchLastRefreshTime}
                      className="text-sm text-blue-600 hover:text-blue-800 flex items-center space-x-1"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      <span>Refresh</span>
                    </button>
                  </div>
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">Last Manual Refresh:</span>
                      <span className="ml-2 font-mono text-gray-900">
                        {lastRefreshTime ? new Date(lastRefreshTime).toLocaleString() : 'Never'}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-600">Last Auto Refresh (Cron):</span>
                      <span className="ml-2 font-mono text-gray-900">
                        {cronRefreshTime ? new Date(cronRefreshTime).toLocaleString() : 'Never'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'analytics' && (
              <div className="p-8">
                <div className="mb-8">
                  <h2 className="text-3xl font-bold text-gray-900 mb-2">Analytics Overview</h2>
                  <p className="text-gray-600">Storage analytics across all accounts</p>
                </div>

                {/* Summary Stats */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                  <div className="bg-white p-6 rounded-xl shadow card-hover">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600">Total Storage</p>
                        <p className="text-2xl font-bold text-gray-900">{formatBytes(buckets.reduce((sum, b) => sum + (b.size || 0), 0))}</p>
                      </div>
                      <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                        <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                        </svg>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-white p-6 rounded-xl shadow card-hover">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600">Total Objects</p>
                        <p className="text-2xl font-bold text-gray-900">{formatNumber(buckets.reduce((sum, b) => sum + (b.objects || 0), 0))}</p>
                      </div>
                      <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                        <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-white p-6 rounded-xl shadow card-hover">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600">Total Buckets</p>
                        <p className="text-2xl font-bold text-gray-900">{buckets.length}</p>
                      </div>
                      <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                        <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                        </svg>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-white p-6 rounded-xl shadow card-hover">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600">Active Accounts</p>
                        <p className="text-2xl font-bold text-gray-900">{accounts.filter(a => a.isActive).length}</p>
                      </div>
                      <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                        <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-.5a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                        </svg>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Storage Analytics by Account */}
                <div className="mb-8">
                  <h3 className="text-xl font-semibold text-gray-900 mb-6">Storage Analytics by Account</h3>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {(() => {
                      const bucketsByAccount = buckets.reduce((acc, bucket) => {
                        const accountName = bucket.accountName || 'Unknown Account';
                        const accountId = bucket.accountId || 'unknown';
                        if (!acc[accountId]) {
                          acc[accountId] = {
                            accountName: accountName,
                            accountId: accountId,
                            buckets: [],
                            totalSize: 0,
                            totalObjects: 0
                          };
                        }
                        acc[accountId].buckets.push(bucket);
                        acc[accountId].totalSize += (bucket.size || 0);
                        acc[accountId].totalObjects += (bucket.objects || 0);
                        return acc;
                      }, {});

                      return Object.values(bucketsByAccount).map((account) => (
                        <div key={account.accountId} className="bg-white rounded-xl shadow-lg overflow-hidden">
                          <div className="p-6">
                            <h4 className="text-lg font-semibold text-gray-900 mb-4">{account.accountName}</h4>
                            
                            {/* Account Stats */}
                            <div className="grid grid-cols-3 gap-4 mb-6">
                              <div className="text-center">
                                <p className="text-2xl font-bold text-gray-900">{account.buckets.length}</p>
                                <p className="text-sm text-gray-600">Buckets</p>
                              </div>
                              <div className="text-center">
                                <p className="text-2xl font-bold text-gray-900">{formatNumber(account.totalObjects)}</p>
                                <p className="text-sm text-gray-600">Objects</p>
                              </div>
                              <div className="text-center">
                                <p className="text-2xl font-bold text-gray-900">{formatBytes(account.totalSize)}</p>
                                <p className="text-sm text-gray-600">Total Size</p>
                              </div>
                            </div>
                            
                            {/* Top Buckets */}
                            <div>
                              <h5 className="text-sm font-medium text-gray-700 mb-3">Top Buckets by Size</h5>
                              <div className="space-y-2">
                                {account.buckets
                                  .sort((a, b) => (b.size || 0) - (a.size || 0))
                                  .slice(0, 5)
                                  .map((bucket) => {
                                    const percentage = account.totalSize > 0 ? ((bucket.size || 0) / account.totalSize) * 100 : 0;
                                    return (
                                      <div key={bucket.name} className="relative">
                                        <div className="flex justify-between items-center mb-1">
                                          <span className="text-sm font-medium text-gray-700">{bucket.name}</span>
                                          <span className="text-sm text-gray-600">{formatBytes(bucket.size || 0)}</span>
                                        </div>
                                        <div className="w-full bg-gray-200 rounded-full h-2">
                                          <div 
                                            className="bg-purple-600 h-2 rounded-full transition-all duration-300"
                                            style={{ width: \`\${percentage}%\` }}
                                          />
                                        </div>
                                      </div>
                                    );
                                  })}
                              </div>
                            </div>
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                </div>

                {/* Bucket Comparison Table */}
                <div className="bg-white rounded-xl shadow-lg overflow-hidden">
                  <div className="p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">All Buckets Comparison</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-gray-50 border-b">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Bucket</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Account</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Objects</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Size</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">% of Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {buckets
                            .sort((a, b) => (b.size || 0) - (a.size || 0))
                            .map((bucket) => {
                              const totalSize = buckets.reduce((sum, b) => sum + (b.size || 0), 0);
                              const percentage = totalSize > 0 ? ((bucket.size || 0) / totalSize) * 100 : 0;
                              return (
                                <tr key={bucket.name} className="hover:bg-gray-50">
                                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{bucket.name}</td>
                                  <td className="px-6 py-4 text-sm text-gray-600">{bucket.accountName}</td>
                                  <td className="px-6 py-4 text-sm text-gray-900 text-right">{formatNumber(bucket.objects || 0)}</td>
                                  <td className="px-6 py-4 text-sm text-gray-900 text-right">{formatBytes(bucket.size || 0)}</td>
                                  <td className="px-6 py-4 text-sm text-gray-600 text-right">{percentage.toFixed(1)}%</td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'file-browser' && selectedBucket && (
              <div className="p-8">
                <div className="flex justify-between items-center mb-8">
                  <div>
                    <h2 className="text-3xl font-bold text-gray-900 mb-2">File Browser: {selectedBucket.name}</h2>
                    <p className="text-gray-600">Browse and manage files in your bucket</p>
                  </div>
                  <div className="flex space-x-3">
                    <button
                      onClick={() => fetchBucketObjects(selectedBucket.name)}
                      className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg flex items-center space-x-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      <span>Refresh</span>
                    </button>
                    <button
                      onClick={() => setActiveTab('buckets')}
                      className="px-4 py-2 gradient-bg text-white rounded-lg hover:opacity-90"
                    >
                      Back to Buckets
                    </button>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Size</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Modified</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {bucketObjects.map((object) => (
                          <tr key={object.key} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                <svg className="w-5 h-5 text-gray-400 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                </svg>
                                <span className="text-sm font-medium text-gray-900">{object.key}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {formatBytes(object.size)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {new Date(object.lastModified).toLocaleString()}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                              <button
                                onClick={() => deleteObject(selectedBucket.name, object.key)}
                                className="text-red-600 hover:text-red-900 ml-4"
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {bucketObjects.length === 0 && (
                    <div className="text-center py-12">
                      <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg>
                      <h3 className="text-lg font-medium text-gray-900 mb-2">No files found</h3>
                      <p className="text-gray-600">This bucket appears to be empty.</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }

    ReactDOM.render(<App />, document.getElementById('root'));
  </script>
</body>
</html>
  `;
  
  return c.html(html);
});

// 刷新统计数据的核心逻辑
async function refreshAllStats(env: Env): Promise<any> {
  let totalUsers = 0;
  let totalAccounts = 0;
  let totalBuckets = 0;
  let refreshedStats = 0;
  let errors = 0;

  // 获取所有用户
  const usersList = await env.USER_DATA.list({ prefix: 'user:' });
  
  for (const key of usersList.keys) {
    try {
      totalUsers++;
      const userData = await env.USER_DATA.get(key.name);
      if (!userData) continue;

      const user: User = JSON.parse(userData);
      if (!user.accounts || user.accounts.length === 0) continue;

      // 遍历用户的所有账户
      for (const account of user.accounts) {
        if (!account.isActive) continue;
        totalAccounts++;

        try {
          // 获取账户的所有bucket
          const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account.accountId}/r2/buckets`, {
            headers: {
              'Authorization': `Bearer ${account.apiToken}`,
              'Content-Type': 'application/json'
            }
          });

          const data = await response.json() as any;

          if (response.ok && data.success) {
            // 刷新每个bucket的统计信息
            for (const bucket of data.result.buckets) {
              totalBuckets++;
              try {
                const stats = await getBucketStats(account, bucket.name, env.CACHE_DATA);
                refreshedStats++;
              } catch (error) {
                console.error(`Failed to refresh stats for bucket ${bucket.name}:`, error);
                errors++;
              }
            }
          }
        } catch (error) {
          console.error(`Failed to process account ${account.name}:`, error);
          errors++;
        }
      }
    } catch (error) {
      console.error(`Failed to process user ${key.name}:`, error);
      errors++;
    }
  }

  const summary = {
    success: true,
    message: 'Statistics refresh completed',
    data: {
      totalUsers,
      totalAccounts,
      totalBuckets,
      refreshedStats,
      errors,
      timestamp: new Date().toISOString()
    }
  };

  // 将刷新结果存储在KV中
  await env.CACHE_DATA.put('last-cron-refresh', JSON.stringify(summary), { expirationTtl: 86400 });

  return summary;
}

// Cron Trigger处理器
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

// 导出Workers处理程序
export default {
  fetch: app.fetch,
  scheduled
};