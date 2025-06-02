import React, { useState, useEffect } from 'react';
import { Card, Progress, Statistic, Table, Typography, Button, Space, Row, Col, Divider, Tag, Dropdown, Menu, Alert, Modal, message, Slider } from 'antd';
import { ReloadOutlined, HddOutlined, RocketOutlined, AppstoreOutlined, DownOutlined, GlobalOutlined, WarningOutlined, DesktopOutlined, ApiOutlined, ExclamationCircleOutlined, StopOutlined, DragOutlined, SettingOutlined } from '@ant-design/icons';
import { DragDropContext, Droppable, Draggable, DropResult } from 'react-beautiful-dnd';
import axios from 'axios';
import { useIsMobile } from '../hooks/useIsMobile'; // 导入移动端检测钩子

const { Title, Paragraph } = Typography;

interface SystemInfo {
  cpu_usage: number;
  memory: {
    total: number;
    used: number;
    percent: number;
  };
  disk: {
    total: number;
    used: number;
    percent: number;
  };
  games_space?: Record<string, number>;
  network?: {
    interfaces: Record<string, {
      addresses: Array<{
        type: string;
        address: string;
        netmask: string;
      }>;
      status: string;
      speed: number;
      duplex: string;
      mtu: number;
    }>;
    public_ip: {
      ipv4: string | null;
      ipv6: string | null;
    };
    io_stats: Record<string, {
      bytes_sent: number;
      bytes_recv: number;
      packets_sent: number;
      packets_recv: number;
      errin: number;
      errout: number;
      dropin: number;
      dropout: number;
    }>;
  };
}

interface GameInfo {
  id: string;
  name: string;
  size_mb?: number;
  started_at?: number;
  uptime?: number;
  external?: boolean;
}

interface ProcessInfo {
  pid: number;
  name: string;
  username: string;
  cpu_percent: number;
  memory_percent: number;
  create_time: number;
  cmdline: string;
}

interface PortInfo {
  port: number;
  address: string;
  family: string;
  type: string;
  status: string;
  pid: number;
  process_name: string;
  process_cmdline: string;
}

interface ContainerInfoProps {
  onInstallGame?: (gameId: string) => void;
  onStartServer?: (gameId: string) => void;
  onStopServer?: (gameId: string, force?: boolean) => void;
  onUninstallGame?: (gameId: string) => void;
}

// 卡片配置接口
interface CardConfig {
  id: string;
  title: string;
  type: 'cpu' | 'memory' | 'disk' | 'network' | 'installedGames' | 'runningGames' | 'processes' | 'ports';
  visible: boolean;
  span: number; // 栅格占用宽度
}

// 默认卡片配置
const defaultCardConfigs: CardConfig[] = [
  { id: 'cpu', title: 'CPU使用率', type: 'cpu', visible: true, span: 8 },
  { id: 'memory', title: '内存使用', type: 'memory', visible: true, span: 8 },
  { id: 'disk', title: '磁盘使用', type: 'disk', visible: true, span: 8 },
  { id: 'network', title: '网络状态', type: 'network', visible: true, span: 24 },
  { id: 'installedGames', title: '已安装游戏', type: 'installedGames', visible: true, span: 12 },
  { id: 'runningGames', title: '正在运行的服务器', type: 'runningGames', visible: true, span: 12 },
  { id: 'processes', title: '系统进程', type: 'processes', visible: true, span: 12 },
  { id: 'ports', title: '活跃端口', type: 'ports', visible: true, span: 12 }
];

