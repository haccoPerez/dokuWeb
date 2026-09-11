// Generador PRNG (Mulberry32)

function generarSeedPorTimestamp() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const aa = pad(d.getFullYear() % 100);
    const MM = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    const hh = pad(d.getHours());
    const mm = pad(d.getMinutes());
    const ss = pad(d.getSeconds());
    return Number(`${aa}${MM}${dd}${hh}${mm}${ss}`);
}

let currentSeed = generarSeedPorTimestamp();
//let currentSeed = Date.now(); // Cambia esto por un string alfanumérico hasheado para retos diarios
function mulberry32(a) {
    return function() {
      var t = a += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
}
let seededRandom = mulberry32(currentSeed);

// --- SISTEMA DE TEMAS ---
const THEMES = {
    crab: { name: "Jaiba", icon: "🦀" },
    raccoon: { name: "Mapache", icon: "🦝" },
    alien: { name: "Alien", icon: "👽" }
};
let currentTheme = THEMES.crab;

// --- SISTEMA DE PESOS (dificultad heurística) ---
// Usado por el motor de deducción para puntuar cuánto "cuesta" cada paso lógico.
const WEIGHTS = {
    DIRECT: 1,       // Nivel Básico: exclusión evidente / única celda disponible
    CONFINEMENT: 3,  // Nivel Medio: bioma monopoliza una fila o columna
    PROJECTION: 10   // Nivel Avanzado: look-ahead / contradicción
};

let timerInterval;
let secondsElapsed = 0;

let SIZE = 4;
let lives = 3;

// Estrellas v1:
// 3 estrellas = terminar con 3 vidas
// 2 estrellas = terminar con 2 vidas
// 1 estrella  = terminar con 1 vida
function calculateStarsFromLives() {
    return Math.max(1, Math.min(3, lives));
}

// --- NIVEL CURADO / PROGRESIÓN ---
// El tablero ya no se elige al azar. level-manager.js determina el nivel,
// progresion.json determina {tamano, indice}, y el diccionario curado aporta
// la seed reproducible del puzzle.
let currentLevelInfo = null;
let currentDictionaryEntry = null;
let levelLoadToken = 0;
const dictionaryCache = new Map();
const DICTIONARY_BASE_URL = 'data';
let gameOver = false;
let markersPlaced = 0;

let regionGrid = [];
let solution = [];
let stateGrid = [];

let currentHintCells = [];
let isDrawingCrosses = false;

// Estado unificado para mouse, touch y stylus.
let pressTimer = null;
let activePointerId = null;
let pressStartCell = null;
let sweepMode = null; // 'PAINT' | 'ERASE'
let pointerStartX = 0;
let pointerStartY = 0;
let pointerMoved = false;
let pointerDownAt = 0;

// Mantener presionado activa el modo descarte/arrastre.
const LONG_PRESS_MS = 260;
const RESULT_DIALOG_ARM_MS = 320;
const TAP_MOVE_TOLERANCE = 10;

const boardEl = (typeof document !== 'undefined') ? document.getElementById('board') : null;

if (boardEl) {
    // Evita que el navegador interprete el arrastre del tablero como scroll/zoom
    boardEl.style.touchAction = 'none';

    // Bloqueamos el menú contextual solo dentro del tablero
    boardEl.addEventListener('contextmenu', e => e.preventDefault());
}

function formatTime(totalSeconds) {
    let m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    let s = (totalSeconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

function startTimer() {
    clearInterval(timerInterval);
    secondsElapsed = 0;
    document.getElementById('timer').innerText = "00:00";
    timerInterval = setInterval(() => {
        if (!gameOver) {
            secondsElapsed++;
            document.getElementById('timer').innerText = formatTime(secondsElapsed);
        }
    }, 1000);
}

function getCurrentLevelNumber() {
    return currentLevelInfo?.nivel
        ?? window.TampiDokuLevel?.currentLevel
        ?? 1;
}

function getRecordKey() {
    return `tampidoku_record_nivel_${getCurrentLevelNumber()}`;
}

function updateRecordDisplay() {
    let record = localStorage.getItem(getRecordKey());
    document.getElementById('record-display').innerText =
        record ? formatTime(parseInt(record, 10)) : "--:--";
}

async function loadCuratedDictionary(size) {
    if (dictionaryCache.has(size)) {
        return dictionaryCache.get(size);
    }

    const url = `${DICTIONARY_BASE_URL}/diccionario_${size}x${size}_N.json`;
    const response = await fetch(url, { cache: 'no-store' });

    if (!response.ok) {
        throw new Error(`No se pudo cargar ${url} (${response.status})`);
    }

    const dictionary = await response.json();

    if (!Array.isArray(dictionary)) {
        throw new Error(`${url} no contiene un arreglo JSON válido.`);
    }

    dictionaryCache.set(size, dictionary);
    return dictionary;
}

async function initBoard() {
    const info = window.TampiDokuLevel?.currentEntry;

    if (!info) {
        throw new Error('No hay un nivel activo en TampiDokuLevel.');
    }

    const loadToken = ++levelLoadToken;

    currentLevelInfo = info;
    SIZE = Number(info.tamano);

    if (!Number.isInteger(SIZE) || SIZE < 1) {
        throw new Error(`Tamaño inválido en progresion.json para nivel ${info.nivel}.`);
    }

    const dictionary = await loadCuratedDictionary(SIZE);

    // Si el jugador cambió de nivel mientras terminaba el fetch, descartamos
    // esta carga para evitar pintar un tablero viejo sobre el nuevo.
    if (loadToken !== levelLoadToken) return false;

    const dictionaryIndex = Number(info.indice);
    const entry = dictionary[dictionaryIndex];

    if (!entry) {
        throw new Error(
            `Nivel ${info.nivel}: no existe el índice ${dictionaryIndex} ` +
            `en diccionario_${SIZE}x${SIZE}_N.json.`
        );
    }

    if (entry.seed === undefined || entry.seed === null) {
        throw new Error(
            `Nivel ${info.nivel}: la entrada ${dictionaryIndex} del diccionario ` +
            `no contiene "seed".`
        );
    }

    currentDictionaryEntry = entry;

    // generateRandomLevel(size, seed) usa un PRNG aislado, por lo que esta seed
    // siempre reconstruye exactamente el mismo tablero.
    const newLevel = generateRandomLevel(SIZE, entry.seed);

    if (!newLevel) {
        throw new Error(
            `Nivel ${info.nivel}: la seed ${entry.seed} no pudo reconstruirse.`
        );
    }

    if (loadToken !== levelLoadToken) return false;

    solution = newLevel.generatedSolution;
    regionGrid = newLevel.generatedRegions;
    stateGrid = Array(SIZE).fill(0).map(() => Array(SIZE).fill('EMPTY'));

    boardEl.innerHTML = '';
    boardEl.style.gridTemplateColumns = `repeat(${SIZE}, minmax(0, 1fr))`;

    for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
            const cell = document.createElement('div');
            cell.className = `cell color-${regionGrid[r][c] % 10}`;
            cell.dataset.r = r;
            cell.dataset.c = c;
            boardEl.appendChild(cell);
        }
    }

    console.info(
        `[TampiDoku] Nivel ${info.nivel}: ${SIZE}x${SIZE}, ` +
        `indice=${dictionaryIndex}, seed=${entry.seed}, score=${info.score}`
    );

    console.table(regionGrid);

    console.log(
        '[TampiDoku] Firma visual:',
        normalizeRegionsForDebug(regionGrid)
            .map(row => row.join(','))
            .join('|')
    );

    function normalizeRegionsForDebug(grid) {
        const map = new Map();
        let next = 0;

        return grid.map(row =>
            row.map(id => {
                if (!map.has(id)) {
                    map.set(id, next++);
                }

                return map.get(id);
            })
        );
    }
    return true;
}

// --- LÓGICA DE INTERACCIÓN (POINTER EVENTS) ---

function tryPlaceMarker(r, c, cell) {
    const currentState = stateGrid[r][c];
    if (gameOver) return;

    if (currentState === 'LOCKED' || currentState === 'MARKER') {
        return;
    }

    if (currentState === 'CROSS') {
        cell.classList.remove('cross');
    }

    if (solution.some(pos => pos.r === r && pos.c === c)) {
        stateGrid[r][c] = 'MARKER';
        cell.classList.add('marker');
        cell.innerText = currentTheme.icon; // Inyección dinámica
        
        markersPlaced++;
        checkWin();
    } else {
        triggerError(cell, r, c);
    }
}

function applySweepToCell(r, c, cell) {
    if (gameOver || !sweepMode) return;
    const currentState = stateGrid[r][c];

    if (sweepMode === 'PAINT' && currentState === 'EMPTY') {
        stateGrid[r][c] = 'CROSS';
        cell.classList.add('cross');
        return;
    }

    if (sweepMode === 'ERASE' && currentState === 'CROSS') {
        stateGrid[r][c] = 'EMPTY';
        cell.classList.remove('cross');
    }
}

function getCellFromPoint(clientX, clientY) {
    const element = document.elementFromPoint(clientX, clientY);
    if (!element) return null;
    const cell = element.closest('.cell');
    if (!cell || !boardEl.contains(cell)) return null;
    return cell;
}

function getCellCoordinates(cell) {
    return {
        r: Number(cell.dataset.r),
        c: Number(cell.dataset.c)
    };
}

function beginSweep(startCell) {
    if (!startCell) return;
    const { r, c } = getCellCoordinates(startCell);
    const currentState = stateGrid[r][c];

    sweepMode = currentState === 'CROSS' ? 'ERASE' : 'PAINT';
    isDrawingCrosses = true;
    applySweepToCell(r, c, startCell);
}

function endPointerInteraction() {
    clearTimeout(pressTimer);
    pressTimer = null;
    activePointerId = null;
    pressStartCell = null;
    sweepMode = null;
    isDrawingCrosses = false;
    pointerMoved = false;
    pointerDownAt = 0;
}

if (boardEl) {
    boardEl.addEventListener('pointerdown', (e) => {
        if (gameOver) return;
        if (isAnimatingComodin) return;
        if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 2) return;
        if (activePointerId !== null) return;

        const cell = e.target.closest('.cell');
        if (!cell || !boardEl.contains(cell)) return;

        const { r, c } = getCellCoordinates(cell);
        const currentState = stateGrid[r][c];

        if (currentState === 'LOCKED' || currentState === 'MARKER') return;

        e.preventDefault();
        cell.releasePointerCapture(e.pointerId);

        activePointerId = e.pointerId;
        pointerDownAt = performance.now();
        pressStartCell = cell;
        pointerStartX = e.clientX;
        pointerStartY = e.clientY;
        pointerMoved = false;

        clearTimeout(pressTimer);

        if (e.pointerType === 'mouse' && e.button === 2) {
            beginSweep(cell);
            return;
        }

        isDrawingCrosses = false;
        sweepMode = null;

        pressTimer = setTimeout(() => {
            if (activePointerId !== e.pointerId) return;
            beginSweep(pressStartCell);
        }, LONG_PRESS_MS);
    });
}

