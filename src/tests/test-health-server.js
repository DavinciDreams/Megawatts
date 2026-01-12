import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Basic health endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '1.0.0'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Self-Editing Discord Bot',
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.HTTP_PORT || 8080;
const HOST = process.env.HTTP_HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`Health server running on http://${HOST}:${PORT}`);
});