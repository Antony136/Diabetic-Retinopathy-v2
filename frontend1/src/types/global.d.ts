export {};

declare global {
  interface Window {
    __ELECTRON__?: boolean;
    __LOCAL_API_BASE__?: string;
    __CLOUD_API_BASE__?: string;
    electronAPI?: {
      isElectron: boolean;
      getLocalApiBase: () => string;
      getCloudApiBase: () => string;
      getBackendBase: () => string;
      backendStatus?: () => Promise<{ ready: boolean; port?: number }>;
      backendRestart?: () => Promise<{ ok: boolean; message?: string; port?: number }>;
      setActiveDoctor?: (userId: number | null) => Promise<{ ok: boolean; message?: string }>;
      getSecureToken?: (key: string) => Promise<string | null>;
      setSecureToken?: (key: string, value: string) => Promise<boolean>;
      clearSecureToken?: (key: string) => Promise<boolean>;
    };
  }
}
