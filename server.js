// ==========================================
// SERVER.JS - VERSIÓN NORTHFLANK (PRODUCCIÓN)
// ==========================================

// DEBUG INICIAL EXTREMO
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

// INTENTAR CARGAR MÓDULOS
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

// CORS CONFIGURACIÓN MEJORADA (incluye dominios de producción)
app.use(cors({
    origin: [
        'https://ciber7erroristaschk.com',
        'http://localhost:3000',
        'http://127.0.0.1:5500',
        'https://p01--extrapolador-backend--zzznpgbh8lh8.code.run' // dominio Northflank actual
    ],
    methods: ['GET', 'POST', 'OPTIONS', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true
}));

// IMPORTANTE: no usar app.options('*', cors()) en versiones recientes de Express
app.use(express.json());

// HEALTH CHECKS INMEDIATOS
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

// RUTA PRINCIPAL
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

// ========== FUNCIÓN PARA ENCONTRAR NAVEGADOR EN NORTHFLANK ==========
async function findBrowser() {
    console.log('🔍 Buscando navegador...');
    // 1. Usar la ruta configurada por variable de entorno (Dockerfile)
    const envPath = process.env.PUPPETEER_EXECUTABLE_PATH;
    if (envPath && fs.existsSync(envPath)) {
        console.log(`✅ Navegador encontrado vía variable de entorno: ${envPath}`);
        return envPath;
    }
    
    // 2. Buscar en rutas comunes de Linux (Northflank)
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
    
    // 3. Fallo total
    console.error('❌ No se pudo encontrar ningún navegador.');
    console.error('   Variable PUPPETEER_EXECUTABLE_PATH:', process.env.PUPPETEER_EXECUTABLE_PATH);
    return undefined;
}

// ========== FUNCIÓN PRINCIPAL DE SCRAPING (VERSIÓN MEJORADA) ==========
async function doPuppeteerSearch(bin) {
    let browser;
    try {
        console.log(`🚀 Iniciando Puppeteer para BIN: ${bin}`);
        const browserPath = await findBrowser();

        const launchOptions = {
            headless: 'new',               // Modo headless para producción
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

        // === CONFIGURACIÓN ANTI-DETECCIÓN ===
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

        // --- LOGIN ---
        const chkUrl = process.env.CHK_URL;
        console.log('🌐 Navegando a:', chkUrl);
        await page.goto(chkUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

        console.log('🔑 Iniciando sesión...');
        // Nota: el campo de email es type="text" según la versión local
        await page.waitForSelector('input[type="text"]', { timeout: 10000 });
        await page.type('input[type="text"]', process.env.CHK_EMAIL, { delay: 20 });
        await page.type('input[type="password"]', process.env.CHK_PASSWORD, { delay: 20 });
        
        await Promise.all([
            page.click('button[type="submit"]'),
            page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 })
        ]);

        // Espera fija de 12 segundos   
        console.log('⏳ Esperando carga inicial (12 segundos)...');
        await new Promise(resolve => setTimeout(resolve, 12000));

        // --- BÚSQUEDA ---
        console.log('🎯 Buscando BIN:', bin);
        await page.waitForSelector('input[placeholder="Buscar por BIN de 6 dígitos..."]', { timeout: 10000 });
        await page.type('input[placeholder="Buscar por BIN de 6 dígitos..."]', bin, { delay: 100 });

        // Esperar a que aparezca "Cargando..."
        try {
            await page.waitForFunction(() => document.body.innerText.includes('Cargando'), { timeout: 5000 });
            console.log('✅ Búsqueda iniciada (apareció "Cargando...")');
        } catch (e) {
            console.log('⚠️ No se detectó "Cargando..."');
        }
        
        // Espera fija de 12 segundos
        console.log('⏳ Esperando carga inicial (12 segundos)...');
        await new Promise(resolve => setTimeout(resolve, 12000));


        // ========== MÚLTIPLES MÉTODOS DE EXTRACCIÓN ==========
        let allTexts = [];

        // Método 1: texto visible
        const visibleText = await page.evaluate(() => document.body.innerText);
        allTexts.push(visibleText);
        console.log(`🔍 Texto visible obtenido (primeros 500 chars):\n${visibleText.substring(0, 500)}`);

        // Método 2: HTML completo
        const fullHtml = await page.evaluate(() => document.body.outerHTML);
        allTexts.push(fullHtml);
        console.log(`🔍 HTML (primeros 500 chars):\n${fullHtml.substring(0, 500)}`);

        // Método 3: Ctrl+A + Ctrl+C (simulación)
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

        // Método 4: contenido de .protected-content
        const protectedContent = await page.evaluate(() => {
            const container = document.querySelector('.protected-content');
            return container ? container.innerText : '';
        });
        if (protectedContent) {
            allTexts.push(protectedContent);
            console.log(`🔍 .protected-content (primeros 500 chars):\n${protectedContent.substring(0, 500)}`);
        }

        const combinedText = allTexts.join('\n');

        // Limpiar caracteres invisibles
        const cleanedText = combinedText.replace(/[\u200B\u200C\u200D\uFEFF]/g, '');

        // Extraer con regex robusta
        const cardPattern = /(\d{16})\D*(\d{2})\D*(\d{4})\D*(\d{3})/g;
        let tarjetas = new Set();
        let match;
        while ((match = cardPattern.exec(cleanedText)) !== null) {
            tarjetas.add(`${match[1]}|${match[2]}|${match[3]}|${match[4]}`);
        }

        // Fallback con separadores explícitos (por si acaso)
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

// ========== RUTA DE BÚSQUEDA ==========
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

// ========== RUTA DE TEST ==========
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

// INICIAR SERVIDOR
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor en puerto ${PORT}`);
    console.log(`🔧 Health: http://0.0.0.0:${PORT}/health`);
    console.log(`🔧 API Health: http://0.0.0.0:${PORT}/api/health`);
});

console.log('✅ Servidor iniciado correctamente');