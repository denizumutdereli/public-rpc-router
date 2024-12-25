import { NextFunction, Request, Response } from 'express';
import { HTTP_STATUS } from '../config/constants';
import { logger } from '../utils/logger';

export interface ApiError extends Error {
  status?: number;
  code?: string;
}

export const errorHandler = (
  err: ApiError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  logger.error('Error occurred:', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });

  const status = err.status || HTTP_STATUS.INTERNAL_SERVER_ERROR;
  const message = err.message || 'Internal server error';

  res.status(status).json({
    error: {
      message,
      code: err.code,
      status
    }
  });
};
