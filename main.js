// MyText — programa de escritorio (Electron) que envuelve el editor web
const { app, BrowserWindow, ipcMain, dialog, shell, net, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

let autoUpdater = null;
try { autoUpdater = require('electron-updater').autoUpdater; } catch (e) { /* sin actualizador */ }

// Dónde se publican las actualizaciones del editor
const REPO = 'YipikayeiGit/MyText';
const RAW = `https://raw.githubusercontent.com/${REPO}/main/editor/`;

const EXT_ABRIBLES = /\.(txt|md|markdown|log|docx|pdf|html?|rtf|odt|csv|json|xml)$/i;
const FILTROS = {
  docx: { name: 'Documento de Word', extensions: ['docx'] },
  pdf: { name: 'PDF', extensions: ['pdf'] },
  html: { name: 'Página web', extensions: ['html', 'htm'] },
  htm: { name: 'Página web', extensions: ['html', 'htm'] },
  txt: { name: 'Texto', extensions: ['txt'] },
  md: { name: 'Markdown', extensions: ['md'] }
};

let win = null;
let archivoPendiente = archivoDeArgs(process.argv);
let puedeCerrar = false;
let ultimaCarpeta = null;

/* ---------- utilidades ---------- */
function archivoDeArgs(argv) {
  for (const a of argv.slice(1)) {
    if (a && !a.startsWith('-') && EXT_ABRIBLES.test(a)) {
      try { if (fs.existsSync(a)) return path.resolve(a); } catch (e) {}
    }
  }
  return null;
}
function cmp(a, b) {
  const pa = String(a || '0').split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b || '0').split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}
function leerJson(f, def) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return def; } }
const dirEditorDescargado = () => path.join(app.getPath('userData'), 'editor');
const archivoRecientes = () => path.join(app.getPath('userData'), 'recientes.json');

// Elige el editor más nuevo: el que viene con el programa o uno descargado
function editorActual() {
  const incluido = { html: path.join(__dirname, 'editor', 'editor.html'), ...leerJson(path.join(__dirname, 'editor', 'version.json'), { version: '0.0.0' }) };
  const dir = dirEditorDescargado();
  const desc = leerJson(path.join(dir, 'version.json'), null);
  if (desc && fs.existsSync(path.join(dir, 'editor.html')) && cmp(desc.version, incluido.version) > 0 && cmp(app.getVersion(), desc.minApp || '0') >= 0) {
    return { html: path.join(dir, 'editor.html'), ...desc };
  }
  return incluido;
}

/* ---------- recientes ---------- */
function recientes() { return leerJson(archivoRecientes(), []).filter(r => { try { return fs.existsSync(r); } catch (e) { return false; } }); }
function anadirReciente(ruta) {
  const lista = [ruta, ...recientes().filter(r => r.toLowerCase() !== ruta.toLowerCase())].slice(0, 10);
  try { fs.writeFileSync(archivoRecientes(), JSON.stringify(lista)); } catch (e) {}
  try { app.addRecentDocument(ruta); } catch (e) {}
  ultimaCarpeta = path.dirname(ruta);
}

/* ---------- ventana ---------- */
function crearVentana() {
  win = new BrowserWindow({
    width: 1280, height: 900, minWidth: 420, minHeight: 400,
    title: 'MyText', show: false, autoHideMenuBar: true,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    backgroundColor: '#e6e8ec',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, spellcheck: true
    }
  });
  Menu.setApplicationMenu(null);
  try { win.webContents.session.setSpellCheckerLanguages(['es-ES', 'es']); } catch (e) {}

  win.loadFile(editorActual().html);
  win.once('ready-to-show', () => { win.maximize(); win.show(); });

  win.webContents.on('did-finish-load', () => {
    if (archivoPendiente) { const f = archivoPendiente; archivoPendiente = null; enviarArchivo(f, false); }
  });

  // Enlaces externos → navegador
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:|^mailto:/i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file:')) { e.preventDefault(); shell.openExternal(url); } });

  // Atajos: herramientas de desarrollo y recargar
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) { win.webContents.toggleDevTools(); e.preventDefault(); }
  });

  // Menú del botón derecho con sugerencias del corrector
  win.webContents.on('context-menu', (e, p) => {
    const items = [];
    if (p.misspelledWord) {
      p.dictionarySuggestions.slice(0, 6).forEach(s => items.push({ label: s, click: () => win.webContents.replaceMisspelling(s) }));
      if (!p.dictionarySuggestions.length) items.push({ label: 'Sin sugerencias', enabled: false });
      items.push({ label: 'Añadir al diccionario', click: () => win.webContents.session.addWordToSpellCheckerDictionary(p.misspelledWord) });
      items.push({ type: 'separator' });
    }
    if (p.isEditable || p.selectionText) {
      items.push(
        { label: 'Cortar', role: 'cut', enabled: p.editFlags.canCut },
        { label: 'Copiar', role: 'copy', enabled: p.editFlags.canCopy },
        { label: 'Pegar', role: 'paste', enabled: p.editFlags.canPaste },
        { type: 'separator' },
        { label: 'Seleccionar todo', role: 'selectAll' }
      );
    }
    if (items.length) Menu.buildFromTemplate(items).popup({ window: win });
  });

  // Avisar de cambios sin guardar al cerrar
  win.on('close', async e => {
    if (puedeCerrar) return;
    e.preventDefault();
    let modificado = false;
    try { modificado = await win.webContents.executeJavaScript('window.__mytextModificado === true'); } catch (err) {}
    if (modificado) {
      const r = dialog.showMessageBoxSync(win, {
        type: 'question', buttons: ['Guardar', 'No guardar', 'Cancelar'], defaultId: 0, cancelId: 2,
        title: 'MyText', message: '¿Quieres guardar los cambios antes de cerrar?'
      });
      if (r === 2) return;
      if (r === 0) {
        let ok = false;
        try { ok = await win.webContents.executeJavaScript('window.__mytextGuardar ? window.__mytextGuardar() : false'); } catch (err) {}
        if (!ok) return;
      }
      if (r === 1) {
        // "No guardar": olvidar el documento para que no reaparezca al volver a abrir MyText
        try { await win.webContents.executeJavaScript('window.__mytextDescartar ? window.__mytextDescartar() : true'); } catch (err) {}
      }
    }
    puedeCerrar = true;
    win.close();
  });
  win.on('closed', () => { win = null; });
}

