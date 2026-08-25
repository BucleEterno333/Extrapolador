// ==========================================
// SERVER.JS - NAVEGADOR PERSISTENTE CON REAUTENTICACIÓN
// ==========================================

console.log('🎯 ===== INICIANDO SERVER.JS (MODO PERSISTENTE CON REAUTENTICACIÓN) =====');
console.log('📅 Timestamp:', new Date().toISOString());

const fs = require('fs');
const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');

try { require('dotenv').config(); } catch(e) {}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
    origin: [
        'https://astralchk.com',
        'http://localhost:3000',
        'http://127.0.0.1:5500',
        'https://p01--extrapoladorrapido--ymf4hnxpvjhd.code.run'
    ],
    credentials: true
}));
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'OK' }));
app.get('/api/health', (req, res) => res.json({ status: 'healthy' }));

// ========== CONFIGURACIÓN ==========
const MAX_SEARCH_TIME = 600000; // 10 minutos
const KEEPALIVE_INTERVAL = 30000; // 30 segundos
const MAX_RETRIES = 3;

// ========== VARIABLES GLOBALES ==========
let browser = null;
let page = null;
let isReady = false;
let isProcessing = false;
let requestQueue = [];
let keepaliveTimer = null;
let initInProgress = false;

// ========== FUNCIONES AUXILIARES ==========
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
    try {
        return await page.evaluate(() => document.body.innerText);
    } catch (error) {
        if (error.message.includes('Execution context was destroyed')) {
            console.warn('⚠️ Contexto destruido, reiniciando navegador...');
            throw new Error('NAVIGATION_RESET');
        }
        throw error;
    }
}

// ========== FUNCIÓN DE REAUTENTICACIÓN ==========
async function reauthenticate() {
    console.log('🔄 Reautenticando (recargando página y login)...');
    try {
        // Navegar a la URL de login
        await page.goto(process.env.CHK_URL, {
            waitUntil: 'domcontentloaded',
            timeout: 120000
        });

        // Esperar campos de login
        await page.waitForSelector('input[type="email"]', { timeout: 30000 });
        await page.waitForSelector('input[type="password"]', { timeout: 30000 });

        console.log('🔑 Iniciando sesión nuevamente...');
        await page.type('input[type="email"]', process.env.CHK_EMAIL, { delay: 30 });
        await page.type('input[type="password"]', process.env.CHK_PASSWORD, { delay: 30 });
        await page.click('button[type="submit"]');
        await page.waitForNavigation({
            waitUntil: 'domcontentloaded',
            timeout: 120000
        });
        console.log('✅ Reautenticación completada');

        // Verificar que el input de búsqueda aparezca
        const searchInputSelectors = [
            'input[placeholder*="Search by"]',
            'input[placeholder*="BIN"]',
            'input[maxlength="6"][type="text"]',
            'input[data-v-6e92ebc5][type="text"]'
        ];
        let found = false;
        for (const sel of searchInputSelectors) {
            try {
                await page.waitForSelector(sel, { timeout: 10000, visible: true });
                const input = await page.$(sel);
                if (input) {
                    console.log(`✅ Input de búsqueda encontrado después de reautenticar: ${sel}`);
                    found = true;
                    break;
                }
            } catch (e) {}
        }
        if (!found) {
            throw new Error('No se encontró input de búsqueda después de reautenticar');
        }
        isReady = true;
        console.log('✅ Navegador listo después de reautenticación');
    } catch (error) {
        console.error('❌ Error en reautenticación:', error.message);
        isReady = false;
        throw error;
    }
}

// ========== INICIALIZAR NAVEGADOR PERSISTENTE ==========
async function initBrowser() {
    if (initInProgress) return;
    initInProgress = true;
    console.log('🔄 Inicializando navegador persistente...');
    try {
        if (browser) {
            try { await browser.close(); } catch (e) {}
            browser = null;
            page = null;
        }
        const browserPath = await findBrowser();
        const launchOptions = {
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
            defaultViewport: { width: 1366, height: 768 },
            timeout: 600000
        };
        if (browserPath) launchOptions.executablePath = browserPath;

        browser = await puppeteer.launch(launchOptions);
        page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // Realizar login inicial
        await reauthenticate();

        isReady = true;
        console.log('✅ Navegador listo para recibir peticiones');
        startKeepAlive();
    } catch (error) {
        console.error('❌ Error inicializando navegador:', error.message);
        isReady = false;
        setTimeout(() => {
            initInProgress = false;
            initBrowser();
        }, 10000);
    } finally {
        initInProgress = false;
    }
}

