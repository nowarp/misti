import {
  ImportGraph,
  ImportNode,
  ImportEdge,
} from "../src/internals/ir/imports";
import { SrcInfo } from "@tact-lang/compiler/dist/grammar/ast";
import { ItemOrigin } from "@tact-lang/compiler/dist/grammar/grammar";

describe("ImportGraph", () => {
  let node1: ImportNode;
  let node2: ImportNode;
  let node3: ImportNode;
  let edge1: ImportEdge;
  let edge2: ImportEdge;
  let graph: ImportGraph;

  beforeEach(() => {
    node1 = new ImportNode(
      "Node1",
      {} as ItemOrigin,
      "/path/to/node1",
      "tact",
      true,
    );
    node1.idx = 1;
    node2 = new ImportNode(
      "Node2",
      {} as ItemOrigin,
      "/path/to/node2",
      "tact",
      false,
    );
    node2.idx = 2;
    node3 = new ImportNode(
      "Node3",
      {} as ItemOrigin,
      "/path/to/node3",
      "func",
      true,
    );
    node3.idx = 3;

    // Create edges from node1 to node2 and node2 to node3
    edge1 = new ImportEdge(node1.idx, node2.idx, {} as SrcInfo);
    edge1.idx = 1;
    edge2 = new ImportEdge(node2.idx, node3.idx, {} as SrcInfo);
    edge2.idx = 2;

    // Update node inEdges and outEdges
    node1.outEdges.add(edge1.idx);
    node2.inEdges.add(edge1.idx);
    node2.outEdges.add(edge2.idx);
    node3.inEdges.add(edge2.idx);

    graph = new ImportGraph([node1, node2, node3], [edge1, edge2]);
  });

  test("forEachNode should iterate over all nodes", () => {
    const nodeNames: string[] = [];
    graph.forEachNode((node) => {
      nodeNames.push(node.name);
    });
    expect(nodeNames).toContain("Node1");
    expect(nodeNames).toContain("Node2");
    expect(nodeNames).toContain("Node3");
  });

  test("forEachEdge should iterate over all edges", () => {
    const edgeIdxs: number[] = [];
    graph.forEachEdge((edge) => {
      edgeIdxs.push(edge.idx);
    });
    expect(edgeIdxs).toContain(edge1.idx);
    expect(edgeIdxs).toContain(edge2.idx);
  });

  test("imports should return true if node imports another node", () => {
    expect(graph.imports(node1.idx, node2.idx)).toBe(true);
    expect(graph.imports(node1.idx, node3.idx)).toBe(true);
    expect(graph.imports(node2.idx, node3.idx)).toBe(true);
    expect(graph.imports(node2.idx, node1.idx)).toBe(false);
  });

  test("getContractNodes should return nodes with hasContract = true", () => {
    const contractNodes = graph.getContractNodes();
    const contractNodeNames = contractNodes.map((node) => node.name);
    expect(contractNodeNames).toContain("Node1");
    expect(contractNodeNames).toContain("Node3");
    expect(contractNodeNames).not.toContain("Node2");
  });

  test("findNodeByPath should return correct node", () => {
    const node = graph.findNodeByPath("/path/to/node2");
    expect(node).toBeDefined();
    expect(node!.name).toBe("Node2");
  });

  test("getAllImportConnections should return all nodes imported by a node", () => {
    const connections = graph.getAllImportConnections(node1.idx);
    const connectionNames = connections.map((node) => node.name);
    expect(connectionNames).toContain("Node2");
    expect(connectionNames).toContain("Node3");
    expect(connectionNames).not.toContain("Node1");
  });

  test("getAllImportingNodes should return all nodes that import a node", () => {
    const importingNodes = graph.getAllImportingNodes(node3.idx);
    const importingNodeNames = importingNodes.map((node) => node.name);
    expect(importingNodeNames).toContain("Node1");
    expect(importingNodeNames).toContain("Node2");
    expect(importingNodeNames).not.toContain("Node3");
  });

  test("findConnection should return the edge between two nodes if it exists", () => {
    const edge = graph.findConnection(node1.idx, node2.idx);
    expect(edge).toBeDefined();
    expect(edge!.idx).toBe(edge1.idx);
    const noEdge = graph.findConnection(node1.idx, node3.idx);
    expect(noEdge).toBeUndefined();
  });
});
