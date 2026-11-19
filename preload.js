// Puente seguro entre el editor (página web) y el programa de Windows
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const info = ipcRenderer.sendSync('info');

contextBridge.exposeInMainWorld('mytext', {
  info,
  guardar: (ruta, datos) => ipcRenderer.invoke('guardar', { ruta, datos }),
  guardarComo: (nombre, datos) => ipcRenderer.invoke('guardar-como', { nombre, datos }),
  abrir: () => ipcRenderer.invoke('abrir-dialogo'),
  abrirRuta: ruta => ipcRenderer.invoke('abrir-ruta', ruta),
  nuevaVentana: () => ipcRenderer.invoke('nueva-ventana'),
  recientes: () => ipcRenderer.invoke('recientes'),
  confirmarCambios: () => ipcRenderer.invoke('confirmar-cambios'),
  titulo: t => ipcRenderer.send('titulo', t),
  rutaDe: file => { try { return webUtils.getPathForFile(file) || null; } catch (e) { return null; } },
  pdf: (nombre, ruta) => ipcRenderer.invoke('pdf', ruta ? { nombre, ruta } : nombre),
  elegirRuta: (nombre, ext, soloPdf) => ipcRenderer.invoke('elegir-ruta', { nombre, ext, soloPdf: !!soloPdf }),
  buscarActualizaciones: () => ipcRenderer.invoke('buscar-actualizaciones'),
  actualizarEditor: () => ipcRenderer.invoke('actualizar-editor'),
  actualizarPrograma: () => ipcRenderer.invoke('actualizar-programa'),
  alAbrirArchivo: cb => ipcRenderer.on('abrir-archivo', (e, d) => cb(d)),
  alProgreso: cb => ipcRenderer.on('progreso', (e, p) => cb(p)),
  alHayActualizacion: cb => ipcRenderer.on('hay-actualizacion', (e, d) => cb(d))
});