// ========== KEEP-ALIVE ==========
function startKeepAlive() {
    if (keepaliveTimer) clearInterval(keepaliveTimer);
    keepaliveTimer = setInterval(async () => {
        try {
            if (page && isReady) {
                await page.evaluate(() => document.title);
                console.log('💓 Keep-alive ejecutado');
            } else {
                console.warn('⚠️ Keep-alive: página no disponible, reiniciando...');
                isReady = false;
                clearInterval(keepaliveTimer);
                initBrowser();
            }
        } catch (error) {
            console.warn('⚠️ Keep-alive falló:', error.message);
            isReady = false;
            clearInterval(keepaliveTimer);
            initBrowser();
        }
    }, KEEPALIVE_INTERVAL);
}

// ========== PROCESAR COLA DE PETICIONES ==========
async function processQueue() {
    if (isProcessing || requestQueue.length === 0) return;
    isProcessing = true;

    while (requestQueue.length > 0) {
        const { req, res, bin } = requestQueue.shift();
        try {
            if (!isReady || !page) {
                console.log('⏳ Navegador no listo, reiniciando...');
                await initBrowser();
                if (!isReady) throw new Error('Navegador no disponible');
            }
            console.log(`🔍 Procesando BIN: ${bin}`);
            const result = await performSearch(bin);
            res.json(result);
        } catch (error) {
            console.error(`❌ Error procesando BIN ${bin}:`, error.message);
            if (error.message === 'NAVIGATION_RESET' || error.message.includes('context destroyed')) {
                console.log('🔄 Reiniciando navegador por error de contexto...');
                isReady = false;
                await initBrowser();
                if (isReady) {
                    requestQueue.unshift({ req, res, bin });
                    console.log(`↩️ Reintentando BIN ${bin} después de reinicio.`);
                    continue;
                } else {
                    res.status(500).json({ success: false, error: 'Navegador no disponible después de reinicio' });
                }
            } else if (error.message.includes('Input de búsqueda')) {
                // Si es error de input, intentar reautenticar
                console.log('🔄 Intentando reautenticación por error de input...');
                try {
                    await reauthenticate();
                    // Reintentar la petición
                    requestQueue.unshift({ req, res, bin });
                    console.log(`↩️ Reintentando BIN ${bin} después de reautenticación.`);
                    continue;
                } catch (reauthError) {
                    res.status(500).json({ success: false, error: 'Error de autenticación: ' + reauthError.message });
                }
            } else {
                res.status(500).json({ success: false, error: error.message });
            }
        }
    }

    isProcessing = false;
}

