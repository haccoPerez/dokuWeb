// player-progress.js
// Persistencia de resultados del jugador para TampiDoku.
// No conoce el tablero ni progresion.json: solo guarda resultados por número de nivel.

(() => {
    'use strict';

    const STORAGE_KEY = 'tampidoku.progress.v1';
    const STORAGE_MAX_UNLOCKED = 'tampidoku.maxUnlockedLevel';
    const STORAGE_CURRENT_LEVEL = 'tampidoku.currentLevel';

    function createEmptyProgress() {
        return {
            version: 1,
            levels: {}
        };
    }

    function load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return createEmptyProgress();

            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return createEmptyProgress();

            if (!parsed.levels || typeof parsed.levels !== 'object') {
                parsed.levels = {};
            }

            parsed.version = 1;
            return parsed;
        } catch (error) {
            console.warn('[TampiDokuProgress] No se pudo leer el progreso.', error);
            return createEmptyProgress();
        }
    }

    function save(progress) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
            return true;
        } catch (error) {
            console.warn('[TampiDokuProgress] No se pudo guardar el progreso.', error);
            return false;
        }
    }

    function normalizeStars(stars) {
        const value = Number(stars);
        if (!Number.isFinite(value)) return 1;
        return Math.max(1, Math.min(3, Math.round(value)));
    }

    function normalizeTime(time) {
        const value = Number(time);
        return Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
    }

    function getLevelResult(level) {
        const progress = load();
        const result = progress.levels[String(Number(level))];
        return result ? { ...result } : null;
    }

    function completeLevel(level, result = {}) {
        level = Number(level);
        if (!Number.isInteger(level) || level < 1) return null;

        const progress = load();
        const key = String(level);
        const previous = progress.levels[key] || {};

        const stars = normalizeStars(result.stars);
        const time = normalizeTime(result.time);

        const next = {
            completed: true,
            stars: Math.max(Number(previous.stars) || 0, stars),
            bestTime: previous.bestTime ?? null,
            completedAt: previous.completedAt || new Date().toISOString(),
            lastCompletedAt: new Date().toISOString()
        };

        if (time !== null) {
            next.bestTime =
                previous.bestTime === null || previous.bestTime === undefined
                    ? time
                    : Math.min(Number(previous.bestTime), time);
        }

        progress.levels[key] = next;
        save(progress);

        return { ...next };
    }

    function getStars(level) {
        return Number(getLevelResult(level)?.stars) || 0;
    }

    function getTotalStars() {
        const progress = load();
        return Object.values(progress.levels)
            .reduce((sum, item) => sum + (Number(item?.stars) || 0), 0);
    }

    function getCompletedCount() {
        const progress = load();
        return Object.values(progress.levels)
            .filter(item => item?.completed === true)
            .length;
    }

    function getMaxUnlockedLevel() {
        try {
            const value = Number(localStorage.getItem(STORAGE_MAX_UNLOCKED));
            return Number.isInteger(value) && value > 0 ? value : 1;
        } catch {
            return 1;
        }
    }

    function getCurrentLevel() {
        try {
            const value = Number(localStorage.getItem(STORAGE_CURRENT_LEVEL));
            return Number.isInteger(value) && value > 0 ? value : 1;
        } catch {
            return 1;
        }
    }

    function isUnlocked(level) {
        level = Number(level);
        return Number.isInteger(level) &&
            level >= 1 &&
            level <= getMaxUnlockedLevel();
    }

    function getProgress() {
        const progress = load();
        return {
            version: progress.version,
            levels: { ...progress.levels },
            maxUnlockedLevel: getMaxUnlockedLevel(),
            currentLevel: getCurrentLevel(),
            totalStars: getTotalStars(),
            completedCount: getCompletedCount()
        };
    }

    function resetProgress() {
        try {
            localStorage.removeItem(STORAGE_KEY);
            localStorage.removeItem(STORAGE_MAX_UNLOCKED);
            localStorage.removeItem(STORAGE_CURRENT_LEVEL);
            return true;
        } catch {
            return false;
        }
    }

    window.TampiDokuProgress = {
        getProgress,
        getLevelResult,
        completeLevel,
        getStars,
        getTotalStars,
        getCompletedCount,
        getMaxUnlockedLevel,
        getCurrentLevel,
        isUnlocked,
        resetProgress
    };
})();
