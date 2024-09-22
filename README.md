# <img src="img/misti.png" alt="Misti Logo" width="32"/> Misti
Misti is a static analysis tool designed for smart contracts on the [TON blockchain](https://ton.org/).

**Language Support:**
- [Tact](https://tact-lang.org/) 1.5 is supported.
- Support for [FunC](https://docs.ton.org/develop/func/overview) [is planned](https://github.com/nowarp/misti/issues/56).

## Getting Started
1. Install Soufflé according to [the official installation instruction](https://souffle-lang.github.io/install).

2. Misti is distributed via npm and should be added to your Tact project [in the same way](https://github.com/tact-lang/tact?tab=readme-ov-file#installation) as Tact itself:
```bash
yarn add @nowarp/misti
```

3. Run Misti by specifying a Tact project configuration:
```bash
npx misti test/projects/simple/tactConfig.json
```

## Use Cases
* **Detect Vulnerabilities:** Identify and fix potential security flaws early in the development cycle.
* **Improve Code Quality:** Maintain high standards by catching bugs and enforcing best practices automatically.
* **Streamline Development:** Integrate Misti into your CI/CD pipeline to ensure continuous code quality checks.
* **Custom Detectors:** Create custom detectors to solve specific problems in your code or to provide a thorough security review if you are an auditor.

## Resources
* [Misti Documentation](https://nowarp.github.io/tools/misti/) provides a detailed overview of the built-in detectors, the architecture of the analyzer, and developer documentation.
* [Misti API Reference](https://nowarp.github.io/tools/misti/api) is useful if you are going to contribute or create your own detectors to streamline your audit.
* [Misti Blueprint Plugin](https://github.com/nowarp/blueprint-misti) is a plugin for the Blueprint Framework that simplifies your workflow with Misti.

## Community
* [Misti Discussion Group](https://t.me/misti_dev)
