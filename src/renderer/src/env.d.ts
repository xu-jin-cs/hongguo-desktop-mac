/// <reference types="vite/client" />

interface Window {
  /** 本地数据层端口（主进程经 preload 注入）；0/undefined = 数据层未就绪，dataSource 回落内置 mock */
  __HG_PORT__?: number;
  /**
   * 播放器运行态（PRD v1.2 播放完整性硬验收）：Player 挂载后由 loadedmetadata +
   * 播放中事件采样更新，卸载时删除；供冒烟机械断言「有声音轨 + 有画面帧 + 播放中」。
   */
  __HG_PLAYER_STATE__?: {
    /** 音轨存在（best-effort 检测，手段见 Player.tsx detectHasAudio 注释） */
    hasAudio: boolean;
    /** 已解码出画面帧（videoWidth/videoHeight 非 0） */
    hasVideo: boolean;
    videoWidth: number;
    videoHeight: number;
    currentTime: number;
    paused: boolean;
  };
}
