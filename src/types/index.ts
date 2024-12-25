export interface RpcConfig {
    chainId: number;
    name: string;
    urls: string[];
  }
  
  export interface RpcHealth {
    url: string;
    healthy: boolean;
    lastCheck: Date;
    responseTime: number;
    failCount: number;
  }
  
  export interface RpcSession {
    id: string;
    url: string;
    chainId: number;
    createdAt: Date;
    lastUsed: Date;
    requestCount: number;
  }
  
  export interface RpcConfigFile {
    chains: RpcConfig[];
  }