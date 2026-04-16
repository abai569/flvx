import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { AnimatedPage } from '@/components/animated-page';
import { Card, CardBody, CardHeader } from '@/shadcn-bridge/heroui/card';
import { Button } from '@/shadcn-bridge/heroui/button';
import { Input } from '@/shadcn-bridge/heroui/input';
import { Alert } from '@/shadcn-bridge/heroui/alert';
import { Table } from '@/shadcn-bridge/heroui/table';
import { licenseAPI, type LicenseStatus, type LicenseHistoryItem } from '@/api/license';

export default function LicensePage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [license, setLicense] = useState<LicenseStatus | null>(null);
  const [licenseKey, setLicenseKey] = useState('');
  const [history, setHistory] = useState<LicenseHistoryItem[]>([]);
  const [activating, setActivating] = useState(false);
  const [deactivating, setDeactivating] = useState(false);

  useEffect(() => {
    loadLicenseStatus();
    loadLicenseHistory();
  }, []);

  const loadLicenseStatus = async () => {
    try {
      const status = await licenseAPI.getStatus();
      setLicense(status);
    } catch (error) {
      toast.error('加载授权状态失败');
    } finally {
      setLoading(false);
    }
  };

  const loadLicenseHistory = async () => {
    try {
      const items = await licenseAPI.getHistory();
      setHistory(items);
    } catch (error) {
      console.error('Failed to load license history:', error);
    }
  };

  const handleActivate = async () => {
    if (!licenseKey.trim()) {
      toast.error('请输入 License Key');
      return;
    }

    setActivating(true);
    try {
      await licenseAPI.activate(licenseKey.trim());
      toast.success('激活成功');
      setLicenseKey('');
      loadLicenseStatus();
      loadLicenseHistory();
    } catch (error: any) {
      toast.error(error.message || '激活失败');
    } finally {
      setActivating(false);
    }
  };

  const handleDeactivate = async () => {
    if (!confirm('确定要停用当前授权吗？\n\n停用后所有功能将无法使用，直到重新激活。')) {
      return;
    }

    setDeactivating(true);
    try {
      await licenseAPI.deactivate('用户主动停用');
      toast.success('已停用授权');
      loadLicenseStatus();
      loadLicenseHistory();
    } catch (error: any) {
      toast.error(error.message || '停用失败');
    } finally {
      setDeactivating(false);
    }
  };

  const handleVerify = async () => {
    try {
      await licenseAPI.verify();
      toast.success('验证通过');
      loadLicenseStatus();
    } catch (error: any) {
      toast.error(error.message || '验证失败');
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString('zh-CN');
  };

  const getActionLabel = (action: string) => {
    const labels: Record<string, string> = {
      activate: '激活',
      renew: '续期',
      deactivate: '停用',
      expire: '过期',
    };
    return labels[action] || action;
  };

  if (loading) {
    return <AnimatedPage>加载中...</AnimatedPage>;
  }

  const daysRemaining = license?.days_remaining ?? 0;
  const isExpired = license?.status === 2 || daysRemaining <= 0;
  const isExpiring = daysRemaining <= 3 && daysRemaining > 0;

  return (
    <AnimatedPage className="px-3 lg:px-6 py-2 lg:py-4">
      <div className="max-w-4xl mx-auto space-y-4">
        <h1 className="text-2xl font-bold mb-6">授权管理</h1>

        {/* 授权状态卡片 */}
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold">授权状态</h2>
          </CardHeader>
          <CardBody className="space-y-3">
            {!license || !license.activated ? (
              <>
                <Alert type="warning">
                  当前面板未激活，请先激活授权
                </Alert>
                <div className="pt-2">
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
                  >
                    激活授权
                  </Button>
                </div>
              </>
            ) : (
              <>
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
                  >
                    验证授权
                  </Button>
                  <Button
                    variant="light"
                    color="danger"
                    onPress={handleDeactivate}
                    isLoading={deactivating}
                  >
                    停用授权
                  </Button>
                  <Button
                    color="primary"
                    onPress={() => window.open('https://example.com/renew', '_blank')}
                  >
                    续期授权
                  </Button>
                </div>

                {isExpiring && (
                  <Alert type="warning" className="mt-3">
                    授权即将过期，剩余 {daysRemaining} 天，请及时续期
                  </Alert>
                )}
                {isExpired && (
                  <Alert type="danger" className="mt-3">
                    授权已过期，面板功能已受限，请立即续期
                  </Alert>
                )}
              </>
            )}
          </CardBody>
        </Card>

        {/* 使用历史 */}
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold">使用历史</h2>
          </CardHeader>
          <CardBody>
            {history.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">暂无记录</p>
            ) : (
              <Table
                columns={[
                  { key: 'action', label: '操作' },
                  { key: 'reason', label: '原因' },
                  { key: 'created_time', label: '时间' },
                ]}
                rows={history}
                renderCell={(item, key) => {
                  switch (key) {
                    case 'action':
                      return getActionLabel(item.action);
                    case 'reason':
                      return item.reason || '-';
                    case 'created_time':
                      return formatDate(item.created_time);
                    default:
                      return item[key as keyof LicenseHistoryItem];
                  }
                }}
              />
            )}
          </CardBody>
        </Card>
      </div>
    </AnimatedPage>
  );
}
