import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { Button, Input, Space, Tooltip, Modal } from 'antd';
import { ClearOutlined, SearchOutlined, HistoryOutlined, ReloadOutlined, CopyOutlined } from '@ant-design/icons';

interface SimpleServerTerminalProps {
  outputs: string[];
  onSendCommand?: (command: string) => void;
  onClear?: () => void;
  onReconnect?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

interface SimpleServerTerminalRef {
  write: (data: string) => void;
  writeln: (data: string) => void;
  clear: () => void;
  focus: () => void;
  scrollToBottom: () => void;
}

const SimpleServerTerminal = forwardRef<SimpleServerTerminalRef, SimpleServerTerminalProps>((
  { outputs, onSendCommand, onClear, onReconnect, className = '', style = {} },
  ref
) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<any>(null);
  const [commandInput, setCommandInput] = useState('');
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [cursorPosition, setCursorPosition] = useState({ x: 0, y: 0 });
  const [isTerminalFocused, setIsTerminalFocused] = useState(false);

  // 滚动到底部
  const scrollToBottom = () => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  };

  // 当输出更新时滚动到底部
  useEffect(() => {
    scrollToBottom();
  }, [outputs]);

  // 暴露方法给父组件
  useImperativeHandle(ref, () => ({
    write: (data: string) => {
      // 这里可以添加实时写入逻辑
      console.log('Terminal write:', data);
    },
    writeln: (data: string) => {
      // 这里可以添加实时写入逻辑
      console.log('Terminal writeln:', data);
    },
    clear: () => {
      if (onClear) {
        onClear();
      }
    },
    focus: () => {
      if (inputRef.current) {
        inputRef.current.focus();
      }
    },
    scrollToBottom
  }));

  // 处理命令发送
  const handleSendCommand = () => {
    console.log("SimpleServerTerminal attempt to send:", commandInput);
    console.log("SimpleServerTerminal: typeof onSendCommand is", typeof onSendCommand);
    console.log("SimpleServerTerminal: commandInput.trim() is", `"${commandInput.trim()}"`);
    console.log("SimpleServerTerminal: commandInput.trim() ? is true : is false ->", commandInput.trim() ? true : false);

    if (onSendCommand && commandInput.trim()) {
      console.log("SimpleServerTerminal: Condition met, calling onSendCommand prop.");
      onSendCommand(commandInput.trim());
      
      // 添加到历史记录
      setCommandHistory(prev => {
        const newHistory = [...prev, commandInput.trim()];
        return newHistory.slice(-50); // 保留最近50条
      });
      setHistoryIndex(-1);
      setCommandInput('');
    } else {
      console.log("SimpleServerTerminal: Condition NOT met (onSendCommand or commandInput.trim() is falsy).");
    }
  };

