// ==========================================
// SERVER.JS - VERSIÓN SIN $x (totalmente compatible)
// ==========================================

console.log('🎯 ===== INICIANDO SERVER.JS =====');
console.log('📅 Timestamp:', new Date().toISOString());
console.log('📁 Directorio actual:', process.cwd());
console.log('🔍 Variables de entorno Puppeteer:');
console.log('   PUPPETEER_EXECUTABLE_PATH:', process.env.PUPPETEER_EXECUTABLE_PATH);
console.log('   PUPPETEER_SKIP_CHROMIUM_DOWNLOAD:', process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD);

const fs = require('fs');
try {
    console.log('📁 Archivos en directorio actual:');
    const files = fs.readdirSync('.');
    console.log(files);
    
    console.log('📦 Verificando node_modules:');
    if (fs.existsSync('node_modules')) {
        const nodeModules = fs.readdirSync('node_modules');
        console.log('   Número de módulos:', nodeModules.length);
        console.log('   Módulos críticos encontrados:');
        ['express', 'cors', 'puppeteer'].forEach(mod => {
            const exists = fs.existsSync(`node_modules/${mod}`);
            console.log(`   - ${mod}: ${exists ? '✅' : '❌'}`);
        });
    } else {
        console.log('❌ node_modules NO EXISTE!');
    }
} catch (error) {
    console.log('❌ Error en verificación inicial:', error.message);
}

let express, cors, puppeteer;
try {
    express = require('express');
    console.log('✅ Express cargado correctamente');
} catch (error) {
    console.log('❌ Error cargando express:', error.message);
    process.exit(1);
}

try {
    cors = require('cors');
    console.log('✅ CORS cargado correctamente');
} catch (error) {
    console.log('❌ Error cargando cors:', error.message);
}

try {
    puppeteer = require('puppeteer');
    console.log('✅ Puppeteer cargado correctamente');
} catch (error) {
    console.log('❌ Error cargando puppeteer:', error.message);
    process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3000;

console.log('✅ Todos los módulos cargados - Iniciando servidor Express...');

// CORS actualizado
app.use(cors({
    origin: [
        'https://astralchk.com',
        'http://localhost:3000',
        'http://127.0.0.1:5500',
        'https://p01--extrapolador--7ppzd7xy487n.code.run'
    ],
    methods: ['GET', 'POST', 'OPTIONS', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true
}));

app.use(express.json());

app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        message: 'Servidor funcionando correctamente',
        dependencies: {
            express: '✅',
            cors: '✅', 
            puppeteer: '✅'
        }
    });
});

app.get('/api/health', (req, res) => {
    res.status(200).json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        service: 'extrapolador-backend',
        uptime: process.uptime(),
        memory: process.memoryUsage()
    });
});

app.get('/', (req, res) => {
    res.json({ 
        message: '🎉 Extrapolador Backend API',
        status: '🟢 ONLINE',
        endpoints: {
            health: '/api/health',
            search: '/api/search-bin (POST)',
            test: '/api/test-puppeteer'
        }
    });
});

async function findBrowser() {
    console.log('🔍 Buscando navegador...');
    const envPath = process.env.PUPPETEER_EXECUTABLE_PATH;
    if (envPath && fs.existsSync(envPath)) {
        console.log(`✅ Navegador encontrado vía variable de entorno: ${envPath}`);
        return envPath;
    }
    
    const systemPaths = [
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/usr/bin/google-chrome-stable'
    ];
    
    for (const path of systemPaths) {
        if (fs.existsSync(path)) {
            console.log(`✅ Navegador encontrado en sistema: ${path}`);
            return path;
        }
    }
    
    console.error('❌ No se pudo encontrar ningún navegador.');
    return undefined;
}

