// level-manager.js
// Gestión de nivel para TampiDoku sin backend.
//
// Prioridad al iniciar:
//   1. ?nivel=N en la URL
//   2. último nivel guardado en localStorage
//   3. nivel 1
//
// progresion.json esperado:
// [
//   {"nivel":1,"tamano":4,"indice":0,"score":6},
//   ...
// ]

(() => {
    'use strict';

    const CONFIG = {
        progressionUrl: 'data/progresion.json',
        storageCurrentLevel: 'tampidoku.currentLevel',
        storageMaxUnlocked: 'tampidoku.maxUnlockedLevel',
        urlParam: 'nivel'
    };

    const state = {
        progression: [],
        byLevel: new Map(),
        currentLevel: 1,
        currentEntry: null,
        maxLevel: 1,
        maxUnlocked: 1,
        ready: false
    };

    const api = {
        get currentLevel() {
            return state.currentLevel;
        },
        get currentEntry() {
            return state.currentEntry;
        },
        get maxLevel() {
            return state.maxLevel;
        },
        get maxUnlocked() {
            return state.maxUnlocked;
        },
        get ready() {
            return state.ready;
        },
        get progression() {
            return state.progression;
        },
        getEntry(level) {
            return state.byLevel.get(Number(level)) || null;
        },
        goToLevel,
        markCompleted,
        reloadCurrentLevel() {
            return goToLevel(state.currentLevel, { replaceUrl: true, force: true });
        }
    };

    window.TampiDokuLevel = api;

    document.addEventListener('DOMContentLoaded', init);

    async function init() {
        try {
            const response = await fetch(CONFIG.progressionUrl, { cache: 'no-store' });

            if (!response.ok) {
                throw new Error(`No se pudo cargar ${CONFIG.progressionUrl} (${response.status})`);
            }

            const progression = await response.json();

            if (!Array.isArray(progression) || progression.length === 0) {
                throw new Error('progresion.json está vacío o no contiene un arreglo.');
            }

            state.progression = progression
                .filter(x => Number.isInteger(Number(x.nivel)))
                .sort((a, b) => Number(a.nivel) - Number(b.nivel));

            state.byLevel = new Map(
                state.progression.map(x => [Number(x.nivel), x])
            );

            state.maxLevel = Number(state.progression[state.progression.length - 1].nivel);
            state.maxUnlocked = clamp(
                readInteger(CONFIG.storageMaxUnlocked, 1),
                1,
                state.maxLevel
            );

            const urlLevel = readLevelFromUrl();
            const storedLevel = readInteger(CONFIG.storageCurrentLevel, 1);

            let initialLevel = 1;

            if (urlLevel !== null && state.byLevel.has(urlLevel)) {
                initialLevel = urlLevel;
            } else if (state.byLevel.has(storedLevel)) {
                initialLevel = storedLevel;
            }

            // La URL NO debe permitir saltarse la progresión.
            // Si se solicita un nivel bloqueado, abrimos el máximo desbloqueado.
            if (initialLevel > state.maxUnlocked) {
                initialLevel = state.maxUnlocked;
            }

            state.ready = true;
            setupUi();
            goToLevel(initialLevel, { replaceUrl: true, force: true });

            document.dispatchEvent(new CustomEvent('tampidoku:levelready', {
                detail: makeDetail()
            }));
        } catch (error) {
            console.error('[TampiDokuLevel]', error);
            const display = document.getElementById('level-display');
            if (display) display.textContent = 'Error nivel';

            const msg = document.getElementById('game-message');
            if (msg) {
                msg.textContent = 'No se pudo cargar la progresión de niveles.';
            }
        }
    }

    function goToLevel(level, options = {}) {
        if (!state.ready) return false;

        level = Number(level);
        if (!Number.isInteger(level)) return false;

        const entry = state.byLevel.get(level);
        if (!entry) return false;

        if (!options.force && level > state.maxUnlocked) {
            return false;
        }

        state.currentLevel = level;
        state.currentEntry = entry;

        saveInteger(CONFIG.storageCurrentLevel, level);

        if (options.replaceUrl) {
            setLevelInUrl(level, true);
        } else {
            setLevelInUrl(level, false);
        }

        updateHud();
        renderLevelGrid();

        document.dispatchEvent(new CustomEvent('tampidoku:levelchange', {
            detail: makeDetail()
        }));

        return true;
    }

    function markCompleted(level = state.currentLevel) {
        level = Number(level);
        if (!Number.isInteger(level)) return;

        const next = Math.min(level + 1, state.maxLevel);

        if (next > state.maxUnlocked) {
            state.maxUnlocked = next;
            saveInteger(CONFIG.storageMaxUnlocked, state.maxUnlocked);
            renderLevelGrid();
            updateHud();
        }
    }

    function makeDetail() {
        return {
            nivel: state.currentLevel,
            tamano: state.currentEntry?.tamano ?? null,
            indice: state.currentEntry?.indice ?? null,
            score: state.currentEntry?.score ?? null,
            entry: state.currentEntry,
            maxLevel: state.maxLevel,
            maxUnlocked: state.maxUnlocked
        };
    }

    function setupUi() {
        document.getElementById('btn-prev-level')
            ?.addEventListener('click', () => goToLevel(state.currentLevel - 1));

        document.getElementById('btn-next-level')
            ?.addEventListener('click', () => goToLevel(state.currentLevel + 1));

        document.getElementById('level-display')
            ?.addEventListener('click', () => {
                window.location.href = 'niveles.html';
            });

        document.getElementById('level-selector-close')
            ?.addEventListener('click', closeSelector);

        document.getElementById('level-selector')
            ?.addEventListener('click', event => {
                if (event.target.id === 'level-selector') closeSelector();
            });

        document.addEventListener('keydown', event => {
            if (event.key === 'Escape') closeSelector();
        });
    }

    function updateHud() {
        const display = document.getElementById('level-display');
        if (display) {
            display.textContent = `Nivel ${state.currentLevel}`;
            display.title =
                `${state.currentEntry.tamano}x${state.currentEntry.tamano} · score ${state.currentEntry.score}`;
        }

        const prev = document.getElementById('btn-prev-level');
        if (prev) prev.disabled = state.currentLevel <= 1;

        const next = document.getElementById('btn-next-level');
        if (next) {
            next.disabled =
                state.currentLevel >= state.maxLevel ||
                state.currentLevel + 1 > state.maxUnlocked;
        }

        const status = document.getElementById('level-selector-status');
        if (status) {
            status.textContent =
                `Nivel actual ${state.currentLevel} · desbloqueado hasta ${state.maxUnlocked}`;
        }
    }

    function openSelector() {
        const selector = document.getElementById('level-selector');
        if (!selector) return;

        renderLevelGrid();
        selector.classList.add('open');
        selector.setAttribute('aria-hidden', 'false');

        requestAnimationFrame(() => {
            document.querySelector('.level-option.current')
                ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        });
    }

    function closeSelector() {
        const selector = document.getElementById('level-selector');
        if (!selector) return;

        selector.classList.remove('open');
        selector.setAttribute('aria-hidden', 'true');
    }

    function renderLevelGrid() {
        const grid = document.getElementById('level-grid');
        if (!grid || !state.ready) return;

        const fragment = document.createDocumentFragment();

        for (const entry of state.progression) {
            const level = Number(entry.nivel);
            const button = document.createElement('button');

            button.type = 'button';
            button.className = 'level-option';
            button.textContent = level;
            button.title = `${entry.tamano}x${entry.tamano} · score ${entry.score}`;

            if (level === state.currentLevel) {
                button.classList.add('current');
            }

            if (level > state.maxUnlocked) {
                button.classList.add('locked');
                button.disabled = true;
                button.title = `Nivel ${level} bloqueado`;
            } else {
                button.addEventListener('click', () => {
                    goToLevel(level);
                    closeSelector();
                });
            }

            fragment.appendChild(button);
        }

        grid.replaceChildren(fragment);
    }

    function readLevelFromUrl() {
        const params = new URLSearchParams(window.location.search);
        const raw = params.get(CONFIG.urlParam);

        if (raw === null || raw.trim() === '') return null;

        const value = Number(raw);
        return Number.isInteger(value) && value > 0 ? value : null;
    }

    function setLevelInUrl(level, replace) {
        const url = new URL(window.location.href);
        url.searchParams.set(CONFIG.urlParam, level);

        if (replace) {
            history.replaceState({ nivel: level }, '', url);
        } else {
            history.pushState({ nivel: level }, '', url);
        }
    }

    window.addEventListener('popstate', () => {
        if (!state.ready) return;

        const level = readLevelFromUrl();
        if (level !== null && state.byLevel.has(level)) {
            const safeLevel = Math.min(level, state.maxUnlocked);
            goToLevel(safeLevel, { replaceUrl: true, force: true });
        }
    });

    function readInteger(key, fallback) {
        try {
            const value = Number(localStorage.getItem(key));
            return Number.isInteger(value) && value > 0 ? value : fallback;
        } catch {
            return fallback;
        }
    }

    function saveInteger(key, value) {
        try {
            localStorage.setItem(key, String(value));
        } catch {
            // El juego puede seguir funcionando aunque el navegador bloquee storage.
        }
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }
})();
