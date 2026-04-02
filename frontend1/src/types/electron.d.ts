export interface ElectronAPI {
  isElectron: boolean;
  getLocalApiBase: () => string;
  getCloudApiBase: () => string;
  getBackendBase: () => string;
  backendStatus?: () => Promise<{ ready: boolean; port?: number }>; 
  backendRestart?: () => Promise<{ ok: boolean; message?: string }>;
  setActiveDoctor?: (userId: number | null) => Promise<{ ok: boolean; message?: string }>;
  getSecureToken?: (key: string) => Promise<string | null>;
  setSecureToken?: (key: string, value: string) => Promise<boolean>;
  clearSecureToken?: (key: string) => Promise<boolean>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
