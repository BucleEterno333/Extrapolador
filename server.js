// ==========================================
// SERVER.JS - CON DOMCONTENTLOADED Y REINTENTOS
// ==========================================

console.log('🎯 ===== INICIANDO SERVER.JS =====');
console.log('📅 Timestamp:', new Date().toISOString());

const fs = require('fs');
const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');

try {
    require('dotenv').config();
} catch (e) {}

const app = express();
const PORT = process.env.PORT || 3000;

// ===== VALIDACIÓN DE VARIABLES =====
const requiredEnv = ['CHK_EMAIL', 'CHK_PASSWORD'];
const missing = requiredEnv.filter(key => !process.env[key]);
if (missing.length > 0) {
    console.error(`❌ Faltan variables obligatorias: ${missing.join(', ')}`);
    console.error('   Por favor, configúralas en el entorno.');
} else {
    console.log('✅ Credenciales configuradas.');
}

// URLs: si no se define CHK_SEARCH_URL, se usa CHK_URL
const LOGIN_URL = process.env.CHK_LOGIN_URL || process.env.CHK_URL;
const SEARCH_URL = process.env.CHK_SEARCH_URL || process.env.CHK_URL;

if (!LOGIN_URL) {
    console.error('❌ No se definió CHK_URL ni CHK_LOGIN_URL. El servidor no podrá navegar.');
}

console.log(`🔗 LOGIN_URL: ${LOGIN_URL || 'NO DEFINIDA'}`);
console.log(`🔗 SEARCH_URL: ${SEARCH_URL || 'NO DEFINIDA'}`);

