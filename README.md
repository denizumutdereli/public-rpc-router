# Public RPC Router & Load Balancer

A robust, multi-chain RPC (Remote Procedure Call) router and load balancer built with TypeScript. This service provides high availability and intelligent routing for blockchain RPC endpoints with automatic health checks and session management.

[![GitHub](https://img.shields.io/github/license/denizumutdereli/public-rpc-router)](https://github.com/denizumutdereli/public-rpc-router/blob/master/LICENSE)

## Features

- 🔄 **Multi-Chain Support**: Handle multiple blockchain networks simultaneously
- ⚖️ **Load Balancing**: Intelligent distribution of RPC requests
- 🔍 **Health Monitoring**: Automatic periodic health checks of RPC endpoints
- 🔒 **Sticky Sessions**: Maintain consistent connections for better performance
- 🛡️ **Security Features**:
  - IP filtering
  - Rate limiting
  - CORS protection
  - Helmet security headers
- 📊 **Status Monitoring**: Real-time endpoint health statistics
- 🚀 **High Performance**: Built with performance and reliability in mind

## Prerequisites

- Node.js (v14 or higher)
- Redis
- TypeScript
- PM2 (for production deployment)

## Installation

```bash
# Clone the repository
git clone https://github.com/denizumutdereli/public-rpc-router.git

# Navigate to project directory
cd public-rpc-router

# Install dependencies
npm install

# Build the project
npm run build
```

## Configuration

Create a `.env` file in the root directory:

```env
NODE_ENV=development
PORT=3000
REDIS_URL=redis://localhost:6379
USE_HTTPS=false
ALLOWED_IPS=127.0.0.1,::1
CORS_ORIGINS=*
```

## Usage

### Development

```bash
npm run dev
```

### Production

```bash
npm run build
npm start
```

## API Endpoints

### Get RPC Endpoint
```http
GET /api/rpc/endpoint/:chainId
```

### Execute RPC Request
```http
POST /api/rpc/execute/:chainId
Header: x-session-id (optional)
```

### Get URL Status
```http
GET /api/rpc/urls
GET /api/rpc/urls/:chainId
```

## Health Check System

The service includes an automated health checking system that:
- Monitors RPC endpoint availability
- Tracks response times
- Automatically removes unhealthy endpoints
- Provides real-time health statistics

## Session Management

Sticky sessions ensure consistent RPC endpoint usage:
- Session-based routing
- Automatic session cleanup
- Chain-specific session management

## Security

- IP whitelisting
- Rate limiting per IP
- CORS protection
- SSL/TLS support
- Security headers via Helmet

## Documentation

Full API documentation is available in the included Postman collection.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Author

**Deniz Umut Dereli**
- GitHub: [@denizumutdereli](https://github.com/denizumutdereli)

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