async function doPuppeteerSearch(bin) {
    let browser;
    try {
        console.log(`🚀 Iniciando Puppeteer para BIN: ${bin}`);
        const browserPath = await findBrowser();

        const launchOptions = {
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--disable-software-rasterizer',
                '--disable-webgl',
                '--disable-blink-features=AutomationControlled',
                '--disable-features=IsolateOrigins,site-per-process',
                '--disable-web-security',
                '--disable-device-discovery-notifications',
                '--disable-component-extensions-with-background-pages',
                '--disable-default-apps',
                '--disable-extensions',
                '--disable-background-networking',
                '--disable-sync',
                '--disable-translate',
                '--metrics-recording-only',
                '--mute-audio',
                '--no-default-browser-check',
                '--no-first-run',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding',
                '--disable-client-side-phishing-detection',
                '--disable-component-update',
                '--disable-domain-reliability',
                '--disable-breakpad',
                '--disable-ipc-flooding-protection',
                '--disable-notifications',
                '--disable-hang-monitor',
                '--disable-prompt-on-repost',
                '--password-store=basic',
                '--use-mock-keychain',
                '--force-device-scale-factor=1',
                '--disable-infobars'
            ],
            ignoreDefaultArgs: ['--enable-automation'],
            defaultViewport: { width: 1366, height: 768 },
            ignoreHTTPSErrors: true,
            timeout: 60000
        };

        if (browserPath) launchOptions.executablePath = browserPath;

        browser = await puppeteer.launch(launchOptions);
        console.log('✅ Puppeteer iniciado correctamente');

        const page = await browser.newPage();

        // Anti-detección
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
            Object.defineProperty(navigator, 'language', { get: () => 'es-ES' });
            Object.defineProperty(navigator, 'languages', { get: () => ['es-ES', 'en'] });
        });
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'es-ES,es;q=0.9',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate'
        });

        // --- LOGIN ---
        const chkUrl = process.env.CHK_URL;
        console.log('🌐 Navegando a:', chkUrl);
        await page.goto(chkUrl, { waitUntil: 'networkidle2', timeout: 30000 });

        console.log('🔑 Iniciando sesión...');
        const emailField = await page.$('input[type="email"]');
        if (!emailField) throw new Error('No se encontró campo email');
        const passwordField = await page.$('input[type="password"]');
        if (!passwordField) throw new Error('No se encontró campo password');

        await emailField.click({ clickCount: 3 });
        await emailField.type(process.env.CHK_EMAIL, { delay: 30 });
        await passwordField.click({ clickCount: 3 });
        await passwordField.type(process.env.CHK_PASSWORD, { delay: 30 });

        let submitBtn = await page.$('button[type="submit"]');
        if (!submitBtn) submitBtn = await page.$('button.submit-btn');
        if (!submitBtn) submitBtn = await page.$('input[type="submit"]');
        if (!submitBtn) throw new Error('No se encontró botón submit');

        await Promise.all([
            submitBtn.click(),
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 })
        ]);
        console.log('✅ Login completado');
        await new Promise(resolve => setTimeout(resolve, 5000));

        // --- BÚSQUEDA ---
        console.log(`🎯 Buscando BIN: ${bin}`);
        const searchInput = await page.$('input[placeholder="Search by 6-digit BIN..."]');
        if (!searchInput) throw new Error('No se encontró campo de búsqueda');

        await searchInput.click({ clickCount: 3 });
        await searchInput.type(bin, { delay: 100 });

        // Intentar botón de búsqueda con selectores CSS (sin $x)
        let searchBtn = await page.$('button[aria-label="Search"]');
        if (!searchBtn) searchBtn = await page.$('button[aria-label="Buscar"]');
        if (!searchBtn) searchBtn = await page.$('i.fa-search');
        if (!searchBtn) searchBtn = await page.$('button[type="submit"]:not([form])');

        if (searchBtn) {
            console.log('✅ Botón de búsqueda encontrado, haciendo clic');
            await Promise.all([
                searchBtn.click(),
                page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {})
            ]);
        } else {
            console.log('⚠️ No se encontró botón, presionando Enter');
            await searchInput.press('Enter');
            await new Promise(resolve => setTimeout(resolve, 5000));
        }

        // Esperar resultados
        console.log('⏳ Esperando resultados...');
        await page.waitForFunction(() => {
            const loader = document.querySelector('.loader, .spinner, .loading');
            if (loader && loader.offsetParent !== null) return false;
            return document.body.innerText.includes('card') || 
                   document.body.innerText.includes('tarjeta') ||
                   document.querySelector('table tbody tr') !== null;
        }, { timeout: 30000 }).catch(() => console.log('⚠️ Timeout esperando resultados'));

        await new Promise(resolve => setTimeout(resolve, 3000));

        // --- EXTRACCIÓN ---
        const visibleText = await page.evaluate(() => document.body.innerText);
        console.log(`🔍 Texto visible (primeros 500 chars):\n${visibleText.substring(0, 500)}`);

        const fullHtml = await page.evaluate(() => document.body.outerHTML);
        const tableData = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('table tbody tr, .card-row'));
            return rows.map(r => r.innerText).join('\n');
        });

        const combinedText = [visibleText, fullHtml, tableData].join('\n');
        const cleanedText = combinedText.replace(/[\u200B-\u200D\uFEFF]/g, '');

        const cardPattern = /(\d{16})\D*(\d{2})\D*(\d{2,4})\D*(\d{3})/g;
        let tarjetas = new Set();
        let match;
        while ((match = cardPattern.exec(cleanedText)) !== null) {
            let year = match[3].length === 2 ? '20' + match[3] : match[3];
            tarjetas.add(`${match[1]}|${match[2]}|${year}|${match[4]}`);
        }

        const pattern2 = /(\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4})\D*(\d{2})\D*(\d{2,4})\D*(\d{3})/g;
        while ((match = pattern2.exec(cleanedText)) !== null) {
            let cardNumber = match[1].replace(/[-\s]/g, '');
            let year = match[3].length === 2 ? '20' + match[3] : match[3];
            tarjetas.add(`${cardNumber}|${match[2]}|${year}|${match[4]}`);
        }

        const resultados = Array.from(tarjetas);
        console.log(`✅ Resultado final: ${resultados.length} tarjetas encontradas.`);

        return {
            success: true,
            count: resultados.length,
            data: resultados,
            debug_text_preview: visibleText.substring(0, 1000)
        };
    } catch (error) {
        console.error('❌ Error en Puppeteer:', error.message);
        throw error;
    } finally {
        if (browser) await browser.close().catch(console.error);
    }
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
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/test-puppeteer', async (req, res) => {
    let browser;
    try {
        const browserPath = await findBrowser();
        const launchOptions = {
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
            timeout: 20000
        };
        if (browserPath) launchOptions.executablePath = browserPath;
        browser = await puppeteer.launch(launchOptions);
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
    console.log(`🔧 Health: http://0.0.0.0:${PORT}/health`);
});