// CORS
app.use(cors({
    origin: [
        'https://astralchk.com',
        'http://localhost:3000',
        'http://127.0.0.1:5500',
        'https://p01--extrapolador--7ppzd7xy487n.code.run'
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

async function doPuppeteerSearch(bin) {
    if (!LOGIN_URL || !SEARCH_URL) {
        throw new Error('Falta URL de login o búsqueda. Verifica las variables CHK_URL, CHK_LOGIN_URL y CHK_SEARCH_URL.');
    }
    if (!process.env.CHK_EMAIL || !process.env.CHK_PASSWORD) {
        throw new Error('Faltan credenciales (CHK_EMAIL / CHK_PASSWORD).');
    }

    const MAX_ATTEMPTS = 3;
    let attempt = 0;
    let lastError = null;

    while (attempt < MAX_ATTEMPTS) {
        attempt++;
        console.log(`\n🔁 Intento ${attempt} de ${MAX_ATTEMPTS} para BIN: ${bin}`);
        let browser;
        try {
            const browserPath = await findBrowser();
            const launchOptions = {
                headless: 'new',
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
                defaultViewport: { width: 1366, height: 768 },
                timeout: 120000
            };
            if (browserPath) launchOptions.executablePath = browserPath;

            browser = await puppeteer.launch(launchOptions);
            const page = await browser.newPage();

            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

            // === LOGIN ===
            console.log(`🌐 Navegando a login: ${LOGIN_URL}`);
            await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });

            // Esperar campos de login
            console.log('🔍 Esperando campos de login...');
            await page.waitForSelector('input[type="email"]', { timeout: 30000 });
            await page.waitForSelector('input[type="password"]', { timeout: 30000 });

            console.log('🔑 Iniciando sesión...');
            await page.type('input[type="email"]', process.env.CHK_EMAIL, { delay: 30 });
            await page.type('input[type="password"]', process.env.CHK_PASSWORD, { delay: 30 });
            await page.click('button[type="submit"]');

            // Esperar a que la navegación termine (redirección post-login)
            console.log(`⏳ Esperando redirección...`);
            await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 120000 });

            // Si la URL actual no es la de búsqueda, navegar a ella
            const currentUrl = page.url();
            if (!currentUrl.includes(SEARCH_URL)) {
                console.log(`⚠️ La URL actual (${currentUrl}) no es la de búsqueda. Navegando a ${SEARCH_URL}`);
                await page.goto(SEARCH_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
            }

            console.log('✅ Login completado y en página de búsqueda.');

            // Espera estabilizadora (opcional, pero ayuda)
            console.log('⏳ Esperando 5 segundos para estabilizar...');
            await new Promise(r => setTimeout(r, 5000));

            // === BÚSQUEDA DEL BIN ===
            console.log(`🎯 Buscando BIN: ${bin}`);
            await page.waitForSelector('input[placeholder="Search by 6-digit BIN..."]', { timeout: 30000 });
            const searchInput = await page.$('input[placeholder="Search by 6-digit BIN..."]');

            // Limpiar campo
            await searchInput.click({ clickCount: 3 });
            for (let i = 0; i < 6; i++) await searchInput.press('Backspace');

            await searchInput.type(bin, { delay: 100 });

            const valorActual = await page.evaluate(el => el.value, searchInput);
            if (valorActual !== bin) {
                console.log(`⚠️ Valor escrito no coincide: ${valorActual} vs ${bin}, corrigiendo...`);
                await searchInput.evaluate((el, val) => { el.value = val; }, bin);
            }

            // Disparar eventos
            await page.evaluate(() => {
                const input = document.querySelector('input[placeholder="Search by 6-digit BIN..."]');
                if (input) {
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                    input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
                    input.dispatchEvent(new Event('blur', { bubbles: true }));
                }
            });
            await page.evaluate((binBuscado) => {
                if (window.searchCards) window.searchCards(binBuscado);
                if (window.filterCards) window.filterCards(binBuscado);
                const input = document.querySelector('input[placeholder="Search by 6-digit BIN..."]');
                if (input) {
                    const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true });
                    input.dispatchEvent(enterEvent);
                }
            }, bin);

            await new Promise(r => setTimeout(r, 500));
            console.log(`✅ BIN ${bin} escrito y eventos disparados`);

            console.log('⏳ Esperando 20 segundos para que carguen los resultados...');
            await new Promise(r => setTimeout(r, 20000));

            // Quitar foco
            console.log('🖱️ Haciendo clic fuera del input...');
            await page.click('body');
            await new Promise(r => setTimeout(r, 500));

            // Seleccionar todo
            console.log('📋 Seleccionando todo el contenido...');
            await page.keyboard.down('Control');
            await page.keyboard.press('a');
            await page.keyboard.up('Control');

            const selectedText = await page.evaluate(() => {
                const selection = window.getSelection();
                return selection ? selection.toString() : '';
            });

            if (!selectedText) {
                throw new Error('No se pudo obtener el texto seleccionado');
            }

            console.log(`🔍 Texto seleccionado (primeros 500 chars):\n${selectedText.substring(0, 500)}`);

            // Extraer tarjetas
            const cardPattern = /(\d{16})\D*(\d{2})\D*(\d{4})\D*(\d{3})/g;
            let tarjetas = new Set();
            let match;
            while ((match = cardPattern.exec(selectedText)) !== null) {
                tarjetas.add(`${match[1]}|${match[2]}|${match[3]}|${match[4]}`);
            }

            if (tarjetas.size === 0) {
                const pattern2 = /(\d{16})\s*[|\-\s]\s*(\d{2})\s*[|\-\s]\s*(\d{4})\s*[|\-\s]\s*(\d{3})/g;
                while ((match = pattern2.exec(selectedText)) !== null) {
                    tarjetas.add(`${match[1]}|${match[2]}|${match[3]}|${match[4]}`);
                }
            }

            const rawCards = Array.from(tarjetas);
            console.log(`🔎 Tarjetas extraídas (sin filtrar): ${rawCards.length}`);

            const validCards = filterCardsByBinAndExpiry(rawCards, bin);
            console.log(`✅ Después de filtrar (BIN correcto y no vencidas): ${validCards.length}`);

            if (validCards.length > 0) {
                console.log(`🎉 Éxito en intento ${attempt}`);
                return {
                    success: true,
                    count: validCards.length,
                    data: validCards,
                    debug_preview: selectedText.substring(0, 1000),
                    attempt: attempt
                };
            } else {
                console.log(`⚠️ Intento ${attempt} no produjo tarjetas válidas.`);
                if (rawCards.length > 0) {
                    console.log(`   Se encontraron ${rawCards.length} tarjetas pero ninguna coincidía con el BIN o estaban vencidas.`);
                }
                lastError = new Error(`Intento ${attempt}: sin tarjetas válidas para BIN ${bin}`);
            }
        } catch (error) {
            console.error(`❌ Error en intento ${attempt}:`, error.message);
            lastError = error;
            if (error.message.includes('CHK_') || error.message.includes('URL')) {
                throw error;
            }
        } finally {
            if (browser) await browser.close().catch(console.error);
        }
    }

    console.log(`❌ Todos los ${MAX_ATTEMPTS} intentos fallaron.`);
    throw lastError || new Error(`No se pudieron obtener tarjetas válidas para el BIN ${bin} después de ${MAX_ATTEMPTS} intentos`);
}

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

app.get('/api/test-puppeteer', async (req, res) => {
    let browser;
    try {
        const browserPath = await findBrowser();
        browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'], executablePath: browserPath });
        const page = await browser.newPage();
        await page.goto('https://example.com', { waitUntil: 'domcontentloaded' });
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