if (typeof window !== 'undefined') {
    window.addEventListener('pointermove', (e) => {
        if (activePointerId !== e.pointerId) return;
        e.preventDefault();

        const dx = e.clientX - pointerStartX;
        const dy = e.clientY - pointerStartY;

        if (Math.hypot(dx, dy) > TAP_MOVE_TOLERANCE) {
            pointerMoved = true;
        }

        if (!isDrawingCrosses) return;

        const cell = getCellFromPoint(e.clientX, e.clientY);
        if (!cell) return;

        const { r, c } = getCellCoordinates(cell);
        applySweepToCell(r, c, cell);
    });

    window.addEventListener('pointerup', (e) => {
        if (activePointerId !== e.pointerId) return;

        e.preventDefault();
        clearTimeout(pressTimer);

        // Copiamos el estado antes de limpiarlo. Así una misma interacción física
        // solo puede producir una acción del tablero.
        const startCell = pressStartCell;
        const wasDrawingCrosses = isDrawingCrosses;
        const didMove = pointerMoved;
        const pressDuration = pointerDownAt
            ? performance.now() - pointerDownAt
            : 0;

        const isRightMouseButton =
            e.pointerType === 'mouse' && e.button === 2;

        // Limpiamos ANTES de ejecutar la acción. Esto evita reentradas accidentales.
        endPointerInteraction();

        if (!wasDrawingCrosses && !isRightMouseButton && !didMove) {
            const releaseCell = getCellFromPoint(e.clientX, e.clientY);

            if (releaseCell === startCell && startCell) {
                const { r, c } = getCellCoordinates(startCell);

                // Un toque corto es siempre intento de marcador.
                // El descarte comienza únicamente al mantener LONG_PRESS_MS.
                if (pressDuration < LONG_PRESS_MS + 80) {
                    tryPlaceMarker(r, c, startCell);
                }
            }
        }
    }, { passive: false });

    window.addEventListener('pointercancel', (e) => {
        if (activePointerId !== e.pointerId) return;
        endPointerInteraction();
    });
}



