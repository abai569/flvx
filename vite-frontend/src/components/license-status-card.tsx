import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardBody } from '@/shadcn-bridge/heroui/card';
import { Button } from '@/shadcn-bridge/heroui/button';
import { Alert } from '@/shadcn-bridge/heroui/alert';
import { licenseAPI, type LicenseStatus } from '@/api/license';

export function LicenseStatusCard() {
  const navigate = useNavigate();
  const [license, setLicense] = useState<LicenseStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLicenseStatus();
  }, []);

  const loadLicenseStatus = async () => {
    try {
      const status = await licenseAPI.getStatus();
      setLicense(status);
    } catch (error) {
      console.error('Failed to load license status:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return null;
  }

  if (!license || !license.activated) {
    return (
      <Card className="mb-4">
        <CardBody>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium">授权管理</h3>
              <p className="text-xs text-gray-500 mt-1">未激活</p>
            </div>
            <Button size="sm" onPress={() => navigate('/license')}>
              激活授权
            </Button>
          </div>
        </CardBody>
      </Card>
    );
  }

  const daysRemaining = license.days_remaining ?? 0;
  const isExpiring = daysRemaining <= 3 && daysRemaining > 0;
  const isExpired = license.status === 2 || daysRemaining <= 0;

  return (
    <>
      {isExpiring && (
        <Alert color="warning" className="mb-4">
          授权即将过期，剩余 {daysRemaining} 天
        </Alert>
      )}
      {isExpired && (
        <Alert color="danger" className="mb-4">
          授权已过期，请立即续期
        </Alert>
      )}
      <Card className={`mb-4 ${isExpired ? 'border-danger' : ''}`}>
        <CardBody>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium">授权管理</h3>
              <p className="text-xs text-gray-500 mt-1">
                剩余 {isExpired ? '0' : daysRemaining} 天
              </p>
            </div>
            <Button 
              size="sm" 
              variant={isExpired ? 'solid' : 'light'}
              color={isExpired ? 'danger' : 'default'}
              onPress={() => navigate('/license')}
            >
              管理授权
            </Button>
          </div>
        </CardBody>
      </Card>
    </>
  );
}
