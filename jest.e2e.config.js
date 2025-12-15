module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: [
    '**/e2e/**/*.test.ts',
    '**/?(*.)+(spec|test).e2e.ts'
  ],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts'
  ],
  coverageDirectory: 'coverage/e2e',
  coverageReporters: [
    'text',
    'lcov',
    'html',
    'json-summary'
  ],
  coverageThresholds: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  },
  setupFilesAfterEnv: ['<rootDir>/src/tests/setup/e2e.ts'],
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/src/$1'
  },
  testTimeout: 120000,
  verbose: true,
  collectOnly: false,
  bail: false,
  maxWorkers: 1, // E2E tests should run sequentially
  cacheDirectory: '<rootDir>/.jest-cache/e2e',
  reporters: [
    'default',
    [
      'jest-junit',
      {
        outputDirectory: 'test-results/e2e',
        outputName: 'junit.xml',
        ancestorSeparator: ' › ',
        uniqueOutputName: 'false',
        suiteNameTemplate: '{filepath}',
        classNameTemplate: '{classname}',
        titleTemplate: '{title}'
      }
    ]
  ],
  globalSetup: '<rootDir>/src/tests/setup/globalE2e.ts',
  globalTeardown: '<rootDir>/src/tests/teardown/globalE2e.ts'
};