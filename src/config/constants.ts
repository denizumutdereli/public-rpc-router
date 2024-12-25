export const REDIS_KEYS = {
    HEALTH_SET: 'rpc:health',
    SESSION_PREFIX: 'rpc:session:',
    CHAIN_PREFIX: 'rpc:chain:',
  };
  
  export const CONFIG_PATHS = {
    RPC_CONFIG: '.rpc.json', 
  };
  
  export const HTTP_STATUS = {
    OK: 200,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    NOT_FOUND: 404,
    INTERNAL_SERVER_ERROR: 500,
  };
  
  export const ERROR_MESSAGES = {
    CHAIN_NOT_FOUND: 'Chain not found',
    NO_HEALTHY_RPC: 'No healthy RPC endpoints available',
    INVALID_REQUEST: 'Invalid JSON-RPC request',
    UNAUTHORIZED: 'Unauthorized access',
    RATE_LIMIT_EXCEEDED: 'Rate limit exceeded',
    INVALID_CONFIG: 'Invalid RPC configuration format',
    FILE_NOT_FOUND: 'RPC configuration file not found'
  };