import request from './network';

export interface LicenseStatus {
  activated: boolean;
  domain?: string;
  expired_at?: number;
  days_remaining?: number;
  status: number; // 0=未激活 1=已激活 2=过期
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
  getStatus: (): Promise<LicenseStatus> => {
    return request.get('/api/v1/license/status');
  },

  activate: (licenseKey: string): Promise<{ expired_at: number; days_remaining: number; domain: string }> => {
    return request.post('/api/v1/license/activate', { license_key: licenseKey });
  },

  verify: (): Promise<{ message: string }> => {
    return request.post('/api/v1/license/verify');
  },

  deactivate: (reason: string): Promise<{ message: string }> => {
    return request.post('/api/v1/license/deactivate', { reason });
  },

  getHistory: (licenseId?: number): Promise<LicenseHistoryItem[]> => {
    const params = licenseId ? { license_id: licenseId } : {};
    return request.get('/api/v1/license/history', { params });
  },
};
