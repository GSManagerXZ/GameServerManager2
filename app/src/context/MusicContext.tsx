import React, { createContext, useContext, useState, useRef, useEffect, ReactNode } from 'react';
import axios from 'axios';
import { message } from 'antd';

// 歌曲信息接口
interface Song {
  id: string;
  name: string;
  artist: string;
  duration: number;
  url?: string;
}

// 音乐播放状态接口
interface MusicState {
  playlistId: string;
  playlist: Song[];
  currentIndex: number;
  currentSong: Song | null;
  isPlaying: boolean;
  isPaused: boolean;
  isPlayerVisible: boolean;
}

// 音乐上下文接口
interface MusicContextType {
  musicState: MusicState;
  audioRef: React.RefObject<HTMLAudioElement>;
  loadPlaylist: (playlistId: string) => Promise<void>;
  playMusic: (songIndex?: number) => Promise<void>;
  pauseMusic: () => void;
  resumeMusic: () => void;
  stopMusic: () => void;
  nextSong: () => void;
  previousSong: () => void;
  setMusicState: (state: Partial<MusicState>) => void;
}

// 创建上下文
const MusicContext = createContext<MusicContextType | undefined>(undefined);

// 音乐提供者属性接口
interface MusicProviderProps {
  children: ReactNode;
}

// 从localStorage加载音乐配置
const loadMusicConfig = (): MusicState => {
  try {
    const saved = localStorage.getItem('netease_music_config');
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (error) {
    console.error('加载音乐配置失败:', error);
  }
  return {
    playlistId: '',
    playlist: [],
    currentIndex: 0,
    currentSong: null,
    isPlaying: false,
    isPaused: false,
    isPlayerVisible: false
  };
};

// 保存音乐配置到localStorage
const saveMusicConfig = (state: MusicState) => {
  try {
    localStorage.setItem('netease_music_config', JSON.stringify(state));
  } catch (error) {
    console.error('保存音乐配置失败:', error);
  }
};

// 音乐提供者组件
export const MusicProvider: React.FC<MusicProviderProps> = ({ children }) => {
  const [musicState, setMusicStateInternal] = useState<MusicState>(loadMusicConfig);
  const audioRef = useRef<HTMLAudioElement>(null);

  // 更新音乐状态并保存到localStorage
  const setMusicState = (newState: Partial<MusicState>) => {
    setMusicStateInternal(prevState => {
      const updatedState = { ...prevState, ...newState };
      saveMusicConfig(updatedState);
      return updatedState;
    });
  };

  // 加载歌单
  const loadPlaylist = async (playlistId: string) => {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await axios.post('/api/netease/load_playlist', 
        { playlist_id: playlistId },
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );
      if (response.data.status === 'success') {
        const songs = response.data.songs || [];
        setMusicState({
          playlistId,
          playlist: songs,
          currentIndex: 0,
          currentSong: null,
          isPlaying: false,
          isPaused: false,
          isPlayerVisible: true
        });
        message.success(`成功加载歌单，共 ${songs.length} 首歌曲`);
      } else {
        message.error(response.data.message || '加载歌单失败');
      }
    } catch (error) {
      message.error('加载歌单失败，请检查网络连接');
    }
  };

  // 播放音乐
  const playMusic = async (songIndex?: number) => {
    try {
      const index = songIndex !== undefined ? songIndex : musicState.currentIndex;
      const token = localStorage.getItem('auth_token');
      const response = await axios.post('/api/netease/play', 
        { song_index: index },
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );
      if (response.data.status === 'success') {
        const currentSong = response.data.current_song;
        setMusicState({
          isPlaying: true,
          isPaused: false,
          currentIndex: index,
          currentSong: currentSong
        });
        
        // 如果有音频元素，自动播放
        if (audioRef.current && currentSong?.url) {
          audioRef.current.src = currentSong.url;
          setTimeout(() => {
            audioRef.current?.play().catch(err => {
              console.log('自动播放失败，需要用户交互:', err);
            });
          }, 100);
        }
        
        message.success('开始播放');
      } else {
        message.error(response.data.message || '播放失败');
      }
    } catch (error) {
      message.error('播放失败，请检查网络连接');
    }
  };

  // 暂停音乐
  const pauseMusic = () => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setMusicState({ isPaused: true });
  };

  // 恢复播放
  const resumeMusic = () => {
    if (audioRef.current) {
      audioRef.current.play().catch(err => {
        console.log('恢复播放失败:', err);
      });
    }
    setMusicState({ isPaused: false });
  };

  // 停止音乐
  const stopMusic = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setMusicState({
      isPlaying: false,
      isPaused: false
    });
  };

  // 下一首
  const nextSong = () => {
    if (musicState.playlist.length === 0) return;
    const nextIndex = (musicState.currentIndex + 1) % musicState.playlist.length;
    playMusic(nextIndex);
  };

  // 上一首
  const previousSong = () => {
    if (musicState.playlist.length === 0) return;
    const prevIndex = musicState.currentIndex === 0 
      ? musicState.playlist.length - 1 
      : musicState.currentIndex - 1;
    playMusic(prevIndex);
  };

  // 音频事件处理
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handlePlay = () => {
      setMusicState({ isPlaying: true, isPaused: false });
    };

    const handlePause = () => {
      setMusicState({ isPaused: true });
    };

    const handleEnded = () => {
      nextSong();
    };

    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [musicState.currentIndex, musicState.playlist.length]);

  const value: MusicContextType = {
    musicState,
    audioRef,
    loadPlaylist,
    playMusic,
    pauseMusic,
    resumeMusic,
    stopMusic,
    nextSong,
    previousSong,
    setMusicState
  };

  return (
    <MusicContext.Provider value={value}>
      {children}
      {/* 全局音频元素 */}
      <audio 
        ref={audioRef}
        style={{ display: 'none' }}
      />
    </MusicContext.Provider>
  );
};

// 使用音乐上下文的Hook
export const useMusic = (): MusicContextType => {
  const context = useContext(MusicContext);
  if (!context) {
    throw new Error('useMusic必须在MusicProvider内使用');
  }
  return context;
};