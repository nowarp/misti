module.exports = {
  preset : "ts-jest",
  testEnvironment : "node",
  testPathIgnorePatterns : [ "/node_modules/", "/dist/" ],
  maxWorkers: 3,
  testTimeout: 15000,
};
