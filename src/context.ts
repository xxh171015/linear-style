import { createContext, useContext, useSyncExternalStore } from "react";
import type { Workspace } from "./workspace";

// Keep context identity independent of component hot updates.
export const WorkspaceContext = createContext<Workspace | null>(null);
export function useWorkspace() {
  const workspace = useContext(WorkspaceContext);
  if (!workspace) throw Error("Workspace provider is missing");
  return workspace;
}
export function useData() {
  const workspace = useWorkspace();
  return useSyncExternalStore(workspace.subscribe, workspace.getActiveSnapshot);
}

export function useAllData() {
  const workspace = useWorkspace();
  return useSyncExternalStore(workspace.subscribe, workspace.getSnapshot);
}
