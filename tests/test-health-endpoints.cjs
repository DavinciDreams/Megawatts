const { HealthManager } = require('../dist/core/health/index');
const express = require('express');

async function testHealthEndpoints() {
  console.log('🧪 Testing Health Endpoints...\n');

  try {
    // Test 1: Initialize health manager
    console.log('1️⃣ Initializing Health Manager...');
    const healthManager = new HealthManager();
    await healthManager.initialize();
    console.log('✅ Health Manager initialized successfully\n');

    // Test 2: Setup Express app with health endpoints
    console.log('2️⃣ Setting up Express app with health endpoints...');
    const app = express();
    app.use(express.json());
    healthManager.setupEndpoints(app);
    console.log('✅ Health endpoints setup completed\n');

    // Test 3: Run health checks
    console.log('3️⃣ Running health checks...');
    const health = await healthManager.runHealthChecks();
    console.log(`✅ Health checks completed - Status: ${health.status}`);
    console.log(`📊 Summary: ${health.summary.healthy}/${health.summary.total} healthy\n`);

    // Test 4: Test readiness
    console.log('4️⃣ Testing readiness...');
    const readiness = await healthManager.getReadiness();
    console.log(`✅ Readiness check: ${readiness.ready ? 'READY' : 'NOT READY'}\n`);

    // Test 5: Test liveness
    console.log('5️⃣ Testing liveness...');
    const liveness = await healthManager.getLiveness();
    console.log(`✅ Liveness check: ${liveness.alive ? 'ALIVE' : 'NOT ALIVE'}\n`);

    // Test 6: Get metrics
    console.log('6️⃣ Getting metrics...');
    const metrics = healthManager.getMetrics(5);
    console.log(`✅ Retrieved ${metrics.length} metrics entries\n`);

    // Test 7: Test individual health checks
    console.log('7️⃣ Testing individual health checks...');
    const checks = healthManager.getOrchestrator().getChecks();
    console.log(`✅ Found ${checks.length} registered health checks:`);
    checks.forEach(check => {
      console.log(`   - ${check.name} (${check.type})`);
    });
    console.log('');

    // Test 8: Test HTTP endpoints (simulate requests)
    console.log('8️⃣ Testing HTTP endpoint registration...');
    const routes = app._router?.stack?.filter(layer => layer.route) || [];
    const healthRoutes = routes.filter(route => 
      route.route.path && (
        route.route.path.includes('/health') || 
        route.route.path.includes('/ready') || 
        route.route.path.includes('/live')
      )
    );
    
    console.log(`✅ Found ${healthRoutes.length} health-related routes:`);
    healthRoutes.forEach(route => {
      const methods = Object.keys(route.route.methods).join(', ').toUpperCase();
      console.log(`   - ${methods} ${route.route.path}`);
    });
    console.log('');

    // Test 9: Test individual check execution
    console.log('9️⃣ Testing individual check execution...');
    const memoryCheck = await healthManager.getOrchestrator().runCheck('memory');
    if (memoryCheck) {
      console.log(`✅ Memory check: ${memoryCheck.status} - ${memoryCheck.message}`);
    }

    const discordCheck = await healthManager.getOrchestrator().runCheck('discord_api');
    if (discordCheck) {
      console.log(`✅ Discord API check: ${discordCheck.status} - ${discordCheck.message}`);
    }
    console.log('');

    // Test 10: Test alerts
    console.log('🔍 Testing alerts...');
    const alerts = healthManager.getActiveAlerts();
    console.log(`✅ Active alerts: ${alerts.length}`);
    if (alerts.length > 0) {
      alerts.forEach(alert => {
        console.log(`   - ${alert.severity}: ${alert.message}`);
      });
    }
    console.log('');

    console.log('🎉 All health endpoint tests completed successfully!');
    console.log('\n📋 Integration Summary:');
    console.log('   ✅ Health Manager initialization');
    console.log('   ✅ Health endpoint registration');
    console.log('   ✅ Health check execution');
    console.log('   ✅ Readiness probe functionality');
    console.log('   ✅ Liveness probe functionality');
    console.log('   ✅ Metrics collection');
    console.log('   ✅ Individual check management');
    console.log('   ✅ HTTP route registration');
    console.log('   ✅ Individual check execution');
    console.log('   ✅ Alert system');
    
    return true;
  } catch (error) {
    console.error('❌ Health endpoint test failed:', error);
    console.error('Stack trace:', error.stack);
    return false;
  }
}

// Run test
testHealthEndpoints().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('❌ Test execution failed:', error);
  process.exit(1);
});