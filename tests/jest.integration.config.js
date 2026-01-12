export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: [
    '**/integration/**/*.test.ts',
    '**/?(*.)+(spec|test).integration.ts'
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
  coverageDirectory: 'coverage/integration',
  coverageReporters: [
    'text',
    'lcov',
    'html',
    'json-summary'
  ],
  coverageThresholds: {
    global: {
      branches: 75,
      functions: 75,
      lines: 75,
      statements: 75
    }
  },
  setupFilesAfterEnv: ['<rootDir>/src/tests/setup/integration.ts'],
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/src/$1'
  },
  testTimeout: 60000,
  verbose: true,
  collectOnly: false,
  bail: false,
  maxWorkers: '25%',
  cacheDirectory: '<rootDir>/.jest-cache/integration',
  reporters: [
    'default',
    [
      'jest-junit',
      {
        outputDirectory: 'test-results/integration',
        outputName: 'junit.xml',
        ancestorSeparator: ' › ',
        uniqueOutputName: 'false',
        suiteNameTemplate: '{filepath}',
        classNameTemplate: '{classname}',
        titleTemplate: '{title}'
      }
    ]
  ],
  globalSetup: '<rootDir>/src/tests/setup/globalIntegration.ts',
  globalTeardown: '<rootDir>/src/tests/teardown/globalIntegration.ts'
};