const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const fallbackNews = [
   {
      date: '17.11.2026',
      title: '23Visuals 0.3.1',
      text: 'Новый лаунчер, автообновление клиента и быстрый вход без архивов.'
   },
   {
      date: '16.11.2026',
      title: 'Косметика и HUD',
      text: 'Починен скролл косметики, обновлён TargetHP и кулдауны врага.'
   },
   {
      date: '16.11.2026',
      title: 'Безопасность',
      text: 'Лицензия временно отключена — вход по нику, без ключа.'
   }
];

let settings = null;
let remoteVersion = null;
let currentPage = 'home';

function setStatus(text, kind = 'ok') {
   $('#statusText').textContent = text;
   $('#statusDot').className = kind === 'ok' ? '' : kind;
}

function setProgress(data) {
   if (!data) return;
   const wrap = $('#progressWrap');
   wrap.classList.add('active');
   $('#progressText').textContent = data.text || 'Загрузка...';
   const percent = Math.max(0, Math.min(100, Number(data.percent) || 0));
   $('#progressPercent').textContent = `${percent}%`;
   $('#progressFill').style.width = `${percent}%`;
   if (data.stage === 'done') {
      setTimeout(() => wrap.classList.remove('active'), 1200);
   }
}

function log(line) {
   const out = $('#logOutput');
   out.textContent += `${line}\n`;
   out.scrollTop = out.scrollHeight;
}

function formatBytes(bytes) {
   if (!bytes) return '0 B';
   const units = ['B', 'KB', 'MB', 'GB'];
   let value = bytes;
   let index = 0;
   while (value >= 1024 && index < units.length - 1) {
      value /= 1024;
      index++;
   }
   return `${value.toFixed(index > 1 ? 1 : 0)} ${units[index]}`;
}

function showPage(page) {
   currentPage = page;
   $$('.page').forEach((el) => el.classList.toggle('active', el.id === `page-${page}`));
   $$('.nav-item[data-page]').forEach((el) => el.classList.toggle('active', el.dataset.page === page));
   if (page === 'mods') loadMods();
}

function renderNews(news) {
   const list = Array.isArray(news) && news.length ? news : fallbackNews;
   const renderCard = (item) => `
      <article class="news-card">
        <div class="news-date">${escapeHtml(item.date || '')}</div>
        <h3>${escapeHtml(item.title || '')}</h3>
        <p>${escapeHtml(item.text || '')}</p>
      </article>`;

   $('#homeNews').innerHTML = list.slice(0, 3).map(renderCard).join('');
   $('#newsList').innerHTML = list.map(renderCard).join('');
}

function escapeHtml(text) {
   return String(text)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
}

async function loadMods() {
   const mods = await window.launcher.mods();
   $('#modCount').textContent = String(mods.length);
   $('#modsHint').textContent = mods.length
      ? `Найдено ${mods.length} модов в game/mods`
      : 'Моды не найдены — сначала скачай клиент';

   $('#modsList').innerHTML = mods.length
      ? mods
           .map(
              (mod) => `
              <div class="mod-row">
                <div class="mod-icon">J</div>
                <div class="mod-name">${escapeHtml(mod.name)}</div>
                <div class="mod-size">${formatBytes(mod.size)}</div>
              </div>`
           )
           .join('')
      : '<div class="mod-row"><div class="mod-name muted">Пока пусто</div></div>';
}

async function loadVersion() {
   const result = await window.launcher.version();
   if (result.ok) {
      remoteVersion = result.remote;
      $('#clientVersion').textContent = result.remote.version || '0.3.1';
      $('#versionState').textContent = 'доступна';
      renderNews(result.remote.news);
   } else {
      $('#versionState').textContent = 'локальный режим';
      renderNews(fallbackNews);
      log(`[Launcher] version.json: ${result.error}`);
   }
}