function showLoseDialog() {
    const dialog = document.getElementById('lose-dialog');
    if (!dialog) return;

    dialog.classList.remove('ready');
    dialog.classList.add('open');
    dialog.setAttribute('aria-hidden', 'false');

    // Evita que el pointerup/click que causó la tercera vida perdida
    // atraviese hacia el botón Reintentar recién aparecido.
    setTimeout(() => {
        if (!dialog.classList.contains('open')) return;

        dialog.classList.add('ready');
        document.getElementById('btn-retry-level')?.focus();
    }, RESULT_DIALOG_ARM_MS);
}

function hideLoseDialog() {
    const dialog = document.getElementById('lose-dialog');
    if (!dialog) return;

    dialog.classList.remove('open', 'ready');
    dialog.setAttribute('aria-hidden', 'true');
}

function playWinConfetti() {
    const confetti = document.getElementById('win-confetti');
    if (!confetti) return;

    confetti.classList.remove('active');
    void confetti.offsetWidth;
    confetti.classList.add('active');

    setTimeout(() => {
        confetti.classList.remove('active');
    }, 2900);
}

function setupResultUi() {
    // Los botones de resultado usan onclick directo en index_niveles.html.
    // Aquí solo manejamos Escape para no registrar acciones duplicadas.
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            const dialog = document.getElementById('lose-dialog');
            if (dialog?.classList.contains('open')) {
                hideLoseDialog();
            }
        }
    });
}


// --- FLUJO DE PARTIDA ---

