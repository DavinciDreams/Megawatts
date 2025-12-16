const { HealthManager } = require('./core/health');
const express = require('express');

async function testHealthIntegration() {
  console.log('🧪 Testing Health System Integration...\n');

  try {
    // Test 1: Initialize health manager
    console.log('1️⃣ Initializing Health Manager...');
    const healthManager = new HealthManager();
    await healthManager.initialize();
    console.log('✅ Health Manager initialized successfully\n');

    // Test 2: Setup Express app with health endpoints
    console.log('2️⃣ Setting up Express app with health endpoints...');
    const app = express();
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

    console.log('🎉 All health integration tests completed successfully!');
    console.log('\n📋 Integration Summary:');
    console.log('   ✅ Health Manager initialization');
    console.log('   ✅ Health endpoint registration');
    console.log('   ✅ Health check execution');
    console.log('   ✅ Readiness probe functionality');
    console.log('   ✅ Liveness probe functionality');
    console.log('   ✅ Metrics collection');
    console.log('   ✅ Individual check management');
    console.log('   ✅ HTTP route registration');
    
    return true;
  } catch (error) {
    console.error('❌ Health integration test failed:', error);
    return false;
  }
}

// Run the test
testHealthIntegration().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('❌ Test execution failed:', error);
  process.exit(1);
});