// ==========================================
// SERVER.JS - NAVEGADOR PERSISTENTE OPTIMIZADO
// ==========================================

console.log('🎯 ===== INICIANDO SERVER.JS (MODO PERSISTENTE) =====');
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
        'https://p01--extrapolador--jbrg9jvfl7cz.code.run'
    ],
    credentials: true
}));
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'OK' }));
app.get('/api/health', (req, res) => res.json({ status: 'healthy' }));

// ========== CONFIGURACIÓN ==========
const MAX_SEARCH_TIME = 180000; // 3 minutos para buscar un BIN
const KEEPALIVE_INTERVAL = 30000; // 30 segundos

// ========== VARIABLES GLOBALES ==========
let browser = null;
let page = null;
let isReady = false;
let isProcessing = false;
let requestQueue = [];
let keepaliveTimer = null;
let pageUrl = null;

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
    return await page.evaluate(() => document.body.innerText);
}

// ========== INICIALIZAR NAVEGADOR PERSISTENTE ==========
async function initBrowser() {
    console.log('🔄 Inicializando navegador persistente...');
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
        page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // === LOGIN ===
        console.log('🌐 Navegando a:', process.env.CHK_URL);
        await page.goto(process.env.CHK_URL, {
            waitUntil: 'domcontentloaded',
            timeout: 300000
        });
        pageUrl = process.env.CHK_URL;

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

        let found = false;
        for (const sel of searchInputSelectors) {
            try {
                await page.waitForSelector(sel, { timeout: 10000, visible: true });
                const input = await page.$(sel);
                if (input) {
                    console.log(`✅ Input encontrado con: ${sel}`);
                    found = true;
                    break;
                }
            } catch (e) {}
        }

        if (!found) {
            throw new Error('No se encontró el input de búsqueda');
        }

        isReady = true;
        console.log('✅ Navegador listo para recibir peticiones');

        // Iniciar keep-alive
        startKeepAlive();

    } catch (error) {
        console.error('❌ Error inicializando navegador:', error.message);
        // Reintentar después de 10 segundos
        setTimeout(() => {
            console.log('🔄 Reintentando inicialización...');
            initBrowser();
        }, 10000);
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
            }
        } catch (error) {
            console.warn('⚠️ Keep-alive falló, intentando reiniciar navegador...');
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
                if (!isReady) {
                    throw new Error('Navegador no disponible');
                }
            }

            console.log(`🔍 Procesando BIN: ${bin}`);
            const result = await performSearch(bin);
            res.json(result);
        } catch (error) {
            console.error(`❌ Error procesando BIN ${bin}:`, error.message);
            res.status(500).json({ success: false, error: error.message });
        }
    }

    isProcessing = false;
}

