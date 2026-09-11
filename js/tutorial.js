(() => {
    'use strict';

    const boardPattern = [
        [0, 0, 1, 1],
        [0, 0, 1, 1],
        [2, 2, 3, 1],
        [2, 2, 3, 3]
    ];

    // Solución fija de demostración:
    // (0,1), (1,3), (2,0), (3,2)
    const solution = [
        [0,1],
        [1,3],
        [2,0],
        [3,2]
    ];

    const board = document.getElementById('tutorial-board');
    const finger = document.getElementById('tutorial-finger');
    const btnPause = document.getElementById('btn-pause');
    const btnReplay = document.getElementById('btn-replay');
    const btnSkip = document.getElementById('btn-skip');
    const finish = document.getElementById('tutorial-finish');

    let cancelled = false;
    let paused = false;
    let pauseResolver = null;

    buildBoard();
    bindUi();
    runTutorial();

    function buildBoard() {
        board.replaceChildren();

        for (let r = 0; r < 4; r++) {
            for (let c = 0; c < 4; c++) {
                const cell = document.createElement('div');
                cell.className = `tutorial-cell color-${boardPattern[r][c]}`;
                cell.dataset.r = r;
                cell.dataset.c = c;
                board.appendChild(cell);
            }
        }
    }

    function bindUi() {
        btnPause.addEventListener('click', () => {
            paused = !paused;
            btnPause.textContent = paused ? 'Continuar' : 'Pausar';

            if (!paused && pauseResolver) {
                pauseResolver();
                pauseResolver = null;
            }
        });

        btnReplay.addEventListener('click', restartTutorial);
        btnSkip.addEventListener('click', showFinish);

        document.getElementById('btn-play').addEventListener('click', () => {
            window.location.href = 'index_niveles.html?nivel=1';
        });

        document.getElementById('btn-repeat-finish').addEventListener('click', () => {
            finish.classList.remove('open');
            finish.setAttribute('aria-hidden','true');
            restartTutorial();
        });

        window.addEventListener('resize', () => {
            finger.style.transition = 'none';
            finger.style.transform = 'translate(-120px,-120px)';
            requestAnimationFrame(() => {
                finger.style.transition = '';
            });
        });
    }

    async function restartTutorial() {
        cancelled = true;
        paused = false;
        btnPause.textContent = 'Pausar';

        await sleepRaw(60);

        cancelled = false;
        finish.classList.remove('open');
        finish.setAttribute('aria-hidden','true');

        resetBoard();
        await runTutorial();
    }

    async function runTutorial() {
        resetBoard();

        setProgress(3);
        setRule(null);
        setCoach(
            'Mira cómo se resuelve',
            'Vamos a resolver un tablero pequeño paso a paso.',
            '🦀'
        );
        setCallout('Observa el tablero', null);
        setCaption('La mano te mostrará qué hacer');

        await wait(900);

        // PASO 1: colocar primera jaiba
        setProgress(12);
        setCoach(
            'Primera jaiba',
            'Empezamos colocando una jaiba en una posición válida.',
            '🦀'
        );
        setCallout('Toca una casilla para colocar la jaiba.', null);
        setCaption('Toque corto = colocar marcador');

        await moveFinger(0,1);
        await fingerTap();
        placeMarker(0,1);
        await wait(800);

        // PASO 2: fila y columna
        setProgress(26);
        setRule('row');
        setCoach(
            'Fila y columna',
            'Como ya hay una jaiba aquí, ninguna otra puede compartir su fila ni su columna.',
            '↔️'
        );
        setCallout('Solo puede haber una jaiba por fila y columna.', 'row');

        highlightRowCol(0,1);
        await wait(1000);

        // Descarta algunas casillas con long press
        clearHighlights();
        setCaption('Mantener presionado = descartar');

        for (const [r,c] of [[0,0],[0,2],[0,3],[1,0],[1,1]]) {
            await moveFinger(r,c);
            await fingerHold();
            placeCross(r,c);
            await wait(260);
        }

        // PASO 3: segunda jaiba y zona
        setProgress(46);
        setRule('zone');
        setCoach(
            'Ahora mira la zona',
            'Cada zona de color también debe contener exactamente una jaiba.',
            '🎨'
        );
        setCallout('Cada zona de color necesita una sola jaiba.', 'zone');

        highlightZone(0);
        await wait(900);
        clearHighlights();

        await moveFinger(1,3);
        await fingerTap();
        placeMarker(1,3);
        await wait(700);

        // PASO 4: vecinos
        setProgress(64);
        setRule('neighbors');
        setCoach(
            'No pueden tocarse',
            'Una jaiba bloquea también las ocho casillas que tiene alrededor.',
            '🚫'
        );
        setCallout('No pueden ser vecinas, ni siquiera en diagonal.', 'neighbors');

        highlightNeighbors(1,3);
        await wait(1100);

        clearHighlights();

        // Descartes provocados por vecinos
        for (const [r,c] of [[1,2],[2,2],[2,3]]) {
            await moveFinger(r,c);
            await fingerHold();
            placeCross(r,c);
            await wait(240);
        }

        // PASO 5: combinación de reglas
        setProgress(78);
        setRule('row');
        setCoach(
            'Combina las reglas',
            'Al descartar opciones, algunas filas y zonas terminan teniendo una sola posibilidad.',
            '💡'
        );
        setCallout('Las reglas trabajan juntas.', 'row');

        await moveFinger(2,0);
        await fingerTap();
        placeMarker(2,0);
        await wait(650);

        // Mostrar zona correspondiente brevemente
        setRule('zone');
        setCallout('Esta zona ya tiene su jaiba.', 'zone');
        highlightZone(3);
        await wait(700);
        clearHighlights();

        // Más descartes
        for (const [r,c] of [[2,1],[3,0],[3,1]]) {
            if (!getCell(r,c).classList.contains('cross')) {
                await moveFinger(r,c);
                await fingerHold();
                placeCross(r,c);
                await wait(200);
            }
        }

        // Última jaiba
        setProgress(92);
        setRule('row');
        setCoach(
            'Última posibilidad',
            'Solo queda una casilla válida para la última jaiba.',
            '✨'
        );
        setCallout('Cuando queda una sola opción, la solución es directa.', 'row');

        await moveFinger(3,2);
        await fingerTap();
        placeMarker(3,2);
        await wait(420);

        // La última fila ya quedó decidida: marcamos el descarte restante.
        await moveFinger(3,3);
        await fingerHold();
        placeCross(3,3);
        await wait(420);

        setProgress(100);
        setRule(null);
        setCoach(
            '¡Tablero resuelto!',
            'Eso es todo: fila, columna, zona y distancia trabajan al mismo tiempo.',
            '🎉'
        );
        setCallout('¡Completado!', null);
        setCaption('Ahora inténtalo tú');

        finger.classList.add('hidden');
        await wait(1200);

        showFinish();
    }

    function resetBoard() {
        [...board.children].forEach(cell => {
            cell.className = `tutorial-cell color-${boardPattern[Number(cell.dataset.r)][Number(cell.dataset.c)]}`;
            cell.textContent = '';
        });

        finger.classList.remove('hidden','tap','hold');
        finger.style.transform = 'translate(-120px,-120px)';
        setProgress(0);
        setRule(null);
    }

    function getCell(r,c) {
        return board.querySelector(`.tutorial-cell[data-r="${r}"][data-c="${c}"]`);
    }

    function placeMarker(r,c) {
        const cell = getCell(r,c);
        cell.classList.remove('cross');
        cell.classList.add('marker');
        cell.textContent = '🦀';
    }

    function placeCross(r,c) {
        const cell = getCell(r,c);
        if (cell.classList.contains('marker')) return;
        cell.classList.add('cross');
    }

    function clearHighlights() {
        [...board.children].forEach(cell => {
            cell.classList.remove(
                'highlight-rowcol',
                'highlight-zone',
                'highlight-neighbor',
                'focus-cell',
                'dim'
            );
        });
    }

    function highlightRowCol(r,c) {
        clearHighlights();

        for (let i=0;i<4;i++) {
            if (i !== c) getCell(r,i).classList.add('highlight-rowcol');
            if (i !== r) getCell(i,c).classList.add('highlight-rowcol');
        }

        getCell(r,c).classList.add('focus-cell');
    }

    function highlightZone(zoneId) {
        clearHighlights();

        for (let r=0;r<4;r++) {
            for (let c=0;c<4;c++) {
                const cell = getCell(r,c);

                if (boardPattern[r][c] === zoneId) {
                    cell.classList.add('highlight-zone');
                } else {
                    cell.classList.add('dim');
                }
            }
        }
    }

    function highlightNeighbors(r,c) {
        clearHighlights();

        for (let rr=Math.max(0,r-1); rr<=Math.min(3,r+1); rr++) {
            for (let cc=Math.max(0,c-1); cc<=Math.min(3,c+1); cc++) {
                if (rr === r && cc === c) continue;
                getCell(rr,cc).classList.add('highlight-neighbor');
            }
        }

        getCell(r,c).classList.add('focus-cell');
    }

    async function moveFinger(r,c) {
        await checkPause();
        if (cancelled) throw new Error('cancelled');

        clearFocusOnly();

        const cell = getCell(r,c);
        cell.classList.add('focus-cell');

        const boardRect = board.getBoundingClientRect();
        const cellRect = cell.getBoundingClientRect();

        const x = cellRect.left - boardRect.left + cellRect.width * .56;
        const y = cellRect.top - boardRect.top + cellRect.height * .48;

        finger.classList.remove('hidden');
        finger.style.transform = `translate(${x}px, ${y}px) translate(-42%, -10%)`;

        await wait(700);
    }

    async function fingerTap() {
        await checkPause();
        finger.classList.remove('tap');
        void finger.offsetWidth;
        finger.classList.add('tap');
        await wait(360);
        finger.classList.remove('tap');
    }

    async function fingerHold() {
        await checkPause();
        finger.classList.remove('hold');
        void finger.offsetWidth;
        finger.classList.add('hold');
        await wait(760);
        finger.classList.remove('hold');
    }

    function clearFocusOnly() {
        [...board.children].forEach(cell => cell.classList.remove('focus-cell'));
    }

    function setCoach(title,text,icon) {
        document.getElementById('step-title').textContent = title;
        document.getElementById('step-text').textContent = text;
        document.getElementById('coach-icon').textContent = icon;
    }

    function setCaption(text) {
        document.getElementById('interaction-caption').textContent = text;
    }

    function setCallout(text,rule) {
        const el = document.getElementById('rule-callout');
        el.textContent = text;
        el.classList.remove('rule-zone','rule-neighbors');

        if (rule === 'zone') el.classList.add('rule-zone');
        if (rule === 'neighbors') el.classList.add('rule-neighbors');
    }

    function setRule(rule) {
        document.querySelectorAll('.mini-rule').forEach(el => {
            el.classList.toggle('active', el.dataset.rule === rule);
        });
    }

    function setProgress(percent) {
        document.getElementById('tutorial-progress').style.width = `${percent}%`;
    }

    async function checkPause() {
        while (paused && !cancelled) {
            await new Promise(resolve => {
                pauseResolver = resolve;
            });
        }
    }

    async function wait(ms) {
        const slice = 50;
        let elapsed = 0;

        while (elapsed < ms) {
            if (cancelled) throw new Error('cancelled');
            await checkPause();
            await sleepRaw(Math.min(slice, ms-elapsed));
            elapsed += slice;
        }
    }

    function sleepRaw(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function showFinish() {
        cancelled = true;
        paused = false;
        btnPause.textContent = 'Pausar';
        finish.classList.add('open');
        finish.setAttribute('aria-hidden','false');
    }

    // Evita que una cancelación de "Repetir" deje una promesa sin manejar.
    window.addEventListener('unhandledrejection', event => {
        if (event.reason?.message === 'cancelled') {
            event.preventDefault();
        }
    });
})();
