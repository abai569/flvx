import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Card, CardBody } from '@/shadcn-bridge/heroui/card';
import { Button } from '@/shadcn-bridge/heroui/button';
import { Alert } from '@/shadcn-bridge/heroui/alert';
import { Modal, ModalContent, ModalHeader, ModalBody } from '@/shadcn-bridge/heroui/modal';
import { Input } from '@/shadcn-bridge/heroui/input';
import { licenseAPI, type LicenseStatus } from '@/api/license';

interface LicenseStatusCardProps {
  onOpenManage: () => void;
}

export function LicenseStatusCard({ onOpenManage }: LicenseStatusCardProps) {
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
            <Button size="sm" onPress={onOpenManage}>
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
              onPress={onOpenManage}
            >
              管理授权
            </Button>
          </div>
        </CardBody>
      </Card>
    </>
  );
}

interface LicenseManageModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function LicenseManageModal({ isOpen, onClose }: LicenseManageModalProps) {
  const [license, setLicense] = useState<LicenseStatus | null>(null);
  const [licenseKey, setLicenseKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadLicenseStatus();
    }
  }, [isOpen]);

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

  const handleActivate = async () => {
    if (!licenseKey.trim()) {
      toast.error('请输入 License Key');
      return;
    }

    setActivating(true);
    try {
      const result = await licenseAPI.activate(licenseKey.trim());
      // 检查返回结果
      if (result.code === 0) {
        toast.success('激活成功');
        setLicenseKey('');
        await loadLicenseStatus();
        // 关闭弹窗
        onClose();
      } else {
        toast.error(result.msg || '激活失败');
      }
    } catch (error: any) {
      toast.error(error.message || '激活失败');
    } finally {
      setActivating(false);
    }
  };

  const handleVerify = async () => {
    try {
      await licenseAPI.verify();
      toast.success('验证通过');
      await loadLicenseStatus();
    } catch (error: any) {
      toast.error(error.message || '验证失败');
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString('zh-CN');
  };

  const daysRemaining = license?.days_remaining ?? 0;
  const isExpired = license?.status === 2 || daysRemaining <= 0;
  const isExpiring = daysRemaining <= 3 && daysRemaining > 0;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md">
      <ModalContent>
        <ModalHeader>
          <h2 className="text-lg font-semibold">授权管理</h2>
        </ModalHeader>
        <ModalBody className="py-4">
          {loading ? (
            <div className="text-center py-8">加载中...</div>
          ) : !license || !license.activated ? (
            <>
              <Alert color="warning">
                当前面板未激活，请先激活授权
              </Alert>
              <div className="pt-4">
                <p className="text-sm text-gray-500 mb-2">请输入 License Key</p>
                <Input
                  placeholder="eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
                  value={licenseKey}
                  onChange={(e) => setLicenseKey(e.target.value)}
                  className="mb-3"
                />
                <Button
                  color="primary"
                  onPress={handleActivate}
                  isLoading={activating}
                  className="w-full"
                >
                  激活授权
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">授权域名</p>
                    <p className="font-medium">{license.domain}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">过期时间</p>
                    <p className="font-medium">
                      {license.expired_at ? formatDate(license.expired_at) : '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">剩余天数</p>
                    <p className={`font-medium ${isExpired ? 'text-danger' : ''}`}>
                      {isExpired ? '0' : daysRemaining} 天
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">状态</p>
                    <p className={`font-medium ${
                      isExpired ? 'text-danger' : isExpiring ? 'text-warning' : 'text-success'
                    }`}>
                      {isExpired ? '已过期' : isExpiring ? '即将过期' : '正常'}
                    </p>
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    variant="light"
                    onPress={handleVerify}
                    className="flex-1"
                  >
                    验证授权
                  </Button>
                  <Button
                    color="primary"
                    onPress={() => window.open('https://license.yourdomain.com', '_blank')}
                    className="flex-1"
                  >
                    购买/续期
                  </Button>
                </div>

                {isExpiring && (
                  <Alert color="warning">
                    授权即将过期，剩余 {daysRemaining} 天，请及时续期
                  </Alert>
                )}
                {isExpired && (
                  <Alert color="danger">
                    授权已过期，面板功能已受限，请立即续期
                  </Alert>
                )}
              </div>
            </>
          )}
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
