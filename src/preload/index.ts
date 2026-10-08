import { contextBridge } from 'electron';

// 主进程经 additionalArguments 注入本地数据层端口；0 = 数据层未就绪（渲染层回落 mock）。
const arg = process.argv.find((a) => a.startsWith('--hg-port='));
const parsed = arg ? Number.parseInt(arg.slice('--hg-port='.length), 10) : 0;
const port = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;

contextBridge.exposeInMainWorld('__HG_PORT__', port);
