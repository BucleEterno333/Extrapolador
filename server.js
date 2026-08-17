// ==========================================
// SERVER.JS - ASÍNCRONO PARA EVITAR TIMEOUT DE 5 MIN
// ==========================================

console.log('🎯 ===== INICIANDO SERVER.JS =====');
console.log('📅 Timestamp:', new Date().toISOString());

const fs = require('fs');
const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');
const crypto = require('crypto');

try { require('dotenv').config(); } catch(e) {}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
    origin: [
        'https://astralchk.com',
        'http://localhost:3000',
        'http://127.0.0.1:5500',
        'https://p01--extrapolador--jbrg9jvfl7cz.code.run'
    ],
    credentials: true
}));
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'OK' }));
app.get('/api/health', (req, res) => res.json({ status: 'healthy' }));

// ===== TASK MANAGEMENT =====
const tasks = new Map(); // taskId -> { status, result, error, startedAt, bin }

// Limpiar tareas antiguas cada 10 minutos (mayores a 30 minutos)
setInterval(() => {
    const now = Date.now();
    for (const [id, task] of tasks) {
        if (now - task.startedAt > 30 * 60 * 1000) {
            tasks.delete(id);
            console.log(`🧹 Tarea ${id} eliminada por antigüedad`);
        }
    }
}, 10 * 60 * 1000);

// ===== FUNCIONES DE PUPPETEER (igual que antes) =====
async function findBrowser() {
    const envPath = process.env.PUPPETEER_EXECUTABLE_PATH;
    if (envPath && fs.existsSync(envPath)) return envPath;
    const paths = ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome-stable'];
    for (const p of paths) if (fs.existsSync(p)) return p;
    return undefined;
}

function isNotExpired(month, year) {
    const yearNum = parseInt(year, 10);
    const monthNum = parseInt(month, 10);
    if (yearNum > 26) return true;
    if (yearNum < 26) return false;
    return monthNum >= 6;
}

function filterCardsByBinAndExpiry(cards, targetBin) {
    return cards.filter(cardStr => {
        const parts = cardStr.split('|');
        if (parts.length !== 4) return false;
        const [cardNumber, expMonth, expYear] = parts;
        const cardBin = cardNumber.substring(0, 6);
        if (cardBin !== targetBin) return false;
        return isNotExpired(expMonth, expYear);
    });
}

function extractCardsFromText(text) {
    const cardPattern = /(\d{15,16})\D*(\d{1,2})\D*(\d{2,4})\D*(\d{3,4})/g;
    const tarjetas = new Set();
    let match;
    while ((match = cardPattern.exec(text)) !== null) {
        let month = match[2].padStart(2, '0');
        let year = match[3];
        if (year.length === 4) year = year.slice(-2);
        let cvv = match[4].padStart(3, '0');
        tarjetas.add(`${match[1]}|${month}|${year}|${cvv}`);
    }
    if (tarjetas.size === 0) {
        const pattern2 = /(\d{15,16})\s*[|│\s-]\s*(\d{1,2})\s*[|│\s-]\s*(\d{2,4})\s*[|│\s-]\s*(\d{3,4})/g;
        while ((match = pattern2.exec(text)) !== null) {
            let month = match[2].padStart(2, '0');
            let year = match[3];
            if (year.length === 4) year = year.slice(-2);
            let cvv = match[4].padStart(3, '0');
            tarjetas.add(`${match[1]}|${month}|${year}|${cvv}`);
        }
    }
    return Array.from(tarjetas);
}

async function getPageText(page) {
    return await page.evaluate(() => document.body.innerText);
}

