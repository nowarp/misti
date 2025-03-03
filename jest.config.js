module.exports = {
  preset : "ts-jest",
  testEnvironment : "node",
  testPathIgnorePatterns : [ "/node_modules/", "/dist/" ],
  maxWorkers: "30%",
  testTimeout: 15000,
};
