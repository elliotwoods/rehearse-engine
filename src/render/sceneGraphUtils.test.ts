import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { pruneInvalidSceneGraph } from "@/render/sceneGraphUtils";

describe("pruneInvalidSceneGraph", () => {
  it("removes null children recursively without disturbing valid objects", () => {
    const root = new THREE.Group();
    const branch = new THREE.Group();
    const leaf = new THREE.Group();

    branch.add(leaf);
    root.add(branch);
    root.children.push(null as any);
    branch.children.push(undefined as any);

    pruneInvalidSceneGraph(root);

    expect(root.children).toEqual([branch]);
    expect(branch.children).toEqual([leaf]);
    expect(leaf.children).toHaveLength(0);
  });
});
