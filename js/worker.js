// Importa tu motor lógico. Al no haber DOM, las guardas de typeof document evitan errores.
importScripts('game.js');

const tablerosUnicos = new Set();

self.onmessage = function(e) {
    if (e.data.action === 'START') {
        const { total, size } = e.data;
        let validLevels = [];
        
        // Semilla inicial determinista (ej. concatenación de fecha y ceros)
        let currentSeed = generarSeedPorTimestamp(); 
        let fallos = 0;

        self.postMessage({ type: 'LOG', payload: 'Motor cargado. Comenzando iteración procedural.' });

        while (validLevels.length < total) {
            // 1. Generar la matriz estructural usando la semilla actual
            let level = generateRandomLevel(size, currentSeed);

            if (level) {
                // 2. Crear una matriz de estado vacía para que el orquestador trabaje
                let stateGrid = Array(size).fill(0).map(() => Array(size).fill('EMPTY'));

                // 3. Pasar el tablero por el simulador humano
                let evaluacion = resolverCompleto(stateGrid, level.generatedRegions, size);

                if (evaluacion.resuelto) {
                    const firma = firmaTablero(level);

                    if (!tablerosUnicos.has(firma)) {

                        tablerosUnicos.add(firma);

                        validLevels.push({
                            seed: currentSeed,
                            score: evaluacion.puntajeTotal
                        });

                    } else {

                        self.postMessage({
                            type:"LOG",
                            payload:`Semilla duplicada descartada: ${currentSeed}`
                        });

                        fallos++;
                    }

                    // Reportar progreso a la UI cada 25 tableros para no asfixiar el postMessage
                    if (validLevels.length % 25 === 0 || validLevels.length === total) {
                        self.postMessage({
                            type: 'PROGRESS',
                            payload: { count: validLevels.length }
                        });
                    }
                } else {
                    // Tablero válido matemáticamente pero irresoluble sin adivinar
                    fallos++;
                }
            } else {
                // Generador no logró un tablero único (chocó con el límite de 1500 intentos)
                fallos++;
            }

            currentSeed++; // Avanzar al siguiente candidato
        }

        self.postMessage({ type: 'LOG', payload: `Ciclo terminado. Semillas descartadas: ${fallos}` });

        // Ordenar estrictamente de menor a mayor dificultad (score)
        validLevels.sort((a, b) => a.score - b.score);

        // Devolver el JSON ensamblado al hilo principal
        self.postMessage({ type: 'DONE', payload: { niveles: validLevels } });
    }
};

function normalizarRegiones(grid) {
    const mapa = new Map();
    let siguiente = 0;

    return grid.map(row =>
        row.map(id => {
            if (!mapa.has(id)) mapa.set(id, siguiente++);
            return mapa.get(id);
        })
    );
}

function firmaTablero(level) {

    const regiones = normalizarRegiones(level.generatedRegions)
        .map(row => row.join(""))
        .join("|");

    const solucion = level.generatedSolution
        .slice()
        .sort((a,b)=> a.r-b.r || a.c-b.c)
        .map(p => `${p.r}${p.c}`)
        .join("");

    return regiones + "::" + solucion;
}