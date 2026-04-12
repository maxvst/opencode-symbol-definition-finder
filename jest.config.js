module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  testPathIgnorePatterns: ['<rootDir>/tests/e2e'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/cli.ts'
  ],
  coverageDirectory: 'coverage',
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: 'tsconfig.test.json',
      diagnostics: {
        warnOnly: false,
      },
    }],
  },
};
