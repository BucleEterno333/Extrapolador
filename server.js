// ==========================================
// SERVER.JS - TIME OUTS EXAGERADOS PARA 525 MB RAM
// ==========================================

console.log('🎯 ===== INICIANDO SERVER.JS =====');
console.log('📅 Timestamp:', new Date().toISOString());

const fs = require('fs');
const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS actualizado
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

/**
 * Verifica si una tarjeta NO está vencida (fecha posterior o igual a 06/2026)
 */
function isNotExpired(month, year) {
    const yearNum = parseInt(year, 10);
    const monthNum = parseInt(month, 10);
    if (yearNum > 26) return true;
    if (yearNum < 26) return false;
    return monthNum >= 6;
}

/**
 * Filtra las tarjetas según el BIN y la fecha de vencimiento
 */
function filterCardsByBinAndExpiry(cards, targetBin) {
    return cards.filter(cardStr => {
        const parts = cardStr.split('|');
        if (parts.length !== 4) return false;
        const [cardNumber, expMonth, expYear, cvv] = parts;
        const cardBin = cardNumber.substring(0, 6);
        if (cardBin !== targetBin) return false;
        return isNotExpired(expMonth, expYear);
    });
}

async function doPuppeteerSearch(bin) {
    const MAX_ATTEMPTS = 3;
    let attempt = 0;
    let lastError = null;

    while (attempt < MAX_ATTEMPTS) {
        attempt++;
        console.log(`\n🔁 Intento ${attempt} de ${MAX_ATTEMPTS} para BIN: ${bin}`);
        let browser;
        try {
            console.log(`🚀 Iniciando Puppeteer para BIN: ${bin}`);
            const browserPath = await findBrowser();
            const launchOptions = {
                headless: 'new',
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
                defaultViewport: { width: 1366, height: 768 },
                timeout: 180000  // ⬆️ 3 minutos para lanzar el navegador
            };
            if (browserPath) launchOptions.executablePath = browserPath;

            browser = await puppeteer.launch(launchOptions);
            const page = await browser.newPage();

            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

            // === LOGIN ===
            console.log('🌐 Navegando a:', process.env.CHK_URL);
            await page.goto(process.env.CHK_URL, { 
                waitUntil: 'networkidle2', 
                timeout: 300000  // ⬆️ 5 minutos para cargar la página
            });

            console.log('🔑 Iniciando sesión...');
            await page.type('input[type="email"]', process.env.CHK_EMAIL, { delay: 30 });
            await page.type('input[type="password"]', process.env.CHK_PASSWORD, { delay: 30 });
            await page.click('button[type="submit"]');
            await page.waitForNavigation({ 
                waitUntil: 'networkidle2', 
                timeout: 300000  // ⬆️ 5 minutos para la redirección post-login
            });
            console.log('✅ Login completado');

            // ⬆️ Espera exagerada de 120 segundos para estabilizar la sesión
            console.log('⏳ Esperando 120 segundos después del login...');
            await new Promise(r => setTimeout(r, 120000));

            // === BÚSQUEDA DEL BIN (SELECTOR FLEXIBLE) ===
            console.log(`🎯 Buscando BIN: ${bin}`);

            // Intentar varios selectores posibles
            const selectors = [
                'input[placeholder*="Search by"]',
                'input[placeholder*="BIN"]',
                'input[placeholder*="search"]',
                'input[maxlength="6"][type="text"]',
                'input[placeholder="Search by 6-digit BIN..."]'
            ];

            let searchInput = null;
            for (const sel of selectors) {
                try {
                    await page.waitForSelector(sel, { timeout: 10000, visible: true });
                    searchInput = await page.$(sel);
                    if (searchInput) {
                        console.log(`✅ Selector encontrado: ${sel}`);
                        break;
                    }
                } catch (e) {
                    // Continuar con el siguiente selector
                }
            }

            if (!searchInput) {
                // Si no se encuentra, tomar captura y lanzar error
                await page.screenshot({ path: 'debug_no_input.png' });
                const html = await page.content();
                console.log('🔍 HTML de la página (primeros 500 chars):', html.substring(0, 500));
                throw new Error('No se encontró el input de búsqueda con ningún selector');
            }

            // Limpiar campo
            await searchInput.click({ clickCount: 3 });
            for (let i = 0; i < 10; i++) await searchInput.press('Backspace');

            await searchInput.type(bin, { delay: 100 });

            const valorActual = await page.evaluate(el => el.value, searchInput);
            if (valorActual !== bin) {
                console.log(`⚠️ Valor escrito no coincide: ${valorActual} vs ${bin}, corrigiendo...`);
                await searchInput.evaluate((el, val) => { el.value = val; }, bin);
            }

            // Disparar eventos
            await page.evaluate(() => {
                const input = document.querySelector('input[placeholder*="Search"], input[placeholder*="BIN"], input[maxlength="6"]');
                if (input) {
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                    input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
                    input.dispatchEvent(new Event('blur', { bubbles: true }));
                }
            });

            // Presionar Enter directamente
            await searchInput.press('Enter');

            console.log(`✅ BIN ${bin} escrito y eventos disparados`);

            console.log('⏳ Esperando 120 segundos para que carguen los resultados...');
            await new Promise(r => setTimeout(r, 120000));

            // Quitar foco
            console.log('🖱️ Haciendo clic fuera del input para quitar el foco...');
            await page.click('body');
            await new Promise(r => setTimeout(r, 1000));  // ⬆️ 1 segundo

            // Seleccionar todo
            console.log('📋 Seleccionando todo el contenido de la página...');
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

            // Extracción de tarjetas (soporte 15/16 dígitos, año 2/4 dígitos, CVV 3/4)
            const cardPattern = /(\d{15,16})\D*(\d{1,2})\D*(\d{2,4})\D*(\d{3,4})/g;
            let tarjetas = new Set();
            let match;
            while ((match = cardPattern.exec(selectedText)) !== null) {
                let month = match[2].padStart(2, '0');
                let year = match[3];
                if (year.length === 4) year = year.slice(-2);
                let cvv = match[4].padStart(3, '0');
                tarjetas.add(`${match[1]}|${month}|${year}|${cvv}`);
            }

            // Patrón alternativo con separadores
            if (tarjetas.size === 0) {
                const pattern2 = /(\d{15,16})\s*[|│\s-]\s*(\d{1,2})\s*[|│\s-]\s*(\d{2,4})\s*[|│\s-]\s*(\d{3,4})/g;
                while ((match = pattern2.exec(selectedText)) !== null) {
                    let month = match[2].padStart(2, '0');
                    let year = match[3];
                    if (year.length === 4) year = year.slice(-2);
                    let cvv = match[4].padStart(3, '0');
                    tarjetas.add(`${match[1]}|${month}|${year}|${cvv}`);
                }
            }

            const rawCards = Array.from(tarjetas);
            console.log(`🔎 Tarjetas extraídas (sin filtrar): ${rawCards.length}`);

            const validCards = filterCardsByBinAndExpiry(rawCards, bin);
            console.log(`✅ Después de filtrar (BIN correcto y no vencidas): ${validCards.length}`);

            if (validCards.length > 0) {
                // Convertir años de 2 dígitos a 4 dígitos (asumiendo 20XX)
                const dataWith4DigitYear = validCards.map(cardStr => {
                    const parts = cardStr.split('|');
                    if (parts.length === 4) {
                        let year = parts[2];
                        // Si el año tiene 2 dígitos, lo convertimos a 4 (ej. 30 -> 2030)
                        if (year.length === 2) {
                            year = "20" + year;
                        }
                        parts[2] = year;
                        return parts.join('|');
                    }
                    return cardStr;
                });

                console.log(`🎉 Éxito en intento ${attempt}`);
                return {
                    success: true,
                    count: dataWith4DigitYear.length,
                    data: dataWith4DigitYear,
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
        } finally {
            if (browser) await browser.close().catch(console.error);
        }
    }

    console.log(`❌ Todos los ${MAX_ATTEMPTS} intentos fallaron.`);
    throw lastError || new Error(`No se pudieron obtener tarjetas válidas para el BIN ${bin} después de ${MAX_ATTEMPTS} intentos`);
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
            timeout: 300000  // ⬆️ 5 minutos
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