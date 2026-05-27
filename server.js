// ==========================================
// SERVER.JS - VERSIÓN DEFINITIVA (con Ctrl+A / Ctrl+C)
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

        // User agent real
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
        await new Promise(r => setTimeout(r, 5000));

        // === BÚSQUEDA DEL BIN ===
        console.log(`🎯 Buscando BIN: ${bin}`);
        // Esperar el campo de búsqueda
        await page.waitForSelector('input[placeholder="Search by 6-digit BIN..."]', { timeout: 10000 });
        const searchInput = await page.$('input[placeholder="Search by 6-digit BIN..."]');
        await searchInput.click({ clickCount: 3 });
        await searchInput.type(bin, { delay: 100 });
        
        // Esperar 20 segundos fijos para que la web cargue los resultados
        console.log('⏳ Esperando 20 segundos para que carguen los resultados...');
        await new Promise(r => setTimeout(r, 20000));

        // === SELECCIONAR TODO (Ctrl+A) Y COPIAR (Ctrl+C) ===
        console.log('📋 Seleccionando todo el contenido y copiando al portapapeles...');
        // En Puppeteer, usamos page.keyboard para enviar comandos reales
        await page.keyboard.down('Control');
        await page.keyboard.press('a');
        await page.keyboard.press('c');
        await page.keyboard.up('Control');

        // Pequeña pausa para que el clipboard se actualice
        await new Promise(r => setTimeout(r, 500));

        // Obtener el texto copiado desde el navegador
        const copiedText = await page.evaluate(() => {
            return navigator.clipboard.readText();
        }).catch(err => {
            console.log('⚠️ Error al leer el portapapeles:', err.message);
            // Fallback: obtener el texto seleccionado sin clipboard
            return page.evaluate(() => window.getSelection().toString());
        });

        if (!copiedText) {
            throw new Error('No se pudo obtener el texto copiado');
        }

        console.log(`🔍 Texto copiado (primeros 500 chars):\n${copiedText.substring(0, 500)}`);

        // === EXTRACCIÓN DE TARJETAS (mismos patrones que funcionaban) ===
        const cardPattern = /(\d{16})\D*(\d{2})\D*(\d{4})\D*(\d{3})/g;
        let tarjetas = new Set();
        let match;
        while ((match = cardPattern.exec(copiedText)) !== null) {
            tarjetas.add(`${match[1]}|${match[2]}|${match[3]}|${match[4]}`);
        }

        // Fallback con separadores
        if (tarjetas.size === 0) {
            const pattern2 = /(\d{16})\s*[|\-\s]\s*(\d{2})\s*[|\-\s]\s*(\d{4})\s*[|\-\s]\s*(\d{3})/g;
            while ((match = pattern2.exec(copiedText)) !== null) {
                tarjetas.add(`${match[1]}|${match[2]}|${match[3]}|${match[4]}`);
            }
        }

        const resultados = Array.from(tarjetas);
        console.log(`✅ Resultado final: ${resultados.length} tarjetas completas encontradas.`);

        return {
            success: true,
            count: resultados.length,
            data: resultados,
            debug_preview: copiedText.substring(0, 1000)
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