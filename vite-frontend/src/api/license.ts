import request from './network';

export interface LicenseStatus {
  activated: boolean;
  domain?: string;
  expired_at?: number;
  days_remaining?: number;
  status: number;
}

export interface LicenseHistoryItem {
  id: number;
  license_id: number;
  domain: string;
  action: string;
  reason: string;
  operator_id: number;
  created_time: number;
}

interface ApiResponse<T> {
  code: number;
  msg: string;
  data: T;
}

export const licenseAPI = {
  getStatus: async (): Promise<LicenseStatus> => {
    const response = await request.get('/api/v1/license/status') as ApiResponse<LicenseStatus>;
    return response.data;
  },

  activate: async (licenseKey: string): Promise<{ expired_at: number; days_remaining: number; domain: string }> => {
    const response = await request.post('/api/v1/license/activate', { license_key: licenseKey }) as ApiResponse<{ expired_at: number; days_remaining: number; domain: string }>;
    return response.data;
  },

  verify: async (): Promise<{ message: string }> => {
    const response = await request.post('/api/v1/license/verify') as ApiResponse<{ message: string }>;
    return response.data;
  },

  deactivate: async (reason: string): Promise<{ message: string }> => {
    const response = await request.post('/api/v1/license/deactivate', { reason }) as ApiResponse<{ message: string }>;
    return response.data;
  },

  getHistory: async (licenseId?: number): Promise<LicenseHistoryItem[]> => {
    const params = licenseId ? { license_id: licenseId } : {};
    const response = await request.get('/api/v1/license/history', { params }) as ApiResponse<LicenseHistoryItem[]>;
    return response.data;
  },
};
