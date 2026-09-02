import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import webhookRoutes from './routes/webhook.js';
import apiRoutes from './routes/api.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Asegurarse de cargar el .env del directorio raíz del proyecto
dotenv.config({ path: path.resolve('..', '.env') });
dotenv.config(); // Fallback por si se ejecuta en la raíz

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
// Parsear JSON
app.use(express.json());

// Servir la carpeta public/uploads estáticamente
app.use('/uploads', express.static(path.resolve('public', 'uploads')));

// Montar Rutas
app.use('/webhook', webhookRoutes);
app.use('/api', apiRoutes);

// Servir estáticos de React (Vite build)
app.use(express.static(path.join(__dirname, '../dist')));

// Ruta de salud
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'whatsapp-bot-server' });
});

// Ruta catch-all para soportar SPA de React (debe ir al final)
app.use((req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor backend escuchando en el puerto ${PORT}`);
  console.log(`   - Webhook URL: http://localhost:${PORT}/webhook`);
  console.log(`   - API Send: http://localhost:${PORT}/api/send-message`);
});