// Antes de cambiar de documento: si hay cambios, preguntar Guardar / No guardar / Cancelar
async function permitirCambio() {
  if (!win) return true;
  let modificado = false;
  try { modificado = await win.webContents.executeJavaScript('window.__mytextHayCambios ? window.__mytextHayCambios() : window.__mytextModificado === true'); } catch (e) {}
  if (!modificado) return true;
  if (win.isMinimized()) win.restore();
  win.show(); win.focus();
  const { response } = await dialog.showMessageBox(win, {
    type: 'question', buttons: ['Guardar', 'No guardar', 'Cancelar'], defaultId: 0, cancelId: 2,
    title: 'MyText', message: '¿Quieres guardar los cambios del documento actual?'
  });
  if (response === 2) return false;
  if (response === 0) {
    try { return !!(await win.webContents.executeJavaScript('window.__mytextGuardar ? window.__mytextGuardar() : false')); } catch (e) { return false; }
  }
  return true;
}
ipcMain.handle('confirmar-cambios', () => permitirCambio());

async function enviarArchivo(ruta, preguntar = true) {
  if (preguntar && !(await permitirCambio())) return;
  try {
    const datos = fs.readFileSync(ruta);
    win.webContents.send('abrir-archivo', { ruta, nombre: path.basename(ruta), datos: new Uint8Array(datos), forzar: true });
    anadirReciente(ruta);
  } catch (e) {
    dialog.showErrorBox('MyText', 'No se pudo abrir el archivo:\n' + ruta + '\n\n' + e.message);
  }
}

/* ---------- comunicación con el editor ---------- */
ipcMain.on('info', e => {
  const nm = path.join(__dirname, 'node_modules');
  const libs = {
    pdfjs: 'pdfjs-dist/build/pdf.min.js',
    pdfjsWorker: 'pdfjs-dist/build/pdf.worker.min.js',
    mammoth: 'mammoth/mammoth.browser.min.js',
    jszip: 'jszip/dist/jszip.min.js'
  };
  // Solo se usan las librerías que estén dentro del programa; si falta alguna, el editor la descarga de internet
  const vendor = {};
  for (const [k, rel] of Object.entries(libs)) {
    const f = path.join(nm, rel);
    try { if (fs.existsSync(f)) vendor[k] = pathToFileURL(f).href; } catch (err) {}
  }
  if (!vendor.pdfjs || !vendor.pdfjsWorker) { delete vendor.pdfjs; delete vendor.pdfjsWorker; }
  e.returnValue = { versionPrograma: app.getVersion(), versionEditor: editorActual().version, vendor, archivoInicial: !!archivoPendiente };
});

ipcMain.handle('guardar', async (e, { ruta, datos }) => {
  try { await fs.promises.writeFile(ruta, Buffer.from(datos)); anadirReciente(ruta); return ruta; }
  catch (err) { dialog.showErrorBox('MyText', 'No se pudo guardar:\n' + ruta + '\n\n' + err.message); return null; }
});

ipcMain.handle('guardar-como', async (e, { nombre, datos }) => {
  const ext = (path.extname(nombre).slice(1) || 'docx').toLowerCase();
  const r = await dialog.showSaveDialog(win, {
    title: 'Guardar como',
    defaultPath: path.join(ultimaCarpeta || app.getPath('documents'), nombre),
    filters: [FILTROS[ext] || { name: ext.toUpperCase(), extensions: [ext] }, { name: 'Todos los archivos', extensions: ['*'] }]
  });
  if (r.canceled || !r.filePath) return null;
  try { await fs.promises.writeFile(r.filePath, Buffer.from(datos)); anadirReciente(r.filePath); return r.filePath; }
  catch (err) { dialog.showErrorBox('MyText', 'No se pudo guardar:\n' + r.filePath + '\n\n' + err.message); return null; }
});