// ========== BÚSQUEDA OPTIMIZADA CON REINTENTOS ==========
async function performSearch(bin) {
    console.log(`🎯 Buscando BIN: ${bin}`);

    // Helper para escribir el BIN en el input
    async function writeBin(binValue) {
        // Limpiar input
        await page.evaluate(() => {
            const input = document.querySelector('input[placeholder*="Search"], input[placeholder*="BIN"], input[maxlength="6"]');
            if (input) {
                input.value = '';
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });
        await new Promise(r => setTimeout(r, 500));

        let searchInput = await page.$('input[placeholder*="Search"], input[placeholder*="BIN"], input[maxlength="6"]');
        if (!searchInput) {
            console.warn('⚠️ Input no encontrado, recargando página y reautenticando...');
            throw new Error('Input de búsqueda no encontrado');
        }

        await searchInput.click({ clickCount: 3 });
        await searchInput.press('End');

        for (let i = 0; i < binValue.length; i++) {
            await searchInput.type(binValue[i], { delay: 80 });
            await page.evaluate(() => {
                const input = document.querySelector('input[placeholder*="Search"], input[placeholder*="BIN"], input[maxlength="6"]');
                if (input) input.dispatchEvent(new Event('input', { bubbles: true }));
            });
            await new Promise(r => setTimeout(r, 50));
        }

        const actual = await page.evaluate(el => el.value, searchInput);
        if (actual !== binValue) {
            await page.evaluate((val) => {
                const input = document.querySelector('input[placeholder*="Search"], input[placeholder*="BIN"], input[maxlength="6"]');
                if (input) {
                    input.value = val;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }, binValue);
        }

        await page.evaluate(() => {
            const input = document.querySelector('input[placeholder*="Search"], input[placeholder*="BIN"], input[maxlength="6"]');
            if (input) {
                input.dispatchEvent(new Event('change', { bubbles: true }));
                input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
                input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }));
            }
        });
        await searchInput.press('Enter');
        console.log(`✅ BIN ${binValue} enviado.`);
    }

    // Primer envío
    await writeBin(bin);

    let retryCount = 0;
    let targetCards = [];

    while (retryCount <= MAX_RETRIES) {
        const startTime = Date.now();
        let firstMatch = false;
        let firstCount = 0;

        while (Date.now() - startTime < MAX_SEARCH_TIME) {
            let text;
            try {
                text = await getPageText(page);
            } catch (error) {
                if (error.message === 'NAVIGATION_RESET' || error.message.includes('context destroyed')) {
                    throw error;
                }
                throw error;
            }
            const allCards = extractCardsFromText(text);
            const matching = allCards.filter(cardStr => cardStr.startsWith(bin));

            if (matching.length > 0) {
                firstMatch = true;
                firstCount = matching.length;
                console.log(`🔎 Primeras tarjetas con BIN ${bin} detectadas: ${matching.length}`);

                if (matching.length > 195) {
                    targetCards = matching;
                    console.log(`✅ Detectadas ${targetCards.length} tarjetas, consideramos completas.`);
                    break;
                } else {
                    await new Promise(r => setTimeout(r, 1000));
                    const text2 = await getPageText(page);
                    const allCards2 = extractCardsFromText(text2);
                    targetCards = allCards2.filter(cardStr => cardStr.startsWith(bin));
                    console.log(`📦 Después de esperar 1s, tarjetas con BIN ${bin}: ${targetCards.length}`);
                    break;
                }
            }

            await new Promise(r => setTimeout(r, 500));
            const elapsed = Math.round((Date.now() - startTime) / 1000);
            if (elapsed % 5 === 0 && elapsed > 0) {
                console.log(`⏳ Esperando resultados (${elapsed}s)...`);
            }
        }

        if (targetCards.length > 1 || retryCount === MAX_RETRIES) {
            break;
        }

        if (targetCards.length <= 1 && retryCount < MAX_RETRIES) {
            retryCount++;
            console.log(`⚠️ Solo ${targetCards.length} tarjeta(s) (intento ${retryCount}/${MAX_RETRIES}). Reintentando...`);
            await writeBin(bin);
            targetCards = [];
        } else {
            break;
        }
    }

    if (targetCards.length === 0) {
        await page.screenshot({ path: `debug_no_results_${bin}.png` });
        throw new Error(`No se encontraron tarjetas para el BIN ${bin} después de reintentos.`);
    }

    const validCards = filterCardsByBinAndExpiry(targetCards, bin);
    console.log(`✅ Después de filtrar vencidas: ${validCards.length}`);

    if (validCards.length === 0) {
        throw new Error(`No se encontraron tarjetas válidas para el BIN ${bin}`);
    }

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
}

// ========== RUTAS ==========
app.post('/api/search-bin', async (req, res) => {
    req.setTimeout(1200000);
    const { bin } = req.body;
    if (!bin || bin.length !== 6) {
        return res.status(400).json({ error: 'BIN debe tener exactamente 6 dígitos' });
    }
    requestQueue.push({ req, res, bin });
    processQueue();
});

// ========== SISTEMA DE TAREAS ASÍNCRONAS ==========
const tasks = new Map();

function generateTaskId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

app.post('/api/search-bin/async', async (req, res) => {
    const { bin } = req.body;
    if (!bin || bin.length !== 6) {
        return res.status(400).json({ error: 'BIN debe tener exactamente 6 dígitos' });
    }

    const taskId = generateTaskId();
    tasks.set(taskId, { status: 'pending', result: null, error: null, startTime: Date.now() });

    (async () => {
        try {
            const result = await performSearch(bin);
            tasks.set(taskId, { status: 'done', result, error: null, startTime: tasks.get(taskId).startTime });
        } catch (error) {
            tasks.set(taskId, { status: 'error', result: null, error: error.message, startTime: tasks.get(taskId).startTime });
        }
    })();

    res.json({ taskId, status: 'pending' });
});

app.get('/api/search-bin/result/:taskId', async (req, res) => {
    const { taskId } = req.params;
    const task = tasks.get(taskId);
    if (!task) {
        return res.status(404).json({ error: 'Tarea no encontrada' });
    }
    if (Date.now() - task.startTime > 1800000) {
        tasks.delete(taskId);
        return res.status(404).json({ error: 'Tarea expirada' });
    }
    res.json({ status: task.status, result: task.result, error: task.error });
});

app.get('/api/test-puppeteer', async (req, res) => {
    try {
        if (isReady && page) {
            const title = await page.title();
            res.json({ success: true, title });
        } else {
            res.json({ success: false, error: 'Navegador no listo' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== INICIAR SERVIDOR ==========
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor en puerto ${PORT}`);
    initBrowser();
});

server.timeout = 1200000;
server.keepAliveTimeout = 1200000;
server.headersTimeout = 1200000;

console.log('✅ Servidor listo con navegador persistente y reautenticación');