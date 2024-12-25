import rateLimit from 'express-rate-limit';
import { ERROR_MESSAGES } from '../config/constants';
import { environment } from '../config/environment';

export const rateLimiter = rateLimit({
  windowMs: environment.security.rateLimit.windowMs,
  max: environment.security.rateLimit.max,
  message: { error: ERROR_MESSAGES.RATE_LIMIT_EXCEEDED },
  standardHeaders: true,
  legacyHeaders: false,
});