  // 处理键盘事件
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      // handleSendCommand(); // 移除这行，因为 onSearch 会处理回车
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistory.length > 0 && historyIndex < commandHistory.length - 1) {
        const newIndex = historyIndex + 1;
        setHistoryIndex(newIndex);
        setCommandInput(commandHistory[commandHistory.length - 1 - newIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setCommandInput(commandHistory[commandHistory.length - 1 - newIndex]);
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setCommandInput('');
      }
    }
  };

  // 处理终端点击事件（模拟光标定位）
  const handleTerminalClick = (e: React.MouseEvent) => {
    const rect = terminalRef.current?.getBoundingClientRect();
    if (rect) {
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setCursorPosition({ x, y });
      setIsTerminalFocused(true);
      
      // 聚焦到输入框 (注释掉或移除此行以防止自动聚焦)
      // if (inputRef.current) {
      //   inputRef.current.focus();
      // }
    }
  };

  // 处理搜索
  const handleSearch = (term: string) => {
    if (!term) return;
    
    const terminalElement = terminalRef.current;
    if (!terminalElement) return;
    
    // 简单的文本搜索高亮
    const textContent = terminalElement.textContent || '';
    const index = textContent.toLowerCase().indexOf(term.toLowerCase());
    
    if (index !== -1) {
      // 这里可以添加更复杂的搜索高亮逻辑
      console.log('Found search term at index:', index);
    }
  };

  // 复制终端内容
  const handleCopyAll = () => {
    const content = outputs.join('\n');
    navigator.clipboard.writeText(content).then(() => {
      Modal.success({
        title: '复制成功',
        content: '终端内容已复制到剪贴板',
        okText: '确定'
      });
    }).catch(() => {
      Modal.error({
        title: '复制失败',
        content: '无法复制到剪贴板，请手动选择复制',
        okText: '确定'
      });
    });
  };

  // 显示完整历史
  const showFullHistory = () => {
    Modal.info({
      title: '完整终端历史',
      content: (
        <div style={{ 
          maxHeight: '400px', 
          overflow: 'auto',
          fontFamily: 'Consolas, "Courier New", monospace',
          fontSize: '12px',
          backgroundColor: '#1a1a1a',
          color: '#f0f0f0',
          padding: '12px',
          borderRadius: '4px'
        }}>
          {outputs.map((line, index) => (
            <div key={index} style={{ marginBottom: '2px' }}>
              <span style={{ color: '#666', marginRight: '8px' }}>{index + 1}</span>
              <span>{line}</span>
            </div>
          ))}
        </div>
      ),
      width: 800,
      okText: '关闭'
    });
  };

  return (
    <div className={`simple-server-terminal ${className}`} style={style}>
      {/* 工具栏 */}
      <div style={{ 
        padding: '8px 12px', 
        borderBottom: '1px solid #333',
        backgroundColor: '#2a2a2a',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div style={{ color: '#f0f0f0', fontSize: '12px' }}>
          增强终端 - 支持鼠标交互、命令历史和快捷键 | 输出行数: {outputs.length}
        </div>
        <Space size="small">
          <Tooltip title="搜索内容 (Ctrl+F)">
            <Button 
              size="small" 
              icon={<SearchOutlined />}
              onClick={() => setSearchVisible(!searchVisible)}
            />
          </Tooltip>
          <Tooltip title="查看完整历史">
            <Button 
              size="small" 
              icon={<HistoryOutlined />}
              onClick={showFullHistory}
            />
          </Tooltip>
          <Tooltip title="复制全部内容">
            <Button 
              size="small" 
              icon={<CopyOutlined />}
              onClick={handleCopyAll}
            />
          </Tooltip>
          <Tooltip title="重新连接">
            <Button 
              size="small" 
              icon={<ReloadOutlined />}
              onClick={onReconnect}
            />
          </Tooltip>
          <Tooltip title="清空终端">
            <Button 
              size="small" 
              icon={<ClearOutlined />}
              onClick={onClear}
            />
          </Tooltip>
        </Space>
      </div>

      {/* 搜索栏 */}
      {searchVisible && (
        <div style={{ 
          padding: '8px 12px', 
          backgroundColor: '#333',
          borderBottom: '1px solid #444'
        }}>
          <Input.Search
            placeholder="搜索终端内容... (Enter搜索下一个，Shift+Enter搜索上一个)"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onSearch={handleSearch}
            style={{ maxWidth: 400 }}
            size="small"
          />
        </div>
      )}

      {/* 终端输出区域 */}
      <div 
        ref={terminalRef}
        onClick={handleTerminalClick}
        style={{ 
          flex: 1,
          minHeight: '400px',
          maxHeight: '500px',
          overflow: 'auto',
          backgroundColor: '#1a1a1a',
          color: '#f0f0f0',
          fontFamily: 'Consolas, "Courier New", monospace',
          fontSize: '13px',
          padding: '12px',
          cursor: 'text',
          position: 'relative',
          userSelect: 'text'
        }}
      >
        {/* 虚拟光标 */}
        {isTerminalFocused && (
          <div
            style={{
              position: 'absolute',
              left: cursorPosition.x,
              top: cursorPosition.y,
              width: '2px',
              height: '16px',
              backgroundColor: '#00ff00',
              animation: 'blink 1s infinite',
              pointerEvents: 'none'
            }}
          />
        )}
        
        {/* 输出内容 */}
        {outputs.map((line, index) => {
          let lineStyle: React.CSSProperties = { marginBottom: '2px', lineHeight: '1.4' };
          
          // 根据内容类型设置不同颜色
          if (typeof line === 'string') {
            if (line.includes('===')) {
              lineStyle.color = '#74c0fc';
              lineStyle.fontWeight = 'bold';
            } else if (line.includes('[文件]') || line.includes('[文件输出]')) {
              lineStyle.color = '#51cf66';
            } else if (line.includes('[心跳检查]')) {
              lineStyle.color = '#868e96';
            } else if (line.startsWith('>')) {
              lineStyle.color = '#ffd43b';
            } else if (line.includes('错误') || line.includes('Error') || line.includes('error')) {
              lineStyle.color = '#ff6b6b';
            } else if (line.includes('警告') || line.includes('Warning') || line.includes('warning')) {
              lineStyle.color = '#ffd43b';
            } else if (line.includes('成功') || line.includes('Success') || line.includes('success')) {
              lineStyle.color = '#51cf66';
            }
          }
          
          return (
            <div key={index} style={lineStyle}>
              {line}
            </div>
          );
        })}
        
        {/* 终端提示符 */}
        <div style={{ 
          color: '#00ff00', 
          marginTop: '8px',
          display: 'flex',
          alignItems: 'center'
        }}>
          <span>$ </span>
          <span style={{ color: '#f0f0f0', marginLeft: '4px' }}>
            {commandInput}
            <span style={{ 
              animation: 'blink 1s infinite',
              backgroundColor: '#00ff00',
              width: '8px',
              height: '16px',
              display: 'inline-block',
              marginLeft: '2px'
            }}>|</span>
          </span>
        </div>
      </div>

      {/* 命令输入区域 */}
      <div style={{ 
        padding: '8px 12px',
        backgroundColor: '#2a2a2a',
        borderTop: '1px solid #333'
      }}>
        <Input.Search
          ref={inputRef}
          placeholder="输入命令... (↑↓键浏览历史，Enter发送，Ctrl+C清空)"
          value={commandInput}
          onChange={(e) => setCommandInput(e.target.value)}
          onSearch={handleSendCommand}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsTerminalFocused(true)}
          onBlur={() => setIsTerminalFocused(false)}
          enterButton="发送"
          style={{ width: '100%' }}
        />
        <div style={{ 
          marginTop: '4px', 
          fontSize: '11px', 
          color: '#666',
          display: 'flex',
          justifyContent: 'space-between'
        }}>
          <span>快捷键: Ctrl+L清屏 | Ctrl+C中断 | Tab补全</span>
          <span>历史记录: {commandHistory.length} 条</span>
        </div>
      </div>
      
      {/* CSS动画 */}
      <style>{`
        @keyframes blink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
        
        .simple-server-terminal {
          display: flex;
          flex-direction: column;
          height: 100%;
          border: 1px solid #333;
          border-radius: 4px;
          overflow: hidden;
        }
        
        .simple-server-terminal ::-webkit-scrollbar {
          width: 8px;
        }
        
        .simple-server-terminal ::-webkit-scrollbar-track {
          background: #2a2a2a;
        }
        
        .simple-server-terminal ::-webkit-scrollbar-thumb {
          background: #555;
          border-radius: 4px;
        }
        
        .simple-server-terminal ::-webkit-scrollbar-thumb:hover {
          background: #777;
        }
      `}</style>
    </div>
  );
});

SimpleServerTerminal.displayName = 'SimpleServerTerminal';

export default SimpleServerTerminal;
export type { SimpleServerTerminalProps, SimpleServerTerminalRef };