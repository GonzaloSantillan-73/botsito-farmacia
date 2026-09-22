import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import webhookRoutes from './routes/webhook.js';
import apiRoutes from './routes/api.js';
import adminAuthRoutes from './routes/adminAuth.js';
import staffRoutes from './routes/staff.js';
import clientesRoutes from './routes/clientes.js';
import clientDirectoryRoutes from './routes/clientDirectory.js';
import quickRepliesRoutes from './routes/quickReplies.js';
import moderacionRoutes from './routes/moderacion.js';
import { startSessionExpiryChecker } from './services/sessionExpiryChecker.js';
import { logInstanceBoot } from './instanceInfo.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

logInstanceBoot();
console.log('🔍 [DEBUG-INDEX] Inicializando servidor, __dirname:', __dirname);

// Helper de debug: clona un body y redacta campos sensibles de password antes de loguear
function debugRedactBody(body) {
  if (!body || typeof body !== 'object') return body;
  const clone = { ...body };
  ['password', 'currentPassword', 'newPassword'].forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(clone, field)) {
      clone[field] = '[REDACTED]';
    }
  });
  return clone;
}

// Asegurarse de cargar el .env del directorio raíz del proyecto
console.log('🔍 [DEBUG-INDEX] Cargando dotenv desde:', path.join(__dirname, '../.env'));
dotenv.config({ path: path.join(__dirname, '../.env') });
console.log('✅ [DEBUG-INDEX] dotenv cargado');

const app = express();
const PORT = process.env.PORT || 3000;
console.log('🔍 [DEBUG-INDEX] PORT configurado:', PORT, '(process.env.PORT presente:', !!process.env.PORT, ')');

console.log('🔍 [DEBUG-INDEX] Registrando middleware cors()');
app.use(cors());
// Parsear JSON
console.log('🔍 [DEBUG-INDEX] Registrando middleware express.json()');
app.use(express.json());

// Servir la carpeta public/uploads estáticamente
console.log('🔍 [DEBUG-INDEX] Registrando static /uploads en:', path.resolve('public', 'uploads'));
app.use('/uploads', express.static(path.resolve('public', 'uploads')));

// Evitar que el CDN de Hostinger (o el navegador) cachee respuestas de la API,
// ya que devuelve datos dinámicos y un cacheo stale rompe el login/config del CRM.
app.use('/api', (_req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  next();
});

// Montar Rutas
console.log('🔍 [DEBUG-INDEX] Montando ruta /webhook');
app.use('/webhook', webhookRoutes);
console.log('🔍 [DEBUG-INDEX] Montando ruta /api');
app.use('/api', apiRoutes);
console.log('🔍 [DEBUG-INDEX] Montando ruta /api/admin');
app.use('/api/admin', adminAuthRoutes);
console.log('🔍 [DEBUG-INDEX] Montando ruta /api/admin/staff');
app.use('/api/admin/staff', staffRoutes);
console.log('🔍 [DEBUG-INDEX] Montando ruta /api/admin/clientes');
app.use('/api/admin/clientes', clientesRoutes);
console.log('🔍 [DEBUG-INDEX] Montando ruta /api/admin/client-directory');
app.use('/api/admin/client-directory', clientDirectoryRoutes);
console.log('🔍 [DEBUG-INDEX] Montando ruta /api/admin/quick-replies');
app.use('/api/admin/quick-replies', quickRepliesRoutes);
console.log('🔍 [DEBUG-INDEX] Montando ruta /api/admin/moderacion');
app.use('/api/admin/moderacion', moderacionRoutes);

// Servir estáticos de React (Vite build)
console.log('🔍 [DEBUG-INDEX] Registrando static de React (Vite build) en:', path.join(__dirname, '../dist'));
app.use(express.static(path.join(__dirname, '../dist')));

// Ruta de salud
app.get('/health', (req, res) => {
  console.log('🔍 [DEBUG-INDEX] GET /health - method:', req.method, 'originalUrl:', req.originalUrl, 'body:', debugRedactBody(req.body), 'query:', req.query, 'params:', req.params);
  const responseBody = { status: 'ok', service: 'whatsapp-bot-server' };
  console.log('🔚 [DEBUG-INDEX] GET /health - respondiendo status:', 200, 'body:', responseBody);
  res.status(200).json(responseBody);
});

// Ruta catch-all para soportar SPA de React (debe ir al final)
app.use((req, res) => {
  console.log('🔍 [DEBUG-INDEX] catch-all - method:', req.method, 'originalUrl:', req.originalUrl, 'body:', debugRedactBody(req.body), 'query:', req.query, 'params:', req.params);
  const indexPath = path.join(__dirname, '../dist/index.html');
  console.log('🔚 [DEBUG-INDEX] catch-all - respondiendo con sendFile:', indexPath);
  res.sendFile(indexPath);
});

app.listen(PORT, () => {
  console.log('✅ [DEBUG-INDEX] app.listen callback ejecutado, PORT:', PORT);
  console.log(`🚀 Servidor backend escuchando en el puerto ${PORT}`);
  console.log(`   - Webhook URL: http://localhost:${PORT}/webhook`);
  console.log(`   - API Send: http://localhost:${PORT}/api/send-message`);
  console.log('🔍 [DEBUG-INDEX] Llamando a startSessionExpiryChecker()');
  startSessionExpiryChecker();
  console.log('✅ [DEBUG-INDEX] startSessionExpiryChecker() invocado');
});
