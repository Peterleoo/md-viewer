const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs').promises;

// Path to persistent config file in user data directory
const configPath = path.join(app.getPath('userData'), 'config.json');

async function readConfig() {
  try {
    const data = await fs.readFile(configPath, 'utf-8');
    return JSON.parse(data);
  } catch (e) {
    // If file does not exist or is corrupted, start fresh
    return {};
  }
}

async function writeConfig(cfg) {
  await fs.writeFile(configPath, JSON.stringify(cfg, null, 2), 'utf-8');
}

let mainWindow;

function loadDevServer(win, devUrl, retries = 30) {
  win.loadURL(devUrl).catch((error) => {
    if (retries <= 0) {
      console.error(`Failed to load dev server at ${devUrl}`, error);
      return;
    }
    setTimeout(() => loadDevServer(win, devUrl, retries - 1), 500);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Development uses Vite dev server; packaged builds load the bundled renderer from app.asar.
  if (!app.isPackaged) {
    const devPort = process.env.VITE_PORT || '5173';
    const devUrl = `http://localhost:${devPort}`;
    loadDevServer(mainWindow, devUrl);
  } else {
    const indexPath = path.join(__dirname, '..', '..', 'dist', 'renderer', 'index.html');
    mainWindow.loadFile(indexPath);
  }
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

// ------- IPC Handlers (File I/O, PDF Export, HTML Export) -------
ipcMain.handle('dialog:openFile', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }],
    properties: ['openFile']
  });
  if (canceled) return null;
  const filePath = filePaths[0];
  const content = await fs.readFile(filePath, 'utf-8');
  return { filePath, content };
});

ipcMain.handle('dialog:saveFile', async (_, { filePath, content }) => {
  if (filePath) {
    await fs.writeFile(filePath, content, 'utf-8');
    return { filePath };
  }
  const { canceled, filePath: newPath } = await dialog.showSaveDialog({
    filters: [{ name: 'Markdown', extensions: ['md'] }]
  });
  if (canceled) return null;
  await fs.writeFile(newPath, content, 'utf-8');
  return { filePath: newPath };
});

ipcMain.handle('export:pdf', async (_, htmlContent) => {
  const pdfPath = await dialog.showSaveDialog({
    defaultPath: 'document.pdf',
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  });
  if (pdfPath.canceled) return null;
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent));
  const pdfData = await win.webContents.printToPDF({});
  await fs.writeFile(pdfPath.filePath, pdfData);
  win.close();
  return { filePath: pdfPath.filePath };
});

// Export rendered HTML to a file
ipcMain.handle('dialog:saveHTML', async (_, htmlContent) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    defaultPath: 'document.html',
    filters: [{ name: 'HTML', extensions: ['html', 'htm'] }]
  });
  if (canceled) return null;
  await fs.writeFile(filePath, htmlContent, 'utf-8');
  return { filePath };
});

// ---------- Language Persistence (i18n) ----------
ipcMain.handle('config:getLang', async () => {
  const cfg = await readConfig();
  return cfg.lang || 'zh';
});

ipcMain.handle('config:setLang', async (_, lang) => {
  const cfg = await readConfig();
  cfg.lang = lang;
  await writeConfig(cfg);
  createAppMenu(lang);
  return { ok: true };
});

// ----- Application Menu (Windows shortcuts) -----
const { Menu } = require('electron');
const isMac = process.platform === 'darwin';
// Load persisted language for menu localization
const fsSync = require('fs');
let menuLang = 'zh';
try {
  const cfgRaw = fsSync.readFileSync(configPath, 'utf-8');
  const cfg = JSON.parse(cfgRaw);
  menuLang = cfg.lang || 'zh';
} catch (_) { /* ignore */ }
const menuLabels = {
  zh: {
    file: '文件',
    view: '视图',
    newFile: '新建文件',
    open: '打开',
    save: '保存',
    exportPdf: '导出 PDF',
    exportHtml: '导出 HTML',
    toggleLang: '切换语言',
    quit: '退出'
  },
  en: {
    file: 'File',
    view: 'View',
    newFile: 'New File',
    open: 'Open',
    save: 'Save',
    exportPdf: 'Export PDF',
    exportHtml: 'Export HTML',
    toggleLang: 'Toggle Language',
    quit: 'Quit'
  }
};
function sendMenuAction(channel) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel);
  }
}

function createAppMenu(lang = menuLang) {
  menuLang = lang;
  const mt = menuLabels[menuLang] || menuLabels['zh'];
  const template = [
    {
      label: mt.file,
      submenu: [
        { label: mt.newFile, accelerator: 'CmdOrCtrl+N', click: () => sendMenuAction('menu-new-file') },
        { label: mt.open, accelerator: 'CmdOrCtrl+O', click: () => sendMenuAction('menu-open') },
        { label: mt.save, accelerator: 'CmdOrCtrl+S', click: () => sendMenuAction('menu-save') },
        { label: mt.exportPdf, accelerator: 'CmdOrCtrl+Shift+P', click: () => sendMenuAction('menu-export-pdf') },
        { label: mt.exportHtml, accelerator: 'CmdOrCtrl+Shift+H', click: () => sendMenuAction('menu-export-html') },
        { label: mt.toggleLang, accelerator: 'CmdOrCtrl+L', click: () => sendMenuAction('menu-toggle-lang') },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit', label: mt.quit }
      ]
    },
    {
      label: mt.view,
      submenu: [
        { role: 'reload' },
        { role: 'forcereload' },
        { role: 'toggledevtools' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

createAppMenu(menuLang);
