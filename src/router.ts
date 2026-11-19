import type { NavId } from "./types";
export type Route = {
  nav: NavId;
  id?: string;
  section?: string;
  issueId?: string;
  peek?: boolean;
};
export function readRoute(hash = window.location.hash): Route {
  let parts: string[];
  try {
    parts = hash
      .replace(/^#\/?/, "")
      .split("/")
      .filter(Boolean)
      .map(decodeURIComponent);
  } catch {
    return { nav: "my-issues" };
  }
  const [first, id, section] = parts;
  if (first === "issue") return { nav: "my-issues", issueId: id };
  if (first === "project") return { nav: "projects", id, section };
  if (first === "view") return { nav: "views", id };
  if (first === "initiative") return { nav: "initiatives", id, section };
  if (
    [
      "inbox",
      "my-issues",
      "reviews",
      "agent",
      "projects",
      "views",
      "loops",
      "team-home",
      "team-issues",
      "triage",
      "cycles",
      "initiatives",
      "settings",
      "archive",
      "documents",
    ].includes(first)
  )
    return { nav: first as NavId, id, section };
  return { nav: "my-issues", id: "assigned" };
}
export function routeHash(route: Route) {
  if (route.issueId && !route.peek)
    return `#/issue/${encodeURIComponent(route.issueId)}`;
  return `#/${route.nav}${route.id ? `/${encodeURIComponent(route.id)}` : ""}${route.section ? `/${encodeURIComponent(route.section)}` : ""}`;
}
export function navigate(route: Route) {
  const hash = routeHash(route);
  if (window.location.hash !== hash) {
    window.history.pushState(null, "", hash);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }
}
