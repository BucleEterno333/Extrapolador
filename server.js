// ==========================================
// SERVER.JS - VERSIÓN FINAL CON EXTRACCIÓN MEJORADA
// ==========================================

console.log('🎯 ===== INICIANDO SERVER.JS =====');
console.log('📅 Timestamp:', new Date().toISOString());
console.log('📁 Directorio actual:', process.cwd());

const fs = require('fs');
try {
    console.log('📦 Verificando node_modules...');
    if (fs.existsSync('node_modules')) {
        const modules = ['express', 'cors', 'puppeteer'];
        modules.forEach(mod => {
            const exists = fs.existsSync(`node_modules/${mod}`);
            console.log(`   - ${mod}: ${exists ? '✅' : '❌'}`);
        });
    }
} catch (error) {
    console.log('❌ Error en verificación:', error.message);
}

let express, cors, puppeteer;
try {
    express = require('express');
    cors = require('cors');
    puppeteer = require('puppeteer');
    console.log('✅ Todos los módulos cargados');
} catch (error) {
    console.log('❌ Error cargando módulos:', error.message);
    process.exit(1);
}

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
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

app.use(express.json());

// Health checks
app.get('/health', (req, res) => res.json({ status: 'OK' }));
app.get('/api/health', (req, res) => res.json({ status: 'healthy', uptime: process.uptime() }));
app.get('/', (req, res) => res.json({ message: 'API funcionando', endpoints: ['/api/search-bin (POST)'] }));

// Función para encontrar Chromium
async function findBrowser() {
    const envPath = process.env.PUPPETEER_EXECUTABLE_PATH;
    if (envPath && fs.existsSync(envPath)) return envPath;
    const paths = ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome-stable'];
    for (const p of paths) if (fs.existsSync(p)) return p;
    return undefined;
}

// ========== FUNCIÓN PRINCIPAL ==========
async function doPuppeteerSearch(bin) {
    let browser;
    try {
        console.log(`🚀 Iniciando para BIN: ${bin}`);
        const browserPath = await findBrowser();
        const launchOptions = {
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
            ignoreDefaultArgs: ['--enable-automation'],
            defaultViewport: { width: 1366, height: 768 },
            timeout: 60000
        };
        if (browserPath) launchOptions.executablePath = browserPath;

        browser = await puppeteer.launch(launchOptions);
        const page = await browser.newPage();

        // Anti-detección básica
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
        });

        // LOGIN
        console.log('🌐 Navegando a:', process.env.CHK_URL);
        await page.goto(process.env.CHK_URL, { waitUntil: 'networkidle2', timeout: 30000 });

        console.log('🔑 Iniciando sesión...');
        await page.type('input[type="email"]', process.env.CHK_EMAIL, { delay: 30 });
        await page.type('input[type="password"]', process.env.CHK_PASSWORD, { delay: 30 });
        await page.click('button[type="submit"]');
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 });
        console.log('✅ Login completado');
        await new Promise(r => setTimeout(r, 5000));

        // BÚSQUEDA DEL BIN
        console.log(`🎯 Buscando BIN: ${bin}`);
        await page.waitForSelector('input[placeholder="Search by 6-digit BIN..."]', { timeout: 10000 });
        const searchInput = await page.$('input[placeholder="Search by 6-digit BIN..."]');
        await searchInput.click({ clickCount: 3 });
        await searchInput.type(bin, { delay: 100 });

        // Disparar eventos para que el filtro se actualice
        await page.evaluate(() => {
            const input = document.querySelector('input[placeholder="Search by 6-digit BIN..."]');
            if (input) {
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });

        // Presionar Enter (por si acaso)
        await searchInput.press('Enter');

        // Esperar a que aparezca UNA FILA que contenga el BIN buscado en el texto
        console.log(`⏳ Esperando fila con BIN ${bin}...`);
        try {
            await page.waitForFunction((searchBin) => {
                const rows = document.querySelectorAll('table tbody tr');
                for (const row of rows) {
                    if (row.innerText.includes(searchBin)) return true;
                }
                return false;
            }, { timeout: 30000 }, bin);
            console.log('✅ Fila con el BIN encontrada');
        } catch (e) {
            console.log('⚠️ No se encontró ninguna fila con ese BIN. Puede que no haya resultados.');
        }

        // Pequeña espera adicional para renderizado
        await new Promise(r => setTimeout(r, 3000));

        // ========== EXTRACCIÓN (MÉTODOS QUE FUNCIONABAN ANTES) ==========
        let allTexts = [];

        // Método 1: texto visible completo
        const visibleText = await page.evaluate(() => document.body.innerText);
        allTexts.push(visibleText);
        console.log(`🔍 Texto visible (primeros 500 chars):\n${visibleText.substring(0, 500)}`);

        // Método 2: HTML completo
        const fullHtml = await page.evaluate(() => document.body.outerHTML);
        allTexts.push(fullHtml);

        // Método 3: SIMULAR CTRL+A + CTRL+C (el que funcionaba antes)
        const copiedText = await page.evaluate(async () => {
            const body = document.body;
            const range = document.createRange();
            range.selectNodeContents(body);
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
            try {
                await navigator.clipboard.writeText(selection.toString());
                return selection.toString();
            } catch (err) {
                return selection.toString();
            }
        }).catch(err => {
            console.log('⚠️ Error en clipboard:', err.message);
            return '';
        });
        if (copiedText) {
            allTexts.push(copiedText);
            console.log(`🔍 Texto copiado (primeros 500 chars):\n${copiedText.substring(0, 500)}`);
        }

        const combinedText = allTexts.join('\n');
        const cleanedText = combinedText.replace(/[\u200B\u200C\u200D\uFEFF]/g, '');

        // Patrones de extracción (los mismos que usabas)
        const cardPattern = /(\d{16})\D*(\d{2})\D*(\d{4})\D*(\d{3})/g;
        let tarjetas = new Set();
        let match;
        while ((match = cardPattern.exec(cleanedText)) !== null) {
            tarjetas.add(`${match[1]}|${match[2]}|${match[3]}|${match[4]}`);
        }

        // Fallback con separadores
        if (tarjetas.size === 0) {
            const pattern2 = /(\d{16})\s*[|\-\s]\s*(\d{2})\s*[|\-\s]\s*(\d{4})\s*[|\-\s]\s*(\d{3})/g;
            while ((match = pattern2.exec(cleanedText)) !== null) {
                tarjetas.add(`${match[1]}|${match[2]}|${match[3]}|${match[4]}`);
            }
        }

        const resultados = Array.from(tarjetas);
        console.log(`✅ Resultado final: ${resultados.length} tarjetas completas encontradas.`);

        // Si no se encontraron tarjetas pero se encontró la fila del BIN, el problema es la ofuscación
        if (resultados.length === 0 && visibleText.includes(bin)) {
            console.log('⚠️ Se encontró el BIN pero no se pudieron extraer tarjetas. Revisa el preview del texto copiado.');
        }

        return {
            success: true,
            count: resultados.length,
            data: resultados,
            debug_preview: copiedText.substring(0, 1000) || visibleText.substring(0, 1000)
        };
    } catch (error) {
        console.error('❌ Error:', error.message);
        throw error;
    } finally {
        if (browser) await browser.close().catch(console.error);
    }
}

// Ruta de búsqueda
app.post('/api/search-bin', async (req, res) => {
    const { bin } = req.body;
    if (!bin || bin.length !== 6) return res.status(400).json({ error: 'BIN debe tener 6 dígitos' });
    try {
        const result = await doPuppeteerSearch(bin);
        res.json(result);
    } catch (error) {
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

// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor en puerto ${PORT}`);
});