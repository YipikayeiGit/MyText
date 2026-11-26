// Se carga dentro del editor. Aplica formato con los mismos comandos que usa el usuario
// y después comprueba que, al volver a abrir el archivo, el formato sigue ahí.
(function () {
  const IMG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAIAAAD/gAIDAAAA6UlEQVR4Xu3QMRHAIADAwFJZWEMnfjgckP1/zpQx1/54879lXGYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgUHYsoCUqEXHtcAAAAASUVORK5CYII=';
  const PALABRAS = 'NEGRITA CURSIVA SUBRAYADO TACHADO ROJO RESALTADO GRANDE GEORGIA SUPERINDICE';

  function nodoCon(palabra) {
    const tw = document.createTreeWalker(document.getElementById('editor'), NodeFilter.SHOW_TEXT);
    let n; while ((n = tw.nextNode())) { const i = n.nodeValue.indexOf(palabra); if (i >= 0) return { n, i }; }
    return null;
  }
  function seleccionar(palabra) {
    const r0 = nodoCon(palabra); if (!r0) throw new Error('no encuentro ' + palabra);
    const r = document.createRange(); r.setStart(r0.n, r0.i); r.setEnd(r0.n, r0.i + palabra.length);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r); rangoGuardado = r.cloneRange();
  }
  function cursorEn(palabra) {
    const r0 = nodoCon(palabra); const r = document.createRange(); r.setStart(r0.n, r0.i + 1); r.collapse(true);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r); rangoGuardado = r.cloneRange();
  }

  window.__aplicarFormato = async function () {
    const ed = document.getElementById('editor');
    ed.focus();
    ed.innerHTML = '<h1>Titulo verde</h1>' +
      '<p>Parrafo centrado</p><p>Parrafo justificado con bastante texto para que se note la justificacion en varias lineas del documento de prueba.</p><p>Parrafo a la derecha</p>' +
      `<p>${PALABRAS}</p>` +
      '<p>Interlineado doble</p><p>Parrafo con sangria</p><p>Espacio despues amplio</p>' +
      '<p>Vineta primera</p><p>Numero primero</p><p>Imagen: aqui</p><p>Final del documento</p>';
    actualizar();
    cursorEn('centrado'); cmd('justifyCenter');
    cursorEn('justificado'); cmd('justifyFull');
    cursorEn('derecha'); cmd('justifyRight');
    seleccionar('NEGRITA'); cmd('bold');
    seleccionar('CURSIVA'); cmd('italic');
    seleccionar('SUBRAYADO'); cmd('underline');
    seleccionar('TACHADO'); cmd('strikeThrough');
    seleccionar('ROJO'); cmd('foreColor', '#d62828');
    seleccionar('RESALTADO'); cmd('hiliteColor', '#ffff00');
    seleccionar('GRANDE'); cmd('fontSize', '6');
    seleccionar('GEORGIA'); cmd('fontName', 'Georgia');
    seleccionar('SUPERINDICE'); cmd('superscript');
    cursorEn('Interlineado'); aplicarInterlineado('2');
    cursorEn('sangria'); cmd('indent');
    cursorEn('Espacio despues'); aplicarInterlineado('esp:1.5em');
    cursorEn('Vineta'); cmd('insertUnorderedList');
    cursorEn('Numero primero'); cmd('insertOrderedList');
    cursorEn('Titulo verde'); cmd('foreColor', '#008000');   // cambia el estilo de todos los Título 1
    // imagen con ajuste "cuadrado a la izquierda"
    const p = [...ed.querySelectorAll('p')].find(x => x.textContent.includes('Imagen:'));
    const img = document.createElement('img'); img.src = IMG; img.dataset.ajuste = 'linea'; img.style.width = '150px';
    p.appendChild(img); await img.decode().catch(() => {});
    ponerAjuste(img, 'izq');
    actualizar();
    return ed.innerHTML.length;
  };

  window.__verificarFormato = function (formato) {
    const fallos = [];
    const ed = document.getElementById('editor');
    const cs = el => getComputedStyle(el);
    const bloque = palabra => { const r = nodoCon(palabra); return r && r.n.parentElement.closest('p,li,h1,h2,h3,div:not(#editor),td,blockquote'); };
    const elem = palabra => { const r = nodoCon(palabra); return r && r.n.parentElement; };
    const ancestros = (el, fn) => { while (el && el !== ed) { if (fn(cs(el))) return true; el = el.parentElement; } return false; };
    const comprobar = (nombre, ok) => { if (!ok) fallos.push(nombre); };
    const b = w => bloque(w) || document.body, e = w => elem(w) || document.body;

    comprobar('centrado', cs(b('centrado')).textAlign === 'center');
    comprobar('justificado', cs(b('justificado')).textAlign === 'justify');
    comprobar('alineado a la derecha', cs(b('derecha')).textAlign === 'right');
    comprobar('negrita', +cs(e('NEGRITA')).fontWeight >= 600);
    comprobar('cursiva', cs(e('CURSIVA')).fontStyle === 'italic');
    comprobar('subrayado', ancestros(e('SUBRAYADO'), c => (c.textDecorationLine || '').includes('underline')));
    comprobar('tachado', ancestros(e('TACHADO'), c => (c.textDecorationLine || '').includes('line-through')));
    comprobar('color rojo', /214,\s*40,\s*40/.test(cs(e('ROJO')).color));
    comprobar('resaltado', ancestros(e('RESALTADO'), c => /255,\s*255,\s*0/.test(c.backgroundColor)));
    comprobar('tamaño grande', parseFloat(cs(e('GRANDE')).fontSize) >= 28);
    comprobar('fuente Georgia', /georgia/i.test(cs(e('GEORGIA')).fontFamily));
    comprobar('superíndice', ancestros(e('SUPERINDICE'), c => c.verticalAlign === 'super'));
    const lh = b('Interlineado'); comprobar('interlineado doble', parseFloat(cs(lh).lineHeight) / parseFloat(cs(lh).fontSize) > 1.8);
    const sg = b('sangria'); comprobar('sangría', sg && (sg.getBoundingClientRect().left - ed.getBoundingClientRect().left) > 20);
    comprobar('espacio después del párrafo', parseFloat(cs(b('Espacio despues')).marginBottom) > 18);
    comprobar('lista con viñetas', !!(e('Vineta') && e('Vineta').closest('ul')));
    comprobar('lista numerada', !!(e('Numero primero') && e('Numero primero').closest('ol')));
    comprobar('título', !!ed.querySelector('h1'));
    comprobar('color del Título 1', !!ed.querySelector('h1') && /0,\s*128,\s*0/.test(cs(ed.querySelector('h1')).color));
    const img = ed.querySelector('img');
    comprobar('imagen', !!img);
    comprobar('tamaño de imagen', !!img && Math.abs(img.getBoundingClientRect().width / escala - 150) < 8);
    comprobar('imagen con ajuste cuadrado', !!img && cs(img).float === 'left');
    return fallos;
  };
})();
