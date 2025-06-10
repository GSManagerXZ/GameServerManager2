import React, { useState, useEffect } from 'react';
import { Card, Button, Spin, message, Typography, Space, Row, Col, Tag, Modal, Progress } from 'antd';
import { LockOutlined, CloudOutlined, AppstoreOutlined, InfoCircleOutlined, DownloadOutlined, LoadingOutlined } from '@ant-design/icons';
import axios from 'axios';

const { Title, Paragraph } = Typography;

interface OnlineGame {
  id: string;
  name: string;
  URL: string;
  script: string;
  txt: string;
}

interface OnlineDeployProps {
  // 可以添加需要的props
}

const OnlineDeploy: React.FC<OnlineDeployProps> = () => {
  const [loading, setLoading] = useState(true);
  const [isSponsored, setIsSponsored] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [onlineGames, setOnlineGames] = useState<OnlineGame[]>([]);
  const [gamesLoading, setGamesLoading] = useState(false);
  const [deployingGames, setDeployingGames] = useState<{[key: string]: boolean}>({});
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [detailGame, setDetailGame] = useState<OnlineGame | null>(null);
  
  // 部署进度相关状态
  const [deployProgressVisible, setDeployProgressVisible] = useState(false);
  const [currentDeployingGame, setCurrentDeployingGame] = useState<OnlineGame | null>(null);
  const [deployProgress, setDeployProgress] = useState(0);
  const [deployStatus, setDeployStatus] = useState<string>('准备中...');
  const [isAnyGameDeploying, setIsAnyGameDeploying] = useState(false);

  // 验证赞助者身份
  const verifySponsor = async () => {
    setVerifying(true);
    try {
      const response = await axios.get('/api/sponsor/validate');
      if (response.data.status === 'success' && response.data.valid) {
        setIsSponsored(true);
        message.success('赞助者身份验证成功');
        // 验证成功后获取在线游戏列表
        await fetchOnlineGames();
      } else {
        setIsSponsored(false);
        message.error('赞助者身份验证失败');
      }
    } catch (error: any) {
      console.error('验证赞助者身份失败:', error);
      setIsSponsored(false);
      message.error('验证赞助者身份时发生错误');
    } finally {
      setVerifying(false);
      setLoading(false);
    }
  };

  // 获取在线游戏列表
  const fetchOnlineGames = async () => {
    setGamesLoading(true);
    try {
      const response = await axios.get('/api/online-games');
      if (response.data.status === 'success') {
        const gamesData = response.data.games;
        const gamesList: OnlineGame[] = Object.keys(gamesData).map(gameId => ({
          id: gameId,
          name: gameId,
          URL: gamesData[gameId].URL,
          script: gamesData[gameId].script,
          txt: gamesData[gameId].txt
        }));
        setOnlineGames(gamesList);
      } else {
        message.error('获取在线游戏列表失败');
      }
    } catch (error: any) {
      console.error('获取在线游戏列表失败:', error);
      message.error('获取在线游戏列表时发生错误');
    } finally {
      setGamesLoading(false);
    }
  };

  // 部署在线游戏
  const handleDeploy = async (game: OnlineGame) => {
    // 检查是否有游戏正在部署
    if (isAnyGameDeploying) {
      message.warning('已有游戏正在部署中，请等待完成后再试');
      return;
    }

    try {
      // 设置部署状态
      setIsAnyGameDeploying(true);
      setCurrentDeployingGame(game);
      setDeployProgress(0);
      setDeployStatus('正在准备部署...');
      setDeployProgressVisible(true);

      // 调用后端API启动部署
      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/online-deploy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          gameId: game.id,
          gameName: game.name,
          downloadUrl: game.URL,
          script: game.script,
        }),
      });

      const result = await response.json();

      if (result.status === 'success') {
        // 启动SSE连接获取实时进度
        const eventSource = new EventSource(`/api/online-deploy/stream?game_id=${game.id}&token=${token}`);
        
        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            
            // 忽略心跳包
            if (data.heartbeat) {
              return;
            }
            
            // 更新进度
            if (data.progress !== undefined) {
              setDeployProgress(data.progress);
            }
            
            if (data.message) {
              setDeployStatus(data.message);
            }
            
            // 检查是否完成
            if (data.complete) {
              eventSource.close();
              
              if (data.status === 'completed') {
                message.success(data.message || `游戏 ${game.name} 部署成功`);
                // 刷新在线游戏列表
                fetchOnlineGames();
              } else if (data.status === 'error') {
                message.error(data.message || '部署失败');
              }
              
              // 延迟2秒后关闭进度弹窗并重置状态
              setTimeout(() => {
                setDeployProgressVisible(false);
                setIsAnyGameDeploying(false);
                setCurrentDeployingGame(null);
                setDeployProgress(0);
                setDeployStatus('');
              }, 2000);
            }
          } catch (error) {
            console.error('解析SSE数据失败:', error);
          }
        };
        
        eventSource.onerror = (error) => {
          console.error('SSE连接错误:', error);
          eventSource.close();
          message.error('获取部署进度失败，请刷新页面查看状态');
          
          // 重置状态
          setTimeout(() => {
            setDeployProgressVisible(false);
            setIsAnyGameDeploying(false);
            setCurrentDeployingGame(null);
            setDeployProgress(0);
            setDeployStatus('');
          }, 2000);
        };
        
      } else {
        throw new Error(result.message || '启动部署失败');
      }
    } catch (error) {
      console.error('部署失败:', error);
      message.error(`部署失败: ${error instanceof Error ? error.message : '未知错误'}`);
      setDeployStatus('部署失败');
      
      // 重置状态
      setTimeout(() => {
        setDeployProgressVisible(false);
        setIsAnyGameDeploying(false);
        setCurrentDeployingGame(null);
        setDeployProgress(0);
        setDeployStatus('');
      }, 2000);
    }
  };

  // 显示游戏详情
  const handleShowDetail = (game: OnlineGame) => {
    setDetailGame(game);
    setDetailModalVisible(true);
  };

  useEffect(() => {
    verifySponsor();
  }, []);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '50px' }}>
        <Spin size="large" />
        <div style={{ marginTop: 16 }}>正在验证赞助者身份...</div>
      </div>
    );
  }

  if (!isSponsored) {
    return (
      <div style={{ textAlign: 'center', padding: '50px' }}>
        <Card>
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            <LockOutlined style={{ fontSize: '64px', color: '#ff4d4f' }} />
            <Title level={3} type="danger">您不是赞助者</Title>
            <Paragraph>
              抱歉，在线部署功能仅对赞助者开放。
              <br />
              如果您已经是赞助者，请确保已正确配置赞助者密钥。
            </Paragraph>
            <Button 
              type="primary" 
              loading={verifying}
              onClick={verifySponsor}
            >
              重新验证
            </Button>
          </Space>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Title level={3} style={{ margin: 0 }}>
          <CloudOutlined style={{ marginRight: 8, color: '#52c41a' }} />
          在线部署
        </Title>
        <Button 
          type="primary" 
          loading={gamesLoading}
          onClick={fetchOnlineGames}
        >
          刷新列表
        </Button>
      </div>
      
      {gamesLoading ? (
        <div className="loading-container" style={{ textAlign: 'center', padding: '50px' }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>正在获取在线游戏列表...</div>
        </div>
      ) : (
        <Row gutter={[16, 16]}>
          {onlineGames.map((game) => {
            const isDeploying = deployingGames[game.id];
            
            return (
              <Col key={game.id} xs={24} sm={12} md={8} lg={6}>
                <div className="custom-game-card">
                  {/* 游戏封面图片 */}
                  <div className="game-cover">
                    <div className="game-cover-placeholder">
                      <CloudOutlined />
                    </div>
                  </div>
                  <div className="card-header">
                    <h3>{game.name}</h3>
                    <Tag color="orange">在线部署</Tag>
                  </div>
                  <div className="card-content">
                    <p>{game.txt || '暂无描述'}</p>
                  </div>
                  <div className="card-actions">
                    <button 
                      className="btn-info"
                      onClick={() => handleShowDetail(game)}
                    >
                      <InfoCircleOutlined /> 详情
                    </button>
                    <button 
                      className="btn-primary"
                      onClick={() => handleDeploy(game)}
                      disabled={isDeploying || isAnyGameDeploying}
                    >
                      <DownloadOutlined /> {isDeploying ? '部署中...' : (isAnyGameDeploying ? '等待中...' : '部署')}
                    </button>
                  </div>
                </div>
              </Col>
            );
          })}
        </Row>
      )}
      
      {!gamesLoading && onlineGames.length === 0 && (
        <div style={{ textAlign: 'center', padding: '50px' }}>
          <CloudOutlined style={{ fontSize: '64px', color: '#d9d9d9' }} />
          <div style={{ marginTop: 16, color: '#999' }}>暂无可用的在线部署游戏</div>
        </div>
      )}
      
      {/* 游戏详情Modal */}
      <Modal
        title={`${detailGame?.name || ''} 详细信息`}
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={null}
        width={600}
      >
        {detailGame && (
           <div className="game-detail">
             {detailGame.image ? (
               <div style={{ textAlign: 'center', marginBottom: 20 }}>
                 <img 
                   src={detailGame.image} 
                   alt={detailGame.name} 
                   style={{ maxWidth: '100%', maxHeight: '200px' }} 
                 />
               </div>
             ) : (
               <div style={{ textAlign: 'center', marginBottom: 20 }}>
                 <CloudOutlined style={{ fontSize: '64px', color: '#52c41a' }} />
               </div>
             )}
             <p><strong>游戏名称:</strong> {detailGame.name}</p>
             <p><strong>游戏ID:</strong> {detailGame.id}</p>
            
            {detailGame.txt && (
              <div>
                <strong>游戏描述:</strong>
                <div style={{ 
                  marginTop: 8, 
                  padding: 12, 
                  backgroundColor: '#f5f5f5', 
                  borderRadius: 6,
                  whiteSpace: 'pre-wrap'
                }}>
                  {detailGame.txt}
                </div>
              </div>
            )}
            
            {detailGame.script && (
              <div style={{ marginTop: 16 }}>
                <strong>启动脚本:</strong>
                <div style={{ 
                  marginTop: 8, 
                  padding: 12, 
                  backgroundColor: '#f0f0f0', 
                  borderRadius: 6,
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  whiteSpace: 'pre-wrap',
                  maxHeight: '200px',
                  overflow: 'auto'
                }}>
                  {detailGame.script}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
      
      {/* 部署进度Modal */}
      <Modal
        title="游戏部署进度"
        open={deployProgressVisible}
        onCancel={null}
        footer={null}
        width={500}
        closable={false}
        maskClosable={false}
      >
        {currentDeployingGame && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ marginBottom: 20 }}>
              <LoadingOutlined style={{ fontSize: '48px', color: '#1890ff' }} />
            </div>
            <h3 style={{ marginBottom: 20 }}>{currentDeployingGame.name}</h3>
            <Progress 
              percent={deployProgress} 
              status={deployProgress === 100 ? 'success' : 'active'}
              strokeColor={{
                '0%': '#108ee9',
                '100%': '#87d068',
              }}
              style={{ marginBottom: 20 }}
            />
            <p style={{ 
              fontSize: '14px', 
              color: '#666',
              marginBottom: 0
            }}>
              {deployStatus}
            </p>
            {deployProgress === 100 && (
              <p style={{ 
                fontSize: '12px', 
                color: '#999',
                marginTop: 10,
                marginBottom: 0
              }}>
                窗口将在2秒后自动关闭
              </p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default OnlineDeploy;