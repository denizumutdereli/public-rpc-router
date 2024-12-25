import chalk from "chalk";
import constants from 'constants';
import cors from 'cors';
import express from 'express';
import fs from 'fs';
import helmet from 'helmet';
import http from 'http';
import https, { ServerOptions } from 'https';
import tls from 'tls';
import { environment } from './config/environment';
import { HealthChecker } from './core/healthChecker';
import RedisManager from './core/redis';
import { RpcManager } from './core/rpcManager';
import { errorHandler } from './middleware/errorHandler';
import { IpFilter, ipFilter } from './middleware/ipFilter';
import { rateLimiter } from './middleware/rateLimiter';
import { rpcRoutes } from './routes/rpc.routes';
import { banner } from "./utils/banner";
import { logger } from './utils/logger';
import { clear } from './utils/misc';

async function configureIpFilter() {
    IpFilter.updateConfig({
        allowedIps: environment.security.allowedIps,
        trustProxy: environment.security.trustProxy, // if we behind a proxy like nginx
        proxyHeaders: [
            'x-forwarded-for',
            'x-real-ip',
            environment.security.cloudflare ? 'cf-connecting-ip' : "" // if we use Cloudflare
        ]
    });

    // Log the IP filter configuration
    logger.info('IP Filter configured with allowed IPs:', {
        allowedIps: environment.security.allowedIps
    });
}

async function startServer() {
    let isFirstRun = true;

    const app = express();

    // Basic middleware
    app.use(helmet());
    app.use(cors({
        origin: environment.security.corsOrigins,
        methods: ['GET', 'POST'],
        allowedHeaders: ['Content-Type', 'x-session-id'],
        credentials: environment.security.corsCredentials // if we need to support credentials
    }));
    app.use(express.json());

    // Configure and initialize IP filter before using it
    await configureIpFilter();

    app.use((req, res, next) => {
        logger.debug(`Incoming request from IP: ${req.ip} to ${req.path}`);
        next();
    });

    // rate limiter before IP filter to prevent DoS
    app.use(rateLimiter);

    app.use((req, res, next) => {
        ipFilter(req, res, (err?: any) => {
            if (err) {
                logger.error('IP Filter error:', { error: err, ip: req.ip });
                return next(err);
            }
            next();
        });
    });

    app.get('/health', (req, res) => {
        res.status(200).json({ status: 'ok' });
    });

    app.use('/api/rpc', rpcRoutes);

    app.use((req, res) => {
        res.status(200).json({ status: 'ok' });
    });

    app.use(errorHandler);

    try {

        if (isFirstRun) {
            clear();
            console.log(chalk.green(banner));
            isFirstRun = false;
        }

        await RedisManager.getInstance().connect();
        logger.info('Connected to Redis successfully');

        const rpcManager = RpcManager.getInstance();
        await rpcManager.loadRpcConfig();
        rpcManager.startConfigRefresh(environment.rpc.configRefreshInterval);
        logger.info('RPC configurations loaded successfully');

        HealthChecker.getInstance().startHealthCheck();
        logger.info('Health checker started successfully');

        let server;

        if (environment.useHttps) {
            const httpsOptions: ServerOptions = {
                key: fs.readFileSync(environment.keyFile),
                cert: fs.readFileSync(environment.certFile),
                minVersion: 'TLSv1.2' as tls.SecureVersion,
                rejectUnauthorized: environment.nodeEnv === 'production',
                requestCert: false,
                secureOptions: constants.SSL_OP_NO_TLSv1 | constants.SSL_OP_NO_TLSv1_1,
                ciphers: [
                    'ECDHE-ECDSA-AES128-GCM-SHA256',
                    'ECDHE-RSA-AES128-GCM-SHA256',
                    'ECDHE-ECDSA-AES256-GCM-SHA384',
                    'ECDHE-RSA-AES256-GCM-SHA384',
                    'ECDHE-ECDSA-CHACHA20-POLY1305',
                    'ECDHE-RSA-CHACHA20-POLY1305',
                    'DHE-RSA-AES128-GCM-SHA256',
                    'DHE-RSA-AES256-GCM-SHA384'
                ].join(':'),
                honorCipherOrder: true
            };
            server = https.createServer(httpsOptions, app);
            logger.info('HTTPS server configured');
        } else {
            server = http.createServer(app);
            logger.info('HTTP server configured');
        }

        // Configure server timeouts
        server.timeout = 30000;
        server.keepAliveTimeout = 65000;

        server.listen(environment.port, () => {
            logger.info(`Server running on port ${environment.port} (${environment.useHttps ? 'HTTPS' : 'HTTP'})`);
            logger.info(`Environment: ${environment.nodeEnv}`);
        });

        // Graceful shutdown
        process.on('SIGTERM', async () => {
            logger.info('SIGTERM received. Starting graceful shutdown...');

            server.close(async () => {
                HealthChecker.getInstance().stopHealthCheck();
                RpcManager.getInstance().stopConfigRefresh();
                await RedisManager.getInstance().disconnect();
                logger.info('Server shut down successfully');
                process.exit(0);
            });

            // Force shutdown after 30 seconds
            setTimeout(() => {
                logger.error('Forced shutdown after timeout');
                process.exit(1);
            }, 30000);
        });

        process.on('uncaughtException', (error) => {
            logger.error('Uncaught exception:', error);
            process.exit(1);
        });

        process.on('unhandledRejection', (reason) => {
            logger.error('Unhandled rejection:', reason);
        });

    } catch (error) {
        logger.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer().catch((error) => {
    logger.error('Unhandled error during server startup:', error);
    process.exit(1);
});