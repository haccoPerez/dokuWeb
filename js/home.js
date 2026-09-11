(() => {
    'use strict';

    const GAME_URL = 'index_niveles.html';
    const LEVELS_URL = 'niveles.html';

    // Ajusta solo esta constante si conservas el nombre tutorial_v2.html.
    const TUTORIAL_URL = 'tutorial.html';

    const progressApi = window.TampiDokuProgress;

    const btnContinue = document.getElementById('btn-continue');
    const continueTitle = document.getElementById('continue-title');
    const continueDetail = document.getElementById('continue-detail');
    const continueButtonText = document.getElementById('continue-button-text');
    const totalStars = document.getElementById('total-stars');
    const completedLevels = document.getElementById('completed-levels');

    init();

    function init() {
        document.getElementById('btn-levels')
            .addEventListener('click', () => window.location.href = LEVELS_URL);

        document.getElementById('btn-tutorial')
            .addEventListener('click', () => window.location.href = TUTORIAL_URL);

        if (!progressApi) {
            showFallback();
            return;
        }

        const maxUnlocked = normalizeLevel(progressApi.getMaxUnlockedLevel(), 1);
        const currentLevel = normalizeLevel(progressApi.getCurrentLevel(), maxUnlocked);
        const stars = safeNumber(progressApi.getTotalStars());
        const completed = safeNumber(progressApi.getCompletedCount());

        /*
         * "Continuar" respeta el nivel actual persistido por player-progress.js.
         * Si por alguna razón currentLevel no está desbloqueado, usamos el máximo
         * desbloqueado como respaldo.
         */
        const continueLevel = progressApi.isUnlocked(currentLevel)
            ? currentLevel
            : maxUnlocked;

        totalStars.textContent = stars;
        completedLevels.textContent = completed;

        continueTitle.textContent = completed > 0 ? 'Continuar' : 'Empezar';
        continueDetail.textContent =
            completed > 0
                ? `Nivel ${continueLevel} · ${stars} ${stars === 1 ? 'estrella' : 'estrellas'}`
                : `Nivel ${continueLevel} · Tu aventura comienza aquí`;

        continueButtonText.textContent =
            completed > 0 ? `Continuar nivel ${continueLevel}` : 'Jugar nivel 1';

        btnContinue.disabled = false;
        btnContinue.addEventListener('click', () => {
            window.location.href =
                `${GAME_URL}?nivel=${encodeURIComponent(continueLevel)}`;
        });
    }

    function showFallback() {
        continueTitle.textContent = 'Empezar';
        continueDetail.textContent = 'Nivel 1 · Tu aventura comienza aquí';
        continueButtonText.textContent = 'Jugar nivel 1';
        totalStars.textContent = '0';
        completedLevels.textContent = '0';

        btnContinue.disabled = false;
        btnContinue.addEventListener('click', () => {
            window.location.href = `${GAME_URL}?nivel=1`;
        });
    }

    function normalizeLevel(value, fallback) {
        const parsed = Number.parseInt(value, 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
    }

    function safeNumber(value) {
        const parsed = Number(value);
        return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    }
})();
