const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const extract = require('extract-zip');

const CONFIG = require('./launcher.config.json');
const APP_ID = '23Visuals';
const GAME_VERSION = '26.2-fabric';
const ASSET_INDEX = '26.2-32';

let mainWindow = null;
let gameProcess = null;
let busy = false;

const appData = app.getPath('appData');
const defaultInstallDir = path.join(appData, APP_ID);
const settingsPath = path.join(appData, APP_ID, 'launcher-settings.json');

const defaultSettings = {
   installDir: defaultInstallDir,
   nickname: CONFIG.defaultNick || 'Player',
   ram: 4,
   key: '',
   localMode: false,
   loggedIn: false,
   remember: true,
   closeLauncherOnPlay: false
};

function send(channel, payload) {
   if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, payload);
   }
}

function logLine(line) {
   send('game:log', String(line));
}

async function readJson(file, fallback) {
   try {
      return JSON.parse(await fsp.readFile(file, 'utf8'));
   } catch {
      return fallback;
   }
}

async function writeJson(file, value) {
   await fsp.mkdir(path.dirname(file), { recursive: true });
   await fsp.writeFile(file, JSON.stringify(value, null, 2), 'utf8');
}

function loadSettings() {
   return readJson(settingsPath, { ...defaultSettings }).then((data) => ({ ...defaultSettings, ...data }));
}

async function saveSettings(patch) {
   const current = await loadSettings();
   const next = { ...current, ...patch };
   await writeJson(settingsPath, next);
   return next;
}

function releaseBase(tag) {
   return `https://github.com/${CONFIG.owner}/${CONFIG.repo}/releases/download/${tag}`;
}

async function fetchVersion() {
   const urls = [
      `${CONFIG.pagesUrl}/version.json`,
      `https://raw.githubusercontent.com/${CONFIG.owner}/${CONFIG.repo}/${CONFIG.branch || 'main'}/docs/version.json`,
      `https://cdn.jsdelivr.net/gh/${CONFIG.owner}/${CONFIG.repo}@${CONFIG.branch || 'main'}/docs/version.json`
   ];
   let lastError = null;

   for (const base of urls) {
      try {
         const res = await fetch(`${base}?t=${Date.now()}`, { redirect: 'follow' });
         if (!res.ok) {
            lastError = new Error(`${base} -> ${res.status}`);
            continue;
         }
         return await res.json();
      } catch (error) {
         lastError = error;
      }
   }

   throw new Error(`Не удалось получить version.json (${lastError?.message || 'network'})`);
}

async function downloadFile(url, destination, onProgress) {
   await fsp.mkdir(path.dirname(destination), { recursive: true });
   const res = await fetch(url, { redirect: 'follow' });
   if (!res.ok || !res.body) {
      throw new Error(`Ошибка скачивания ${url} (${res.status})`);
   }

   const total = Number(res.headers.get('content-length') || 0);
   let received = 0;
   const tmp = `${destination}.part`;
   const out = fs.createWriteStream(tmp);

   const stream = Readable.fromWeb(res.body);
   stream.on('data', (chunk) => {
      received += chunk.length;
      onProgress?.(received, total);
   });

   await pipeline(stream, out);
   await fsp.rename(tmp, destination);
   return destination;
}

async function ensureBase(root, version, onStage) {
   const java = path.join(root, 'runtime', 'jdk', 'bin', 'java.exe');
   const libs = path.join(root, 'runtime', 'lib');
   const baseFile = path.join(root, '.base-version');
   const local = await fsp.readFile(baseFile, 'utf8').catch(() => '');
   const wanted = String(version.baseVersion || version.version);

   if (local.trim() === wanted && fs.existsSync(java) && fs.existsSync(libs)) {
      return;
   }

   const asset = version.base || 'base.zip';
   const baseTag = version.baseRelease || version.release || 'v' + version.version;
   const url = `${releaseBase(baseTag)}/${asset}`;
   const zip = path.join(root, '.downloads', asset);
   onStage({ stage: 'base', text: 'Скачивание runtime (Java, assets, libraries)', percent: 0 });
   await downloadFile(url, zip, (received, total) => {
      onStage({
         stage: 'base',
         text: 'Скачивание runtime',
         percent: total ? Math.min(99, Math.round((received / total) * 100)) : 0,
         received,
         total
      });
   });

   onStage({ stage: 'base', text: 'Распаковка runtime', percent: 99 });
   await extract(zip, { dir: root });
   await fsp.writeFile(baseFile, wanted, 'utf8');
   await fsp.rm(zip, { force: true });
}

