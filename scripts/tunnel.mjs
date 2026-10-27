#!/usr/bin/env node
/**
 * cloudflared Quick Tunnel 启动脚本。
 *
 * 用法：
 *   npm run tunnel                 # 检测 cloudflared 并启动快速隧道（指向本机生产服务）
 *   npm run tunnel -- --install    # 未安装时从 Cloudflare 官方发布地址下载到 tools/ 目录
 *   npm run tunnel -- --port 3001  # 指定后端端口（默认 3001）
 *
 * 说明：
 * - Quick Tunnel 生成临时公网 URL（https://xxx.trycloudflare.com），
 *   停止本脚本或本机服务后链接失效；每次启动 URL 通常会变化。
 * - 无需 Cloudflare 账号、无需域名、免费。
 * - 必须先启动生产服务（npm start），隧道指向生产端口而非 Vite 开发服务器。
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { createWriteStream, unlinkSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const toolsDir = join(root, 'tools');
const localExe = join(toolsDir, process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');
const isWin = process.platform === 'win32';

const args = process.argv.slice(2);
const install = args.includes('--install');
const portIdx = args.indexOf('--port');
const port = portIdx >= 0 ? Number(args[portIdx + 1]) : 3001;

function findCloudflared() {
  const candidates = [localExe];
  if (isWin) candidates.push('cloudflared.exe', 'cloudflared');
  else candidates.push('cloudflared');
  for (const cmd of candidates) {
    try {
      const r = spawnSync(cmd, ['--version'], { encoding: 'utf8', shell: isWin });
      if (r.status === 0) return cmd;
    } catch {
      // 继续尝试下一个候选
    }
  }
  return null;
}

async function downloadCloudflared() {
  mkdirSync(toolsDir, { recursive: true });
  const arch = process.arch === 'arm64' ? 'arm64' : 'amd64';
  const file = isWin ? `cloudflared-windows-${arch}.exe` : `cloudflared-linux-${arch}`;
  const url = `https://github.com/cloudflare/cloudflared/releases/latest/download/${file}`;
  console.log(`[tunnel] 正在从 Cloudflare 官方发布地址下载: ${url}`);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok || !res.body) throw new Error(`下载失败: HTTP ${res.status}`);
  const tmp = localExe + '.download';
  await pipeline(res.body, createWriteStream(tmp));
  if (existsSync(localExe)) unlinkSync(localExe);
  const { renameSync } = await import('node:fs');
  renameSync(tmp, localExe);
  if (!isWin) {
    const { chmodSync } = await import('node:fs');
    chmodSync(localExe, 0o755);
  }
  console.log(`[tunnel] 已安装到 ${localExe}`);
  return localExe;
}

async function main() {
  // 1. 确认本机生产服务在线
  const target = `http://127.0.0.1:${port}`;
  try {
    const res = await fetch(`${target}/healthz`);
    if (!res.ok) throw new Error(`healthz 状态 ${res.status}`);
    console.log(`[tunnel] 本机服务在线: ${target}`);
  } catch {
    console.error(`[tunnel] 无法访问 ${target} —— 请先运行 npm start 启动生产服务。`);
    process.exit(1);
  }

  // 2. 定位/安装 cloudflared
  let exe = findCloudflared();
  if (!exe && install) {
    exe = await downloadCloudflared();
  }
  if (!exe) {
    console.error('[tunnel] 未检测到 cloudflared。两种解决方式：');
    console.error('  1) 下载到项目内（推荐，无需系统安装）：npm run tunnel -- --install');
    if (isWin) {
      console.error('  2) 系统安装：winget install --id Cloudflare.cloudflared');
      console.error('     或官网手动下载：https://github.com/cloudflare/cloudflared/releases');
    } else {
      console.error('  2) 系统安装：brew install cloudflared (macOS) 或按官网说明安装');
    }
    process.exit(1);
  }
  const r = spawnSync(exe, ['--version'], { encoding: 'utf8', shell: isWin });
  console.log(`[tunnel] 使用 ${exe} ${String(r.stdout).trim()}`);

  // 3. 启动 Quick Tunnel 并解析公网 URL
  console.log('[tunnel] 正在启动 Quick Tunnel…');
  const child = spawn(exe, ['tunnel', '--url', target, '--no-autoupdate'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: isWin,
  });

  let announced = false;
  const announce = (chunk) => {
    const text = chunk.toString();
    process.stderr.write(text.startsWith('[') ? '' : ''); // 透传日志由下方处理
    const m = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(text);
    if (m && !announced) {
      announced = true;
      const url = m[0];
      console.log('');
      console.log('============================================================');
      console.log('  公网访问地址（发给朋友即可）:');
      console.log(`  ${url}`);
      console.log('============================================================');
      console.log('[tunnel] 提示：停止本脚本（Ctrl+C）后链接失效；下次启动 URL 会变化。');
      // 验证公网可达性
      setTimeout(async () => {
        try {
          const res = await fetch(`${url}/healthz`);
          console.log(`[tunnel] 公网连通性验证: /healthz → HTTP ${res.status}`);
        } catch (e) {
          console.log(`[tunnel] 公网连通性验证暂未通过（可能需要等待几秒）: ${(e && e.message) || e}`);
        }
      }, 3000);
    }
  };
  child.stdout.on('data', announce);
  child.stderr.on('data', announce);
  child.on('exit', (code) => {
    console.log(`[tunnel] cloudflared 退出（code ${code}）。`);
    process.exit(code ?? 0);
  });

  const stop = () => {
    console.log('\n[tunnel] 正在停止隧道…');
    child.kill('SIGINT');
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((e) => {
  console.error('[tunnel] 失败:', e && e.message ? e.message : e);
  process.exit(1);
});