async function resetGame() {
    hideLoseDialog();

    const info = window.TampiDokuLevel?.currentEntry;

    if (!info) {
        console.warn('[TampiDoku] resetGame() llamado antes de que la progresión esté lista.');
        return;
    }

    currentLevelInfo = info;
    SIZE = Number(info.tamano);

    const themeKeys = Object.keys(THEMES);
    currentTheme = THEMES[themeKeys[Math.floor(seededRandom() * themeKeys.length)]];

    let btnReveal = document.getElementById('btn-reveal');
    if (btnReveal) btnReveal.innerText = `🛸 Revelar ${currentTheme.name}`;

    lives = 3;
    gameOver = true; // bloquea interacción mientras carga el puzzle
    markersPlaced = 0;
    endPointerInteraction();

    document.getElementById('lives').innerText = lives;
    document.getElementById('game-message').innerText = "";

    clearInterval(timerInterval);
    document.getElementById('timer').innerText = "00:00";

    updateRecordDisplay();
    clearHints();

    try {
        const loaded = await initBoard();
        if (!loaded) return;

        gameOver = false;
        startTimer();
    } catch (error) {
        gameOver = true;
        console.error('[TampiDoku]', error);

        const msg = document.getElementById('game-message');
        msg.innerText = `Error al cargar el nivel ${getCurrentLevelNumber()}.`;
        msg.style.color = "red";
    }
}

function triggerError(cell, r, c) {
    lives--;
    document.getElementById('lives').innerText = lives;
    
    cell.classList.add('error-shake');
    setTimeout(() => cell.classList.remove('error-shake'), 400);

    stateGrid[r][c] = 'LOCKED'; 
    cell.classList.add('cross');
    cell.style.cursor = 'not-allowed';

    if(lives <= 0) {
        gameOver = true;
        clearInterval(timerInterval);

        const msg = document.getElementById('game-message');
        msg.innerText = "Te quedaste sin vidas.";
        msg.style.color = "#c05621";

        showLoseDialog();
    }
}

function checkWin() {
    if (markersPlaced === SIZE) {
        gameOver = true;
        clearInterval(timerInterval);

        let currentRecord = localStorage.getItem(getRecordKey());
        let isNewRecord = false;

        if (!currentRecord || secondsElapsed < parseInt(currentRecord, 10)) {
            localStorage.setItem(getRecordKey(), secondsElapsed);
            isNewRecord = true;
        }

        updateRecordDisplay();

        const completedLevel = getCurrentLevelNumber();
        const msg = document.getElementById('game-message');

        playWinConfetti();

        if (isNewRecord) {
            msg.innerText = `¡NUEVO RÉCORD! (${formatTime(secondsElapsed)}) Avanzando...`;
        } else {
            msg.innerText = `¡Completado en ${formatTime(secondsElapsed)}! Avanzando...`;
        }
        msg.style.color = "green";

        // Guardamos el resultado real antes de avanzar.
        // player-progress.js conserva la mejor cantidad de estrellas y el mejor tiempo.
        const starsEarned = calculateStarsFromLives();
        window.TampiDokuProgress?.completeLevel(completedLevel, {
            stars: starsEarned,
            time: secondsElapsed
        });

        const starsText = '⭐'.repeat(starsEarned);
        msg.innerText += ` ${starsText}`;

        // El avance ya no depende de SIZE. Desbloqueamos el siguiente nivel
        // y pedimos al level-manager que lo cargue según progresion.json.
        window.TampiDokuLevel?.markCompleted(completedLevel);

        setTimeout(() => {
            const manager = window.TampiDokuLevel;
            if (!manager) return;

            if (completedLevel < manager.maxLevel) {
                manager.goToLevel(completedLevel + 1);
            } else {
                msg.innerText = `¡Completaste el nivel ${completedLevel}!`;
            }
        }, 3000);
    }
}

// --- SISTEMA DE PISTAS Y COMODÍN ---

function requestHint() {
	if (isAnimatingComodin) return;
    if (gameOver) return;
    clearHints(); 

    let hint = findLogicalHint();
    if (hint) {
        currentHintCells = hint.cells; 
        let display = document.getElementById('hint-display');
        display.innerText = hint.message;

        if (hint.action === 'AUTO_CROSS') {
            let btn = document.createElement('button');
            btn.innerText = "Aplicar • Automáticamente";
            btn.style.marginLeft = "15px";
            btn.style.padding = "2px 10px";
            btn.style.backgroundColor = "#ffd700";
            btn.style.color = "#000";
            btn.style.border = "none";
            btn.style.borderRadius = "4px";
            btn.style.cursor = "pointer";
            btn.onclick = applyAutoCross;
            display.appendChild(btn);
        } else if (hint.action === 'PLACE_MARKER') {
            let btn = document.createElement('button');
            btn.innerText = "Colocar marcador";
            btn.style.marginLeft = "15px";
            btn.style.padding = "2px 10px";
            btn.style.backgroundColor = "#ffd700";
            btn.style.color = "#000";
            btn.style.border = "none";
            btn.style.borderRadius = "4px";
            btn.style.cursor = "pointer";
            btn.onclick = applyPlaceMarkerFromHint;
            display.appendChild(btn);
        }

        hint.cells.forEach(coord => {
            let domCell = document.querySelector(`.cell[data-r='${coord.r}'][data-c='${coord.c}']`);
            if(domCell) domCell.classList.add('highlight-hint');
        });
    } else {
        document.getElementById('hint-display').innerText = "Todo parece en orden. ¡Usa tu intuición tamaulipeca!";
    }
}

