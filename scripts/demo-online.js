// Mode demo online: jalankan server di port 3000 lalu buka Cloudflare Quick Tunnel
// sehingga aplikasi bisa diakses lewat https://xxxx.trycloudflare.com (kamera HP butuh HTTPS).
// Memakai database lokal apa adanya (server/presensi.db), tanpa reset atau seed ulang.
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const PORT = 3000;
const LOCAL_URL = `http://localhost:${PORT}`;
const SERVER_TIMEOUT_MS = 30_000;
const TUNNEL_TIMEOUT_MS = 40_000;
const TUNNEL_URL_PATTERN = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;
const IS_WINDOWS = process.platform === 'win32';

const children = [];
let stopping = false;

function fail(message) {
  console.error(`\n[GAGAL] ${message}\n`);
  stopAll(1);
}

function stopAll(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode !== null || child.signalCode !== null) continue;
    if (IS_WINDOWS) {
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      child.kill('SIGTERM');
    }
  }
  console.log('Server dan tunnel dihentikan.');
  process.exit(exitCode);
}

function canListen(port) {
  return new Promise((resolve) => {
    const tester = net.createServer()
      .once('error', () => resolve(false))
      .once('listening', () => tester.close(() => resolve(true)))
      .listen(port, '0.0.0.0');
  });
}

function somethingAnswers(port, host) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host, timeout: 1000 });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
    socket.once('error', () => resolve(false));
  });
}

// Windows mengizinkan program lain memakai port yang sama di alamat berbeda (mis. ::),
// jadi selain mencoba listen, cek juga apakah ada yang sudah menjawab di localhost.
async function isPortFree(port) {
  if (!(await canListen(port))) return false;
  const answers = await Promise.all([somethingAnswers(port, '127.0.0.1'), somethingAnswers(port, '::1')]);
  return !answers.includes(true);
}

async function waitForServer() {
  const deadline = Date.now() + SERVER_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${LOCAL_URL}/api/health`);
      if (res.ok) return true;
    } catch {
      // server belum siap
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

function findCloudflared() {
  const which = spawnSync(IS_WINDOWS ? 'where' : 'which', ['cloudflared'], { encoding: 'utf8' });
  if (which.status === 0 && which.stdout.trim()) return which.stdout.trim().split(/\r?\n/)[0];

  const candidates = [
    'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe',
    'C:\\Program Files\\cloudflared\\cloudflared.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Links', 'cloudflared.exe'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function shareUrl(url) {
  if (!IS_WINDOWS) return;
  const clip = spawnSync('clip', { input: url });
  if (clip.status === 0) console.log('URL sudah disalin ke clipboard.');
  spawn('cmd', ['/c', 'start', '', url], { stdio: 'ignore', detached: true }).unref();
}

function printBanner(url) {
  const lines = [
    `PresensiQR ONLINE: ${url}`,
    'Login demo: admin / dosen / mahasiswa (sesuai data lokal)',
    'Biarkan jendela ini terbuka selama demo.',
    'Tekan Ctrl+C untuk berhenti.',
  ];
  const width = Math.max(...lines.map((line) => line.length)) + 2;
  const border = '='.repeat(width + 2);
  console.log(`\n${border}`);
  for (const line of lines) console.log(` ${line.padEnd(width)} `);
  console.log(`${border}\n`);
}

async function main() {
  if (!(await isPortFree(PORT))) {
    console.error(`\n[GAGAL] Port ${PORT} sedang dipakai, tutup server lain dulu (mis. jendela start.bat atau npm start).\n`);
    process.exit(1);
  }

  const cloudflared = findCloudflared();
  if (!cloudflared) {
    console.error('\n[GAGAL] cloudflared tidak ditemukan. Install cloudflared, lalu buka terminal baru agar PATH terbaca.\n');
    process.exit(1);
  }

  if (!fs.existsSync(path.join(ROOT, 'client', 'dist', 'index.html'))) {
    console.log('Frontend belum di-build, menjalankan npm run build...');
    const build = spawnSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'inherit', shell: IS_WINDOWS });
    if (build.status !== 0) {
      console.error('\n[GAGAL] npm run build gagal. Periksa pesan error di atas.\n');
      process.exit(1);
    }
  }

  process.on('SIGINT', () => stopAll(0));
  process.on('SIGTERM', () => stopAll(0));
  process.on('SIGHUP', () => stopAll(0));
  process.on('SIGBREAK', () => stopAll(0));

  console.log(`Menjalankan server di ${LOCAL_URL} (database lokal server/presensi.db)...`);
  const server = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), NODE_ENV: 'production', ALLOW_SIMULATED_TIME: 'false' },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  children.push(server);
  server.on('exit', (code) => {
    if (!stopping) fail(`Server berhenti tiba-tiba (kode ${code}).`);
  });

  if (!(await waitForServer())) {
    fail(`Server tidak merespons di ${LOCAL_URL} dalam ${SERVER_TIMEOUT_MS / 1000} detik.`);
    return;
  }

  console.log('Membuka Cloudflare Quick Tunnel...');
  const tunnel = spawn(cloudflared, ['tunnel', '--no-autoupdate', '--url', LOCAL_URL], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(tunnel);

  const tunnelLog = [];
  let publicUrl = null;
  const onTunnelOutput = (chunk) => {
    for (const line of chunk.toString().split(/\r?\n/).filter(Boolean)) {
      tunnelLog.push(line);
      if (tunnelLog.length > 20) tunnelLog.shift();
      const match = !publicUrl && line.match(TUNNEL_URL_PATTERN);
      if (match) {
        publicUrl = match[0];
        printBanner(publicUrl);
        shareUrl(publicUrl);
      }
    }
  };
  tunnel.stdout.on('data', onTunnelOutput);
  tunnel.stderr.on('data', onTunnelOutput);
  tunnel.on('exit', (code) => {
    if (!stopping) fail(`cloudflared berhenti (kode ${code}). Log terakhir:\n${tunnelLog.join('\n')}`);
  });

  setTimeout(() => {
    if (!publicUrl) {
      fail(`URL trycloudflare tidak muncul dalam ${TUNNEL_TIMEOUT_MS / 1000} detik. Periksa koneksi internet.\n20 baris terakhir log cloudflared:\n${tunnelLog.join('\n')}`);
    }
  }, TUNNEL_TIMEOUT_MS);
}

main();