async function ensureClient(root, version, onStage) {
   const game = path.join(root, 'game');
   const versionFile = path.join(root, '.client-version');
   const local = await fsp.readFile(versionFile, 'utf8').catch(() => '');
   if (local.trim() === version.version && fs.existsSync(path.join(game, 'mods'))) {
      return;
   }

   const asset = version.client || `client-${version.version}.zip`;
   const clientTag = version.release || 'v' + version.version;
   const url = `${releaseBase(clientTag)}/${asset}`;
   const zip = path.join(root, '.downloads', asset);
   onStage({ stage: 'client', text: `Скачивание клиента ${version.version}`, percent: 0 });
   await downloadFile(url, zip, (received, total) => {
      onStage({
         stage: 'client',
         text: `Скачивание клиента ${version.version}`,
         percent: total ? Math.min(99, Math.round((received / total) * 100)) : 0,
         received,
         total
      });
   });

   onStage({ stage: 'client', text: 'Распаковка клиента', percent: 99 });
   await fsp.rm(path.join(game, 'mods'), { recursive: true, force: true });
   await extract(zip, { dir: root });

   const hashFile = path.join(game, 'config', '23visuals-build.sha256');
   const hash = await fsp.readFile(hashFile, 'utf8').catch(() => '');
   if (hash.trim()) {
      await fsp.writeFile(path.join(root, '.client-hash'), hash.trim(), 'utf8');
   }

   await fsp.writeFile(versionFile, version.version, 'utf8');
   await fsp.rm(zip, { force: true });
}

function offlineUuid(name) {
   const md5 = crypto.createHash('md5').update(`OfflinePlayer:${name}`, 'utf8').digest();
   md5[6] = (md5[6] & 0x0f) | 0x30;
   md5[8] = (md5[8] & 0x3f) | 0x80;
   const hex = md5.toString('hex');
   return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function launchGame(root, settings) {
   if (gameProcess) {
      throw new Error('Игра уже запущена');
   }

   const runtime = path.join(root, 'runtime');
   const game = path.join(root, 'game');
   let java = path.join(runtime, 'jdk', 'bin', 'java.exe');
   if (!fs.existsSync(java)) {
      java = 'java';
   }

   if (!fs.existsSync(path.join(runtime, 'lib'))) {
      throw new Error('Нет runtime/lib. Сначала скачай клиент или укажи правильную папку.');
   }
   if (!fs.existsSync(path.join(game, 'mods'))) {
      throw new Error('Нет game/mods. Сначала скачай клиент или укажи правильную папку.');
   }

   const nickname = String(settings.nickname || 'Player').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 16) || 'Player';
   const ram = Math.max(2, Math.min(16, Number(settings.ram) || 4));
   const natives = path.join(runtime, 'natives');
   const args = [
      `-Xmx${ram}G`,
      '-Xms512M',
      '--enable-native-access=ALL-UNNAMED',
      '--sun-misc-unsafe-memory-access=allow',
      `-Djava.library.path=${natives}`,
      `-Djna.tmpdir=${path.join(natives, 'jna')}`,
      `-Dorg.lwjgl.system.SharedLibraryExtractPath=${path.join(natives, 'lwjgl')}`,
      `-Dio.netty.native.workdir=${path.join(natives, 'netty')}`,
      '-Dfabric.gameMappingNamespace=official',
      '-Dfabric.development=false',
      '-Dminecraft.launcher.brand=23Visuals',
      '-Dminecraft.launcher.version=0.3.1',
      '-cp',
      path.join(runtime, 'lib', '*'),
      'net.fabricmc.loader.impl.launch.knot.KnotClient',
      '--gameDir', game,
      '--assetsDir', path.join(runtime, 'assets'),
      '--assetIndex', ASSET_INDEX,
      '--version', GAME_VERSION,
      '--versionType', 'release',
      '--username', nickname,
      '--uuid', offlineUuid(nickname)
   ];

   send('launcher:status', { state: 'launching', text: 'Запуск Minecraft...' });
   gameProcess = spawn(java, args, {
      cwd: root,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
   });

   const pipe = (stream) => {
      stream.setEncoding('utf8');
      stream.on('data', (data) => {
         for (const line of data.split(/\r?\n/)) {
            if (line.trim()) {
               logLine(line);
            }
         }
      });
   };
   pipe(gameProcess.stdout);
   pipe(gameProcess.stderr);

   gameProcess.on('error', (error) => {
      send('launcher:status', { state: 'error', text: `Не удалось запустить Java: ${error.message}` });
      gameProcess = null;
   });

   gameProcess.on('exit', (code) => {
      send('launcher:status', { state: 'idle', text: code === 0 ? 'Игра закрыта' : `Игра завершилась с кодом ${code}` });
      gameProcess = null;
   });

   send('launcher:status', { state: 'running', text: 'Игра запущена' });
}

