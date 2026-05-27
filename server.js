// ==========================================
// SERVER.JS - VERSIÓN CON CLIC FUERA DEL INPUT
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

async function doPuppeteerSearch(bin) {
    let browser;
    try {
        console.log(`🚀 Iniciando Puppeteer para BIN: ${bin}`);
        const browserPath = await findBrowser();
        const launchOptions = {
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
            defaultViewport: { width: 1366, height: 768 },
            timeout: 60000
        };
        if (browserPath) launchOptions.executablePath = browserPath;

        browser = await puppeteer.launch(launchOptions);
        const page = await browser.newPage();

        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // === LOGIN ===
        console.log('🌐 Navegando a:', process.env.CHK_URL);
        await page.goto(process.env.CHK_URL, { waitUntil: 'networkidle2', timeout: 30000 });

        console.log('🔑 Iniciando sesión...');
        await page.type('input[type="email"]', process.env.CHK_EMAIL, { delay: 30 });
        await page.type('input[type="password"]', process.env.CHK_PASSWORD, { delay: 30 });
        await page.click('button[type="submit"]');
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 });
        console.log('✅ Login completado');

        // Espera 20 segundos después del login
        console.log('⏳ Esperando 20 segundos después del login...');
        await new Promise(r => setTimeout(r, 30000));

        // === BÚSQUEDA DEL BIN (VERSIÓN ROBUSTA) ===
        console.log(`🎯 Buscando BIN: ${bin}`);

        // Esperar el campo de búsqueda
        await page.waitForSelector('input[placeholder="Search by 6-digit BIN..."]', { timeout: 10000 });
        const searchInput = await page.$('input[placeholder="Search by 6-digit BIN..."]');

        // Limpiar campo por si tiene texto previo
        await searchInput.click({ clickCount: 3 });
        await searchInput.press('Backspace');
        await searchInput.press('Backspace');
        await searchInput.press('Backspace');
        await searchInput.press('Backspace');
        await searchInput.press('Backspace');
        await searchInput.press('Backspace');

        // Escribir el BIN
        await searchInput.type(bin, { delay: 100 });

        // Verificar que el valor se haya escrito correctamente
        const valorActual = await page.evaluate(el => el.value, searchInput);
        if (valorActual !== bin) {
            console.log(`⚠️ Valor escrito no coincide: ${valorActual} vs ${bin}, reintentando...`);
            await searchInput.evaluate((el, val) => { el.value = val; }, bin);
        }

        // Disparar eventos para que la web detecte el cambio
        await page.evaluate(() => {
            const input = document.querySelector('input[placeholder="Search by 6-digit BIN..."]');
            if (input) {
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
                input.dispatchEvent(new Event('blur', { bubbles: true }));
            }
        });

        // Forzar la búsqueda programáticamente (por si acaso)
        await page.evaluate((binBuscado) => {
            // Intenta encontrar cualquier función de búsqueda global (si existe)
            if (window.searchCards) window.searchCards(binBuscado);
            if (window.filterCards) window.filterCards(binBuscado);
            // También simula presionar Enter nuevamente sobre el input
            const input = document.querySelector('input[placeholder="Search by 6-digit BIN..."]');
            if (input) {
                const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true });
                input.dispatchEvent(enterEvent);
            }
        }, bin);

        // Pequeña pausa para que los eventos surtan efecto
        await new Promise(r => setTimeout(r, 500));

        console.log(`✅ BIN ${bin} escrito y eventos disparados`);

        // Espera 20 segundos para que carguen los resultados
        console.log('⏳ Esperando 20 segundos para que carguen los resultados...');
        await new Promise(r => setTimeout(r, 30000));

        // === QUITAR EL FOCO DEL INPUT (clic fuera) ===
        console.log('🖱️ Haciendo clic fuera del input para quitar el foco...');
        await page.click('body'); // Clic en el fondo de la página

        // Pequeña pausa para asegurar que el foco cambió
        await new Promise(r => setTimeout(r, 500));

        // === SELECCIONAR TODO (Ctrl+A) y obtener el texto seleccionado ===
        console.log('📋 Seleccionando todo el contenido de la página...');
        await page.keyboard.down('Control');
        await page.keyboard.press('a');
        await page.keyboard.up('Control');

        // Obtener el texto seleccionado actualmente (no el clipboard, para evitar permisos)
        const selectedText = await page.evaluate(() => {
            const selection = window.getSelection();
            return selection ? selection.toString() : '';
        });

        if (!selectedText) {
            throw new Error('No se pudo obtener el texto seleccionado');
        }

        console.log(`🔍 Texto seleccionado (primeros 500 chars):\n${selectedText.substring(0, 500)}`);

        // === EXTRACCIÓN DE TARJETAS ===
        const cardPattern = /(\d{16})\D*(\d{2})\D*(\d{4})\D*(\d{3})/g;
        let tarjetas = new Set();
        let match;
        while ((match = cardPattern.exec(selectedText)) !== null) {
            tarjetas.add(`${match[1]}|${match[2]}|${match[3]}|${match[4]}`);
        }

        // Fallback con separadores
        if (tarjetas.size === 0) {
            const pattern2 = /(\d{16})\s*[|\-\s]\s*(\d{2})\s*[|\-\s]\s*(\d{4})\s*[|\-\s]\s*(\d{3})/g;
            while ((match = pattern2.exec(selectedText)) !== null) {
                tarjetas.add(`${match[1]}|${match[2]}|${match[3]}|${match[4]}`);
            }
        }

        const resultados = Array.from(tarjetas);
        console.log(`✅ Resultado final: ${resultados.length} tarjetas completas encontradas.`);

        return {
            success: true,
            count: resultados.length,
            data: resultados,
            debug_preview: selectedText.substring(0, 1000)
        };
    } catch (error) {
        console.error('❌ Error en Puppeteer:', error.message);
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
        browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'], executablePath: browserPath });
        const page = await browser.newPage();
        await page.goto('https://example.com');
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