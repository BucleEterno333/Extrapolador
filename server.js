// ==========================================
// SERVER.JS - VERSIÓN ADAPTADA A NUEVA WEB
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

try {
    console.log('🔧 Cargando módulo express...');
    const express = require('express');
    console.log('✅ Express cargado correctamente');
} catch (error) {
    console.log('❌ Error cargando express:', error.message);
    console.log('💀 APLICACIÓN FALLIDA - SALIENDO');
    process.exit(1);
}

try {
    console.log('🔧 Cargando módulo cors...');
    const cors = require('cors');
    console.log('✅ CORS cargado correctamente');
} catch (error) {
    console.log('❌ Error cargando cors:', error.message);
}

const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 3000;

console.log('✅ Todos los módulos cargados - Iniciando servidor Express...');

app.use(cors({
    origin: [
        'https://ciber7erroristaschk.com',
        'http://localhost:3000',
        'http://127.0.0.1:5500',
        'https://p01--extrapolador-backend--zzznpgbh8lh8.code.run'
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
    console.error('   Variable PUPPETEER_EXECUTABLE_PATH:', process.env.PUPPETEER_EXECUTABLE_PATH);
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

            const toDataURL = HTMLCanvasElement.prototype.toDataURL;
            HTMLCanvasElement.prototype.toDataURL = function(type) {
                if (type === 'image/png') {
                    return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
                }
                return toDataURL.apply(this, arguments);
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

        // --- LOGIN MEJORADO CON MÚLTIPLES SELECTORES ---
        const chkUrl = process.env.CHK_URL;
        console.log('🌐 Navegando a:', chkUrl);
        await page.goto(chkUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

        console.log('🔑 Iniciando sesión...');
        // Intentar varios selectores para el campo email
        const emailSelectors = [
            'input[type="email"]',
            'input[name="email"]',
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

        const passwordSelectors = [
            'input[type="password"]',
            'input[name="password"]',
            'input[placeholder*="password" i]',
            'input[placeholder*="contraseña" i]'
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

        await page.type(emailSelectors[0], process.env.CHK_EMAIL, { delay: 20 });
        await page.type(passwordSelectors[0], process.env.CHK_PASSWORD, { delay: 20 });
        
        // Botón de submit (puede ser button[type="submit"] o cualquier botón que contenga "login" o "sign in")
        const submitSelectors = [
            'button[type="submit"]',
            'button:has-text("Login")',
            'button:has-text("Sign in")',
            'button:has-text("Iniciar sesión")'
        ];
        let submitBtn = null;
        for (const sel of submitSelectors) {
            submitBtn = await page.$(sel);
            if (submitBtn) {
                console.log(`✅ Botón submit encontrado con selector: ${sel}`);
                break;
            }
        }
        if (!submitBtn) throw new Error('No se encontró el botón de submit');

        await Promise.all([
            submitBtn.click(),
            page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 })
        ]);

        console.log('⏳ Esperando carga inicial (15 segundos)...');
        await new Promise(resolve => setTimeout(resolve, 15000));

        // --- BÚSQUEDA CON NUEVO PLACEHOLDER EN INGLÉS ---
        console.log('🎯 Buscando BIN:', bin);
        // Selector actualizado al placeholder en inglés
        const searchSelector = 'input[placeholder="Search by 6-digit BIN..."]';
        await page.waitForSelector(searchSelector, { timeout: 10000 });
        await page.type(searchSelector, bin, { delay: 100 });

        // Detección flexible de "Cargando..." o "Loading..."
        try {
            await page.waitForFunction(() => {
                const text = document.body.innerText;
                return text.includes('Cargando') || text.includes('Loading') || text.includes('Searching');
            }, { timeout: 5000 });
            console.log('✅ Búsqueda iniciada (mensaje de carga detectado)');
        } catch (e) {
            console.log('⚠️ No se detectó mensaje de carga, continuando...');
        }
        
        console.log('⏳ Esperando carga de resultados (12 segundos)...');
        await new Promise(resolve => setTimeout(resolve, 12000));

        // ========== EXTRACCIÓN DE DATOS ==========
        let allTexts = [];

        // Método 1: texto visible
        const visibleText = await page.evaluate(() => document.body.innerText);
        allTexts.push(visibleText);
        console.log(`🔍 Texto visible obtenido (primeros 500 chars):\n${visibleText.substring(0, 500)}`);

        // Método 2: HTML completo
        const fullHtml = await page.evaluate(() => document.body.outerHTML);
        allTexts.push(fullHtml);
        console.log(`🔍 HTML (primeros 500 chars):\n${fullHtml.substring(0, 500)}`);

        // Método 3: simular Ctrl+A + Ctrl+C
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
        } else {
            console.log('⚠️ No se pudo obtener texto copiado.');
        }

        const combinedText = allTexts.join('\n');
        const cleanedText = combinedText.replace(/[\u200B\u200C\u200D\uFEFF]/g, '');

        // Extraer tarjetas con patrón robusto
        const cardPattern = /(\d{16})\D*(\d{2})\D*(\d{4})\D*(\d{3})/g;
        let tarjetas = new Set();
        let match;
        while ((match = cardPattern.exec(cleanedText)) !== null) {
            tarjetas.add(`${match[1]}|${match[2]}|${match[3]}|${match[4]}`);
        }

        // Fallback con separadores explícitos
        if (tarjetas.size === 0) {
            const pattern2 = /(\d{16})\s*[|\-\s]\s*(\d{2})\s*[|\-\s]\s*(\d{4})\s*[|\-\s]\s*(\d{3})/g;
            while ((match = pattern2.exec(cleanedText)) !== null) {
                tarjetas.add(`${match[1]}|${match[2]}|${match[3]}|${match[4]}`);
            }
        }

        const resultados = Array.from(tarjetas);
        console.log(`✅ Resultado final: ${resultados.length} tarjetas completas encontradas.`);

        return {
            success: true,
            count: resultados.length,
            data: resultados
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

    console.log(`🔍 Búsqueda para BIN: ${bin}`);
    try {
        const result = await doPuppeteerSearch(bin);
        res.json(result);
    } catch (error) {
        console.error('❌ Error en búsqueda:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

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

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor en puerto ${PORT}`);
    console.log(`🔧 Health: http://0.0.0.0:${PORT}/health`);
    console.log(`🔧 API Health: http://0.0.0.0:${PORT}/api/health`);
});

console.log('✅ Servidor iniciado correctamente');