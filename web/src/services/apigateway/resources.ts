import type { Resource } from "@aws-sdk/client-api-gateway";
import { METHOD_ORDER } from "./constants.ts";

export type ResourceNode = {
  id: string;
  path: string;
  pathPart: string;
  children: ResourceNode[];
  methods: string[];
};

const rank = (method: string) => {
  const i = METHOD_ORDER.indexOf(method);
  return i < 0 ? METHOD_ORDER.length : i;
};

export function resourceTree(resources: Resource[]): ResourceNode[] {
  const nodes = new Map<string, ResourceNode>();
  for (const r of resources) {
    if (!r.id) continue;
    nodes.set(r.id, {
      id: r.id,
      path: r.path ?? "/",
      pathPart: r.pathPart ?? "",
      children: [],
      methods: Object.keys(r.resourceMethods ?? {}).sort((a, b) => rank(a) - rank(b)),
    });
  }
  const roots: ResourceNode[] = [];
  for (const r of resources) {
    const node = r.id ? nodes.get(r.id) : undefined;
    if (!node) continue;
    const parent = r.parentId ? nodes.get(r.parentId) : undefined;
    (parent ? parent.children : roots).push(node);
  }
  for (const node of nodes.values()) {
    node.children.sort((a, b) => a.pathPart.localeCompare(b.pathPart));
  }
  return roots;
}