async function doPuppeteerSearch(bin) {
    console.log(`\n🔍 Iniciando búsqueda para BIN: ${bin}`);
    let browser;
    try {
        const browserPath = await findBrowser();
        const launchOptions = {
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
            defaultViewport: { width: 1366, height: 768 },
            timeout: 180000
        };
        if (browserPath) launchOptions.executablePath = browserPath;

        browser = await puppeteer.launch(launchOptions);
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // === LOGIN ===
        console.log('🌐 Navegando a:', process.env.CHK_URL);
        await page.goto(process.env.CHK_URL, {
            waitUntil: 'domcontentloaded',
            timeout: 300000
        });

        console.log('🔑 Iniciando sesión...');
        await page.type('input[type="email"]', process.env.CHK_EMAIL, { delay: 30 });
        await page.type('input[type="password"]', process.env.CHK_PASSWORD, { delay: 30 });
        await page.click('button[type="submit"]');
        await page.waitForNavigation({
            waitUntil: 'domcontentloaded',
            timeout: 300000
        });
        console.log('✅ Login completado');

        // === ESPERAR INPUT DE BÚSQUEDA ===
        console.log('⏳ Esperando carga de la página de búsqueda...');
        const searchInputSelectors = [
            'input[placeholder*="Search by"]',
            'input[placeholder*="BIN"]',
            'input[maxlength="6"][type="text"]',
            'input[data-v-6e92ebc5][type="text"]'
        ];

        let searchInput = null;
        for (const sel of searchInputSelectors) {
            try {
                await page.waitForSelector(sel, { timeout: 10000, visible: true });
                searchInput = await page.$(sel);
                if (searchInput) {
                    console.log(`✅ Input encontrado con: ${sel}`);
                    break;
                }
            } catch (e) {}
        }

        if (!searchInput) {
            await page.screenshot({ path: 'debug_no_input.png' });
            const html = await page.content();
            console.log('🔍 HTML (primeros 500 chars):', html.substring(0, 500));
            throw new Error('No se encontró el input de búsqueda');
        }

        // === ESPERA INICIAL DE 60 SEGUNDOS (para que carguen tarjetas aleatorias) ===
        console.log('⏳ Esperando 60 segundos para carga inicial de tarjetas aleatorias...');
        await new Promise(r => setTimeout(r, 60000));

        // === ESCRIBIR BIN Y DISPARAR BÚSQUEDA ===
        console.log(`🎯 Escribiendo BIN: ${bin}`);
        await searchInput.click({ clickCount: 3 });
        for (let i = 0; i < 10; i++) await searchInput.press('Backspace');
        await searchInput.type(bin, { delay: 100 });

        const valorActual = await page.evaluate(el => el.value, searchInput);
        if (valorActual !== bin) {
            await searchInput.evaluate((el, val) => { el.value = val; }, bin);
        }

        await page.evaluate(() => {
            const input = document.querySelector('input[placeholder*="Search"], input[placeholder*="BIN"], input[maxlength="6"]');
            if (input) {
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
                input.dispatchEvent(new Event('blur', { bubbles: true }));
            }
        });
        await searchInput.press('Enter');

        console.log(`✅ BIN ${bin} enviado, esperando resultados...`);

        // === POLLING PARA DETECTAR RESULTADOS (máximo 5 minutos) ===
        const MAX_POLLING_TIME = 300000; // 5 minutos
        const startTime = Date.now();
        let resultsFound = false;
        let targetCards = [];

        while (Date.now() - startTime < MAX_POLLING_TIME) {
            const text = await getPageText(page);
            const allCards = extractCardsFromText(text);
            const matching = allCards.filter(cardStr => cardStr.startsWith(bin));
            if (matching.length > 0) {
                console.log(`🔎 Primeras tarjetas con BIN ${bin} detectadas: ${matching.length}`);
                resultsFound = true;
                // Esperar 2 segundos adicionales para que carguen todas
                await new Promise(r => setTimeout(r, 2000));
                // Volver a extraer
                const text2 = await getPageText(page);
                const allCards2 = extractCardsFromText(text2);
                targetCards = allCards2.filter(cardStr => cardStr.startsWith(bin));
                console.log(`📦 Después de esperar 2s, tarjetas con BIN ${bin}: ${targetCards.length}`);
                break;
            }
            const elapsed = Math.round((Date.now() - startTime) / 1000);
            console.log(`⏳ Esperando resultados (${elapsed}s)...`);
            await new Promise(r => setTimeout(r, 3000));
        }

        if (!resultsFound) {
            throw new Error(`No se encontraron tarjetas para el BIN ${bin} después de ${MAX_POLLING_TIME/1000} segundos`);
        }

        console.log(`✅ Resultados finales: ${targetCards.length} tarjetas con BIN ${bin}`);

        // Filtrar vencidas
        const validCards = filterCardsByBinAndExpiry(targetCards, bin);
        console.log(`✅ Después de filtrar vencidas: ${validCards.length}`);

        if (validCards.length === 0) {
            throw new Error(`No se encontraron tarjetas válidas para el BIN ${bin}`);
        }

        // Convertir año a 4 dígitos
        const dataWith4DigitYear = validCards.map(cardStr => {
            const parts = cardStr.split('|');
            if (parts.length === 4) {
                let year = parts[2];
                if (year.length === 2) year = "20" + year;
                parts[2] = year;
                return parts.join('|');
            }
            return cardStr;
        });

        console.log(`🎉 Éxito: ${dataWith4DigitYear.length} tarjetas encontradas`);
        return {
            success: true,
            count: dataWith4DigitYear.length,
            data: dataWith4DigitYear,
            debug_preview: (await getPageText(page)).substring(0, 1000)
        };

    } catch (error) {
        console.error(`❌ Error:`, error.message);
        throw error;
    } finally {
        if (browser) await browser.close().catch(console.error);
    }
}

