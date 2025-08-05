# Cloudflare R2 Dashboard

A unified visualization and management dashboard for multiple Cloudflare R2 storage accounts.

## 🚀 Live Demo

Try the dashboard now: **[https://r2.thesignalwise.com/](https://r2.thesignalwise.com/)**

**Demo Credentials:**
- Email: `demo@thesignalwise.com`
- Password: `demo`

*Experience the full functionality with sample data and explore all features in a live environment.*

## Features

- 🗂️ **Multi-Account Management**: Manage multiple Cloudflare R2 accounts from one dashboard
- 📊 **Storage Analytics**: Visual charts and statistics for storage usage
- 🔄 **Auto Refresh**: Automated data refresh with configurable intervals
- 🔐 **Secure**: Account IDs are masked for privacy protection
- ⚡ **Fast**: Built on Cloudflare Workers for global performance
- 📱 **Responsive**: Modern UI that works on all devices

## Quick Start

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure Wrangler**:
   ```bash
   wrangler login
   ```

3. **Set up secrets**:
   ```bash
   wrangler secret put CRON_SECRET
   ```

4. **Deploy**:
   ```bash
   wrangler deploy
   ```

## 🔑 Getting R2 API Token

To add R2 accounts to your dashboard, you need to generate API tokens with proper permissions:

### Step 1: Access Cloudflare API Tokens
Visit: `https://dash.cloudflare.com/<YOUR_CF_ACCOUNT_ID>/api-tokens`

Replace `<YOUR_CF_ACCOUNT_ID>` with your actual Cloudflare Account ID.

### Step 2: Create New Token
1. Click "**Create Token**"
2. Select "**Custom token**"
3. Configure the following permissions:

### Step 3: Set Required Permissions
Configure your token with **read-only** permissions for:

| Permission | Resource | Access |
|------------|----------|--------|
| **Account** | Analytics | Read |
| **Workers R2** | Data Catalog | Read |
| **Workers R2** | Storage | Read |

### Step 4: Configure Account Resources
- **Account Resources**: Include specific accounts you want to monitor
- **Zone Resources**: Not required for R2 dashboard

### Step 5: Complete Token Creation
1. Review your configuration
2. Click "**Continue to summary**"
3. Click "**Create Token**"
4. **Copy and save** the generated token securely

⚠️ **Security Note**: Store your API tokens securely and never share them publicly. The dashboard only requires read-only permissions for monitoring and analytics.

## Development

```bash
# Start development server
wrangler dev

# View logs
wrangler tail

# Manage KV data
wrangler kv:list --namespace-id=<namespace-id>
```

## Documentation

- [Product Requirements](./docs/PRD.md)
- [Cron Implementation Guide](./CRON_IMPLEMENTATION.md)
- [API Documentation](./CRON_API_GUIDE.md)
- [Development Guidelines](./CLAUDE.md)

## Architecture

- **Frontend**: React 18 + TypeScript + Tailwind CSS
- **Backend**: Cloudflare Workers + Hono framework
- **Storage**: Cloudflare KV for user data and caching
- **Visualization**: Chart.js for data visualization
- **Authentication**: JWT tokens with email-based auth

## License

MIT