function applyAutoCross() {
    currentHintCells.forEach(coord => {
        if (stateGrid[coord.r][coord.c] === 'EMPTY') {
            stateGrid[coord.r][coord.c] = 'CROSS';
            let domCell = document.querySelector(`.cell[data-r='${coord.r}'][data-c='${coord.c}']`);
            if (domCell) domCell.classList.add('cross');
        }
    });
    clearHints();
}

function applyPlaceMarkerFromHint() {
    if (currentHintCells.length === 0) return;
    let { r, c } = currentHintCells[0];
    let domCell = document.querySelector(`.cell[data-r='${r}'][data-c='${c}']`);
    clearHints();
    if (domCell) tryPlaceMarker(r, c, domCell);
}

function clearHints() {
    document.querySelectorAll('.highlight-hint').forEach(el => el.classList.remove('highlight-hint'));
    document.getElementById('hint-display').innerHTML = ""; 
    currentHintCells = [];
}

if (boardEl) {
    boardEl.addEventListener('click', clearHints);
}

// ============================================================
// MOTOR PURO DE DEDUCCIÓN
// Todas las funciones de este bloque reciben (stateGrid, regionGrid, size)
// como parámetros explícitos y NUNCA leen variables globales ni tocan el
// DOM. Esto permite que el mismo motor sirva tanto para las pistas en vivo
// (findLogicalHint más abajo) como para un futuro Web Worker / script
// curador offline, que no tiene acceso a `document`.
// ============================================================

function getGroupCells(regionGrid, size, type, index) {
    // type: 'row' | 'col' | 'biome'
    let cells = [];
    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            if (type === 'row' && r === index) cells.push({ r, c });
            else if (type === 'col' && c === index) cells.push({ r, c });
            else if (type === 'biome' && regionGrid[r][c] === index) cells.push({ r, c });
        }
    }
    return cells;
}

function findMarkerExclusions(stateGrid, regionGrid, size, markerR, markerC) {
    let cells = [];
    let markerBiome = regionGrid[markerR][markerC];
    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            if (stateGrid[r][c] !== 'EMPTY') continue;
            let isSameRow = (r === markerR);
            let isSameCol = (c === markerC);
            let isSameBiome = (regionGrid[r][c] === markerBiome);
            let isAdjacent = (Math.abs(r - markerR) <= 1 && Math.abs(c - markerC) <= 1);
            if (isSameRow || isSameCol || isSameBiome || isAdjacent) {
                cells.push({ r, c });
            }
        }
    }
    return cells;
}

// Nivel Básico: exclusión evidente tras un marcador + aprobación de marcador
// cuando a una fila, columna o zona solo le queda una celda disponible.
function findDirectDeductions(stateGrid, regionGrid, size) {
    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            if (stateGrid[r][c] === 'MARKER') {
                let cellsToCross = findMarkerExclusions(stateGrid, regionGrid, size, r, c);
                if (cellsToCross.length > 0) {
                    return {
                        layer: 'DIRECT',
                        action: 'AUTO_CROSS',
                        weight: WEIGHTS.DIRECT,
                        message: `Un marcador en la fila ${r + 1} ya aseguró su territorio.`,
                        cells: cellsToCross
                    };
                }
            }
        }
    }

    const groupLabel = { row: 'la fila', col: 'la columna', biome: 'la zona' };
    for (let type of ['row', 'col', 'biome']) {
        for (let index = 0; index < size; index++) {
            let groupCells = getGroupCells(regionGrid, size, type, index);
            if (groupCells.length === 0) continue;
            let hasMarker = groupCells.some(({ r, c }) => stateGrid[r][c] === 'MARKER');
            if (hasMarker) continue;
            let emptyCells = groupCells.filter(({ r, c }) => stateGrid[r][c] === 'EMPTY');
            if (emptyCells.length === 1) {
                return {
                    layer: 'DIRECT',
                    action: 'PLACE_MARKER',
                    weight: WEIGHTS.DIRECT,
                    message: `Solo queda una casilla disponible en ${groupLabel[type]} ${index + 1}.`,
                    cells: [emptyCells[0]]
                };
            }
        }
    }

    return null;
}

