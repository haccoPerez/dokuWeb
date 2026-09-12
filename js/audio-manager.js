(() => {
    'use strict';

    const sounds = {
        error: new Audio('audio/tampidoku_fallo_evento.wav'),
        success: new Audio('audio/tampidoku_acierto_positivo.wav'),
        victory: new Audio('audio/tampidoku_victoria_fanfarria_v2.wav'),
        ufo: new Audio('audio/tampidoku_ufo_clasico.wav'),
        fail: new Audio('audio/tampidoku_derrota_nivel.wav')
    };

    // Precargar.
    Object.values(sounds).forEach(sound => {
        sound.preload = 'auto';
        sound.volume = 0.7;
    });

    function play(name, options = {}) {
        const source = sounds[name];

        if (!source) {
            console.warn(`[TampiDokuAudio] Sonido desconocido: ${name}`);
            return;
        }

        /*
         * cloneNode permite reproducir el mismo efecto varias veces
         * aunque el anterior todavía no haya terminado.
         */
        const sound = source.cloneNode();

        sound.volume =
            options.volume ??
            source.volume;

        sound.play().catch(error => {
            console.debug(
                `[TampiDokuAudio] No se pudo reproducir "${name}".`,
                error
            );
        });
    }

    function setVolume(volume) {
        const normalized =
            Math.max(0, Math.min(1, Number(volume)));

        Object.values(sounds).forEach(sound => {
            sound.volume = normalized;
        });
    }

    window.TampiDokuAudio = {
        play,
        setVolume
    };
})();