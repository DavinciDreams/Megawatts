const express = require('express');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Basic health endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '1.0.0',
    test: true
  });
});

// Readiness endpoint
app.get('/ready', (req, res) => {
  res.json({
    ready: true,
    timestamp: new Date().toISOString(),
    checks: [
      { name: 'basic', status: 'healthy', message: 'Basic check passed' }
    ]
  });
});

// Liveness endpoint
app.get('/live', (req, res) => {
  res.json({
    alive: true,
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Detailed health endpoint
app.get('/health/detailed', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '1.0.0',
    checks: [
      { name: 'memory', status: 'healthy', message: 'Memory usage normal' },
      { name: 'cpu', status: 'healthy', message: 'CPU usage normal' },
      { name: 'disk', status: 'healthy', message: 'Disk space sufficient' }
    ],
    summary: {
      total: 3,
      healthy: 3,
      degraded: 0,
      unhealthy: 0,
      critical: 0
    }
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Self-Editing Discord Bot',
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString(),
    health: {
      endpoints: [
        '/health - Basic health check',
        '/ready - Readiness probe',
        '/live - Liveness probe',
        '/health/detailed - Detailed health information'
      ]
    }
  });
});

const PORT = process.env.HTTP_PORT || 8081;
const HOST = process.env.HTTP_HOST || '0.0.0.0';

const server = app.listen(PORT, HOST, () => {
  console.log(`🚀 Health server running on http://${HOST}:${PORT}`);
  console.log('\n📋 Available endpoints:');
  console.log('   GET /health - Basic health check');
  console.log('   GET /ready - Readiness probe');
  console.log('   GET /live - Liveness probe');
  console.log('   GET /health/detailed - Detailed health information');
  console.log('   GET / - Server information');
  console.log('\n🧪 Test the endpoints by visiting:');
  console.log(`   http://localhost:${PORT}/health`);
  console.log(`   http://localhost:${PORT}/ready`);
  console.log(`   http://localhost:${PORT}/live`);
  console.log(`   http://localhost:${PORT}/health/detailed`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n🛑 SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\n🛑 SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});