// Nivel Medio: las celdas libres de un bioma quedan alineadas en una misma
// fila o columna, así que el bioma "monopoliza" esa línea.
function findConfinementDeductions(stateGrid, regionGrid, size) {
    let emptyCellsPerBiome = {};
    for (let i = 0; i < size; i++) emptyCellsPerBiome[i] = [];
    let biomesWithMarkers = new Set();

    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            let biomeId = regionGrid[r][c];
            if (stateGrid[r][c] === 'MARKER') {
                biomesWithMarkers.add(biomeId);
            } else if (stateGrid[r][c] === 'EMPTY') {
                emptyCellsPerBiome[biomeId].push({ r, c });
            }
        }
    }

    for (let biomeId in emptyCellsPerBiome) {
        if (biomesWithMarkers.has(Number(biomeId))) continue;

        let cells = emptyCellsPerBiome[biomeId];
        if (cells.length === 0) continue;

        let allSameRow = cells.every(cell => cell.r === cells[0].r);
        if (allSameRow) {
            let targetRow = cells[0].r;
            let cellsToCross = [];
            for (let c = 0; c < size; c++) {
                if (stateGrid[targetRow][c] === 'EMPTY' && regionGrid[targetRow][c] !== Number(biomeId)) {
                    cellsToCross.push({ r: targetRow, c: c });
                }
            }
            if (cellsToCross.length > 0) {
                return {
                    layer: 'CONFINEMENT',
                    action: 'AUTO_CROSS',
                    weight: WEIGHTS.CONFINEMENT,
                    message: `El bioma en la fila ${targetRow + 1} domina esta línea.`,
                    cells: cellsToCross
                };
            }
        }

        let allSameCol = cells.every(cell => cell.c === cells[0].c);
        if (allSameCol) {
            let targetCol = cells[0].c;
            let cellsToCross = [];
            for (let r = 0; r < size; r++) {
                if (stateGrid[r][targetCol] === 'EMPTY' && regionGrid[r][targetCol] !== Number(biomeId)) {
                    cellsToCross.push({ r: r, c: targetCol });
                }
            }
            if (cellsToCross.length > 0) {
                return {
                    layer: 'CONFINEMENT',
                    action: 'AUTO_CROSS',
                    weight: WEIGHTS.CONFINEMENT,
                    message: `El bioma en la columna ${targetCol + 1} monopoliza esta línea.`,
                    cells: cellsToCross
                };
            }
        }
    }
    return null;
}

function cloneStateGrid(stateGrid) {
    return stateGrid.map(row => row.slice());
}

// Aplica un paso lógico (AUTO_CROSS o PLACE_MARKER) directamente sobre una
// matriz en memoria. No toca el DOM ni el stateGrid real del juego.
function applyStepToGrid(gridToMutate, step) {
    if (step.action === 'PLACE_MARKER') {
        let { r, c } = step.cells[0];
        gridToMutate[r][c] = 'MARKER';
    } else if (step.action === 'AUTO_CROSS') {
        step.cells.forEach(({ r, c }) => {
            if (gridToMutate[r][c] === 'EMPTY') gridToMutate[r][c] = 'CROSS';
        });
    }
}

// Una fila, columna o bioma sin marcador y sin celdas EMPTY restantes es
// una contradicción: ya no hay dónde colocar el marcador que le corresponde.
function hasContradiction(stateGrid, regionGrid, size) {
    for (let type of ['row', 'col', 'biome']) {
        for (let index = 0; index < size; index++) {
            let groupCells = getGroupCells(regionGrid, size, type, index);
            if (groupCells.length === 0) continue;
            let hasMarker = groupCells.some(({ r, c }) => stateGrid[r][c] === 'MARKER');
            let hasEmpty = groupCells.some(({ r, c }) => stateGrid[r][c] === 'EMPTY');
            if (!hasMarker && !hasEmpty) return true;
        }
    }
    return false;
}

// Corre Directo + Confinamiento repetidamente hasta que no haya más
// movimiento. Uso interno de la capa de Proyección para simular "qué pasaría si".
function runDirectAndConfinementToFixpoint(stateGrid, regionGrid, size) {
    while (true) {
        let step = findDirectDeductions(stateGrid, regionGrid, size)
            || findConfinementDeductions(stateGrid, regionGrid, size);
        if (!step) break;
        applyStepToGrid(stateGrid, step);
    }
}

// Nivel Avanzado: asume temporalmente un marcador en una celda vacía; si esa
// suposición fuerza una contradicción tras aplicar deducciones básicas, la
// celda original debe ir tachada. Un solo nivel de profundidad (sin anidar
// suposiciones dentro de suposiciones), tal como pide el spec.
function findProjectionDeduction(stateGrid, regionGrid, size) {
    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            if (stateGrid[r][c] !== 'EMPTY') continue;

            let simulation = cloneStateGrid(stateGrid);
            simulation[r][c] = 'MARKER';
            runDirectAndConfinementToFixpoint(simulation, regionGrid, size);

            if (hasContradiction(simulation, regionGrid, size)) {
                return {
                    layer: 'PROJECTION',
                    action: 'AUTO_CROSS',
                    weight: WEIGHTS.PROJECTION,
                    message: `Suponer un marcador en la fila ${r + 1}, columna ${c + 1} rompe el tablero: debe ir tachada.`,
                    cells: [{ r, c }]
                };
            }
        }
    }
    return null;
}

