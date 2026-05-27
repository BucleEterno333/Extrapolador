// ==========================================
// SERVER.JS - VERSIÓN CORREGIDA (sin selectores :has-text)
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

// Cargar módulos con manejo de errores
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

// Configuración CORS actualizada con los nuevos dominios
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

// Endpoints de salud
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

// Función para encontrar el ejecutable del navegador
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
    console.error('   Variable PUPPETEER_EXECUTABLE_PATH:', process.env.PUPPETEER_EXECUTABLE_PATH);
    return undefined;
}

// Función auxiliar para buscar botón por texto usando XPath
async function findButtonByText(page, text) {
    const xpath = `//button[contains(text(), '${text}')]`;
    const [button] = await page.$x(xpath);
    return button;
}

// Función principal de scraping
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
            defaultViewport: { 
                width: 1366, 
                height: 768,
                deviceScaleFactor: 1,
                isMobile: false,
                hasTouch: false
            },
            ignoreHTTPSErrors: true,
            timeout: 60000
        };

        if (browserPath) {
            launchOptions.executablePath = browserPath;
            console.log('✅ Ruta configurada en launchOptions.');
        } else {
            console.warn('⚠️ No se encontró ruta específica, Puppeteer usará su lógica por defecto.');
        }

        browser = await puppeteer.launch(launchOptions);
        console.log('✅ Puppeteer iniciado correctamente');

        const page = await browser.newPage();

        // Configuración anti-detección
        console.log('👤 Configurando página para evitar detección...');
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'language', { get: () => 'es-ES' });
            Object.defineProperty(navigator, 'languages', { get: () => ['es-ES', 'es', 'en-US', 'en'] });
            Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
            Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
            Object.defineProperty(Intl.DateTimeFormat.prototype.resolvedOptions, 'timeZone', {
                get: () => 'America/Mexico_City'
            });
            const getParameter = WebGLRenderingContext.prototype.getParameter;
            WebGLRenderingContext.prototype.getParameter = function(parameter) {
                if (parameter === 37445) return 'NVIDIA Corporation';
                if (parameter === 37446) return 'NVIDIA GeForce GTX 1070';
                return getParameter.apply(this, arguments);
            };
        });

        await page.setExtraHTTPHeaders({
            'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Cache-Control': 'max-age=0'
        });

        await page.setDefaultNavigationTimeout(30000);
        await page.setDefaultTimeout(30000);

        // --- LOGIN ---
        const chkUrl = process.env.CHK_URL;
        console.log('🌐 Navegando a:', chkUrl);
        await page.goto(chkUrl, { waitUntil: 'networkidle2', timeout: 30000 });

        console.log('🔑 Iniciando sesión...');

        // Campo email
        const emailSelectors = [
            'input[type="email"]',
            'input[name="email"]',
            'input[placeholder*="user@domain.com"]',
            'input[class*="field-input"]',
            'input[placeholder*="email" i]',
            'input[placeholder*="correo" i]'
        ];
        let emailField = null;
        for (const sel of emailSelectors) {
            emailField = await page.$(sel);
            if (emailField) {
                console.log(`✅ Campo email encontrado con selector: ${sel}`);
                break;
            }
        }
        if (!emailField) throw new Error('No se encontró el campo de email');

        // Campo password
        const passwordSelectors = [
            'input[type="password"]',
            'input[name="password"]',
            'input[placeholder*="password" i]',
            'input[placeholder*="contraseña" i]',
            'input[class*="field-input"][type="password"]'
        ];
        let passwordField = null;
        for (const sel of passwordSelectors) {
            passwordField = await page.$(sel);
            if (passwordField) {
                console.log(`✅ Campo password encontrado con selector: ${sel}`);
                break;
            }
        }
        if (!passwordField) throw new Error('No se encontró el campo de password');

        await emailField.click({ clickCount: 3 });
        await emailField.type(process.env.CHK_EMAIL, { delay: 30 });
        await passwordField.click({ clickCount: 3 });
        await passwordField.type(process.env.CHK_PASSWORD, { delay: 30 });

        // Botón de submit - usando selectores estándar y XPath como respaldo
        let submitBtn = await page.$('button[type="submit"]');
        if (!submitBtn) submitBtn = await page.$('button.submit-btn');
        if (!submitBtn) submitBtn = await page.$('input[type="submit"]');
        if (!submitBtn) submitBtn = await findButtonByText(page, 'Login');
        if (!submitBtn) submitBtn = await findButtonByText(page, 'Sign in');
        if (!submitBtn) submitBtn = await findButtonByText(page, 'Iniciar sesión');
        
        if (!submitBtn) throw new Error('No se encontró el botón de submit');

        console.log('✅ Botón submit encontrado');
        await Promise.all([
            submitBtn.click(),
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 })
        ]);

        console.log('✅ Login completado, esperando carga...');
        await new Promise(resolve => setTimeout(resolve, 5000));

        // --- BÚSQUEDA DEL BIN ---
        console.log(`🎯 Buscando BIN: ${bin}`);
        const searchSelectors = [
            'input[placeholder="Search by 6-digit BIN..."]',
            'input[placeholder="Buscar por BIN de 6 dígitos..."]',
            'input[placeholder*="BIN" i]',
            'input[class*="search"]',
            'input[type="search"]'
        ];
        let searchInput = null;
        for (const sel of searchSelectors) {
            searchInput = await page.$(sel);
            if (searchInput) {
                console.log(`✅ Input de búsqueda encontrado con selector: ${sel}`);
                break;
            }
        }
        if (!searchInput) throw new Error('No se encontró el campo de búsqueda del BIN');

        await searchInput.click({ clickCount: 3 });
        await searchInput.type(bin, { delay: 100 });

        // Buscar botón de búsqueda (solo selectores CSS válidos)
        let searchBtn = await page.$('button[aria-label="Search"]');
        if (!searchBtn) searchBtn = await page.$('button[aria-label="Buscar"]');
        if (!searchBtn) searchBtn = await page.$('i.fa-search');
        if (!searchBtn) searchBtn = await page.$('button[type="submit"]:not([form])');
        // Intentar por texto usando XPath
        if (!searchBtn) searchBtn = await findButtonByText(page, 'Search');
        if (!searchBtn) searchBtn = await findButtonByText(page, 'Buscar');

        if (searchBtn) {
            console.log('✅ Botón de búsqueda encontrado, haciendo clic...');
            await Promise.all([
                searchBtn.click(),
                page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => console.log('⚠️ No hubo navegación (SPA)'))
            ]);
        } else {
            console.log('⚠️ No se encontró botón de búsqueda, presionando Enter');
            await searchInput.press('Enter');
            await new Promise(resolve => setTimeout(resolve, 5000));
        }

        // Esperar resultados
        console.log('⏳ Esperando resultados...');
        await page.waitForFunction(() => {
            const loader = document.querySelector('.loader, .spinner, .loading');
            if (loader && loader.offsetParent !== null) return false;
            const hasResults = document.body.innerText.includes('card') || 
                               document.body.innerText.includes('tarjeta') ||
                               document.querySelector('table tbody tr') !== null;
            return hasResults;
        }, { timeout: 30000 }).catch(() => console.log('⚠️ Timeout esperando resultados, continuando...'));

        await new Promise(resolve => setTimeout(resolve, 3000));

        // --- EXTRACCIÓN DE TARJETAS ---
        let allTexts = [];

        const visibleText = await page.evaluate(() => document.body.innerText);
        allTexts.push(visibleText);
        console.log(`🔍 Texto visible (primeros 500 chars):\n${visibleText.substring(0, 500)}`);

        const fullHtml = await page.evaluate(() => document.body.outerHTML);
        allTexts.push(fullHtml);

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

        const tableData = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('table tbody tr, .card-row, .result-item'));
            return rows.map(row => row.innerText).join('\n');
        });
        if (tableData) {
            allTexts.push(tableData);
            console.log(`🔍 Datos de tablas extraídos: ${tableData.length} caracteres`);
        }

        const cardElements = await page.evaluate(() => {
            const regex = /\b\d{16}\b/g;
            const elements = Array.from(document.querySelectorAll('*'));
            const matches = [];
            for (const el of elements) {
                if (el.children.length === 0 && el.innerText && regex.test(el.innerText)) {
                    matches.push(el.innerText);
                }
            }
            return matches.join('\n');
        });
        if (cardElements) {
            allTexts.push(cardElements);
            console.log(`🔍 Elementos con números de tarjeta: ${cardElements.length} caracteres`);
        }

        const combinedText = allTexts.join('\n');
        const cleanedText = combinedText.replace(/[\u200B\u200C\u200D\uFEFF]/g, '');

        const cardPattern = /(\d{16})\D*(\d{2})\D*(\d{2,4})\D*(\d{3})/g;
        let tarjetas = new Set();
        let match;
        while ((match = cardPattern.exec(cleanedText)) !== null) {
            let year = match[3];
            if (year.length === 2) year = '20' + year;
            tarjetas.add(`${match[1]}|${match[2]}|${year}|${match[4]}`);
        }

        const pattern2 = /(\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4})\D*(\d{2})\D*(\d{2,4})\D*(\d{3})/g;
        while ((match = pattern2.exec(cleanedText)) !== null) {
            let cardNumber = match[1].replace(/[-\s]/g, '');
            let year = match[3];
            if (year.length === 2) year = '20' + year;
            tarjetas.add(`${cardNumber}|${match[2]}|${year}|${match[4]}`);
        }

        if (tarjetas.size === 0) {
            const pattern3 = /(\d{16})\D+(\d{2})\D+(\d{4})\D+(\d{3})/g;
            while ((match = pattern3.exec(cleanedText)) !== null) {
                tarjetas.add(`${match[1]}|${match[2]}|${match[3]}|${match[4]}`);
            }
        }

        const resultados = Array.from(tarjetas);
        console.log(`✅ Resultado final: ${resultados.length} tarjetas completas encontradas.`);
        if (resultados.length === 0) {
            console.log('⚠️ No se extrajo ninguna tarjeta. Revisar debug_text_preview.');
        }

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

// Ruta de búsqueda
app.post('/api/search-bin', async (req, res) => {
    const { bin } = req.body;
    if (!bin || bin.length !== 6) {
        return res.status(400).json({ error: 'BIN debe tener exactamente 6 dígitos' });
    }

    console.log(`🔍 Búsqueda para BIN: ${bin}`);
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
    console.log('🧪 Probando Puppeteer...');
    let browser;
    try {
        const browserPath = await findBrowser();
        const launchOptions = {
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
            timeout: 20000
        };
        if (browserPath) launchOptions.executablePath = browserPath;

        browser = await puppeteer.launch(launchOptions);
        const page = await browser.newPage();
        await page.goto('https://example.com', { timeout: 15000 });
        const title = await page.title();

        res.json({ success: true, message: '✅ Puppeteer FUNCIONA!', title });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    } finally {
        if (browser) await browser.close();
    }
});

// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor en puerto ${PORT}`);
    console.log(`🔧 Health: http://0.0.0.0:${PORT}/health`);
    console.log(`🔧 API Health: http://0.0.0.0:${PORT}/api/health`);
});

console.log('✅ Servidor iniciado correctamente');