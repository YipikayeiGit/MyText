# MyText

Editor de textos para Windows: abre Word (.docx), PDF, TXT, Markdown, HTML, RTF y ODT; guarda en .docx, PDF, HTML, TXT y Markdown. Tiene páginas A4, títulos numerados con índice, imágenes con ajuste de texto, copiar formato, corrector ortográfico y vista adaptada a móvil.

## Instalar

1. Ve a la pestaña **Releases** de este repositorio y descarga `MyText-Setup-X.Y.Z.exe`.
2. Ábrelo. Si Windows muestra *"Windows protegió su PC"*, pulsa **Más información → Ejecutar de todos modos** (el programa no tiene firma digital de pago).
3. Para que tus archivos se abran con doble clic: clic derecho sobre un archivo → **Abrir con → Elegir otra aplicación → MyText**, y marca *"Usar siempre esta aplicación"*.

## Actualizaciones

MyText las busca solo al arrancar, y también desde **Ver → Buscar actualizaciones**.

- **Cambios del editor** (carpeta `editor/`): basta con subir `editor/editor.html` y aumentar la versión en `editor/version.json`. El programa los descarga y se recarga en un segundo, sin reinstalar nada.
- **Cambios del programa** (`main.js`, `preload.js`, `package.json`): se aumenta `version` en `package.json`. GitHub Actions construye el instalador y lo publica en *Releases*; el programa lo descarga y se instala al reiniciar.

`minApp` en `editor/version.json` indica la versión mínima del programa que necesita ese editor.

## Estructura

| Archivo | Qué es |
|---|---|
| `editor/editor.html` | El editor completo (también funciona abierto en el navegador) |
| `editor/version.json` | Versión del editor |
| `main.js` | Programa de Windows (ventana, abrir/guardar, actualizaciones) |
| `preload.js` | Puente seguro entre el editor y el programa |
| `.github/workflows/publicar.yml` | Construye y publica el instalador |
