import { Request } from 'express';

export const validateJsonRpcRequest = (body: any): boolean => {
  return (
    body &&
    typeof body === 'object' &&
    body.jsonrpc === '2.0' &&
    typeof body.method === 'string' &&
    typeof body.id !== 'undefined' &&
    (body.params === undefined || Array.isArray(body.params))
  );
};

export const extractChainId = (req: Request): number => {
  const chainId = parseInt(req.params.chainId || req.query.chainId as string);
  if (isNaN(chainId)) {
    throw new Error('Invalid chain ID');
  }
  return chainId;
};