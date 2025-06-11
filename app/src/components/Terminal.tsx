import React, { useEffect, useRef, memo, useState } from 'react';
import { Spin, Modal, Input, Button } from 'antd';
import { StopOutlined, HistoryOutlined } from '@ant-design/icons';

interface TerminalProps {
  output: (string | { prompt?: string; line?: string })[];
  loading: boolean;
  complete: boolean;
  gameId?: string;
  onSendInput?: (gameId: string, value: string) => void;
  allowInput?: boolean;  // 是否允许在终端直接输入
  onTerminate?: (gameId: string) => void; // 新增终止安装的回调
}

// ANSI颜色码映射
const ansiColorMap: { [key: string]: string } = {
  // 标准色
  '30': '#000', // 黑
  '31': '#ff4d4f', // 红
  '32': '#00ff90', // 绿
  '33': '#ffe066', // 黄
  '34': '#40a9ff', // 蓝
  '35': '#b37feb', // 洋红
  '36': '#36cfc9', // 青
  '37': '#fff', // 白
  // 亮色
  '90': '#434343', // 亮黑
  '91': '#ff7875', // 亮红
  '92': '#95de64', // 亮绿
  '93': '#fff566', // 亮黄
  '94': '#69c0ff', // 亮蓝
  '95': '#d3adf7', // 亮洋红
  '96': '#5cdbd3', // 亮青
  '97': '#fff', // 亮白
};