async function init() {
   const config = await window.launcher.config();
   $('#launcherVersion').textContent = config.version;

   settings = await window.launcher.getSettings();
   $('#nickInput').value = settings.nickname || 'Player';
   $('#keyInput').value = settings.key || '';
   $('#dirInput').value = settings.installDir || '';
   $('#ramRange').value = String(settings.ram || 4);
   $('#ramValue').textContent = `${settings.ram || 4} GB`;
   $('#ramLabel').textContent = `${settings.ram || 4} GB`;
   $('#localMode').checked = Boolean(settings.localMode);
   updateAccount(settings.nickname || 'Player');

   await loadVersion();
   await loadMods();

   if (!remoteVersion) {
      setStatus('Клиент не установлен', 'busy');
   }

   window.launcher.onProgress(setProgress);
   window.launcher.onStatus((data) => {
      if (!data) return;
      setStatus(data.text || '', data.state === 'error' ? 'error' : data.state === 'running' ? 'ok' : 'busy');
      if (data.state === 'running' || data.state === 'idle') {
         $('#playBtn').disabled = false;
         $('#playLabel').textContent = 'Играть';
      }
   });
   window.launcher.onLog(log);
}

function updateAccount(nick) {
   $('#sidebarNick').textContent = nick || 'Player';
   $('#avatar').textContent = (nick || 'P').slice(0, 1).toUpperCase();
}

$('#playBtn').addEventListener('click', async () => {
   const button = $('#playBtn');
   button.disabled = true;
   $('#playLabel').textContent = 'Запуск...';
   setStatus('Проверка файлов...', 'busy');
   const result = await window.launcher.play();
   if (!result.ok) {
      setStatus(result.error || 'Ошибка запуска', 'error');
      button.disabled = false;
      $('#playLabel').textContent = 'Играть';
   }
});

$$('.nav-item[data-page]').forEach((item) => {
   item.addEventListener('click', () => showPage(item.dataset.page));
});

$$('[data-page-link]').forEach((item) => {
   item.addEventListener('click', () => showPage(item.dataset.pageLink));
});

$('#discordBtn').addEventListener('click', () => window.launcher.openDiscord());
$('#folderBtn').addEventListener('click', () => window.launcher.openFolder());
$('#logsBtn').addEventListener('click', () => {
   $('#logPanel').classList.toggle('active');
   window.launcher.openLogs();
});
$('#clearLogBtn').addEventListener('click', () => {
   $('#logOutput').textContent = '';
});

$('#chooseDirBtn').addEventListener('click', async () => {
   const selected = await window.launcher.chooseFolder();
   if (selected) {
      $('#dirInput').value = selected;
   }
});

$('#ramRange').addEventListener('input', () => {
   const value = $('#ramRange').value;
   $('#ramValue').textContent = `${value} GB`;
   $('#ramLabel').textContent = `${value} GB`;
});

$('#saveBtn').addEventListener('click', async () => {
   const nickname = $('#nickInput').value.trim() || 'Player';
   const ram = Number($('#ramRange').value) || 4;
   const installDir = $('#dirInput').value.trim();
   const key = $('#keyInput').value.trim();
   const localMode = $('#localMode').checked;

   settings = await window.launcher.saveSettings({ nickname, ram, installDir, key, localMode });
   updateAccount(nickname);
   $('#saveState').textContent = 'Сохранено';
   setTimeout(() => ($('#saveState').textContent = ''), 1800);
});

$('#repairBtn').addEventListener('click', async () => {
   const button = $('#playBtn');
   button.disabled = true;
   setStatus('Перепроверка файлов...', 'busy');
   const result = await window.launcher.play();
   if (!result.ok) {
      setStatus(result.error || 'Ошибка проверки', 'error');
      button.disabled = false;
      $('#playLabel').textContent = 'Играть';
   }
});

$('#minBtn').addEventListener('click', () => window.launcher.minimize());
$('#maxBtn').addEventListener('click', () => window.launcher.maximize());
$('#closeBtn').addEventListener('click', () => window.launcher.close());

document.addEventListener('keydown', (event) => {
   if (event.key === 'F12') {
      $('#logPanel').classList.toggle('active');
   }
});

init().catch((error) => {
   setStatus(error.message || 'Ошибка лаунчера', 'error');
   log(`[Launcher] ${error.stack || error.message}`);
});