# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Cloudflare R2 multi-account storage management dashboard that provides unified visualization and management for multiple Cloudflare R2 storage accounts. The project is currently in the planning phase with a comprehensive PRD document available.

## Architecture

Based on the PRD document (`r2-dashboard-prd.md`), this will be a full-stack application with:

- **Frontend**: React 18 + TypeScript SPA deployed on Cloudflare Pages
- **Backend**: Cloudflare Workers API layer
- **Storage**: Cloudflare KV for user data and caching
- **Visualization**: ECharts or Recharts for data visualization
- **State Management**: Zustand for lightweight state management

## Planned Project Structure

When implemented, the project will follow this structure:

```
├── frontend/                 # React frontend application
│   ├── src/
│   │   ├── components/       # Reusable UI components
│   │   │   ├── ui/          # Basic UI components
│   │   │   ├── charts/      # Chart components (ECharts/Recharts)
│   │   │   └── layouts/     # Layout components
│   │   ├── pages/           # Page components
│   │   │   ├── Dashboard/   # Main dashboard
│   │   │   ├── Accounts/    # Account management
│   │   │   └── Settings/    # User settings
│   │   ├── hooks/           # Custom React hooks
│   │   ├── stores/          # Zustand state stores
│   │   ├── services/        # API service layer
│   │   ├── utils/           # Utility functions
│   │   └── types/           # TypeScript type definitions
│   ├── package.json
│   └── vite.config.ts       # Vite configuration
├── worker/                  # Cloudflare Workers backend
│   ├── src/
│   │   ├── handlers/        # API route handlers
│   │   │   ├── auth.ts      # Authentication routes
│   │   │   ├── accounts.ts  # Account management
│   │   │   ├── buckets.ts   # R2 bucket operations
│   │   │   └── analytics.ts # Analytics data
│   │   ├── services/        # Business logic layer
│   │   │   ├── r2Client.ts  # R2 API client wrapper
│   │   │   ├── kvStore.ts   # KV storage abstraction
│   │   │   └── cache.ts     # Caching logic
│   │   ├── middleware/      # Express-like middleware
│   │   │   ├── auth.ts      # JWT authentication
│   │   │   ├── cors.ts      # CORS handling
│   │   │   └── rateLimit.ts # Rate limiting
│   │   └── types/           # TypeScript types
│   ├── wrangler.toml        # Workers configuration
│   └── package.json
└── r2-dashboard-prd.md      # Product Requirements Document
```

## Development Commands

When the project is implemented, these commands will be available:

### Frontend Development
```bash
cd frontend
npm install              # Install dependencies
npm run dev             # Start development server
npm run build           # Build for production
npm run preview         # Preview production build
npm run deploy          # Deploy to Cloudflare Pages
```

### Backend Development
```bash
cd worker
npm install              # Install dependencies
wrangler dev            # Start local Workers development
wrangler deploy         # Deploy to Cloudflare Workers
wrangler secret put JWT_SECRET        # Set JWT secret
wrangler secret put ENCRYPTION_KEY    # Set encryption key
```

### Full Stack Development
```bash
npm run dev:all         # Start both frontend and backend concurrently
```

## Key Technical Decisions

1. **Cloudflare-First Architecture**: Leverages Cloudflare's edge computing for global performance
2. **Serverless Design**: Uses Workers for auto-scaling backend logic
3. **KV Storage Strategy**: 
   - User data with encryption for sensitive information
   - Smart caching with different TTLs based on data type
   - Buckets cached for 1 hour, analytics for 6 hours
4. **API Design**: RESTful endpoints with JWT authentication
5. **Frontend State**: Zustand for lightweight, non-opinionated state management

## Security Considerations

- API tokens encrypted using AES-256 before KV storage
- JWT tokens for session management
- HTTPS everywhere with TLS 1.3
- Rate limiting on API endpoints
- Input validation and sanitization

## Development Guidelines

1. **TypeScript First**: Use strict TypeScript throughout
2. **Component Architecture**: Build reusable UI components with proper typing
3. **API Client Pattern**: Centralize R2 API calls in dedicated client classes
4. **Error Handling**: Implement comprehensive error boundaries and API error handling
5. **Caching Strategy**: Respect cache TTLs and implement cache invalidation
6. **Performance**: Optimize for Cloudflare's edge computing environment

## Environment Setup

The project will use:
- **Development**: Local Wrangler for Workers, Vite dev server for frontend
- **Production**: Cloudflare Workers + Pages deployment
- **KV Namespaces**: Separate for development and production
- **Secrets Management**: Wrangler secrets for sensitive configuration

## Monitoring and Analytics

- Cloudflare Workers Analytics for backend performance
- Cloudflare Web Analytics for frontend usage
- KV operation monitoring for storage efficiency
- Custom metrics for R2 API usage and costs