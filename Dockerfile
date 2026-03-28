FROM node:18-slim

# PASO 1: Actualizar sistema e instalar Chromium
RUN echo "🔧 PASO 1: Instalando Chromium..." && \
    apt-get update && \
    apt-get install -y \
    chromium \
    fonts-freefont-ttf \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# PASO 2: Copiar package.json
COPY package*.json ./

# PASO 3: Instalar dependencias con manejo de errores
RUN echo "📦 PASO 3: Instalando dependencias..." && \
    npm install --silent --no-optional || \
    (echo "❌ Falló npm install, intentando con --legacy-peer-deps" && npm install --legacy-peer-deps --silent) && \
    echo "✅ Dependencias instaladas"

# PASO 4: Verificar instalación
RUN echo "🔍 Verificando módulos..." && \
    ls -la node_modules/ && \
    echo "--- Módulos críticos ---" && \
    ls node_modules/ | grep -E "express|cors|puppeteer" && \
    echo "--- Verificando carga ---" && \
    node -e "try { require('express'); console.log('✅ Express OK') } catch(e) { console.log('❌ Express FAIL:', e.message) }" && \
    node -e "try { require('cors'); console.log('✅ CORS OK') } catch(e) { console.log('❌ CORS FAIL:', e.message) }"

COPY . .

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

EXPOSE 3000

CMD ["node", "server.js"]