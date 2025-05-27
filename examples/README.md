# Custom detector and tool examples

This directory contains sample detectors and tools that demonstrate the capabilities and usage of the Misti API. These examples serve as templates and guides for creating custom detectors for the Misti static analysis tool.

## Example Detector

[Implicit Init](./implicit-init) is a very simple detector that can be used as a starting template for writing your own detector. It showcases the basic structure and required elements of a Misti detector.

```bash
misti -de examples/implicit-init/implicitInit.ts:ImplicitInit examples/implicit-init/test/project/contract.tact
```

## Example Tool

[Contract Summary](./contract-summary) is an example of **external tool** that prints some information about the contract defined in the input file.

### Usage

```bash
misti -t examples/contract-summary/contractSummary.ts:ContractSummary examples/contract-summary/test.tact
```