// 解析ANSI颜色和样式
const parseColoredText = (text: string): React.ReactNode => {
  // 首先清理所有ANSI控制序列（非颜色相关的）
  let cleanedText = text
    // 清除光标位置控制序列
    .replace(/\u001b\[\d*[ABCDEFGHJKST]/g, '')
    // 清除光标位置设置序列 [H, [f
    .replace(/\u001b\[\d*;?\d*[Hf]/g, '')
    // 清除清屏序列 [J, [K
    .replace(/\u001b\[\d*[JK]/g, '')
    // 清除设备状态报告等控制序列
    .replace(/\u001b\[\d*[nR]/g, '')
    // 清除其他控制序列
    .replace(/\u001b\[[0-9;]*[a-zA-Z]/g, (match) => {
      // 保留颜色相关的序列（以m结尾）
      if (match.endsWith('m')) {
        return match;
      }
      return '';
    })
    // 清除非标准的控制字符
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // 匹配颜色相关的ANSI转义序列
  const ansiRegex = /\u001b\[([0-9;]+)m/g;
  let result: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let styleStack: any = {};
  let keyIndex = 0;

  while ((match = ansiRegex.exec(cleanedText)) !== null) {
    // 添加前面的普通文本
    if (match.index > lastIndex) {
      const textContent = cleanedText.substring(lastIndex, match.index);
      if (textContent) {
        result.push(
          <span key={`text-${keyIndex++}`} style={{ ...styleStack }}>{textContent}</span>
        );
      }
    }
    // 解析ANSI参数
    const params = match[1].split(';');
    params.forEach(param => {
      if (param === '0') {
        // 重置
        styleStack = {};
      } else if (param === '1') {
        styleStack.fontWeight = 'bold';
      } else if (param === '4') {
        styleStack.textDecoration = 'underline';
      } else if (param === '7') {
        styleStack.filter = 'invert(100%)'; // 反色
      } else if (ansiColorMap[param]) {
        styleStack.color = ansiColorMap[param];
      } else if (param === '39') {
        // 默认前景色
        styleStack.color = undefined;
      } else if (param === '49') {
        // 默认背景色
        styleStack.background = undefined;
      } else if (/^4[0-7]$/.test(param)) {
        // 背景色 40-47
        const bgColor = ansiColorMap[(+param - 10).toString()];
        if (bgColor) styleStack.background = bgColor;
      } else if (/^10[0-7]$/.test(param)) {
        // 亮背景色 100-107
        const bgColor = ansiColorMap[(+param - 60).toString()];
        if (bgColor) styleStack.background = bgColor;
      }
    });
    lastIndex = ansiRegex.lastIndex;
  }
  // 添加剩余文本
  if (lastIndex < cleanedText.length) {
    const remainingText = cleanedText.substring(lastIndex);
    if (remainingText) {
      result.push(
        <span key={`text-${keyIndex++}`} style={{ ...styleStack }}>{remainingText}</span>
      );
    }
  }
  
  // 如果没有任何内容，返回清理后的文本
  if (result.length === 0 && cleanedText) {
    return <span>{cleanedText}</span>;
  }
  
  return result.length > 0 ? <>{result}</> : null;
};

// 使用memo优化Terminal组件，避免不必要的重新渲染
const Terminal: React.FC<TerminalProps> = memo(({ output, loading, complete, gameId, onSendInput, allowInput, onTerminate }) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const [terminalInput, setTerminalInput] = useState('');
  const [promptVisible, setPromptVisible] = useState(false);
  const [promptMsg, setPromptMsg] = useState('');
  const [inputValue, setInputValue] = useState('');
  const [terminateConfirmVisible, setTerminateConfirmVisible] = useState(false);
  const [showFullHistory, setShowFullHistory] = useState(false);
  const [historyModalVisible, setHistoryModalVisible] = useState(false);
  
  // 确保有终端滚动到最新输出
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [output]);
  
  // 检查输出中是否有需要输入的提示
  useEffect(() => {
    if (!output.length) return;
    
    const lastOutput = output[output.length - 1];
    if (typeof lastOutput === 'object' && lastOutput.prompt) {
      setPromptMsg(lastOutput.prompt);
      setPromptVisible(true);
    }
  }, [output]);
  
  // 处理连接错误
  useEffect(() => {
    // 如果终端完成但没有明确的完成消息，添加一个
    if (complete && output.length > 0) {
      // console.log('终端完成状态变化:', complete);
      const lastOutput = output[output.length - 1];
      if (typeof lastOutput === 'object' && !lastOutput.line?.includes('已结束') && !lastOutput.line?.includes('已停止')) {
        if (terminalRef.current) {
          const errorDiv = document.createElement('div');
          errorDiv.className = 'terminal-error';
          errorDiv.textContent = '连接已断开，服务器可能已停止';
          terminalRef.current.appendChild(errorDiv);
        }
      }
      
      // 检查是否有错误详情
      if (typeof lastOutput === 'object' && lastOutput.error_details) {
        if (terminalRef.current) {
          const errorDetailsDiv = document.createElement('div');
          errorDetailsDiv.className = 'terminal-error-details';
          errorDetailsDiv.style.color = '#ff4d4f';
          errorDetailsDiv.style.whiteSpace = 'pre-wrap';
          errorDetailsDiv.style.fontWeight = 'bold';
          errorDetailsDiv.textContent = lastOutput.error_details;
          terminalRef.current.appendChild(errorDetailsDiv);
        }
      }
    }
  }, [complete, output]);
  
  // 处理终端输入提交
  const handleInputSubmit = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && terminalInput.trim() && onSendInput && gameId) {
      onSendInput(gameId, terminalInput);
      setTerminalInput('');
    }
  };
  
  // 处理验证码/令牌提交
  const handlePromptOk = () => {
    if (inputValue.trim() && onSendInput && gameId) {
      onSendInput(gameId, inputValue);
      setInputValue('');
      setPromptVisible(false);
    }
  };
  
  // 处理终止安装
  const handleTerminate = () => {
    setTerminateConfirmVisible(true);
  };
  
  // 确认终止安装
  const confirmTerminate = () => {
    if (onTerminate && gameId) {
      // 获取认证令牌
      const token = localStorage.getItem('auth_token');
      if (!token) {
        // 如果没有令牌，提示用户登录
        Modal.error({
          title: '认证错误',
          content: '您需要登录才能执行此操作'
        });
        return;
      }
      
      onTerminate(gameId);
    }
    setTerminateConfirmVisible(false);
  };

  // 获取要显示的输出内容
  const getDisplayOutput = () => {
    if (showFullHistory || output.length <= 20) {
      return output;
    }
    return output.slice(-20); // 只显示最后20行
  };

  const displayOutput = getDisplayOutput();
  const hasMoreHistory = output.length > 20 && !showFullHistory;

  return (
    <div className="terminal-container">
      {/* 终端头部工具栏 */}
      <div className="terminal-header">
        <div className="terminal-info">
          <span>输出日志 ({output.length} 行)</span>
          {hasMoreHistory && (
            <span style={{ color: '#faad14', marginLeft: '8px' }}>
              (显示最后 20 行)
            </span>
          )}
        </div>
        <div className="terminal-actions">
          {output.length > 20 && (
            <Button
              size="small"
              icon={<HistoryOutlined />}
              onClick={() => setHistoryModalVisible(true)}
              style={{ marginRight: '8px' }}
            >
              查看历史输出
            </Button>
          )}
          {hasMoreHistory && (
            <Button
              size="small"
              type="link"
              onClick={() => setShowFullHistory(true)}
              style={{ color: '#1890ff' }}
            >
              显示全部
            </Button>
          )}
          {showFullHistory && output.length > 20 && (
            <Button
              size="small"
              type="link"
              onClick={() => setShowFullHistory(false)}
              style={{ color: '#1890ff' }}
            >
              显示最新20行
            </Button>
          )}
        </div>
      </div>
      
      <div className="terminal" ref={terminalRef}>
        {displayOutput.map((line, index) => {
          if (typeof line === 'object' && line.prompt) {
            return <div key={index} style={{ color: '#ff4d4f' }}>{line.prompt}</div>;
          }
          if (typeof line === 'object' && line.line) {
            return <div key={index}>{parseColoredText(line.line)}</div>;
          }
          if (typeof line === 'object' && line.complete && line.status === 'error') {
            return (
              <div key={index} style={{ color: '#ff4d4f', fontWeight: 'bold' }}>
                {line.message}
              </div>
            );
          }
          return <div key={index}>{parseColoredText(line as string)}</div>;
        })}
        {loading && (
          <div className="terminal-loading">
            <Spin size="small" /> 任务进行中...
          </div>
        )}
        {complete && (
          <div className="terminal-complete">
            ===== 进程已结束 =====
          </div>
        )}
      </div>
      
      {/* 添加终端输入框 */}
      {allowInput && !complete && onSendInput && gameId && (
        <div className="terminal-input-container">
          <Input
            value={terminalInput}
            onChange={e => setTerminalInput(e.target.value)}
            onKeyPress={handleInputSubmit}
            placeholder="输入命令并按回车发送..."
            prefix={<span style={{ color: '#1890ff' }}>❯</span>}
            autoFocus
          />
        </div>
      )}
      
      {/* 终止安装按钮 - 移至底部 */}
      {loading && onTerminate && gameId && (
        <div style={{ padding: '10px', textAlign: 'center' }}>
          <Button 
            danger
            icon={<StopOutlined />}
            onClick={handleTerminate}
            style={{ width: '150px' }}
          >
            终止安装
          </Button>
        </div>
      )}
      
      {/* 验证码输入对话框 */}
      <Modal
        title="需要输入"
        open={promptVisible}
        onOk={handlePromptOk}
        onCancel={() => setPromptVisible(false)}
        okText="提交"
        cancelText="取消"
        maskClosable={false}
        destroyOnClose
      >
        <div style={{ marginBottom: 12 }}>{promptMsg}</div>
        <Input.Password
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          autoFocus
          placeholder="请输入验证码/令牌"
          onPressEnter={handlePromptOk}
        />
      </Modal>
      
      {/* 终止安装确认对话框 */}
      <Modal
        title="确认终止安装"
        open={terminateConfirmVisible}
        onOk={confirmTerminate}
        onCancel={() => setTerminateConfirmVisible(false)}
        okText="确认终止"
        cancelText="取消"
        okButtonProps={{ danger: true }}
      >
        <p>确定要终止当前游戏的安装过程吗？</p>
        <p>终止安装可能会导致游戏文件不完整，需要重新安装。</p>
      </Modal>
      
      {/* 历史输出查看对话框 */}
      <Modal
        title={`历史输出日志 (共 ${output.length} 行)`}
        open={historyModalVisible}
        onCancel={() => setHistoryModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setHistoryModalVisible(false)}>
            关闭
          </Button>
        ]}
        width={1000}
        style={{ top: 20 }}
        bodyStyle={{ padding: 0 }}
      >
        <div className="terminal-history-modal">
          <div className="terminal-history-content">
            {output.map((line, index) => {
              if (typeof line === 'object' && line.prompt) {
                return (
                  <div key={index} className="terminal-history-line" style={{ color: '#ff4d4f' }}>
                    <span className="line-number">{index + 1}</span>
                    {line.prompt}
                  </div>
                );
              }
              if (typeof line === 'object' && line.line) {
                return (
                  <div key={index} className="terminal-history-line">
                    <span className="line-number">{index + 1}</span>
                    {parseColoredText(line.line)}
                  </div>
                );
              }
              if (typeof line === 'object' && line.complete && line.status === 'error') {
                return (
                  <div key={index} className="terminal-history-line" style={{ color: '#ff4d4f', fontWeight: 'bold' }}>
                    <span className="line-number">{index + 1}</span>
                    {line.message}
                  </div>
                );
              }
              return (
                <div key={index} className="terminal-history-line">
                  <span className="line-number">{index + 1}</span>
                  {parseColoredText(line as string)}
                </div>
              );
            })}
          </div>
        </div>
      </Modal>
    </div>
  );
});

export default Terminal;