// Punto de entrada único del motor: intenta la capa más barata primero.
function findNextLogicalStep(stateGrid, regionGrid, size) {
    return findDirectDeductions(stateGrid, regionGrid, size)
        || findConfinementDeductions(stateGrid, regionGrid, size)
        || findProjectionDeduction(stateGrid, regionGrid, size);
}

// Orquestador: resuelve un tablero completo aplicando las 3 capas en bucle
// sobre una COPIA del stateGrid (nunca muta el real), acumulando el puntaje
// de dificultad. Es la pieza que reutilizará el curador offline para
// clasificar tableros, y también sirve para saber si un tablero es
// resoluble por lógica pura (sin adivinar).
function resolverCompleto(stateGrid, regionGrid, size) {
    let working = cloneStateGrid(stateGrid);
    let pasos = [];
    let puntajeTotal = 0;

    while (true) {
        let markersCount = 0;
        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                if (working[r][c] === 'MARKER') markersCount++;
            }
        }
        if (markersCount === size) {
            return { resuelto: true, puntajeTotal, pasos };
        }

        let step = findNextLogicalStep(working, regionGrid, size);
        if (!step) {
            return { resuelto: false, puntajeTotal, pasos };
        }

        applyStepToGrid(working, step);
        puntajeTotal += step.weight;
        pasos.push(step);
    }
}

// --- ADAPTADOR PARA LA UI EN VIVO ---
// findLogicalHint() es la única función de esta sección que sí conoce las
// variables globales del juego (stateGrid, regionGrid, SIZE): traduce el
// resultado del motor puro al formato que ya consume requestHint().
function findLogicalHint() {
    return findNextLogicalStep(stateGrid, regionGrid, SIZE);
}

// Variable bandera para evitar clics mientras se anima el OVNI
let isAnimatingComodin = false; 

function revealRandomMarker() {
    if (gameOver || isAnimatingComodin) return;
    clearHints();

    let missingMarkers = [];
    for (let pos of solution) {
        if (stateGrid[pos.r][pos.c] !== 'MARKER') {
            missingMarkers.push(pos);
        }
    }

    if (missingMarkers.length === 0) return; 
    
    // Bloqueamos interacciones
    isAnimatingComodin = true;

    // Elegir celda
    let randomIdx = Math.floor(seededRandom() * missingMarkers.length);
    let pos = missingMarkers[randomIdx];
    let r = pos.r;
    let c = pos.c;

    let domCell = document.querySelector(`.cell[data-r='${r}'][data-c='${c}']`);
    
    // Calcular coordenadas exactas relativas a la pantalla
    let cellRect = domCell.getBoundingClientRect();
    
    let targetX = cellRect.left + (cellRect.width / 2);
    let targetY = cellRect.top + (cellRect.height / 2);

    // Preparar OVNI
    const overlay = document.getElementById('ufo-overlay');
    const ufoWrap = document.getElementById('ufo-wrap');
    
    // Ajustar posición: restamos 70px (mitad del ancho) y 100px de altura para dar espacio al rayo
    ufoWrap.style.left = `${targetX - 70}px`; 
    ufoWrap.style.top = `${targetY - 100}px`;

    // 1. Aparece el OVNI
    overlay.classList.add('active');

    // 2. Enciende el Rayo Tractor
    setTimeout(() => {
        overlay.classList.add('abducting');
    }, 600);

    // 3. Suelta el Personaje
    setTimeout(() => {
        stateGrid[r][c] = 'MARKER';
        domCell.classList.remove('cross');
        domCell.classList.remove('error-shake');
        domCell.style.cursor = 'pointer'; 
        
        domCell.classList.add('marker');
        domCell.innerText = currentTheme.icon; // El tema dinámico brilla aquí
        
        markersPlaced++;
        autoCrossAround(r, c);

        document.getElementById('hint-display').innerText = `🛸 ¡Un OVNI dejó caer un(a) ${currentTheme.name} en su lugar!`;
    }, 1200);

    // 4. Apaga el rayo y se retira
    setTimeout(() => {
        overlay.classList.remove('abducting');
        overlay.classList.add('leaving'); // Gatilla la animación de salida
        
        setTimeout(() => {
            overlay.classList.remove('active');
            overlay.classList.remove('leaving'); // Limpia para el próximo uso
        }, 600); // Espera a que termine la transición CSS
    }, 1800);

    // 5. Desbloquea juego y revisa victoria
    setTimeout(() => {
        isAnimatingComodin = false;
        checkWin();
    }, 2400);
}

function autoCrossAround(markerR, markerC) {
    let cellsToCross = findMarkerExclusions(stateGrid, regionGrid, SIZE, markerR, markerC);
    cellsToCross.forEach(({ r, c }) => {
        stateGrid[r][c] = 'CROSS';
        let domCell = document.querySelector(`.cell[data-r='${r}'][data-c='${c}']`);
        if (domCell) domCell.classList.add('cross');
    });
}