// ===== RUTAS ASÍNCRONAS =====

// Iniciar búsqueda en background
app.post('/api/search-bin/async', async (req, res) => {
    const { bin } = req.body;
    if (!bin || bin.length !== 6) {
        return res.status(400).json({ error: 'BIN debe tener exactamente 6 dígitos' });
    }

    const taskId = crypto.randomBytes(8).toString('hex');
    console.log(`📌 Creando tarea ${taskId} para BIN ${bin}`);

    // Guardar estado inicial
    tasks.set(taskId, {
        status: 'pending',
        result: null,
        error: null,
        startedAt: Date.now(),
        bin: bin
    });

    // Iniciar la tarea en segundo plano (sin await)
    doPuppeteerSearch(bin)
        .then(result => {
            const task = tasks.get(taskId);
            if (task) {
                task.status = 'done';
                task.result = result;
                console.log(`✅ Tarea ${taskId} completada`);
            }
        })
        .catch(error => {
            const task = tasks.get(taskId);
            if (task) {
                task.status = 'error';
                task.error = error.message;
                console.error(`❌ Tarea ${taskId} falló: ${error.message}`);
            }
        });

    // Devolver taskId inmediatamente
    res.json({ taskId, status: 'pending' });
});

// Consultar estado/resultado de una tarea
app.get('/api/search-bin/result/:taskId', (req, res) => {
    const { taskId } = req.params;
    const task = tasks.get(taskId);
    if (!task) {
        return res.status(404).json({ error: 'Tarea no encontrada' });
    }

    // Si está completada o con error, podemos eliminar la tarea después de devolverla (opcional)
    const response = {
        taskId,
        status: task.status,
        bin: task.bin
    };
    if (task.status === 'done') {
        response.result = task.result;
        // Opcional: eliminar tarea para ahorrar memoria después de entregar resultado
        // tasks.delete(taskId);
    } else if (task.status === 'error') {
        response.error = task.error;
        // tasks.delete(taskId);
    }
    res.json(response);
});

// Ruta síncrona (por compatibilidad, pero ya no debería usarse)
app.post('/api/search-bin', async (req, res) => {
    req.setTimeout(1200000);
    const { bin } = req.body;
    if (!bin || bin.length !== 6) {
        return res.status(400).json({ error: 'BIN debe tener exactamente 6 dígitos' });
    }
    try {
        const result = await doPuppeteerSearch(bin);
        res.json(result);
    } catch (error) {
        console.error('❌ Error en búsqueda:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Ruta de prueba
app.get('/api/test-puppeteer', async (req, res) => {
    let browser;
    try {
        const browserPath = await findBrowser();
        browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox'],
            executablePath: browserPath,
            timeout: 180000
        });
        const page = await browser.newPage();
        await page.goto('https://example.com', { timeout: 60000 });
        const title = await page.title();
        res.json({ success: true, title });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    } finally {
        if (browser) await browser.close();
    }
});

const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor en puerto ${PORT}`);
});

server.timeout = 1200000;
server.keepAliveTimeout = 1200000;
server.headersTimeout = 1200000;