ipcMain.handle('window:minimize', () => mainWindow?.minimize());
ipcMain.handle('window:maximize', () => {
   if (!mainWindow) return;
   if (mainWindow.isMaximized()) mainWindow.unmaximize();
   else mainWindow.maximize();
});
ipcMain.handle('window:close', () => mainWindow?.close());

ipcMain.handle('settings:get', async () => loadSettings());
ipcMain.handle('settings:save', async (_event, patch) => saveSettings(patch || {}));

ipcMain.handle('launcher:config', () => ({
   version: app.getVersion(),
   owner: CONFIG.owner,
   repo: CONFIG.repo,
   pagesUrl: CONFIG.pagesUrl,
   discord: CONFIG.discord
}));

ipcMain.handle('launcher:version', async () => {
   try {
      const remote = await fetchVersion();
      return { ok: true, remote };
   } catch (error) {
      return { ok: false, error: error.message };
   }
});

ipcMain.handle('launcher:play', async () => {
   if (gameProcess) {
      return { ok: false, error: 'Игра уже запущена' };
   }
   if (busy) return { ok: false, error: 'Уже выполняется другая операция' };
   busy = true;
   try {
      const settings = await loadSettings();
      const root = settings.installDir || defaultInstallDir;
      await fsp.mkdir(root, { recursive: true });

      let remote = null;
      try {
         remote = await fetchVersion();
      } catch (error) {
         logLine(`[Launcher] ${error.message}`);
      }

      if (remote && !settings.localMode) {
         await ensureBase(root, remote, (progress) => send('launcher:progress', progress));
         await ensureClient(root, remote, (progress) => send('launcher:progress', progress));
      }

      send('launcher:progress', { stage: 'done', text: 'Проверка завершена', percent: 100 });
      await launchGame(root, settings);
      return { ok: true };
   } catch (error) {
      send('launcher:status', { state: 'error', text: error.message });
      return { ok: false, error: error.message };
   } finally {
      busy = false;
   }
});

ipcMain.handle('launcher:mods', async () => {
   const settings = await loadSettings();
   const dir = path.join(settings.installDir || defaultInstallDir, 'game', 'mods');
   try {
      const files = await fsp.readdir(dir);
      const mods = [];
      for (const file of files.filter((f) => f.endsWith('.jar'))) {
         const stat = await fsp.stat(path.join(dir, file)).catch(() => null);
         mods.push({ name: file, size: stat ? stat.size : 0 });
      }
      return mods.sort((a, b) => a.name.localeCompare(b.name));
   } catch {
      return [];
   }
});

ipcMain.handle('launcher:openFolder', async () => {
   const settings = await loadSettings();
   const root = settings.installDir || defaultInstallDir;
   await fsp.mkdir(root, { recursive: true });
   await shell.openPath(root);
});

ipcMain.handle('launcher:logs', async () => {
   const settings = await loadSettings();
   const root = settings.installDir || defaultInstallDir;
   await shell.openPath(path.join(root, 'game', 'logs'));
});

ipcMain.handle('launcher:discord', async () => {
   if (CONFIG.discord) await shell.openExternal(CONFIG.discord);
});

ipcMain.handle('launcher:chooseFolder', async () => {
   const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory', 'createDirectory'] });
   return result.canceled ? null : result.filePaths[0];
});

function createWindow() {
   mainWindow = new BrowserWindow({
      width: 1180,
      height: 720,
      minWidth: 980,
      minHeight: 620,
      frame: false,
      transparent: false,
      backgroundColor: '#0a0a0f',
      show: false,
      webPreferences: {
         preload: path.join(__dirname, 'preload.js'),
         contextIsolation: true,
         nodeIntegration: false
      }
   });

   mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
   mainWindow.once('ready-to-show', () => mainWindow.show());
   mainWindow.on('closed', () => {
      mainWindow = null;
   });
}

app.whenReady().then(() => {
   createWindow();
   app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
   });
});

app.on('window-all-closed', () => {
   if (process.platform !== 'darwin') app.quit();
});