// --- GENERADOR PROCEDURAL DE NIVELES ---

// Si se pasa `seed`, la generación usa una instancia de Mulberry32 propia y
// aislada del PRNG continuo del módulo: la misma semilla siempre produce
// exactamente el mismo tablero, sin importar qué más haya consumido
// `seededRandom` antes (tema elegido, comodín usado, etc.). Necesario para
// que el futuro curador offline pueda mapear "seed N -> tablero N" de forma
// reproducible. Si no se pasa seed, el comportamiento interactivo actual
// (usar el generador continuo de sesión) se mantiene sin cambios.
function generateRandomLevel(size, seed = null) {
    const rng = (seed !== null) ? mulberry32(seed) : seededRandom;
    let maxAttempts = 1500;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        let newSolution = [];
        
        function solveMarkers(row, currentSolution) {
            if (row === size) {
                newSolution = [...currentSolution];
                return true;
            }
            let cols = shuffleArray([...Array(size).keys()], rng);

            for (let c of cols) {
                if (isValidPosition(row, c, currentSolution)) {
                    currentSolution.push({r: row, c: c});
                    if (solveMarkers(row + 1, currentSolution)) return true;
                    currentSolution.pop();
                }
            }
            return false;
        }

        function isValidPosition(r, c, currentSolution) {
            for (let marker of currentSolution) {
                if (marker.c === c) return false;
                if (Math.abs(marker.r - r) <= 1 && Math.abs(marker.c - c) <= 1) return false; 
            }
            return true;
        }

        solveMarkers(0, []);

        let newRegionGrid = Array(size).fill(0).map(() => Array(size).fill(-1));
        let queue = [];

        newSolution.forEach((marker, index) => {
            newRegionGrid[marker.r][marker.c] = index;
            queue.push({r: marker.r, c: marker.c, id: index});
        });

        while (queue.length > 0) {
            let randIdx = Math.floor(rng() * queue.length);
            let current = queue.splice(randIdx, 1)[0];

            let neighbors = [
                {r: current.r - 1, c: current.c}, {r: current.r + 1, c: current.c},
                {r: current.r, c: current.c - 1}, {r: current.r, c: current.c + 1}
            ];

            for (let n of neighbors) {
                if (n.r >= 0 && n.r < size && n.c >= 0 && n.c < size) {
                    if (newRegionGrid[n.r][n.c] === -1) {
                        newRegionGrid[n.r][n.c] = current.id;
                        queue.push({r: n.r, c: n.c, id: current.id});
                    }
                }
            }
        }

        if (countSolutions(newRegionGrid, size) === 1) {
            return { generatedSolution: newSolution, generatedRegions: newRegionGrid };
        }
    }

    if (seed !== null) {
        // No reintentamos con la misma semilla: produciría idéntica secuencia
        // de números y fallaría exactamente igual otra vez. El curador debe
        // descartar este seed y probar con el siguiente.
        console.warn(`Semilla ${seed} no produjo un tablero único tras ${maxAttempts} intentos. Descartada.`);
        return null;
    }

    console.error("No se pudo generar un nivel único. Reintentando...");
    return generateRandomLevel(size);
}

function countSolutions(grid, size) {
    let solutionsCount = 0;

    function solve(row, currentMarkers) {
        if (row === size) {
            solutionsCount++;
            return;
        }

        for (let col = 0; col < size; col++) {
            if (isValidForSolver(row, col, currentMarkers, grid)) {
                currentMarkers.push({r: row, c: col, biome: grid[row][col]});
                solve(row + 1, currentMarkers);
                currentMarkers.pop();
                
                if (solutionsCount > 1) return; 
            }
        }
    }

    function isValidForSolver(r, c, currentMarkers, grid) {
        let biome = grid[r][c];
        for (let marker of currentMarkers) {
            if (marker.c === c) return false; 
            if (marker.biome === biome) return false; 
            if (Math.abs(marker.r - r) <= 1 && Math.abs(marker.c - c) <= 1) return false; 
        }
        return true;
    }

    solve(0, []);
    return solutionsCount;
}

function shuffleArray(array, rng = seededRandom) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

setupResultUi();

// --- INTEGRACIÓN CON level-manager.js ---
// level-manager.js es quien resuelve URL/localStorage/progresion.json.
// Cada cambio de nivel dispara un único reinicio con el puzzle curado exacto.
if (typeof document !== 'undefined') {
    document.addEventListener('tampidoku:levelchange', (event) => {
        currentLevelInfo = event.detail?.entry ?? window.TampiDokuLevel?.currentEntry ?? null;
        resetGame();
    });

    // Caso defensivo: si brain.js se carga después de que level-manager ya
    // terminó de inicializar, arrancamos directamente.
    if (window.TampiDokuLevel?.ready) {
        currentLevelInfo = window.TampiDokuLevel.currentEntry;
        resetGame();
    }
}