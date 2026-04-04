# Manuscrip MVP (v1)

Primera versión del producto enfocada en los pasos 1 y 2 del flujo:
- subir manuscrito (DOCX/TXT/PDF)
- extraer texto
- detectar capítulos
- guardar versiones cargadas

## Qué hace esta versión

- Formulario de carga con contexto editorial (título, género, público, objetivo)
- Upload de archivo `DOCX`, `TXT` o `PDF`
- Parseo de texto del manuscrito
- Detección inicial de capítulos por encabezados tipo `Chapter` o `Capítulo`
- Métricas base por versión:
  - recuento aproximado de palabras
  - capítulos detectados
  - extracto por capítulo
- Persistencia local de versiones en `data/manuscripts.json`

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create an environment file:

   - Copy `.env.example` to `.env`
   - Set your API key:

   ```env
   ANTHROPIC_API_KEY=your_real_key_here
   PORT=3000
   ```

3. Run the app:

   ```bash
   npm start
   ```

4. Open:

   [http://localhost:3000](http://localhost:3000)

## Estructura básica del proyecto

- `server.js`: API + lógica de ingesta
- `public/`: interfaz web
- `data/manuscripts.json`: versiones guardadas localmente

## Próximo paso sugerido

Conectar el análisis IA por capítulos para generar:
- score por dimensión
- fortalezas/debilidades
- recomendaciones accionables por capítulo
