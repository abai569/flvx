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

export const licenseAPI = {
  getStatus: async (): Promise<LicenseStatus> => {
    const response = await request.get('/api/v1/license/status');
    return response.data as LicenseStatus;
  },

  activate: async (licenseKey: string): Promise<{ expired_at: number; days_remaining: number; domain: string }> => {
    const response = await request.post('/api/v1/license/activate', { license_key: licenseKey });
    return response.data as { expired_at: number; days_remaining: number; domain: string };
  },

  verify: async (): Promise<{ message: string }> => {
    const response = await request.post('/api/v1/license/verify');
    return response.data as { message: string };
  },

  deactivate: async (reason: string): Promise<{ message: string }> => {
    const response = await request.post('/api/v1/license/deactivate', { reason });
    return response.data as { message: string };
  },

  getHistory: async (licenseId?: number): Promise<LicenseHistoryItem[]> => {
    const params = licenseId ? { license_id: licenseId } : {};
    const response = await request.get('/api/v1/license/history', { params });
    return response.data as LicenseHistoryItem[];
  },
};