const ContainerInfo: React.FC<ContainerInfoProps> = ({
  onInstallGame,
  onStartServer,
  onStopServer,
  onUninstallGame
}) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [installedGames, setInstalledGames] = useState<GameInfo[]>([]);
  const [runningGames, setRunningGames] = useState<GameInfo[]>([]);
  const [networkStats, setNetworkStats] = useState<{sent: number[], recv: number[]}>({sent: [], recv: []});
  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [ports, setPorts] = useState<PortInfo[]>([]);
  const [processLoading, setProcessLoading] = useState<boolean>(false);
  const [portLoading, setPortLoading] = useState<boolean>(false);
  const [cardConfigs, setCardConfigs] = useState<CardConfig[]>(() => {
    // 从localStorage加载配置，如果没有则使用默认配置
    const saved = localStorage.getItem('containerInfo_cardConfigs');
    return saved ? JSON.parse(saved) : defaultCardConfigs;
  });
  const [isDragMode, setIsDragMode] = useState<boolean>(false);
  const [settingsVisible, setSettingsVisible] = useState<boolean>(false);
  const isMobile = useIsMobile(); // 检测是否为移动端

  const fetchContainerInfo = async () => {
    setLoading(true);
    try {
      // 添加超时处理
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时
      
      try {
        const [containerInfoResp, installedGamesResp, networkInfoResp] = await Promise.all([
          axios.get('/api/container_info', { 
            signal: controller.signal,
            timeout: 10000 // 设置axios超时
          }),
          axios.get('/api/installed_games', { 
            signal: controller.signal,
            timeout: 10000 
          }),
          axios.get('/api/network_info', { 
            signal: controller.signal,
            timeout: 10000 
          })
        ]);
        
        // 清除超时定时器
        clearTimeout(timeoutId);
        
        if (containerInfoResp.data.status === 'success') {
          const sysInfo = containerInfoResp.data.system_info;
          
          // 添加网络信息
          if (networkInfoResp.data.status === 'success') {
            sysInfo.network = {
              interfaces: networkInfoResp.data.network_interfaces,
              public_ip: networkInfoResp.data.public_ip,
              io_stats: networkInfoResp.data.io_stats
            };
            
            // 更新网络统计数据
            let totalSent = 0;
            let totalRecv = 0;
            
            Object.values(networkInfoResp.data.io_stats || {}).forEach((stats: any) => {
              totalSent += stats.bytes_sent || 0;
              totalRecv += stats.bytes_recv || 0;
            });
            
            // 保留最多10个数据点
            setNetworkStats(prev => ({
              sent: [...prev.sent.slice(-9), totalSent],
              recv: [...prev.recv.slice(-9), totalRecv]
            }));
          }
          
          setSystemInfo(sysInfo);
          setRunningGames(containerInfoResp.data.running_games || []);
          
          // 处理已安装游戏列表
          let allInstalledGames = containerInfoResp.data.installed_games || [];
          
          // 加入外部游戏
          if (installedGamesResp.data.status === 'success' && installedGamesResp.data.external) {
            const externalGames = installedGamesResp.data.external.map((game: any) => ({
              ...game,
              size_mb: containerInfoResp.data.system_info?.games_space?.[game.id] || 0
            }));
            
            // 合并正常游戏和外部游戏
            allInstalledGames = [...allInstalledGames, ...externalGames];
          }
          
          setInstalledGames(allInstalledGames);
        }
      } catch (error: any) {
        // 清除超时定时器
        clearTimeout(timeoutId);
        
        // 处理请求错误
        console.error("获取容器信息失败:", error);
        
        // 如果是超时错误，显示适当的提示
        if (error.name === 'AbortError' || error.code === 'ECONNABORTED') {
          console.warn("容器信息请求超时，使用缓存数据");
          // 保持使用现有数据，不更新状态
        } else {
          // 其他错误，可以考虑设置一些默认值
          // 但不要完全重置状态，保留之前的数据
          console.warn("容器信息请求失败，使用缓存数据");
        }
      }
    } finally {
      setLoading(false);
    }
  };

  // 获取进程信息
  const fetchProcesses = async () => {
    setProcessLoading(true);
    try {
      const response = await axios.get('/api/system_processes');
      if (response.data.status === 'success') {
        setProcesses(response.data.processes || []);
      }
    } catch (error) {
      console.error('获取进程信息失败:', error);
      message.error('获取进程信息失败');
    } finally {
      setProcessLoading(false);
    }
  };

  // 获取端口信息
  const fetchPorts = async () => {
    setPortLoading(true);
    try {
      const response = await axios.get('/api/system_ports');
      if (response.data.status === 'success') {
        setPorts(response.data.ports || []);
      }
    } catch (error) {
      console.error('获取端口信息失败:', error);
      message.error('获取端口信息失败');
    } finally {
      setPortLoading(false);
    }
  };

  // 结束进程
  const killProcess = async (pid: number, processName: string, force: boolean = false) => {
    try {
      const response = await axios.post('/api/kill_process', {
        pid: pid,
        force: force
      });
      if (response.data.status === 'success') {
        message.success(response.data.message);
        fetchProcesses(); // 刷新进程列表
      } else {
        message.error(response.data.message);
      }
    } catch (error: any) {
      console.error('结束进程失败:', error);
      message.error(error.response?.data?.message || '结束进程失败');
    }
  };

  // 保存卡片配置到localStorage
  const saveCardConfigs = (configs: CardConfig[]) => {
    localStorage.setItem('containerInfo_cardConfigs', JSON.stringify(configs));
    setCardConfigs(configs);
  };

  // 处理拖拽结束
  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) {
      return;
    }

    const items = Array.from(cardConfigs);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    saveCardConfigs(items);
  };

  // 切换卡片可见性
  const toggleCardVisibility = (cardId: string) => {
    const newConfigs = cardConfigs.map(config => 
      config.id === cardId ? { ...config, visible: !config.visible } : config
    );
    saveCardConfigs(newConfigs);
  };

  // 更新卡片宽度
  const updateCardSpan = (cardId: string, span: number) => {
    const newConfigs = cardConfigs.map(config => 
      config.id === cardId ? { ...config, span } : config
    );
    saveCardConfigs(newConfigs);
  };

  // 重置卡片配置
  const resetCardConfigs = () => {
    saveCardConfigs(defaultCardConfigs);
    message.success('卡片布局已重置为默认配置');
  };

  // 显示结束进程确认对话框
  const showKillProcessConfirm = (pid: number, processName: string) => {
    Modal.confirm({
      title: '确认结束进程',
      icon: <ExclamationCircleOutlined />,
      content: (
        <div>
          <p>您确定要结束以下进程吗？</p>
          <p><strong>进程名:</strong> {processName}</p>
          <p><strong>PID:</strong> {pid}</p>
          <p style={{ color: '#ff4d4f', marginTop: 16 }}>
            <WarningOutlined /> 警告：结束进程可能会导致数据丢失或系统不稳定！
          </p>
        </div>
      ),
      okText: '正常结束',
      cancelText: '取消',
      okType: 'danger',
      onOk() {
        killProcess(pid, processName, false);
      },
      footer: [
        <Button key="cancel" onClick={() => Modal.destroyAll()}>
          取消
        </Button>,
        <Button key="terminate" type="primary" danger onClick={() => {
          Modal.destroyAll();
          killProcess(pid, processName, false);
        }}>
          正常结束
        </Button>,
        <Button key="kill" type="primary" danger onClick={() => {
          Modal.destroyAll();
          killProcess(pid, processName, true);
        }}>
          强制结束
        </Button>
      ]
    });
  };

  useEffect(() => {
    fetchContainerInfo();
    // 设置定时刷新（每30秒）但如果有运行中的服务器，增加间隔时间避免频繁请求
    const interval = setInterval(fetchContainerInfo, runningGames.length > 0 ? 60000 : 30000);
    return () => clearInterval(interval);
  }, [runningGames.length]);

  // 格式化时间显示
  const formatUptime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}小时${minutes}分钟`;
  };

  // 格式化大小显示
  const formatSize = (mb: number): string => {
    if (mb < 1024) {
      return `${mb.toFixed(1)} MB`;
    }
    return `${(mb / 1024).toFixed(1)} GB`;
  };

  // 格式化磁盘/内存大小显示（GB格式）
  const formatGB = (gb: number): string => {
    return `${gb.toFixed(1)}`;
  };
  
  // 格式化GB大小对的显示
  const formatGBPair = (used: number, total: number): string => {
    return `${formatGB(used)}/${formatGB(total)} GB`;
  };

  // 计算网络流量变化率 (bytes/s)
  const calculateNetworkRate = (current: number[], previous: number[]): number => {
    if (current.length < 2 || previous.length < 2) return 0;
    const lastCurrent = current[current.length - 1];
    const lastPrevious = current[current.length - 2];
    return Math.max(0, (lastCurrent - lastPrevious) / 30); // 30秒刷新间隔
  };

  // 格式化网络速率
  const formatNetworkRate = (bytesPerSecond: number): string => {
    if (bytesPerSecond < 1024) {
      return `${bytesPerSecond.toFixed(1)} B/s`;
    } else if (bytesPerSecond < 1024 * 1024) {
      return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
    } else if (bytesPerSecond < 1024 * 1024 * 1024) {
      return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
    } else {
      return `${(bytesPerSecond / (1024 * 1024 * 1024)).toFixed(1)} GB/s`;
    }
  };

  // 格式化时间戳
  const formatTimestamp = (timestamp: number): string => {
    return new Date(timestamp * 1000).toLocaleString('zh-CN');
  };

  // 进程表格列定义
  const processColumns = [
    {
      title: 'PID',
      dataIndex: 'pid',
      key: 'pid',
      width: 80,
      sorter: (a: ProcessInfo, b: ProcessInfo) => a.pid - b.pid,
    },
    {
      title: '进程名',
      dataIndex: 'name',
      key: 'name',
      width: 120,
      sorter: (a: ProcessInfo, b: ProcessInfo) => a.name.localeCompare(b.name),
    },
    {
      title: '用户',
      dataIndex: 'username',
      key: 'username',
      width: 100,
      sorter: (a: ProcessInfo, b: ProcessInfo) => a.username.localeCompare(b.username),
    },
    {
      title: 'CPU%',
      dataIndex: 'cpu_percent',
      key: 'cpu_percent',
      width: 80,
      sorter: (a: ProcessInfo, b: ProcessInfo) => a.cpu_percent - b.cpu_percent,
      render: (cpu: number) => `${cpu.toFixed(1)}%`,
    },
    {
      title: '内存%',
      dataIndex: 'memory_percent',
      key: 'memory_percent',
      width: 80,
      sorter: (a: ProcessInfo, b: ProcessInfo) => a.memory_percent - b.memory_percent,
      render: (memory: number) => `${memory.toFixed(1)}%`,
    },
    {
      title: '命令行',
      dataIndex: 'cmdline',
      key: 'cmdline',
      ellipsis: true,
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_, record: ProcessInfo) => (
        <Button
          size="small"
          danger
          icon={<StopOutlined />}
          onClick={() => showKillProcessConfirm(record.pid, record.name)}
        >
          结束
        </Button>
      ),
    },
  ];

  // 端口表格列定义
  const portColumns = [
    {
      title: '端口',
      dataIndex: 'port',
      key: 'port',
      width: 80,
      sorter: (a: PortInfo, b: PortInfo) => a.port - b.port,
    },
    {
      title: '地址',
      dataIndex: 'address',
      key: 'address',
      width: 120,
    },
    {
      title: '协议',
      dataIndex: 'type',
      key: 'type',
      width: 60,
      render: (type: string) => <Tag color={type === 'TCP' ? 'blue' : 'green'}>{type}</Tag>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 200,
      ellipsis: true,
      render: (status: string) => {
        let color = 'default';
        let displayText = status;
        
        if (status === 'LISTEN') {
          color = 'green';
        } else if (status === 'ACTIVE') {
          color = 'blue';
        } else if (status.startsWith('ESTABLISHED')) {
          color = 'orange';
          // 简化ESTABLISHED显示，只显示远程IP
          const match = status.match(/ESTABLISHED -> (.+)/);
          if (match) {
            const remoteAddr = match[1];
            displayText = `ESTABLISHED ${remoteAddr}`;
          }
        }
        
        return (
          <Tag color={color} title={status}>
            {displayText}
          </Tag>
        );
      },
    },
    {
      title: 'PID',
      dataIndex: 'pid',
      key: 'pid',
      width: 80,
    },
    {
      title: '进程名',
      dataIndex: 'process_name',
      key: 'process_name',
      width: 120,
    },
    {
      title: '命令行',
      dataIndex: 'process_cmdline',
      key: 'process_cmdline',
      ellipsis: true,
    },
  ];

  // 移动端进程表格列
  const getMobileProcessColumns = () => {
    return [
      {
        title: '进程信息',
        key: 'info',
        render: (_, record: ProcessInfo) => (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontWeight: 'bold' }}>{record.name}</span>
              <Button
                size="small"
                danger
                icon={<StopOutlined />}
                onClick={() => showKillProcessConfirm(record.pid, record.name)}
              >
                结束
              </Button>
            </div>
            <div style={{ fontSize: '12px', color: '#888' }}>
              <div>PID: {record.pid} | 用户: {record.username}</div>
              <div>CPU: {record.cpu_percent.toFixed(1)}% | 内存: {record.memory_percent.toFixed(1)}%</div>
              <div style={{ marginTop: 4, wordBreak: 'break-all' }}>
                命令: {record.cmdline}
              </div>
            </div>
          </div>
        ),
      },
    ];
  };

  // 移动端端口表格列
  const getMobilePortColumns = () => {
    return [
      {
        title: '端口信息',
        key: 'info',
        render: (_, record: PortInfo) => {
           let statusColor = 'default';
           let statusText = record.status;
           
           if (record.status === 'LISTEN') {
             statusColor = 'green';
           } else if (record.status === 'ACTIVE') {
             statusColor = 'blue';
           } else if (record.status.startsWith('ESTABLISHED')) {
             statusColor = 'orange';
             // 简化ESTABLISHED显示
             const match = record.status.match(/ESTABLISHED -> (.+)/);
             if (match) {
               const remoteAddr = match[1];
               statusText = `连接至 ${remoteAddr}`;
             }
           }
           
           return (
             <div>
               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                 <span style={{ fontWeight: 'bold' }}>端口 {record.port}</span>
                 <div>
                   <Tag color={record.type === 'TCP' ? 'blue' : 'green'}>{record.type}</Tag>
                   <Tag color={statusColor} style={{ marginLeft: 4 }} title={record.status}>
                     {statusText}
                   </Tag>
                 </div>
               </div>
               <div style={{ fontSize: '12px', color: '#888' }}>
                 <div>地址: {record.address}</div>
                 <div>PID: {record.pid} | 进程: {record.process_name}</div>
                 <div style={{ marginTop: 4, wordBreak: 'break-all' }}>
                   命令: {record.process_cmdline}
                 </div>
               </div>
             </div>
           );
         },
      },
    ];
  };

  // 渲染CPU卡片
  const renderCpuCard = () => (
    <Card 
      title={<><HddOutlined /> CPU使用率</>} 
      loading={loading} 
      style={{marginBottom: isMobile ? 8 : 16, borderRadius: '8px', minHeight: isMobile ? 'auto' : '200px'}} 
      size={isMobile ? "small" : "default"}
    >
      <Progress 
        type="dashboard" 
        percent={Math.round(systemInfo?.cpu_usage || 0)} 
        status={systemInfo?.cpu_usage && systemInfo.cpu_usage > 80 ? 'exception' : 'normal'} 
        format={percent => `${Math.round(percent || 0)}%`}
        width={isMobile ? 80 : 120}
      />
      <Statistic title="使用率" value={`${Math.round(systemInfo?.cpu_usage || 0)}%`} />
    </Card>
  );

  // 渲染内存卡片
  const renderMemoryCard = () => (
    <Card 
      title={<><HddOutlined /> 内存使用</>} 
      loading={loading} 
      style={{marginBottom: isMobile ? 8 : 16, borderRadius: '8px', minHeight: isMobile ? 'auto' : '200px'}} 
      size={isMobile ? "small" : "default"}
    >
      <Progress 
        type="dashboard" 
        percent={Math.round(systemInfo?.memory.percent || 0)} 
        status={systemInfo?.memory.percent && systemInfo.memory.percent > 80 ? 'exception' : 'normal'} 
        format={percent => `${Math.round(percent || 0)}%`}
        width={isMobile ? 80 : 120}
      />
      <Statistic 
        title="使用/总量" 
        value={systemInfo ? formatGBPair(systemInfo.memory.used, systemInfo.memory.total) : '-'} 
      />
    </Card>
  );

  // 渲染磁盘卡片
  const renderDiskCard = () => (
    <Card 
      title={<><HddOutlined /> 磁盘使用</>} 
      loading={loading} 
      style={{marginBottom: isMobile ? 8 : 16, borderRadius: '8px', minHeight: isMobile ? 'auto' : '200px'}} 
      size={isMobile ? "small" : "default"}
    >
      <Progress 
        type="dashboard" 
        percent={Math.round(systemInfo?.disk.percent || 0)}
        status={systemInfo?.disk.percent && systemInfo.disk.percent > 80 ? 'exception' : 'normal'} 
        format={percent => `${Math.round(percent || 0)}%`}
        width={isMobile ? 80 : 120}
      />
      <Statistic 
        title="使用/总量" 
        value={systemInfo ? formatGBPair(systemInfo.disk.used, systemInfo.disk.total) : '-'} 
      />
    </Card>
  );

  // 渲染网络卡片
  const renderNetworkCard = () => (
    <Card 
      title={<><GlobalOutlined /> 网络状态</>} 
      loading={loading}
      style={{marginBottom: isMobile ? 8 : 16, borderRadius: '8px', minHeight: isMobile ? 'auto' : '200px'}}
      size={isMobile ? "small" : "default"}
    >
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          {/* IPv4 状态行 */}
          <tr>
            <td style={{ padding: '12px 0', width: '80px', fontWeight: 'bold' }}>IPv4</td>
            <td style={{ padding: '12px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <div style={{ 
                  backgroundColor: '#f0f0f0', 
                  width: '30px', 
                  height: '30px', 
                  borderRadius: '4px',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  marginRight: '10px'
                }}>
                  <GlobalOutlined style={{ color: '#1890ff' }} />
                </div>
                <div style={{ 
                  flex: 1, 
                  height: '3px', 
                  backgroundColor: '#e8e8e8', 
                  position: 'relative' 
                }}>
                  <div style={{ 
                    position: 'absolute', 
                    left: '25%', 
                    top: '-8px', 
                    width: '18px', 
                    height: '18px', 
                    borderRadius: '50%', 
                    backgroundColor: '#1890ff',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    color: 'white',
                    fontSize: '12px'
                  }}>
                    ✓
                  </div>
                  <div style={{ 
                    position: 'absolute', 
                    left: '60%', 
                    top: '-8px', 
                    width: '18px', 
                    height: '18px', 
                    borderRadius: '50%', 
                    backgroundColor: '#1890ff',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    color: 'white',
                    fontSize: '12px'
                  }}>
                    ✓
                  </div>
                  <div style={{ 
                    position: 'absolute', 
                    right: '0', 
                    top: '-8px', 
                    width: '18px', 
                    height: '18px', 
                    borderRadius: '50%', 
                    backgroundColor: '#f0f0f0',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    color: '#1890ff',
                    fontSize: '12px',
                    border: '1px solid #1890ff'
                  }}>
                    <GlobalOutlined style={{ fontSize: '10px' }} />
                  </div>
                </div>
              </div>
            </td>
          </tr>
          
          {/* IPv4地址行 */}
          <tr>
            <td style={{ padding: '12px 0', fontWeight: 'bold' }}>IPv4公网地址</td>
            <td style={{ padding: '12px 0' }}>
              {systemInfo?.network?.public_ip?.ipv4 || '未获取到'}
            </td>
          </tr>
          
          {/* IPv6 状态行 */}
          <tr>
            <td style={{ padding: '12px 0', width: '80px', fontWeight: 'bold' }}>IPv6</td>
            <td style={{ padding: '12px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <div style={{ 
                  backgroundColor: '#f0f0f0', 
                  width: '30px', 
                  height: '30px', 
                  borderRadius: '4px',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  marginRight: '10px'
                }}>
                  <GlobalOutlined style={{ color: systemInfo?.network?.public_ip?.ipv6 ? '#1890ff' : '#ff4d4f' }} />
                </div>
                <div style={{ 
                  flex: 1, 
                  height: '3px', 
                  backgroundColor: '#e8e8e8', 
                  position: 'relative' 
                }}>
                  {systemInfo?.network?.public_ip?.ipv6 ? (
                    <>
                      <div style={{ 
                        position: 'absolute', 
                        left: '50%', 
                        top: '-8px', 
                        width: '18px', 
                        height: '18px', 
                        borderRadius: '50%', 
                        backgroundColor: '#1890ff',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        color: 'white',
                        fontSize: '12px'
                      }}>
                        ✓
                      </div>
                      <div style={{ 
                        position: 'absolute', 
                        right: '0', 
                        top: '-8px', 
                        width: '18px', 
                        height: '18px', 
                        borderRadius: '50%', 
                        backgroundColor: '#f0f0f0',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        color: '#1890ff',
                        fontSize: '12px',
                        border: '1px solid #1890ff'
                      }}>
                        <GlobalOutlined style={{ fontSize: '10px' }} />
                      </div>
                    </>
                  ) : (
                    <div style={{ 
                      position: 'absolute', 
                      left: '50%', 
                      top: '-8px', 
                      width: '18px', 
                      height: '18px', 
                      borderRadius: '50%', 
                      backgroundColor: '#ff4d4f',
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                      color: 'white',
                      fontSize: '12px'
                    }}>
                      ✗
                    </div>
                  )}
                </div>
              </div>
            </td>
          </tr>
          
          {/* IPv6地址行 */}
          <tr>
            <td style={{ padding: '12px 0', fontWeight: 'bold' }}>IPv6公网地址</td>
            <td style={{ padding: '12px 0' }}>
              {systemInfo?.network?.public_ip?.ipv6 || '未获取到'}
            </td>
          </tr>
        </tbody>
      </table>
    </Card>
  );

  // 渲染已安装游戏卡片
  const renderInstalledGamesCard = () => (
    <Card 
      title={<><AppstoreOutlined /> 已安装游戏 ({installedGames.length})</>} 
      extra={<Tag color="blue">{formatSize(installedGames.reduce((acc, game) => acc + (game.size_mb || 0), 0))}</Tag>}
      loading={loading}
      style={{marginBottom: isMobile ? 8 : 16, borderRadius: '8px', minHeight: isMobile ? 'auto' : '200px'}}
      size={isMobile ? "small" : "default"}
    >
      <Table 
        dataSource={installedGames} 
        columns={isMobile ? getMobileInstalledGamesColumns() : installedGamesColumns} 
        rowKey="id"
        pagination={false}
        size={isMobile ? "small" : "default"}
        locale={{ emptyText: '暂无已安装游戏' }}
        scroll={isMobile ? { x: '100%' } : undefined}
      />
    </Card>
  );

  // 渲染正在运行的服务器卡片
  const renderRunningGamesCard = () => (
    <Card 
      title={<><RocketOutlined /> 正在运行的服务器 ({runningGames.length})</>}
      loading={loading}
      style={{marginBottom: isMobile ? 8 : 16, borderRadius: '8px', minHeight: isMobile ? 'auto' : '200px'}}
      size={isMobile ? "small" : "default"}
    >
      <Table 
        dataSource={runningGames} 
        columns={isMobile ? getMobileRunningGamesColumns() : runningGamesColumns} 
        rowKey="id"
        pagination={false}
        size={isMobile ? "small" : "default"}
        locale={{ emptyText: '暂无正在运行的服务器' }}
        scroll={isMobile ? { x: '100%' } : undefined}
      />
    </Card>
  );

  // 渲染系统进程卡片
  const renderProcessesCard = () => (
    <Card 
      title={<><DesktopOutlined /> 系统进程 ({processes.length})</>}
      extra={
        <Button 
          size="small" 
          icon={<ReloadOutlined />} 
          onClick={fetchProcesses}
          loading={processLoading}
        >
          刷新
        </Button>
      }
      loading={processLoading}
      style={{marginBottom: isMobile ? 8 : 16, borderRadius: '8px', minHeight: isMobile ? 'auto' : '200px'}}
      size={isMobile ? "small" : "default"}
    >
      <Table 
        dataSource={processes} 
        columns={isMobile ? getMobileProcessColumns() : processColumns} 
        rowKey="pid"
        pagination={{
          pageSize: isMobile ? 5 : 10,
          showSizeChanger: false,
          showQuickJumper: false,
          size: 'small'
        }}
        size={isMobile ? "small" : "default"}
        locale={{ emptyText: '暂无进程信息' }}
        scroll={isMobile ? { x: '100%' } : { y: 300 }}
      />
    </Card>
  );

  // 渲染活跃端口卡片
  const renderPortsCard = () => (
    <Card 
      title={<><ApiOutlined /> 活跃端口 ({ports.length})</>}
      extra={
        <Button 
          size="small" 
          icon={<ReloadOutlined />} 
          onClick={fetchPorts}
          loading={portLoading}
        >
          刷新
        </Button>
      }
      loading={portLoading}
      style={{marginBottom: isMobile ? 8 : 16, borderRadius: '8px', minHeight: isMobile ? 'auto' : '200px'}}
      size={isMobile ? "small" : "default"}
    >
      <Table 
        dataSource={ports} 
        columns={isMobile ? getMobilePortColumns() : portColumns} 
        rowKey={(record) => `${record.port}-${record.address}`}
        pagination={{
          pageSize: isMobile ? 5 : 10,
          showSizeChanger: false,
          showQuickJumper: false,
          size: 'small'
        }}
        size={isMobile ? "small" : "default"}
        locale={{ emptyText: '暂无端口信息' }}
        scroll={isMobile ? { x: '100%' } : { y: 300 }}
      />
    </Card>
  );

  // 根据卡片类型渲染对应的卡片
  const renderCard = (config: CardConfig) => {
    switch (config.type) {
      case 'cpu':
        return renderCpuCard();
      case 'memory':
        return renderMemoryCard();
      case 'disk':
        return renderDiskCard();
      case 'network':
        return renderNetworkCard();
      case 'installedGames':
        return renderInstalledGamesCard();
      case 'runningGames':
        return renderRunningGamesCard();
      case 'processes':
        return renderProcessesCard();
      case 'ports':
        return renderPortsCard();
      default:
        return null;
    }
  };

  // 渲染简单的网络流量图表
  const renderNetworkChart = (data: number[], color: string) => {
    if (data.length < 2) return null;
    
    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;
    
    return (
      <div style={{ height: '40px', display: 'flex', alignItems: 'flex-end' }}>
        {data.map((value, index) => {
          const height = ((value - min) / range) * 100;
          return (
            <div 
              key={index}
              style={{
                height: `${Math.max(5, height)}%`,
                backgroundColor: color,
                flex: 1,
                margin: '0 1px',
                borderRadius: '1px'
              }}
            />
          );
        })}
      </div>
    );
  };

  const installedGamesColumns = [
    {
      title: '游戏名称',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: GameInfo) => (
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span>{name}</span>
          {record.external && <Tag color="orange" style={{ marginLeft: 8 }}>外来</Tag>}
        </div>
      ),
    },
    {
      title: '占用空间',
      dataIndex: 'size_mb',
      key: 'size',
      render: (size_mb: number) => formatSize(size_mb),
    },
    {
      title: '操作',
      key: 'action',
      render: (_, record: GameInfo) => (
        <Space size="small" wrap={isMobile}>
          {runningGames.some(game => game.id === record.id) ? (
            <Dropdown overlay={
              <Menu>
                <Menu.Item key="1" onClick={() => onStopServer && onStopServer(record.id, false)}>
                  标准停止(Ctrl+C)
                </Menu.Item>
                <Menu.Item key="2" danger onClick={() => onStopServer && onStopServer(record.id, true)}>
                  强行停止(Kill)
                </Menu.Item>
              </Menu>
            } trigger={['click']} overlayClassName="stop-server-dropdown">
              <Button size={isMobile ? "small" : "middle"} danger>
                停止 <DownOutlined />
              </Button>
            </Dropdown>
          ) : (
            <Button size={isMobile ? "small" : "middle"} type="primary" onClick={() => onStartServer && onStartServer(record.id)}>启动</Button>
          )}
          <Button size={isMobile ? "small" : "middle"} danger onClick={() => onUninstallGame && onUninstallGame(record.id)}>卸载</Button>
        </Space>
      ),
    },
  ];

  const runningGamesColumns = [
    {
      title: '游戏名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '运行时间',
      dataIndex: 'uptime',
      key: 'uptime',
      render: (uptime: number) => formatUptime(uptime),
    },
    {
      title: '操作',
      key: 'action',
      render: (_, record: GameInfo) => (
        <Dropdown overlay={
          <Menu>
            <Menu.Item key="1" onClick={() => onStopServer && onStopServer(record.id, false)}>
              标准停止(Ctrl+C)
            </Menu.Item>
            <Menu.Item key="2" danger onClick={() => onStopServer && onStopServer(record.id, true)}>
              强行停止(Kill)
            </Menu.Item>
          </Menu>
        } trigger={['click']} overlayClassName="stop-server-dropdown">
          <Button size={isMobile ? "small" : "middle"} danger>
            停止服务器 <DownOutlined />
          </Button>
        </Dropdown>
      ),
    },
  ];

  // 为移动端设计的列
  const getMobileInstalledGamesColumns = () => {
    return [
      {
        title: '游戏信息',
        key: 'info',
        render: (_, record: GameInfo) => (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontWeight: 'bold' }}>{record.name}</span>
              {record.external && <Tag color="orange" style={{ marginLeft: 8 }}>外来</Tag>}
            </div>
            <div style={{ fontSize: '12px', color: '#888', marginBottom: 8 }}>
              占用空间: {formatSize(record.size_mb || 0)}
            </div>
            <Space size="small" wrap>
              {runningGames.some(game => game.id === record.id) ? (
                <Dropdown overlay={
                  <Menu>
                    <Menu.Item key="1" onClick={() => onStopServer && onStopServer(record.id, false)}>
                      标准停止(Ctrl+C)
                    </Menu.Item>
                    <Menu.Item key="2" danger onClick={() => onStopServer && onStopServer(record.id, true)}>
                      强行停止(Kill)
                    </Menu.Item>
                  </Menu>
                } trigger={['click']} overlayClassName="stop-server-dropdown">
                  <Button size="small" danger>
                    停止 <DownOutlined />
                  </Button>
                </Dropdown>
              ) : (
                <Button size="small" type="primary" onClick={() => onStartServer && onStartServer(record.id)}>启动</Button>
              )}
              <Button size="small" danger onClick={() => onUninstallGame && onUninstallGame(record.id)}>卸载</Button>
            </Space>
          </div>
        ),
      },
    ];
  };

  const getMobileRunningGamesColumns = () => {
    return [
      {
        title: '服务器信息',
        key: 'info',
        render: (_, record: GameInfo) => (
          <div>
            <div style={{ fontWeight: 'bold', marginBottom: 8 }}>{record.name}</div>
            <div style={{ fontSize: '12px', color: '#888', marginBottom: 8 }}>
              运行时间: {formatUptime(record.uptime || 0)}
            </div>
            <Dropdown overlay={
              <Menu>
                <Menu.Item key="1" onClick={() => onStopServer && onStopServer(record.id, false)}>
                  标准停止(Ctrl+C)
                </Menu.Item>
                <Menu.Item key="2" danger onClick={() => onStopServer && onStopServer(record.id, true)}>
                  强行停止(Kill)
                </Menu.Item>
              </Menu>
            } trigger={['click']} overlayClassName="stop-server-dropdown">
              <Button size="small" danger>
                停止服务器 <DownOutlined />
              </Button>
            </Dropdown>
          </div>
        ),
      },
    ];
  };

  // 检查资源使用率是否超过阈值
  const hasHighResourceUsage = () => {
    if (!systemInfo) return false;
    return (systemInfo.memory.percent > 80 || systemInfo.disk.percent > 80);
  };

  // 生成警告消息
  const getResourceWarningMessage = () => {
    if (!systemInfo) return '';
    
    let messages = [];
    if (systemInfo.memory.percent > 80) {
      messages.push(`内存使用率 ${Math.round(systemInfo.memory.percent)}%`);
    }
    if (systemInfo.disk.percent > 80) {
      messages.push(`磁盘使用率 ${Math.round(systemInfo.disk.percent)}%`);
    }
    
    return messages.join(' 和 ');
  };

  return (
    <div className="container-info" style={{ width: '100%', maxWidth: '100%' }}>
      <div className="page-header">
        <Title level={isMobile ? 3 : 2}>容器信息面板</Title>
        <Paragraph>
          查看容器资源占用情况、已安装游戏和正在运行的游戏服务器
        </Paragraph>
        <Space>
          <Button
            type="primary"
            icon={<ReloadOutlined />}
            onClick={fetchContainerInfo}
            loading={loading}
            size={isMobile ? "small" : "middle"}
          >
            刷新信息
          </Button>
          <Button 
            icon={isDragMode ? <SettingOutlined /> : <DragOutlined />} 
            onClick={() => setIsDragMode(!isDragMode)}
            type={isDragMode ? "primary" : "default"}
            size={isMobile ? "small" : "middle"}
          >
            {isDragMode ? '完成布局' : '自定义布局'}
          </Button>
          <Button 
            icon={<SettingOutlined />} 
            onClick={() => setSettingsVisible(true)}
            size={isMobile ? "small" : "middle"}
          >
            卡片设置
          </Button>
        </Space>
      </div>

      {hasHighResourceUsage() && (
        <Alert
          message="资源使用警告"
          description={`${getResourceWarningMessage()}已超过80%，请注意系统稳定性！`}
          type="error"
          showIcon
          icon={<WarningOutlined />}
          style={{ marginTop: 16, marginBottom: 16 }}
        />
      )}

      {isDragMode && (
        <Alert
          message="拖拽模式"
          description="您现在可以拖拽卡片来重新排列它们的位置。拖拽完成后点击'完成布局'按钮保存更改。"
          type="info"
          showIcon
          style={{ marginTop: 16, marginBottom: 16 }}
        />
      )}

      <Divider />

      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="cards" direction="vertical">
          {(provided) => (
            <div {...provided.droppableProps} ref={provided.innerRef}>
              <Row gutter={isMobile ? 8 : 16}>
                {cardConfigs
                  .filter(config => config.visible)
                  .map((config, index) => {
                    // 根据卡片类型确定栅格布局
                    const getColSpan = () => {
                      if (isMobile) return 24;
                      return config.span;
                    };

                    return (
                      <Draggable 
                        key={config.id} 
                        draggableId={config.id} 
                        index={index}
                        isDragDisabled={!isDragMode}
                      >
                        {(provided, snapshot) => (
                          <Col 
                            span={getColSpan()}
                            style={{
                              marginBottom: 16
                            }}
                          >
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              style={{
                                height: '100%',
                                ...provided.draggableProps.style,
                                transform: snapshot.isDragging 
                                  ? provided.draggableProps.style?.transform 
                                  : 'none'
                              }}
                            >
                              <div 
                                style={{
                                  position: 'relative',
                                  height: '100%',
                                  border: isDragMode ? '2px dashed #d9d9d9' : 'none',
                                  borderRadius: '8px',
                                  padding: isDragMode ? '8px' : '0',
                                  backgroundColor: snapshot.isDragging ? '#f0f0f0' : 'transparent'
                                }}
                              >
                                {isDragMode && (
                                  <div 
                                    {...provided.dragHandleProps}
                                    style={{
                                      position: 'absolute',
                                      top: '16px',
                                      right: '16px',
                                      zIndex: 1000,
                                      cursor: 'grab',
                                      padding: '4px',
                                      backgroundColor: '#1890ff',
                                      color: 'white',
                                      borderRadius: '4px',
                                      fontSize: '12px'
                                    }}
                                  >
                                    <DragOutlined />
                                  </div>
                                )}
                                {renderCard(config)}
                              </div>
                            </div>
                          </Col>
                        )}
                      </Draggable>
                    );
                  })
                }
              </Row>
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      {/* 卡片设置模态框 */}
      <Modal
        title="卡片显示设置"
        open={settingsVisible}
        onCancel={() => setSettingsVisible(false)}
        footer={[
          <Button key="reset" onClick={resetCardConfigs}>
            重置为默认
          </Button>,
          <Button key="close" type="primary" onClick={() => setSettingsVisible(false)}>
            关闭
          </Button>
        ]}
        width={600}
      >
        <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
          {cardConfigs.map(config => (
            <div 
              key={config.id} 
              style={{ 
                padding: '16px 0',
                borderBottom: '1px solid #f0f0f0'
              }}
            >
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                marginBottom: '12px'
              }}>
                <span style={{ fontWeight: config.visible ? 'normal' : '300', color: config.visible ? '#000' : '#999' }}>
                  {config.title}
                </span>
                <Button
                  size="small"
                  type={config.visible ? "primary" : "default"}
                  onClick={() => toggleCardVisibility(config.id)}
                >
                  {config.visible ? '隐藏' : '显示'}
                </Button>
              </div>
              {config.visible && !isMobile && (
                <div style={{ paddingLeft: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '12px', color: '#666', minWidth: '60px' }}>宽度:</span>
                    <Slider
                      min={6}
                      max={24}
                      step={2}
                      value={config.span}
                      onChange={(value) => updateCardSpan(config.id, value)}
                      style={{ flex: 1 }}
                      marks={{
                        6: '1/4',
                        8: '1/3', 
                        12: '1/2',
                        16: '2/3',
                        24: '全宽'
                      }}
                    />
                    <span style={{ fontSize: '12px', color: '#999', minWidth: '40px' }}>{config.span}/24</span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
        <div style={{ marginTop: 16, padding: '12px', backgroundColor: '#f9f9f9', borderRadius: '4px' }}>
          <p style={{ margin: 0, fontSize: '12px', color: '#666' }}>
            💡 提示：
          </p>
          <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#666' }}>
            • 点击"自定义布局"按钮可以拖拽重新排列卡片顺序
          </p>
          <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#666' }}>
            • 调整宽度滑块可以控制卡片在同一行的并排显示
          </p>
          <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#666' }}>
            • 宽度值越小，同一行可以并排显示的卡片越多
          </p>
        </div>
      </Modal>
    </div>
  );
};

export default ContainerInfo;