export type EdgeStyle = "solid" | "dashed";

export function edgeKey(a: string, b: string): string {
  return [a, b].sort((left, right) => left.localeCompare(right)).join("|");
}

export function normalizeEdgeInput(value: unknown): [string, string] | null {
  if (typeof value === "string") {
    for (const separator of ["|", ":", ",", "/", "~", "-"]) {
      const parts = value.split(separator);
      if (parts.length === 2 && parts.every(Boolean))
        return [parts[0], parts[1]];
    }
    return null;
  }
  if (Array.isArray(value) && value.length === 2) {
    const [a, b] = value;
    return typeof a === "string" && typeof b === "string" ? [a, b] : null;
  }
  if (typeof value !== "object" || value === null) return null;
  const edge = value as Record<string, unknown>;
  const a = edge.a ?? edge.from ?? edge[0];
  const b = edge.b ?? edge.to ?? edge[1];
  return typeof a === "string" && typeof b === "string" ? [a, b] : null;
}

export function styleOf(value: unknown): EdgeStyle | null {
  if (
    value === "solid" ||
    value === "dashed" ||
    value === true ||
    value === false
  ) {
    return value === true ? "solid" : value === false ? "dashed" : value;
  }
  if (typeof value !== "object" || value === null) return null;
  const edge = value as Record<string, unknown>;
  if (edge.style === "solid" || edge.style === "dashed") return edge.style;
  if (edge.hidden === true || edge.visible === false) return "dashed";
  if (edge.hidden === false || edge.visible === true) return "solid";
  return null;
}
