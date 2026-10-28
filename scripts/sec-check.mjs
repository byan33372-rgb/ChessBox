/** R10 SEC 实时探测：对生产服务（3001）验证敏感路径 404 与安全响应头（区别于 vitest 内嵌测试服）
 *  用法: node scripts/sec-check.mjs */
const BASE = 'http://127.0.0.1:3001';
const checks = [];
const t = (n, label, ok, detail = '') => {
  checks.push(ok);
  console.log(`${ok ? '✅' : '❌'} SEC-${String(n).padStart(2, '0')} ${ok ? 'PASS' : 'FAIL'}: ${label}${detail ? ' — ' + detail : ''}`);
};

// 敏感路径
const paths = ['/.env', '/package.json', '/data/app.db', '/node_modules', '/src/server/index.ts', '/data', '/logs/server.log'];
let all404 = true;
const details = [];
for (const p of paths) {
  const r = await fetch(BASE + p);
  details.push(`${p}:${r.status}`);
  if (r.status !== 404) all404 = false;
}
t(1, '敏感路径全部 404（含 data 目录与日志文件）', all404, details.join(' '));

// SPA 路由
const home = await fetch(BASE + '/');
const room = await fetch(BASE + '/r/abcdefghij');
t(2, 'SPA 路由 / 与 /r/<id> 均 200', home.status === 200 && room.status === 200, `/:${home.status} /r/:${room.status}`);

// 安全响应头
const h = {};
home.headers.forEach((v, k) => (h[k] = v));
const csp = h['content-security-policy'] ?? '';
t(3, 'X-Content-Type-Options: nosniff', h['x-content-type-options'] === 'nosniff', h['x-content-type-options'] ?? '缺失');
t(4, 'X-Frame-Options: SAMEORIGIN', h['x-frame-options'] === 'SAMEORIGIN', h['x-frame-options'] ?? '缺失');
t(5, 'Referrer-Policy: no-referrer', h['referrer-policy'] === 'no-referrer', h['referrer-policy'] ?? '缺失');
t(6, 'Permissions-Policy 含 camera=()', (h['permissions-policy'] ?? '').includes('camera=()'), h['permissions-policy'] ?? '缺失');
t(7, 'CSP 含 default-src self 且无 unsafe-eval', csp.includes("default-src 'self'") && !csp.includes('unsafe-eval'), csp.slice(0, 80));
t(8, '健康检查 /healthz 200', (await fetch(BASE + '/healthz')).status === 200);

// /api 404 无泄露
const api = await fetch(BASE + '/api/secret');
const apiBody = await api.json();
t(9, '/api/* 404 为 JSON 且不泄露内部信息', api.status === 404 && (apiBody.error ?? '') === 'not found', JSON.stringify(apiBody));

console.log('────────────────────────────────');
console.log(`SEC 实时探测：${checks.filter(Boolean).length}/${checks.length} 项通过`);
process.exit(checks.every(Boolean) ? 0 : 1);
