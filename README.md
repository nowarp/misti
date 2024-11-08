# <img src="img/misti.svg" alt="Misti Logo" width="32"/> Misti
Misti is a static analysis tool designed for smart contracts on the [TON blockchain](https://ton.org/).

#### Language Support
- [Tact](https://tact-lang.org/): 28 detectors [are available](https://nowarp.io/tools/misti/docs/next/detectors)
- [FunC](https://docs.ton.org/develop/func/overview) support is [planned](https://github.com/nowarp/misti/issues/56) by the end of the year

#### Features
- **Code Analysis**: Identify and fix potential [security flaws and code problems](https://nowarp.io/tools/misti/docs/detectors) early in the development cycle.
- **CI/CD Integration**:
  [Integrate](https://nowarp.io/tools/misti/docs/tutorial/ci-cd) Misti into your CI/CD pipeline to ensure continuous code quality checks.
- **Custom Detectors**: Create [custom detectors](https://nowarp.io/tools/misti/docs/hacking/custom-detector) to solve specific problems in your code or to provide a thorough security review if you are an auditor.

## Getting Started
1. *(optional)* [Install Soufflé](https://souffle-lang.github.io/install) to enable more built-in functionality.

2. Install Misti:
```bash
npm install -g @nowarp/misti
```

3. Run Misti by specifying a Tact contract, project config, or directory to check:
```bash
misti path/to/src/contracts
```

See [Misti Configuration](https://nowarp.io/tools/misti/docs/tutorial/getting-started/) for available options, or [Developing Misti](https://nowarp.io/tools/misti/docs/next/hacking/developing-misti) for advanced instructions. Blueprint users should refer to the [appropriate documentation page](https://nowarp.io/tools/misti/docs/tutorial/blueprint).

## Resources
- **[Misti Documentation](https://nowarp.github.io/tools/misti/)**: Comprehensive guide on detectors, architecture, and development.
- **[Misti API Reference](https://nowarp.github.io/tools/misti/api)**: Useful for contributors or developers creating custom detectors.
- **[Misti Blueprint Plugin](https://github.com/nowarp/blueprint-misti)**: A plugin for the Blueprint Framework to enhance your workflow.
- **[Misti Discussion Group](https://t.me/misti_dev)**: Join the conversation.
