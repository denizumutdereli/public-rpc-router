// src/middleware/ipFilter.ts
import { NextFunction, Request, Response } from 'express';
import { Address4 } from 'ip-address';
import { ERROR_MESSAGES, HTTP_STATUS } from '../config/constants';
import { environment } from '../config/environment';
import { logger } from '../utils/logger';

interface IpFilterConfig {
  allowedIps: string[];
  trustProxy: boolean;
  proxyHeaders: string[];
}

export class IpFilter {
  private static config: IpFilterConfig = {
    allowedIps: environment.security.allowedIps,
    trustProxy: true,
    proxyHeaders: ['x-forwarded-for', 'x-real-ip', 'cf-connecting-ip']
  };

  private static normalizeIp(ip: string): string {
    // Handle IPv6 localhost
    if (ip === '::1' || ip === '::ffff:127.0.0.1') {
      return '127.0.0.1';
    }
    // Strip IPv6 prefix from IPv4 addresses
    if (ip.startsWith('::ffff:')) {
      return ip.substring(7);
    }
    return ip;
  }

  private static isIpInCidr(ip: string, cidr: string): boolean {
    try {
      const normalizedIp = this.normalizeIp(ip);
      
      // Handle IPv4
      if (normalizedIp.includes('.')) {
        const address = new Address4(normalizedIp);
        const range = new Address4(cidr);
        return address.isInSubnet(range);
      }
      
      // Handle IPv6
      if (normalizedIp.includes(':')) {
        // Convert localhost IPv6 to IPv4
        if (normalizedIp === '::1') {
          const address = new Address4('127.0.0.1');
          const range = new Address4(cidr);
          return address.isInSubnet(range);
        }
        return false; // Skip other IPv6 addresses for now
      }
      
      return false;
    } catch (error) {
      logger.error('Error checking IP range:', error);
      return false;
    }
  }

  private static getClientIp(req: Request): string | undefined {
    if (this.config.trustProxy) {
      for (const header of this.config.proxyHeaders) {
        const headerValue = req.headers[header] as string;
        if (headerValue) {
          const ip = headerValue.split(',')[0].trim();
          if (ip) return this.normalizeIp(ip);
        }
      }
    }

    return this.normalizeIp(req.ip || req.connection.remoteAddress || '');
  }

  private static isIpAllowed(ip: string): boolean {
    const normalizedIp = this.normalizeIp(ip);
    
    return this.config.allowedIps.some(allowedIp => {
      // Normalize the allowed IP
      const normalizedAllowedIp = this.normalizeIp(allowedIp);
      
      // Direct IP match
      if (normalizedAllowedIp === normalizedIp) return true;
      
      // CIDR range match for IPv4
      if (allowedIp.includes('/')) {
        return this.isIpInCidr(normalizedIp, allowedIp);
      }
      
      return false;
    });
  }

  public static middleware(req: Request, res: Response, next: NextFunction): void {
    try {
      const clientIp = this.getClientIp(req);

      if (!clientIp) {
        logger.warn('Could not determine client IP');
        res.status(HTTP_STATUS.UNAUTHORIZED).json({
          error: ERROR_MESSAGES.UNAUTHORIZED,
          message: 'Could not determine client IP'
        });
        return;
      }

      if (!this.isIpAllowed(clientIp)) {
        logger.warn(`Unauthorized access attempt from IP: ${clientIp}`);
        res.status(HTTP_STATUS.UNAUTHORIZED).json({
          error: ERROR_MESSAGES.UNAUTHORIZED,
          message: 'IP not allowed'
        });
        return;
      }

      logger.debug(`Allowed access from IP: ${clientIp}`);
      next();
    } catch (error) {
      logger.error('Error in IP filter:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        error: 'Internal Server Error',
        message: 'Error processing IP filter'
      });
    }
  }

  public static updateConfig(config: Partial<IpFilterConfig>): void {
    this.config = {
      ...this.config,
      ...config
    };
  }

  public static addAllowedIps(ips: string[]): void {
    const uniqueIps = new Set([...this.config.allowedIps, ...ips]);
    this.config.allowedIps = Array.from(uniqueIps);
  }

  public static removeAllowedIps(ips: string[]): void {
    this.config.allowedIps = this.config.allowedIps.filter(ip => !ips.includes(ip));
  }
}

export const ipFilter = IpFilter.middleware.bind(IpFilter);