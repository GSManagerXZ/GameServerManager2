import React, { useState, useEffect } from 'react';
import { Typography, Card, Tabs, Form, Input, Button, message, Alert, Divider, Spin } from 'antd';
import axios from 'axios';
import { HeartOutlined, InfoCircleOutlined, FileTextOutlined, DownloadOutlined, ReloadOutlined } from '@ant-design/icons';

const { Title, Paragraph } = Typography;
const { TabPane } = Tabs;

const Settings: React.FC = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [sponsorKeyLoading, setSponsorKeyLoading] = useState(true);
  const [hasSponsorKey, setHasSponsorKey] = useState(false);
  const [maskedSponsorKey, setMaskedSponsorKey] = useState('');
  
  // 日志相关状态
  const [logContent, setLogContent] = useState<string>('');
  const [logLoading, setLogLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);

  // 获取赞助者凭证信息
  useEffect(() => {
    const fetchSponsorKey = async () => {
      try {
        setSponsorKeyLoading(true);
        const response = await axios.get('/api/settings/sponsor-key');
        
        if (response.data.status === 'success') {
          setHasSponsorKey(response.data.has_sponsor_key || false);
          setMaskedSponsorKey(response.data.masked_sponsor_key || '');
        }
      } catch (error) {
        console.error('获取赞助者凭证失败:', error);
        message.error('获取赞助者凭证信息失败');
      } finally {
        setSponsorKeyLoading(false);
      }
    };

    fetchSponsorKey();
  }, []);

  // 获取日志内容
  const fetchLogContent = async () => {
    try {
      setLogLoading(true);
      const response = await axios.get('/api/logs/api-server');
      
      if (response.data.status === 'success') {
        setLogContent(response.data.content || '暂无日志内容');
      } else {
        message.error(`获取日志失败: ${response.data.message || '未知错误'}`);
        setLogContent('获取日志失败');
      }
    } catch (error) {
      console.error('获取日志失败:', error);
      message.error('获取日志失败');
      setLogContent('获取日志失败');
    } finally {
      setLogLoading(false);
    }
  };

  // 导出日志
  const handleExportLog = async () => {
    try {
      setExportLoading(true);
      const response = await axios.get('/api/logs/api-server/export', {
        responseType: 'blob'
      });
      
      // 创建下载链接
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      
      // 生成文件名（包含时间戳）
      const now = new Date();
      const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, -5);
      link.download = `api_server_${timestamp}.log`;
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      message.success('日志导出成功');
    } catch (error) {
      console.error('导出日志失败:', error);
      message.error('导出日志失败');
    } finally {
      setExportLoading(false);
    }
  };

  // 保存赞助者凭证
  const handleSponsorCredentialSubmit = async (values: { sponsorKey: string }) => {
    try {
      setLoading(true);
      
      // 发送请求保存赞助者凭证到 /home/steam/games/config.json
      const response = await axios.post('/api/settings/sponsor-key', {
        sponsorKey: values.sponsorKey
      });
      
      if (response.data.status === 'success') {
        message.success('赞助者凭证保存成功');
        
        // 重新获取凭证信息
        const getResponse = await axios.get('/api/settings/sponsor-key');
        if (getResponse.data.status === 'success') {
          setHasSponsorKey(getResponse.data.has_sponsor_key || false);
          setMaskedSponsorKey(getResponse.data.masked_sponsor_key || '');
        }
        
        // 清空表单
        form.resetFields();
      } else {
        message.error(`保存失败: ${response.data.message || '未知错误'}`);
      }
    } catch (error) {
      message.error(`保存失败: ${error.message || '未知错误'}`);
    } finally {
      setLoading(false);
    }
  };

  // 日志管理部分的JSX
  const renderLogSection = () => (
    <Card 
      title={<><FileTextOutlined /> 系统日志</>}
      bordered={false} 
      className="settings-card"
      extra={
        <div>
          <Button 
            icon={<ReloadOutlined />} 
            onClick={fetchLogContent}
            loading={logLoading}
            style={{ marginRight: 8 }}
          >
            刷新
          </Button>
          <Button 
            type="primary"
            icon={<DownloadOutlined />} 
            onClick={handleExportLog}
            loading={exportLoading}
          >
            导出日志
          </Button>
        </div>
      }
    >
      <Paragraph>
        查看和导出API服务器的运行日志，帮助诊断系统问题。
      </Paragraph>
      
      <div style={{ 
        border: '1px solid #d9d9d9', 
        borderRadius: 6, 
        padding: 12, 
        backgroundColor: '#fafafa',
        minHeight: 400,
        maxHeight: 600,
        overflow: 'auto',
        fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
        fontSize: 12,
        lineHeight: 1.5
      }}>
        {logLoading ? (
          <div style={{ textAlign: 'center', padding: 50 }}>
            <Spin size="large" />
            <div style={{ marginTop: 16 }}>正在加载日志...</div>
          </div>
        ) : (
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', textAlign: 'left' }}>
            {logContent}
          </pre>
        )}
      </div>
      
      <Alert
        message="日志文件路径"
        description="/home/steam/server/api_server.log"
        type="info"
        showIcon
        style={{ marginTop: 16 }}
      />
    </Card>
  );

  // 赞助者凭证设置部分的JSX
  const renderSponsorCredentialSection = () => (
    <Card 
      title={<><HeartOutlined /> 赞助者凭证</>}
      bordered={false} 
      className="settings-card"
    >
      <Paragraph>
        成为赞助者后，您将获得额外的特权功能，包括从云端获取更多可部署的游戏列表。
        请在下方输入您的赞助者凭证。
      </Paragraph>
      
      <Paragraph type="secondary">
        <InfoCircleOutlined /> 赞助者权益:
        <ul>
          <li>从云端获取更多可部署的游戏列表及最新的游戏启动脚本</li>
          <li>版本更新提示功能</li>
        </ul>
      </Paragraph>
      
      {hasSponsorKey ? (
        <Alert
          message="已保存赞助者凭证"
          description={`当前凭证: ${maskedSponsorKey}`}
          type="success"
          showIcon
          style={{ marginBottom: '16px' }}
        />
      ) : null}
      
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSponsorCredentialSubmit}
      >
        <Form.Item
          name="sponsorKey"
          label="赞助者凭证"
          rules={[{ required: true, message: '请输入赞助者凭证' }]}
        >
          <Input.Password placeholder="请输入您的赞助者凭证" />
        </Form.Item>
        
        <Form.Item>
          <Button type="primary" htmlType="submit" loading={loading}>
            保存凭证
          </Button>
        </Form.Item>
      </Form>
      
      <Divider />
      
      <Paragraph type="secondary">
        还不是赞助者？ 
        <Button type="link" onClick={() => window.open('https://afdian.com/a/xiaozhuhouses', '_blank')}>
          立即赞助
        </Button>
        获取赞助者特权！
      </Paragraph>
    </Card>
  );

  return (
    <Card className="settings-card full-width" bordered={false}>
      <Title level={2}>系统设置</Title>
      
      <Tabs defaultActiveKey="sponsor">
        <TabPane tab="赞助者凭证" key="sponsor">
          <div style={{ maxWidth: 600, margin: '0 auto', padding: '20px 0' }}>
            {renderSponsorCredentialSection()}
          </div>
        </TabPane>
        <TabPane tab="日志" key="logs">
          <div style={{ padding: '20px 0' }}>
            {renderLogSection()}
          </div>
        </TabPane>
      </Tabs>
    </Card>
  );
};

export default Settings;