ipcMain.handle('abrir-dialogo', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Abrir', defaultPath: ultimaCarpeta || app.getPath('documents'), properties: ['openFile'],
    filters: [
      { name: 'Documentos', extensions: ['docx', 'pdf', 'txt', 'md', 'html', 'htm', 'rtf', 'odt'] },
      { name: 'Todos los archivos', extensions: ['*'] }
    ]
  });
  if (r.canceled || !r.filePaths[0]) return false;
  enviarArchivo(r.filePaths[0]);
  return true;
});

ipcMain.handle('abrir-ruta', (e, ruta) => { enviarArchivo(ruta); return true; });
ipcMain.handle('recientes', () => recientes());
ipcMain.on('titulo', (e, t) => { if (win) win.setTitle(String(t)); });

ipcMain.handle('pdf', async (e, nombre) => {
  const r = await dialog.showSaveDialog(win, {
    title: 'Guardar como PDF', defaultPath: path.join(ultimaCarpeta || app.getPath('documents'), nombre),
    filters: [FILTROS.pdf]
  });
  if (r.canceled || !r.filePath) return null;
  try {
    const datos = await win.webContents.printToPDF({ pageSize: 'A4', printBackground: true, preferCSSPageSize: true });
    await fs.promises.writeFile(r.filePath, datos);
    return r.filePath;
  } catch (err) { dialog.showErrorBox('MyText', 'No se pudo crear el PDF:\n' + err.message); return null; }
});

/* ---------- actualizaciones ---------- */
async function buscarActualizaciones() {
  const res = { editor: null, editorNecesitaPrograma: null, programa: null, error: null };
  try {
    const r = await net.fetch(RAW + 'version.json?t=' + Date.now(), { cache: 'no-store' });
    if (r.ok) {
      const v = await r.json();
      if (cmp(v.version, editorActual().version) > 0) {
        if (cmp(app.getVersion(), v.minApp || '0') >= 0) res.editor = v.version;
        else res.editorNecesitaPrograma = v.version;
      }
    } else res.error = 'No se pudo consultar GitHub (' + r.status + ')';
  } catch (e) { res.error = 'Sin conexión con GitHub'; }
  if (autoUpdater && app.isPackaged) {
    try {
      const r = await autoUpdater.checkForUpdates();
      if (r && r.updateInfo && cmp(r.updateInfo.version, app.getVersion()) > 0) res.programa = r.updateInfo.version;
    } catch (e) { /* todavía no hay versiones publicadas */ }
  }
  return res;
}
ipcMain.handle('buscar-actualizaciones', () => buscarActualizaciones());

ipcMain.handle('actualizar-editor', async () => {
  try {
    const rv = await net.fetch(RAW + 'version.json?t=' + Date.now(), { cache: 'no-store' });
    const v = await rv.json();
    const rh = await net.fetch(RAW + 'editor.html?t=' + Date.now(), { cache: 'no-store' });
    const html = await rh.text();
    if (!rh.ok || !/^<!DOCTYPE html>/i.test(html.trim()) || html.length < 10000) throw new Error('El archivo descargado no es válido');
    const dir = dirEditorDescargado();
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(path.join(dir, 'editor.html'), html, 'utf8');
    await fs.promises.writeFile(path.join(dir, 'version.json'), JSON.stringify(v), 'utf8');
    win.loadFile(editorActual().html);
    return { ok: true, version: v.version };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('actualizar-programa', async () => {
  if (!autoUpdater || !app.isPackaged) return { ok: false, error: 'El actualizador solo funciona en el programa instalado' };
  try {
    await autoUpdater.downloadUpdate();
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
});

if (autoUpdater) {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('download-progress', p => { if (win) win.webContents.send('progreso', Math.round(p.percent)); });
  autoUpdater.on('update-downloaded', info => {
    if (!win) return;
    const r = dialog.showMessageBoxSync(win, {
      type: 'info', buttons: ['Reiniciar ahora', 'Más tarde'], defaultId: 0, cancelId: 1, title: 'MyText',
      message: `La versión ${info.version} está lista.`,
      detail: 'Se instalará al reiniciar MyText. Si eliges "Más tarde", se instalará la próxima vez que lo cierres.'
    });
    if (r === 0) setImmediate(() => autoUpdater.quitAndInstall());
  });
}

/* ---------- arranque ---------- */
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (e, argv) => {
    const f = archivoDeArgs(argv);
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
      if (f) enviarArchivo(f);
    }
  });
  app.whenReady().then(() => {
    crearVentana();
    // Comprobación silenciosa al arrancar
    setTimeout(async () => {
      if (!win) return;
      const r = await buscarActualizaciones();
      if (win && (r.editor || r.programa || r.editorNecesitaPrograma)) win.webContents.send('hay-actualizacion', r);
    }, 5000);
  });
  app.on('window-all-closed', () => app.quit());
}
