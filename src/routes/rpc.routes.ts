import { NextFunction, Request, Response, Router } from 'express';
import { ERROR_MESSAGES, HTTP_STATUS } from '../config/constants';
import { RpcService } from '../services/rpc.service';
import { extractChainId, validateJsonRpcRequest } from '../utils/helpers';
import { RpcManager } from '../core/rpcManager';
import { logger } from '../utils/logger';

const router = Router();

router.get(
  '/endpoint/:chainId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const chainId = extractChainId(req);
      const url = await RpcService.getInstance().getEndpoint(chainId);
      
      res.json({
        success: true,
        data: { url }
      });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/execute/:chainId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!validateJsonRpcRequest(req.body)) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          error: ERROR_MESSAGES.INVALID_REQUEST
        });
      }

      const chainId = extractChainId(req);
      const sessionId = req.headers['x-session-id'] as string;
      
      const result = await RpcService.getInstance().executeRequest(
        chainId,
        req.body,
        sessionId
      );
      
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

router.get('/urls', async (req, res, next) => {
    try {
        const chainId = req.query.chainId ? parseInt(req.query.chainId as string) : undefined;
        const rpcManager = RpcManager.getInstance();
        
        const response: any = { chains: [] };

        if (chainId) {
            const stats = await rpcManager.getChainStats(chainId);
            const config = await rpcManager.getChainConfig(chainId);
            if (config) {
                response.chains.push({
                    chainId: config.chainId,
                    name: config.name,
                    stats,
                });
            }
        } else {
            const configs = await rpcManager.getAllChainConfigs();
            for (const config of configs) {
                const stats = await rpcManager.getChainStats(config.chainId);
                response.chains.push({
                    chainId: config.chainId,
                    name: config.name,
                    stats,
                });
            }
        }

        res.json({
            success: true,
            data: response
        });
    } catch (error) {
        logger.error('Failed to get URL status:', error);
        next(error);
    }
});

router.get('/urls/:chainId', async (req, res, next) => {
    try {
        const chainId = parseInt(req.params.chainId);
        const rpcManager = RpcManager.getInstance();
        
        const config = await rpcManager.getChainConfig(chainId);
        if (!config) {
            return res.status(404).json({
                success: false,
                error: 'Chain not found'
            });
        }

        const stats = await rpcManager.getChainStats(chainId);
        const urlDetails = await rpcManager.getUrlDetails(chainId);

        res.json({
            success: true,
            data: {
                chainId: config.chainId,
                name: config.name,
                stats,
                urls: urlDetails
            }
        });
    } catch (error) {
        logger.error('Failed to get chain URL status:', error);
        next(error);
    }
});

export const rpcRoutes = router;