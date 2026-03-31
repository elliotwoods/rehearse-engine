import * as THREE from "three";

export function pruneInvalidSceneGraph(root: THREE.Object3D): void {
  const stack: THREE.Object3D[] = [root];

  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) {
      continue;
    }

    const children = [...node.children];
    for (let index = node.children.length - 1; index >= 0; index -= 1) {
      const child = node.children[index];
      if (!child) {
        node.children.splice(index, 1);
      }
    }

    for (const child of children) {
      if (child) {
        stack.push(child);
      }
    }
  }
}
