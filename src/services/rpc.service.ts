import axios from 'axios';
import { ERROR_MESSAGES } from '../config/constants';
import { HealthChecker } from '../core/healthChecker';
import { RpcManager } from '../core/rpcManager';
import { RpcSession } from '../types';
import { logger } from '../utils/logger';
import { formatRpcResponse } from '../utils/responseFormatter';

export class RpcService {
    private static instance: RpcService;

    private constructor() { }

    public static getInstance(): RpcService {
        if (!RpcService.instance) {
            RpcService.instance = new RpcService();
        }
        return RpcService.instance;
    }

    public async getEndpoint(chainId: number): Promise<string> {
        const session = await RpcManager.getInstance().createSession(chainId);
        return session.url;
    }

    public async executeRequest(
        chainId: number,
        rpcRequest: any,
        sessionId?: string
    ): Promise<any> {
        let session: RpcSession;

        if (sessionId) {
            const existingSession = await RpcManager.getInstance().getSession(sessionId);
            if (!existingSession) {
                throw new Error('Invalid session ID');
            }

            // Check if chain ID has changed
            if (existingSession.chainId !== chainId) {
                logger.info(`Chain ID changed from ${existingSession.chainId} to ${chainId}, creating new session`);
                // Delete old session and create new one for different chain
                await RpcManager.getInstance().deleteSession(sessionId);
                session = await RpcManager.getInstance().createSession(chainId);
            } else {
                session = existingSession;
            }
        } else {
            session = await RpcManager.getInstance().createSession(chainId);
        }

        try {
            const response = await axios.post(session.url, rpcRequest, {
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: 30000,
            });

            await RpcManager.getInstance().updateSession(session);

            return formatRpcResponse(response.data, session.id);
        } catch (error: any) {
            logger.error('RPC request failed:', {
                chainId,
                url: session.url,
                error: error.message,
            });

            // Update health status for failed request
            await HealthChecker.getInstance().checkHealth(session.url);

            if (error.response?.data) {
                return formatRpcResponse(error.response.data, session.id);
            }

            throw new Error(ERROR_MESSAGES.NO_HEALTHY_RPC);
        }
    }
}