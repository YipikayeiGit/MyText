// Prueba real del programa (Electron) en Windows:
// abrir un archivo → cambiarlo → guardar → cerrar → volver a abrirlo → comprobar que el cambio está.
const { _electron: electron } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');
const matarElectron = () => { try { execSync('taskkill /F /IM electron.exe /T', { stdio: 'ignore' }); } catch (e) {} };

const RAIZ = path.join(__dirname, '..');
const ORIGEN = path.join(__dirname, 'archivos');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'mytext-prueba-'));
const CAPTURAS = path.join(RAIZ, 'capturas-prueba');
fs.mkdirSync(CAPTURAS, { recursive: true });

const resultados = [];
const espera = ms => new Promise(r => setTimeout(r, ms));

async function abrirPrograma(archivo) {
  const app = await electron.launch({ args: [RAIZ, archivo], timeout: 60000 });
  const win = await app.firstWindow();
  win.on('dialog', d => d.accept().catch(() => {}));   // aceptar los avisos (confirm) como haría el usuario
  await win.waitForFunction(() => window.__mytextRuta && window.__mytextRuta(), null, { timeout: 45000 });
  await espera(1500);
  return { app, win };
}
async function cerrarPrograma(app) {
  const proc = app.process();
  const salida = new Promise(r => proc.once('exit', r));
  try { await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(w => w.close())); } catch (e) {}
  await Promise.race([salida, espera(20000)]);
  if (proc.exitCode === null) { console.log('   (el programa no se cerró solo; se fuerza el cierre)'); try { proc.kill(); } catch (e) {} matarElectron(); await espera(1500); }
  matarElectron();
  await espera(1500);
}
async function contenido(win) {
  return win.evaluate(async () => {
    if (window.__visorPdf && window.__visorPdf.activo) {
      let t = '';
      for (const p of window.__visorPdf.paginas) t += (await p.page.getTextContent()).items.map(i => i.str).join(' ') + '\n';
      return t;
    }
    return document.getElementById('editor').innerText;
  });
}
async function escribir(win, texto) {
  await win.click('#editor');
  await win.keyboard.press('Control+End');
  await win.keyboard.type(' ' + texto);
  await espera(400);
}
async function registrar(nombre, ok, detalle, win) {
  resultados.push({ nombre, ok, detalle });
  console.log(`${ok ? '✅' : '❌'} ${nombre}${detalle ? ' — ' + detalle : ''}`);
  if (!ok && win) { try { await win.screenshot({ path: path.join(CAPTURAS, nombre.replace(/[^\w.-]+/g, '_') + '.png') }); } catch (e) {} }
}

async function probarCtrlS(ext) {
  const archivo = path.join(TMP, `ctrl-s.${ext}`);
  fs.copyFileSync(path.join(ORIGEN, `prueba.${ext}`), archivo);
  const marca = `MARCA${ext.toUpperCase()}${Date.now() % 100000}`;
  let { app, win } = await abrirPrograma(archivo);
  try {
    await escribir(win, marca);
    await win.keyboard.press('Control+s');
    await win.waitForFunction(() => /Guardado a las/.test(document.getElementById('estadoGuardado').textContent) && !window.__mytextModificado, null, { timeout: 20000 });
  } catch (e) { await registrar(`.${ext} Ctrl+S`, false, 'no terminó de guardar: ' + e.message.split('\n')[0], win); await cerrarPrograma(app); return; }
  const estado = await win.evaluate(() => document.getElementById('estadoGuardado').textContent);
  await cerrarPrograma(app);
  ({ app, win } = await abrirPrograma(archivo));
  const txt = await contenido(win);
  await registrar(`.${ext} Ctrl+S`, txt.includes(marca), txt.includes(marca) ? estado : 'el cambio NO está al volver a abrir', win);
  await cerrarPrograma(app);
}

async function probarGuardarAlCerrar(ext) {
  const archivo = path.join(TMP, `al-cerrar.${ext}`);
  fs.copyFileSync(path.join(ORIGEN, `prueba.${ext}`), archivo);
  const marca = `CIERRE${ext.toUpperCase()}${Date.now() % 100000}`;
  let { app, win } = await abrirPrograma(archivo);
  await escribir(win, marca);
  // Responder "Guardar" en el aviso de cambios sin guardar
  await app.evaluate(({ dialog }) => { dialog.showMessageBoxSync = () => 0; dialog.showMessageBox = async () => ({ response: 0 }); });
  await cerrarPrograma(app);
  ({ app, win } = await abrirPrograma(archivo));
  const txt = await contenido(win);
  await registrar(`.${ext} Guardar al cerrar`, txt.includes(marca), txt.includes(marca) ? '' : 'el cambio NO está al volver a abrir', win);
  await cerrarPrograma(app);
}