// ========== BÚSQUEDA EN LA PÁGINA PERSISTENTE (MEJORADA) ==========
async function performSearch(bin) {
    console.log(`🎯 Buscando BIN: ${bin}`);

    // 1. Limpiar el input de búsqueda completamente
    console.log('🧹 Limpiando input...');
    await page.evaluate(() => {
        const input = document.querySelector('input[placeholder*="Search"], input[placeholder*="BIN"], input[maxlength="6"]');
        if (input) {
            input.value = '';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            input.dispatchEvent(new Event('blur', { bubbles: true }));
        }
    });

    // Esperar un momento para que la página reaccione
    await new Promise(r => setTimeout(r, 500));

    // 2. Encontrar el input de búsqueda
    const searchInput = await page.$('input[placeholder*="Search"], input[placeholder*="BIN"], input[maxlength="6"]');
    if (!searchInput) {
        throw new Error('Input de búsqueda no encontrado');
    }

    // 3. Enfocar y escribir el BIN lentamente para que React/Vue detecte cambios
    await searchInput.click({ clickCount: 3 });
    await searchInput.press('End');
    await new Promise(r => setTimeout(r, 200));

    // Escribir cada carácter con eventos input intermedios
    for (let i = 0; i < bin.length; i++) {
        await searchInput.type(bin[i], { delay: 80 });
        await page.evaluate(() => {
            const input = document.querySelector('input[placeholder*="Search"], input[placeholder*="BIN"], input[maxlength="6"]');
            if (input) {
                input.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });
        await new Promise(r => setTimeout(r, 50));
    }

    // Verificar que el valor sea correcto
    const valorActual = await page.evaluate(el => el.value, searchInput);
    if (valorActual !== bin) {
        console.log(`⚠️ Valor escrito no coincide: ${valorActual} vs ${bin}, forzando...`);
        await page.evaluate((val) => {
            const input = document.querySelector('input[placeholder*="Search"], input[placeholder*="BIN"], input[maxlength="6"]');
            if (input) {
                input.value = val;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }, bin);
    }

    // 4. Disparar eventos finales y Enter
    await page.evaluate(() => {
        const input = document.querySelector('input[placeholder*="Search"], input[placeholder*="BIN"], input[maxlength="6"]');
        if (input) {
            input.dispatchEvent(new Event('change', { bubbles: true }));
            input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
            input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }));
        }
    });
    await searchInput.press('Enter');

    console.log(`✅ BIN ${bin} enviado, esperando resultados...`);

    // 5. Polling rápido para detectar resultados (cada 500ms)
    const startTime = Date.now();
    const MAX_WAIT = 120000; // 2 minutos
    let targetCards = [];

    while (Date.now() - startTime < MAX_WAIT) {
        const text = await getPageText(page);
        const allCards = extractCardsFromText(text);
        const matching = allCards.filter(cardStr => cardStr.startsWith(bin));
        
        if (matching.length > 0) {
            console.log(`🔎 Primeras tarjetas con BIN ${bin} detectadas: ${matching.length}`);
            // Esperar 3 segundos adicionales para que carguen todas
            await new Promise(r => setTimeout(r, 3000));
            // Volver a extraer
            const text2 = await getPageText(page);
            const allCards2 = extractCardsFromText(text2);
            targetCards = allCards2.filter(cardStr => cardStr.startsWith(bin));
            console.log(`📦 Después de esperar 3s, tarjetas con BIN ${bin}: ${targetCards.length}`);
            break;
        }

        // Esperar 500ms y continuar
        await new Promise(r => setTimeout(r, 500));
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        if (elapsed % 5 === 0 && elapsed > 0) {
            console.log(`⏳ Esperando resultados (${elapsed}s)...`);
        }
    }

    if (targetCards.length === 0) {
        // Intentar una segunda vez si no se encontraron resultados
        console.log(`⚠️ No se encontraron resultados para BIN ${bin}, reintentando...`);
        // Limpiar input y reintentar
        await page.evaluate(() => {
            const input = document.querySelector('input[placeholder*="Search"], input[placeholder*="BIN"], input[maxlength="6"]');
            if (input) {
                input.value = '';
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });
        await new Promise(r => setTimeout(r, 1000));
        await searchInput.type(bin, { delay: 80 });
        await searchInput.press('Enter');
        await new Promise(r => setTimeout(r, 5000));

        // Volver a intentar la extracción
        const textRetry = await getPageText(page);
        const allCardsRetry = extractCardsFromText(textRetry);
        targetCards = allCardsRetry.filter(cardStr => cardStr.startsWith(bin));
        console.log(`🔄 Reintento: ${targetCards.length} tarjetas con BIN ${bin}`);
    }

    if (targetCards.length === 0) {
        await page.screenshot({ path: `debug_no_results_${bin}.png` });
        throw new Error(`No se encontraron tarjetas para el BIN ${bin} en ${MAX_WAIT/1000} segundos`);
    }

    // 6. Procesar resultados (filtrar vencidas, convertir año)
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

// ========== RUTA DE BÚSQUEDA ==========
app.post('/api/search-bin', async (req, res) => {
    req.setTimeout(1200000);
    const { bin } = req.body;
    if (!bin || bin.length !== 6) {
        return res.status(400).json({ error: 'BIN debe tener exactamente 6 dígitos' });
    }

    requestQueue.push({ req, res, bin });
    processQueue();
});

// ========== RUTA DE PRUEBA ==========
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

console.log('✅ Servidor listo con navegador persistente');