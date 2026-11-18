import {
  Component,
  StrictMode,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import {
  IndexedDBRepository,
  Workspace,
  initialData,
  migrateData,
} from "./workspace";
import "./styles.css";
import "./replica.css";
const repository = new IndexedDBRepository();
class RenderBoundary extends Component<
  { children: ReactNode },
  { error: string }
> {
  state = { error: "" };
  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
  render() {
    return this.state.error ? (
      <div className="r-boot" role="alert">
        <h1>Unable to display this page</h1>
        <p>{this.state.error}</p>
        <p>Your saved workspace has not been replaced.</p>
        <button
          onClick={() => {
            window.location.hash = "#/my-issues";
            window.location.reload();
          }}
        >
          Reopen workspace
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
function Bootstrap() {
  const [initialSession,setInitialSession] = useState<unknown>();
  const [workspace, setWorkspace] = useState<Workspace | null>(null),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setError("");
    let loadedWorkspace: Workspace | undefined;
    repository
      .loadOrCreate(initialData())
      .then(async (saved) => {
        const session = await window.replicaDesktop?.loadSession?.().catch(()=>undefined);
        if (active) setInitialSession(session);
        if (active)
          setWorkspace(
            (loadedWorkspace = new Workspace(
              saved === undefined ? initialData() : migrateData(saved),
              repository,
            )),
          );
      })
      .catch((error) => {
        if (active)
          setError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      active = false;
      loadedWorkspace?.dispose();
    };
  }, [attempt]);
  if (error)
    return (
      <div className="r-boot">
        <h1>Unable to open your workspace</h1>
        <p>{error}</p>
        <p>Your saved data has not been replaced.</p>
        <button onClick={() => setAttempt(attempt + 1)}>Retry</button>
      </div>
    );
  return workspace ? (
    <App workspace={workspace} initialSession={initialSession} />
  ) : (
    <div className="r-boot" role="status">
      Opening workspace…
    </div>
  );
}
// Vite can reevaluate this entry when a shared store module changes. Reuse the
// mounted root across that update rather than mounting two React trees.
const root =
  import.meta.hot?.data.root ?? createRoot(document.getElementById("root")!);
if (import.meta.hot) import.meta.hot.data.root = root;
root.render(
  <StrictMode>
    <RenderBoundary>
      <Bootstrap />
    </RenderBoundary>
  </StrictMode>,
);