async function probarBotonGuardar(ext) {
  const archivo = path.join(TMP, `boton.${ext}`);
  fs.copyFileSync(path.join(ORIGEN, `prueba.${ext}`), archivo);
  const marca = `BOTON${ext.toUpperCase()}${Date.now() % 100000}`;
  let { app, win } = await abrirPrograma(archivo);
  await escribir(win, marca);
  await win.click('.desplegable > button');
  await win.click('#mtGuardar');
  try { await win.waitForFunction(() => !window.__mytextModificado, null, { timeout: 20000 }); } catch (e) {}
  await cerrarPrograma(app);
  ({ app, win } = await abrirPrograma(archivo));
  const txt = await contenido(win);
  await registrar(`.${ext} Archivo → Guardar`, txt.includes(marca), txt.includes(marca) ? '' : 'el cambio NO está al volver a abrir', win);
  await cerrarPrograma(app);
}

async function probarPdf() {
  const archivo = path.join(TMP, 'editar.pdf');
  fs.copyFileSync(path.join(ORIGEN, 'prueba.pdf'), archivo);
  const marca = `PDFMARCA${Date.now() % 100000}`;
  let { app, win } = await abrirPrograma(archivo);
  try {
    await win.click('#vpEditar');
    await win.waitForSelector('.vlinea', { timeout: 20000 });
    await win.locator('.vlinea').nth(1).click();
    await win.keyboard.press('End');
    await win.keyboard.type(' ' + marca);
    await win.keyboard.press('Control+s');
    await win.waitForFunction(() => !window.__visorPdf.cambios, null, { timeout: 30000 });
  } catch (e) { await registrar('.pdf editar texto + Ctrl+S', false, e.message.split('\n')[0], win); await cerrarPrograma(app); return; }
  await cerrarPrograma(app);
  ({ app, win } = await abrirPrograma(archivo));
  await espera(1500);
  const txt = await contenido(win);
  await registrar('.pdf editar texto + Ctrl+S', txt.includes(marca), txt.includes(marca) ? '' : 'el cambio NO está al volver a abrir', win);
  await cerrarPrograma(app);
}

async function probarFormato(ext) {
  const archivo = path.join(TMP, `formato.${ext}`);
  fs.copyFileSync(path.join(ORIGEN, `prueba.${ext}`), archivo);
  const SCRIPT = fs.readFileSync(path.join(__dirname, 'formato-navegador.js'), 'utf8');
  let { app, win } = await abrirPrograma(archivo);
  await win.addScriptTag({ content: SCRIPT });
  await win.evaluate(() => window.__aplicarFormato());
  const antes = await win.evaluate(() => window.__verificarFormato());
  await win.keyboard.press('Control+s');
  try { await win.waitForFunction(() => /Guardado a las/.test(document.getElementById('estadoGuardado').textContent) && !window.__mytextModificado, null, { timeout: 20000 }); }
  catch (e) { await registrar(`.${ext} formato`, false, 'no terminó de guardar', win); await cerrarPrograma(app); return; }
  // Como si se abriera en otro PC: sin los estilos de título guardados en este
  await win.evaluate(() => { localStorage.removeItem('editor-estilos'); localStorage.removeItem('editor-numerar'); });
  await cerrarPrograma(app);
  ({ app, win } = await abrirPrograma(archivo));
  await win.addScriptTag({ content: SCRIPT });
  const fallos = await win.evaluate(() => window.__verificarFormato());
  await registrar(`.${ext} formato (22 comprobaciones)`, !fallos.length && !antes.length, fallos.length ? 'se pierde: ' + fallos.join(', ') : (antes.length ? 'no se aplicó: ' + antes.join(', ') : 'se conserva todo'), win);
  await cerrarPrograma(app);
}

(async () => {
  const formatos = ['docx', 'doc', 'odt', 'rtf', 'txt', 'md', 'html'];
  for (const ext of formatos) { try { await probarCtrlS(ext); } catch (e) { await registrar(`.${ext} Ctrl+S`, false, e.message.split('\n')[0]); } }
  for (const ext of ['docx', 'doc', 'txt']) { try { await probarGuardarAlCerrar(ext); } catch (e) { await registrar(`.${ext} Guardar al cerrar`, false, e.message.split('\n')[0]); } }
  for (const ext of ['docx', 'odt']) { try { await probarBotonGuardar(ext); } catch (e) { await registrar(`.${ext} Archivo → Guardar`, false, e.message.split('\n')[0]); } }
  for (const ext of ['docx', 'doc', 'odt', 'rtf', 'html']) { try { await probarFormato(ext); } catch (e) { await registrar(`.${ext} formato (22 comprobaciones)`, false, e.message.split('\n')[0]); } }
  try { await probarPdf(); } catch (e) { await registrar('.pdf editar texto + Ctrl+S', false, e.message.split('\n')[0]); }
  const fallos = resultados.filter(r => !r.ok);
  console.log(`\n${resultados.length - fallos.length} de ${resultados.length} pruebas correctas`);
  fs.writeFileSync(path.join(CAPTURAS, 'resultados.json'), JSON.stringify(resultados, null, 2));
  process.exit(fallos.length ? 1 : 0);
})();
