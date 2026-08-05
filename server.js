// ==========================================
// SERVER.JS - POLLING INTELIGENTE + ESPERA EXTRA TRAS DETECCIÓN
// ==========================================

console.log('🎯 ===== INICIANDO SERVER.JS =====');
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

async function waitForCondition(page, checkFn, intervalMs = 3000, timeoutMs = 1200000) {
    const start = Date.now();
    let lastResult = null;
    while (Date.now() - start < timeoutMs) {
        lastResult = await checkFn();
        if (lastResult) {
            console.log(`✅ Condición cumplida después de ${Date.now() - start}ms`);
            return lastResult;
        }
        console.log(`⏳ Esperando ${intervalMs}ms... (${Math.round((Date.now() - start) / 1000)}s)`);
        await new Promise(r => setTimeout(r, intervalMs));
    }
    throw new Error(`Timeout de ${timeoutMs / 1000}s alcanzado esperando condición`);
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

        // === LOGIN (usando domcontentloaded para mayor velocidad) ===
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

        // === ESPERAR TARJETAS INICIALES ===
        console.log('⏳ Esperando tarjetas iniciales (polling cada 3s)...');
        const initialCards = await waitForCondition(
            page,
            async () => {
                const text = await getPageText(page);
                const cards = extractCardsFromText(text);
                if (cards.length > 0) {
                    console.log(`🔎 Tarjetas iniciales: ${cards.length}`);
                    return cards;
                }
                return null;
            },
            3000,
            1200000
        );
        console.log(`✅ Tarjetas iniciales cargadas (${initialCards.length})`);

        // === BUSCAR BIN ===
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

        // === ESPERAR RESULTADOS DEL BIN (CON ESPERA EXTRA DE 3s) ===
        const targetCards = await waitForCondition(
            page,
            async () => {
                const text = await getPageText(page);
                const allCards = extractCardsFromText(text);
                const matching = allCards.filter(cardStr => cardStr.startsWith(bin));
                if (matching.length > 0) {
                    console.log(`🔎 Primeras tarjetas con BIN ${bin}: ${matching.length}`);
                    // Esperar 3 segundos adicionales para que carguen todas
                    await new Promise(r => setTimeout(r, 3000));
                    // Volver a extraer
                    const text2 = await getPageText(page);
                    const allCards2 = extractCardsFromText(text2);
                    const matching2 = allCards2.filter(cardStr => cardStr.startsWith(bin));
                    console.log(`📦 Después de esperar 3s, tarjetas con BIN ${bin}: ${matching2.length}`);
                    return matching2;
                }
                return null;
            },
            3000,
            1200000
        );

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

// Ruta de búsqueda
app.post('/api/search-bin', async (req, res) => {
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

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor en puerto ${PORT}`);
});