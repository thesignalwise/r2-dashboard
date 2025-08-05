# Cloudflare R2 Dashboard

A unified visualization and management dashboard for multiple Cloudflare R2 storage accounts.

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