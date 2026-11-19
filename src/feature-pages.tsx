import { useContext, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { AccountContext } from "./account-ui";
import { WorkspaceAccounts, WorkspaceMembers } from "./workspace-members-ui";
import * as I from "./icons";
import {
  createKernel,
  estimateProgress,
  PROJECT_STATUSES,
  PRIORITY_LABEL,
} from "./kernel";
import { HEALTH_LABEL, PROJECT_STATUS_LABEL } from "./logic";
import type {
  CustomView,
  Cycle,
  Initiative,
  Loop,
  Priority,
  Project,
  ProjectHealth,
  Review,
} from "./types";
import {
  Attachments,
  Avatar,
  Button,
  Choice,
  DateLabel,
  Dialog,
  Empty,
  Field,
  FileInput,
  IconButton,
  RichText,
  RichEditor,
  useData,
  useAllData,
  useWorkspace,
} from "./ui";
import { IssueList, DisplayMenu, FilterBuilder } from "./issue-ui";
import {
  DEFAULT_DISPLAY,
  LOOP_TEMPLATES,
  currentTeam,
  cyclePhase,
  day,
  displayIssues,
  formatDate,
  initiativeProgress,
  migrateData,
  matchesProjectFilter,
  pulseEntries,
  stamp,
  uid,
  type WorkspaceData,
} from "./workspace";
import { LABEL_COLOR_OPTIONS, LABEL_COLORS } from "./data";
import { navigate, type Route } from "./router";
import { accountApiBase, accountEnabled, setAccountApiBase, setAccountEnabled } from "./remote-repository";
import { localAgent } from "./adapters";
import { IssueTemplateSettings } from "./template-ui";
import { ProjectCollection } from "./project-views";
import { scheduleDates } from "./timeline";
import { inInboxFolder, useNotificationTime, type InboxFolder } from "./notifications";
export type PageProps = {
  route: Route;
  onIssue: (id: string, peek?: boolean) => void;
  onCreate: (options?: {
    projectId?: string;
    cycleId?: string;
    initialStatus?: "triage";
  }) => void;
};
export function PageHeader({
  title,
  children,
  actions,
  className = "",
}: {
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <>
      <header className={`r-page-heading ${className}`}>
        <h1>{title}</h1>
        <div className="r-heading-actions">{actions}</div>
      </header>
      {children}
    </>
  );
}
function Tabs({
  items,
  value,
  onChange,
}: {
  items: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <nav className="r-tabs">
      {items.map((item) => (
        <button
          key={item}
          className={value === item ? "active" : ""}
          onClick={() => onChange(item)}
        >
          {item}
        </button>
      ))}
    </nav>
  );
}
function Meter({ value }: { value: number }) {
  return (
    <span className="r-meter">
      <progress max="1" value={Math.min(1, Math.max(0, value))} />
      <span>{Math.round(value * 100)}%</span>
    </span>
  );
}
export function PulsePage({ onIssue }: { onIssue: (id: string) => void }) {
  const data = useData();
  const items = pulseEntries(data);
  return (
    <>
      <PageHeader title="Pulse" />
      {items.length ? (
        <div className="r-pulse-feed">
          {items.map((item) => (
            <a key={item.id} className="r-pulse-item" href={item.href} onClick={(event) => {
              if (item.kind === "issue") {
                event.preventDefault();
                onIssue(item.title);
              }
            }}>
              <span className="r-chip">{item.kind}</span>
              <strong>{item.title}</strong>
              <p>{item.body}</p>
              <span className="r-muted">{item.author} · {item.time}</span>
            </a>
          ))}
        </div>
      ) : (
        <Empty title="No updates yet" description="Project, initiative and issue activity will appear here." />
      )}
    </>
  );
}
export function CyclesPage({ route, onIssue, onCreate }: PageProps) {
  const data = useData(),
    workspace = useWorkspace();
  const team = currentTeam(data);
  const cycles = data.cycles.filter((c) => (c.teamKey || team.key) === team.key);
  const [editing, setEditing] = useState<Cycle | null>(null),
    [error, setError] = useState("");
  const cycle = cycles.find(
    (c) =>
      c.id === route.id ||
      (route.id === "current" && cyclePhase(c) === "Current") ||
      (route.id === "upcoming" && cyclePhase(c) === "Upcoming"),
  );
  const newCycle = () => {
    const start = new Date();
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    setEditing({
      id: uid("cycle"),
      number: Math.max(0, ...data.cycles.map((c) => c.number)) + 1,
      name: `Cycle ${Math.max(0, ...data.cycles.map((c) => c.number)) + 1}`,
      startDate: day(start),
      endDate: day(end),
      capacity: 8,
      description: "",
      teamKey: team.key,
    });
  };
  return (
    <>
      <PageHeader
        title={cycle?.name ?? "Cycles"}
        actions={
          <>
            <Button onClick={cycle ? () => setEditing(cycle) : newCycle}>
              {cycle ? "Edit cycle" : "New cycle"}
            </Button>
            {cycle && (
              <Button onClick={() => onCreate({ cycleId: cycle.id })}>
                <I.PlusIcon />
                New issue
              </Button>
            )}
          </>
        }
      />
      {route.id && !cycle ? (
        <Empty title="Cycle not found">
          <Button onClick={() => navigate({ nav: "cycles" })}>
            All cycles
          </Button>
        </Empty>
      ) : cycle ? (
        <>
          <div className="r-subheading">
            <Button onClick={() => navigate({ nav: "cycles" })}>
              All cycles
            </Button>
            <span className="r-chip">{cyclePhase(cycle)}</span>
            <DateLabel value={cycle.startDate} />
            <span>–</span>
            <DateLabel value={cycle.endDate} />
          </div>
          <div className="r-cycle-stats">
            {(() => {
              const items = data.issues.filter((i) => i.cycleId === cycle.id),
                p = estimateProgress(items);
              return (
                <>
                  <div>
                    <small>Scope</small>
                    <strong>{p.scope}</strong>
                    <span>estimate points</span>
                  </div>
                  <div>
                    <small>Started</small>
                    <strong>{p.started}</strong>
                    <Meter value={p.scope ? p.started / p.scope : 0} />
                  </div>
                  <div>
                    <small>Completed</small>
                    <strong>{p.completed}</strong>
                    <Meter value={p.scope ? p.completed / p.scope : 0} />
                  </div>
                  <div>
                    <small>Capacity</small>
                    <strong>
                      {cycle.capacity
                        ? Math.round((p.scope / cycle.capacity) * 100)
                        : "—"}
                      %
                    </strong>
                    <span>{cycle.capacity} points available</span>
                  </div>
                </>
              );
            })()}
          </div>
          {cycle.description && (
            <p className="r-inset-copy">{cycle.description}</p>
          )}
          <IssueList
            issues={data.issues.filter((i) => i.cycleId === cycle.id)}
            prefs={{ ...DEFAULT_DISPLAY, grouping: "status" }}
            onOpen={onIssue}
            onCreate={() => onCreate({ cycleId: cycle.id })}
          />
        </>
      ) : (
        <div className="r-cycle-list">
          {[...cycles]
            .sort((a, b) => b.startDate.localeCompare(a.startDate))
            .map((c) => {
              const p = estimateProgress(
                data.issues.filter((i) => i.cycleId === c.id),
              );
              return (
                <button
                  className={`r-cycle-card ${cyclePhase(c) === "Current" ? "current" : ""}`}
                  key={c.id}
                  onClick={() => navigate({ nav: "cycles", id: c.id })}
                >
                  <div className="r-cycle-date">
                    <DateLabel value={c.startDate} />
                    <I.CalendarIcon />
                  </div>
                  <div>
                    <h2>
                      {c.name}
                      <span className="r-chip">{cyclePhase(c)}</span>
                    </h2>
                    <p>
                      {c.capacity
                        ? Math.round((p.scope / c.capacity) * 100)
                        : 0}
                      % of capacity · {p.scope} scope
                    </p>
                    <Meter value={p.scope ? p.completed / p.scope : 0} />
                  </div>
                  <span className="r-push" />
                  <div className="r-cycle-count">
                    <strong>{p.completed}</strong> completed
                  </div>
                </button>
              );
            })}
        </div>
      )}
      {editing && (
        <Dialog
          title={
            data.cycles.some((c) => c.id === editing.id)
              ? "Edit cycle"
              : "New cycle"
          }
          onClose={() => setEditing(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              try {
                workspace.saveCycle(editing);
                setEditing(null);
                setError("");
              } catch (e) {
                setError(String(e));
              }
            }}
          >
            <Field label="Name">
              <input
                required
                autoFocus
                value={editing.name}
                onChange={(e) =>
                  setEditing({ ...editing, name: e.target.value })
                }
              />
            </Field>
            <div className="r-form-grid">
              <Field label="Start date">
                <input
                  required
                  type="date"
                  value={editing.startDate}
                  onChange={(e) =>
                    setEditing({ ...editing, startDate: e.target.value })
                  }
                />
              </Field>
              <Field label="End date">
                <input
                  required
                  type="date"
                  value={editing.endDate}
                  onChange={(e) =>
                    setEditing({ ...editing, endDate: e.target.value })
                  }
                />
              </Field>
            </div>
            <Field label="Capacity (estimate points)">
              <input
                type="number"
                required
                min="0"
                value={editing.capacity}
                onChange={(e) =>
                  setEditing({ ...editing, capacity: e.target.valueAsNumber })
                }
              />
            </Field>
            <Field label="Description">
              <textarea
                value={editing.description}
                onChange={(e) =>
                  setEditing({ ...editing, description: e.target.value })
                }
              />
            </Field>
            {error && (
              <p className="r-error" role="alert">
                {error}
              </p>
            )}
            <footer>
              <Button onClick={() => setEditing(null)}>Cancel</Button>
              <Button primary type="submit">
                Save cycle
              </Button>
            </footer>
          </form>
        </Dialog>
      )}
    </>
  );
}
export function ProjectPages({ route, onIssue, onCreate }: PageProps) {
  const data = useData(),
    workspace = useWorkspace();
  const project = data.projects.find((p) => p.id === route.id);
  const [edit, setEdit] = useState<Project | null>(null),
    [update, setUpdate] = useState(false),
    [resource, setResource] = useState<{
      id: string;
      title: string;
      body: string;
      url: string;
    } | null>(null),
    [milestone, setMilestone] = useState<{
      id: string;
      name: string;
      description: string;
      targetDate: string;
    } | null>(null),
    [error, setError] = useState("");
  const kernel = createKernel({ ...data, viewer: data.settings.user });
  const createProject = () => {
    const created = kernel.createProject({ name: "Untitled project" });
    setEdit(created);
  };
  useEffect(()=>{if(route.id==="new") {createProject();navigate({nav:"projects"});}},[route.id]);
  const tab = route.section ?? "overview";
  const issues = data.issues.filter((i) => i.projectId === project?.id);
  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!edit?.name.trim()) return;
    try { scheduleDates(edit.startDate, edit.targetDate); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); return; }
    setError("");
    workspace.mutate((d) => {
      const index = d.projects.findIndex((p) => p.id === edit.id);
      if (index < 0) d.projects.unshift(edit);
      else d.projects[index] = edit;
    });
    setEdit(null);
    navigate({ nav: "projects", id: edit.id });
  };
  return (
    <>
      <PageHeader
        title={project?.name ?? "Projects"}
        actions={
          <>
            {project ? (
              <>
                <Button onClick={() => setEdit(structuredClone(project))}>
                  Edit project
                </Button>
                <Button onClick={() => setUpdate(true)}>Write update</Button>
                <Button onClick={() => onCreate({ projectId: project.id })}>
                  <I.PlusIcon />
                  New issue
                </Button>
              </>
            ) : (
              <Button onClick={createProject}>
                <I.PlusIcon />
                New project
              </Button>
            )}
          </>
        }
      />
      {route.id && !project ? (
        <Empty title="Project not found">
          <Button onClick={() => navigate({ nav: "projects" })}>
            All projects
          </Button>
        </Empty>
      ) : !project ? (
        <>
          <ProjectCollection projects={data.projects} />
          {!data.projects.length && (
            <Empty title="No projects yet">
              <Button onClick={createProject}>New project</Button>
            </Empty>
          )}
        </>
      ) : (
        <>
          <Tabs
            items={["Overview", "Activity", "Issues"]}
            value={tab[0].toUpperCase() + tab.slice(1)}
            onChange={(s) =>
              navigate({
                nav: "projects",
                id: project.id,
                section: s.toLowerCase(),
              })
            }
          />
          {tab === "issues" ? (
            <IssueList
              issues={issues}
              prefs={{ ...DEFAULT_DISPLAY, grouping: "status" }}
              onOpen={onIssue}
              onCreate={() => onCreate({ projectId: project.id })}
            />
          ) : tab === "activity" ? (
            <div className="r-document">
              <h2>Project activity</h2>
              {project.updates.map((u) => (
                <article className="r-update" key={u.id}>
                  <span className={`r-health ${u.health}`}>
                    {HEALTH_LABEL[u.health]}
                  </span>
                  <small>
                    {u.author} · {formatDate(u.time) || u.time}
                  </small>
                  <RichText text={u.body} />
                </article>
              ))}
              {data.activity
                .filter((a) => issues.some((i) => i.id === a.issueId))
                .map((a) => (
                  <p className="r-event" key={a.id}>
                    <a href={`#/issue/${a.issueId}`}>{a.issueId}</a> {a.text}
                    <time>{formatDate(a.time) || a.time}</time>
                  </p>
                ))}
            </div>
          ) : (
            <div className="r-project-overview">
              <main>
                <div className="r-project-hero">
                  <I.CubeIcon />
                  <h1>{project.name}</h1>
                  <p>{project.summary || "Add a project summary…"}</p>
                </div>
                <div className="r-inline r-project-property-row">
                  <span className="r-small-heading">Properties</span>
                  <select
                    aria-label="Project status"
                    value={project.status}
                    onChange={(e) =>
                      workspace.mutate((d) => {
                        d.projects.find((p) => p.id === project.id)!.status = e
                          .target.value as Project["status"];
                      })
                    }
                  >
                    {PROJECT_STATUSES.map((s) => (
                      <option value={s} key={s}>
                        {PROJECT_STATUS_LABEL[s]}
                      </option>
                    ))}
                  </select>
                  <span>{PRIORITY_LABEL[project.priority]}</span>
                  <Avatar small name={project.lead} />
                  <DateLabel value={project.startDate} />
                  <span>→</span>
                  <DateLabel value={project.targetDate} />
                </div>
                <Field label="Depends on">
                  <Choice
                    label="Project dependency"
                    value={project.dependsOnProjectIds?.[0] ?? ""}
                    onChange={(value) =>
                      workspace.patchProject(project.id, {
                        dependsOnProjectIds: value ? [value] : [],
                      })
                    }
                    options={[
                      { value: "", label: "No dependency" },
                      ...data.projects
                        .filter((item) => item.id !== project.id)
                        .map((item) => ({ value: item.id, label: item.name })),
                    ]}
                  />
                </Field>
                <div className="r-inline">
                  <span className="r-small-heading">Initiatives</span>
                  {project.initiativeIds.map((id) => (
                    <a className="r-chip" key={id} href={`#/initiatives/${id}`}>
                      {data.initiatives.find((i) => i.id === id)?.name ?? id}
                    </a>
                  ))}
                  <select
                    aria-label="Link initiative"
                    value=""
                    onChange={(e) => {
                      if (e.target.value)
                        workspace.mutate((d) => {
                          d.projects
                            .find((p) => p.id === project.id)!
                            .initiativeIds.push(e.target.value);
                        });
                    }}
                  >
                    <option value="">Add initiative…</option>
                    {data.initiatives
                      .filter((i) => !project.initiativeIds.includes(i.id))
                      .map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name}
                        </option>
                      ))}
                  </select>
                </div>
                <section className="r-resource-section">
                  <h3>Resources</h3>
                  {data.documents.filter(doc=>doc.projectId===project.id && !doc.deletedAt).map(doc=><div className="r-resource" key={doc.id}><I.DocsIcon/><a href={`#/documents/${encodeURIComponent(doc.id)}`}>{doc.title}</a></div>)}
                  {project.resources.map((r) => (
                    <div className="r-resource" key={r.id}>
                      <I.DocsIcon />
                      <button
                        onClick={() =>
                          setResource({
                            id: r.id,
                            title: r.title,
                            body: r.body ?? "",
                            url: r.url ?? "",
                          })
                        }
                      >
                        {r.title}
                      </button>
                      <IconButton
                        label={`Remove ${r.title}`}
                        onClick={() =>
                          workspace.mutate((d) => {
                            d.projects.find(
                              (p) => p.id === project.id,
                            )!.resources = d.projects
                              .find((p) => p.id === project.id)!
                              .resources.filter((x) => x.id !== r.id);
                          })
                        }
                      >
                        <I.CloseIcon />
                      </IconButton>
                    </div>
                  ))}
                  <Button
                    onClick={() =>
                      setResource({
                        id: uid("resource"),
                        title: "",
                        body: "",
                        url: "",
                      })
                    }
                  >
                    <I.PlusIcon />
                    Add document or link…
                  </Button>
                </section>
                {project.updates[0] && (
                  <article className="r-update">
                    <div className="r-inline">
                      <strong>Latest update</strong>
                      <span className="r-push" />
                      <Button onClick={() => setUpdate(true)}>Update</Button>
                    </div>
                    <span className={`r-health ${project.updates[0].health}`}>
                      {HEALTH_LABEL[project.updates[0].health]}
                    </span>
                    <small>
                      {project.updates[0].author} ·{" "}
                      {formatDate(project.updates[0].time) ||
                        project.updates[0].time}
                    </small>
                    <RichText text={project.updates[0].body} />
                  </article>
                )}
                <section className="r-project-description">
                  <div className="r-inline">
                    <h3>Description</h3>
                    <span className="r-push" />
                    <Button onClick={() => setEdit(structuredClone(project))}>
                      Edit description
                    </Button>
                  </div>
                  {project.description ? (
                    <RichText text={project.description} />
                  ) : (
                    <button
                      className="r-muted"
                      onClick={() => setEdit(structuredClone(project))}
                    >
                      Add a project description…
                    </button>
                  )}
                </section>
                <section className="r-milestones">
                  <h3>Milestones</h3>
                  {data.milestones
                    .filter((m) => m.projectId === project.id)
                    .sort((a, b) => a.sortOrder - b.sortOrder)
                    .map((m) => (
                      <button
                        className="r-milestone"
                        key={m.id}
                        onClick={() =>
                          setMilestone({
                            id: m.id,
                            name: m.name,
                            description: m.description ?? "",
                            targetDate: m.targetDate ?? "",
                          })
                        }
                      >
                        <I.StatusTodoIcon />
                        <strong>{m.name}</strong>
                        <span className="r-push" />
                        <DateLabel value={m.targetDate} />
                        <span>
                          {issues.filter((i) => i.milestoneId === m.id).length}{" "}
                          issues
                        </span>
                        <Meter value={kernel.milestoneProgress(m.id).ratio} />
                      </button>
                    ))}
                  <Button
                    onClick={() =>
                      setMilestone({
                        id: uid("milestone"),
                        name: "",
                        description: "",
                        targetDate: "",
                      })
                    }
                  >
                    <I.PlusIcon />
                    Milestone
                  </Button>
                </section>
              </main>
              <aside>
                <h3>Progress</h3>
                <Meter value={kernel.projectProgress(project.id).ratio} />
                <p>
                  {issues.filter((i) => i.status === "done").length} of{" "}
                  {issues.length} issues completed
                </p>
                <h3>Health</h3>
                {project.updates[0] ? (
                  <span className={`r-health ${project.updates[0].health}`}>
                    {HEALTH_LABEL[project.updates[0].health]}
                  </span>
                ) : (
                  <span>No updates yet</span>
                )}
                <h3>Members</h3>
                {[
                  ...new Set(
                    [project.lead, ...project.memberIds].filter(Boolean),
                  ),
                ].map((n) => (
                  <div className="r-inline" key={n}>
                    <Avatar small name={n} />
                    {n}
                  </div>
                ))}
              </aside>
            </div>
          )}
        </>
      )}
      {edit && (
        <Dialog
          title={
            data.projects.some((p) => p.id === edit.id)
              ? "Edit project"
              : "New project"
          }
          onClose={() => setEdit(null)}
        >
          <form onSubmit={save}>
            <Field label="Name">
              <input
                autoFocus
                required
                value={edit.name}
                onChange={(e) => setEdit({ ...edit, name: e.target.value })}
              />
            </Field>
            <Field label="Summary">
              <textarea
                value={edit.summary ?? ""}
                onChange={(e) => setEdit({ ...edit, summary: e.target.value })}
              />
            </Field>
            <Field label="Description">
              <RichEditor label="Project description" value={edit.description} onChange={description => setEdit({ ...edit, description })} />
            </Field>
            <div className="r-form-grid">
              <Field label="Status">
                <select
                  value={edit.status}
                  onChange={(e) =>
                    setEdit({
                      ...edit,
                      status: e.target.value as Project["status"],
                    })
                  }
                >
                  {PROJECT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {PROJECT_STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Priority">
                <select
                  value={edit.priority}
                  onChange={(e) =>
                    setEdit({
                      ...edit,
                      priority: Number(e.target.value) as Priority,
                    })
                  }
                >
                  {PRIORITY_LABEL.map((p, i) => (
                    <option key={p} value={i}>
                      {p}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Lead">
                <input
                  value={edit.lead ?? ""}
                  onChange={(e) => setEdit({ ...edit, lead: e.target.value })}
                />
              </Field>
              <Field label="Start date">
                <input
                  type="date"
                  value={
                    /^\d{4}-/.test(edit.startDate ?? "") ? edit.startDate : ""
                  }
                  onChange={(e) =>
                    setEdit({ ...edit, startDate: e.target.value })
                  }
                />
              </Field>
              <Field label="Target date">
                <input
                  type="date"
                  value={
                    /^\d{4}-/.test(edit.targetDate ?? "") ? edit.targetDate : ""
                  }
                  onChange={(e) =>
                    setEdit({ ...edit, targetDate: e.target.value })
                  }
                />
              </Field>
            </div>
            <footer>
              <Button onClick={() => setEdit(null)}>Cancel</Button>
              <Button primary type="submit">
                Save project
              </Button>
            </footer>
          </form>
        </Dialog>
      )}
      {update && project && (
        <Dialog title="Write project update" onClose={() => setUpdate(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              workspace.mutate((d) => {
                d.projects
                  .find((p) => p.id === project.id)!
                  .updates.unshift({
                    id: uid("update"),
                    health: f.get("health") as ProjectHealth,
                    body: String(f.get("body")),
                    author: d.settings.user,
                    time: stamp(),
                  });
              });
              setUpdate(false);
            }}
          >
            <Field label="Health">
              <select name="health">
                <option value="onTrack">On track</option>
                <option value="atRisk">At risk</option>
                <option value="offTrack">Off track</option>
              </select>
            </Field>
            <Field label="Update">
              <textarea
                autoFocus
                name="body"
                required
                placeholder="What changed? What’s next?"
              />
            </Field>
            <footer>
              <Button onClick={() => setUpdate(false)}>Cancel</Button>
              <Button primary type="submit">
                Post update
              </Button>
            </footer>
          </form>
        </Dialog>
      )}
      {resource && project && (
        <Dialog title="Project resource" wide onClose={() => setResource(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (resource.url && !/^https?:\/\//i.test(resource.url)) {
                setError("Enter an http or https URL.");
                return;
              }
              workspace.mutate((d) => {
                const p = d.projects.find((p) => p.id === project.id)!;
                const index = p.resources.findIndex(
                  (r) => r.id === resource.id,
                );
                if (index < 0) p.resources.push(resource);
                else p.resources[index] = resource;
              });
              setResource(null);
              setError("");
            }}
          >
            <Field label="Title">
              <input
                required
                autoFocus
                value={resource.title}
                onChange={(e) =>
                  setResource({ ...resource, title: e.target.value })
                }
              />
            </Field>
            <Field label="Link (optional)">
              <input
                type="url"
                value={resource.url}
                onChange={(e) =>
                  setResource({ ...resource, url: e.target.value })
                }
              />
            </Field>
            <Field label="Document">
              <RichEditor label="Project document" value={resource.body} onChange={body=>setResource({...resource,body})} />
            </Field>
            {error && <p className="r-error">{error}</p>}
            <footer>
              {resource.url && /^https?:\/\//i.test(resource.url) && (
                <a href={resource.url} target="_blank" rel="noreferrer">
                  Open link
                </a>
              )}
              <Button primary type="submit">
                Save resource
              </Button>
            </footer>
          </form>
        </Dialog>
      )}
      {milestone && project && (
        <Dialog title="Milestone" onClose={() => setMilestone(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              workspace.mutate((d) => {
                const index = d.milestones.findIndex(
                  (m) => m.id === milestone.id,
                );
                const record = {
                  ...milestone,
                  projectId: project.id,
                  sortOrder:
                    index < 0
                      ? d.milestones.filter((m) => m.projectId === project.id)
                          .length + 1
                      : d.milestones[index].sortOrder,
                };
                if (index < 0) d.milestones.push(record);
                else d.milestones[index] = record;
              });
              setMilestone(null);
            }}
          >
            <Field label="Name">
              <input
                required
                autoFocus
                value={milestone.name}
                onChange={(e) =>
                  setMilestone({ ...milestone, name: e.target.value })
                }
              />
            </Field>
            <Field label="Description">
              <textarea
                value={milestone.description}
                onChange={(e) =>
                  setMilestone({ ...milestone, description: e.target.value })
                }
              />
            </Field>
            <Field label="Target date">
              <input
                type="date"
                value={
                  /^\d{4}-/.test(milestone.targetDate)
                    ? milestone.targetDate
                    : ""
                }
                onChange={(e) =>
                  setMilestone({ ...milestone, targetDate: e.target.value })
                }
              />
            </Field>
            <footer>
              <Button primary type="submit">
                Save milestone
              </Button>
            </footer>
          </form>
        </Dialog>
      )}
    </>
  );
}
export function InitiativesPage({ route }: PageProps) {
  const data = useData(),
    workspace = useWorkspace();
  const initiative = data.initiatives.find((i) => i.id === route.id);
  const [tab, setTab] = useState("Active"),
    [edit, setEdit] = useState<Initiative | null>(null);
  const projects = data.projects.filter((p) =>
    p.initiativeIds.includes(initiative?.id ?? ""),
  );
  const create = () =>
    setEdit({
      id: uid("initiative"),
      name: "",
      status: "planned",
      owner: data.settings.user,
      priority: 0,
      description: "",
      updates: [],
    });
  useEffect(()=>{if(route.id==="new") {create();navigate({nav:"initiatives"});}},[route.id]);
  return (
    <>
      <PageHeader
        title={initiative?.name ?? "Initiatives"}
        actions={
          <Button
            onClick={
              initiative ? () => setEdit(structuredClone(initiative)) : create
            }
          >
            {initiative ? "Edit initiative" : "+ New initiative"}
          </Button>
        }
      />
      {route.id && !initiative ? (
        <Empty title="Initiative not found" />
      ) : !initiative ? (
        <>
          <Tabs
            items={["Active", "Planned", "All initiatives"]}
            value={tab}
            onChange={setTab}
          />
          <div className="r-table-scroll">
            <table className="r-entity-table">
              <thead>
                <tr>
                  {[
                    "Name",
                    "Priority",
                    "Owner",
                    "Target",
                    "Projects",
                    "Health",
                    "Active projects",
                  ].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.initiatives
                  .filter(
                    (i) =>
                      tab === "All initiatives" ||
                      i.status === (tab === "Active" ? "active" : "planned"),
                  )
                  .map((i) => {
                    const linked = data.projects.filter((p) =>
                      p.initiativeIds.includes(i.id),
                    );
                    return (
                      <tr key={i.id}>
                        <td>
                          <a href={`#/initiatives/${i.id}`}>
                            <I.StarIcon />
                            {i.name}
                          </a>
                        </td>
                        <td>
                          <I.PriorityIcon level={i.priority ?? 0} />
                        </td>
                        <td>
                          <Avatar small name={i.owner ?? data.settings.user} />
                        </td>
                        <td>
                          <DateLabel value={i.targetDate} />
                        </td>
                        <td>
                          {
                            linked.filter((p) => p.status === "completed")
                              .length
                          }{" "}
                          of {linked.length}
                        </td>
                        <td>
                          {i.updates?.[0]
                            ? HEALTH_LABEL[i.updates[0].health]
                            : "No updates"}
                        </td>
                        <td>
                          {linked.filter((p) => p.status === "started").length}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="r-document">
          <h1>{initiative.name}</h1>
          <p>{initiative.description}</p>
          <div className="r-inline">
            <span className="r-chip">{initiative.status}</span>
            <Avatar small name={initiative.owner ?? data.settings.user} />
            <DateLabel value={initiative.targetDate} />
            <Meter value={initiativeProgress(data, initiative.id).ratio} />
          </div>
          <h3>Projects</h3>
          {projects.map((p) => (
            <div className="r-resource" key={p.id}>
              <I.CubeIcon />
              <a href={`#/projects/${p.id}`}>{p.name}</a>
              <span className="r-push" />
              {PROJECT_STATUS_LABEL[p.status]}
              <IconButton
                label={`Unlink ${p.name}`}
                onClick={() =>
                  workspace.mutate((d) => {
                    const project = d.projects.find((x) => x.id === p.id)!;
                    project.initiativeIds = project.initiativeIds.filter(
                      (i) => i !== initiative.id,
                    );
                  })
                }
              >
                <I.CloseIcon />
              </IconButton>
            </div>
          ))}
          <select
            aria-label="Add project to initiative"
            value=""
            onChange={(e) => {
              if (e.target.value)
                workspace.mutate((d) => {
                  d.projects
                    .find((p) => p.id === e.target.value)!
                    .initiativeIds.push(initiative.id);
                });
            }}
          >
            <option value="">Add project…</option>
            {data.projects
              .filter((p) => !p.initiativeIds.includes(initiative.id))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
          <h3>Updates</h3>
          {initiative.updates?.map((u) => (
            <article className="r-update" key={u.id}>
              <span className={`r-health ${u.health}`}>
                {HEALTH_LABEL[u.health]}
              </span>
              <RichText text={u.body} />
              <small>
                {u.author} · {formatDate(u.time)}
              </small>
            </article>
          ))}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              workspace.mutate((d) => {
                const item = d.initiatives.find((i) => i.id === initiative.id)!;
                (item.updates ??= []).unshift({
                  id: uid("update"),
                  body: String(f.get("body")),
                  health: f.get("health") as ProjectHealth,
                  author: d.settings.user,
                  time: stamp(),
                });
              });
              e.currentTarget.reset();
            }}
          >
            <Field label="Write update">
              <textarea
                name="body"
                required
                placeholder="Share progress and next steps…"
              />
            </Field>
            <div className="r-inline">
              <select name="health">
                <option value="onTrack">On track</option>
                <option value="atRisk">At risk</option>
                <option value="offTrack">Off track</option>
              </select>
              <Button type="submit">Post update</Button>
            </div>
          </form>
        </div>
      )}
      {edit && (
        <Dialog
          title={edit.name ? "Edit initiative" : "New initiative"}
          onClose={() => setEdit(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              workspace.mutate((d) => {
                const index = d.initiatives.findIndex((i) => i.id === edit.id);
                if (index < 0) d.initiatives.push(edit);
                else d.initiatives[index] = edit;
              });
              setEdit(null);
              navigate({ nav: "initiatives", id: edit.id });
            }}
          >
            <Field label="Name">
              <input
                required
                autoFocus
                value={edit.name}
                onChange={(e) => setEdit({ ...edit, name: e.target.value })}
              />
            </Field>
            <Field label="Description">
              <textarea
                value={edit.description ?? ""}
                onChange={(e) =>
                  setEdit({ ...edit, description: e.target.value })
                }
              />
            </Field>
            <Field label="Status">
              <select
                value={edit.status}
                onChange={(e) =>
                  setEdit({
                    ...edit,
                    status: e.target.value as Initiative["status"],
                  })
                }
              >
                {["proposed", "planned", "active", "completed", "canceled"].map(
                  (s) => (
                    <option key={s}>{s}</option>
                  ),
                )}
              </select>
            </Field>
            <Field label="Owner">
              <input
                value={edit.owner ?? ""}
                onChange={(e) => setEdit({ ...edit, owner: e.target.value })}
              />
            </Field>
            <Field label="Target date">
              <input
                type="date"
                value={edit.targetDate ?? ""}
                onChange={(e) =>
                  setEdit({ ...edit, targetDate: e.target.value })
                }
              />
            </Field>
            <footer>
              <Button primary type="submit">
                Save initiative
              </Button>
            </footer>
          </form>
        </Dialog>
      )}
    </>
  );
}
export function ReviewsPage({ route, onIssue }: PageProps) {
  const data = useData(),
    workspace = useWorkspace();
  const [tab, setTab] = useState("Created"),
    [edit, setEdit] = useState<Review | null>(null),
    [comment, setComment] = useState("");
  const review = data.reviews.find((r) => r.id === route.id);
  const [group, setGroup] = useState("status");
  const patch = (update: Partial<Review>) =>
    workspace.mutate((d) => {
      const r = d.reviews.find((r) => r.id === review?.id)!;
      Object.assign(r, update);
      r.approved = r.status === "ready" || r.status === "merged";
    });
  return (
    <>
      <PageHeader
        title={review?.title ?? "Reviews"}
        actions={
          <>
            {review ? (
              <Button onClick={() => setEdit(structuredClone(review))}>
                Edit review
              </Button>
            ) : (
              <Button
                onClick={() =>
                  setEdit({
                    id: uid("review"),
                    title: "",
                    author: data.settings.user,
                    approved: false,
                    status: "review",
                    reviewers: [data.settings.user],
                    issueIds: [],
                    comments: [],
                  })
                }
              >
                New review
              </Button>
            )}
          </>
        }
      />
      {route.id && !review ? (
        <Empty title="Review not found" />
      ) : review ? (
        <div className="r-review-detail">
          <div className="r-subheading">
            <Button onClick={() => navigate({ nav: "reviews" })}>
              All reviews
            </Button>
            <span className="r-chip">Local review</span>
            <select
              aria-label="Review status"
              value={review.status ?? "review"}
              onChange={(e) =>
                patch({ status: e.target.value as Review["status"] })
              }
            >
              {["draft", "review", "changes", "ready", "merged", "closed"].map(
                (s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ),
              )}
            </select>
          </div>
          <div className="r-document">
            <h1>{review.title}</h1>
            <p>
              {review.author} · {review.reviewers?.join(", ") || "No reviewers"}
            </p>
            {review.url && /^https?:\/\//i.test(review.url) && (
              <a href={review.url} target="_blank" rel="noreferrer">
                Open pull request
              </a>
            )}
            <div className="r-inline">
              {review.issueIds?.map((id) => (
                <Button key={id} onClick={() => onIssue(id)}>
                  {id}
                </Button>
              ))}
            </div>
            <h3>Changes</h3>
            {review.diff ? (
              <pre className="r-diff">
                {review.diff.split("\n").map((line, i) => (
                  <span
                    key={i}
                    className={
                      line.startsWith("+")
                        ? "added"
                        : line.startsWith("-")
                          ? "removed"
                          : ""
                    }
                  >
                    {line || " "}\n
                  </span>
                ))}
              </pre>
            ) : (
              <p className="r-muted">
                No patch attached. Add a diff in Edit review.
              </p>
            )}
            <div className="r-inline">
              <Button
                onClick={() =>
                  workspace.transitionReview(review.id, "request-changes")
                }
              >
                Request changes
              </Button>
              <Button
                primary
                onClick={() => workspace.transitionReview(review.id, "approve")}
              >
                Approve
              </Button>
              <Button
                onClick={() => workspace.transitionReview(review.id, "merge")}
              >
                Mark merged locally
              </Button>
            </div>
            <h3>Discussion</h3>
            {review.comments?.map((c) => (
              <div className="r-review-comment" key={c.id}>
                <Avatar small name={c.author} />
                <div>
                  <strong>{c.author}</strong>
                  <p>{c.body}</p>
                </div>
              </div>
            ))}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!comment.trim()) return;
                patch({
                  comments: [
                    ...(review.comments ?? []),
                    {
                      id: uid("comment"),
                      author: data.settings.user,
                      body: comment,
                      time: stamp(),
                    },
                  ],
                });
                setComment("");
              }}
            >
              <Field label="Comment">
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Leave a comment…"
                />
              </Field>
              <Button type="submit" disabled={!comment.trim()}>
                Comment
              </Button>
            </form>
          </div>
        </div>
      ) : (
        <>
          <Tabs
            items={["Created", "To review"]}
            value={tab}
            onChange={setTab}
          />
          <div className="r-subheading">
            <span>
              {
                data.reviews.filter((r) =>
                  tab === "Created"
                    ? r.author === data.settings.user
                    : r.reviewers?.includes(data.settings.user),
                ).length
              }{" "}
              reviews
            </span>
            <span className="r-push" />
            <select
              aria-label="Review grouping"
              value={group}
              onChange={(e) => setGroup(e.target.value)}
            >
              <option value="status">Group by status</option>
              <option value="author">Group by author</option>
            </select>
          </div>
          {(group === "status"
            ? ["ready", "review", "changes", "draft", "merged", "closed"]
            : [...new Set(data.reviews.map((r) => r.author))]
          ).map((key) => {
            const items = data.reviews.filter(
              (r) =>
                (tab === "Created"
                  ? r.author === data.settings.user
                  : r.reviewers?.includes(data.settings.user)) &&
                (group === "status"
                  ? (r.status ?? "review") === key
                  : r.author === key),
            );
            return items.length ? (
              <section className="r-review-group" key={key}>
                <h3>
                  {group === "status"
                    ? (
                        {
                          ready: "Ready to merge",
                          review: "In review",
                          changes: "Changes requested",
                          draft: "Draft",
                          merged: "Merged",
                          closed: "Closed",
                        } as Record<string, string>
                      )[key]
                    : key}
                  <span>{items.length}</span>
                </h3>
                {items.map((r) => (
                  <a key={r.id} href={`#/reviews/${r.id}`}>
                    <I.ReviewsIcon />
                    <strong>{r.title}</strong>
                    <span className="r-push" />
                    <Avatar small name={r.author} />
                  </a>
                ))}
              </section>
            ) : null;
          })}
        </>
      )}
      {edit && (
        <Dialog
          title={
            data.reviews.some((r) => r.id === edit.id)
              ? "Edit review"
              : "New review"
          }
          wide
          onClose={() => setEdit(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              workspace.mutate((d) => {
                const index = d.reviews.findIndex((r) => r.id === edit.id);
                if (index < 0) d.reviews.push(edit);
                else d.reviews[index] = edit;
              });
              setEdit(null);
              navigate({ nav: "reviews", id: edit.id });
            }}
          >
            <Field label="Title">
              <input
                required
                autoFocus
                value={edit.title}
                onChange={(e) => setEdit({ ...edit, title: e.target.value })}
              />
            </Field>
            <Field label="Pull request URL">
              <input
                type="url"
                value={edit.url ?? ""}
                onChange={(e) => setEdit({ ...edit, url: e.target.value })}
              />
            </Field>
            <Field label="Reviewers (comma separated)">
              <input
                value={edit.reviewers?.join(", ") ?? ""}
                onChange={(e) =>
                  setEdit({
                    ...edit,
                    reviewers: e.target.value
                      .split(",")
                      .map((s) => s.trimStart()),
                  })
                }
              />
            </Field>
            <Field label="Linked issues">
              <select
                multiple
                value={edit.issueIds ?? []}
                onChange={(e) =>
                  setEdit({
                    ...edit,
                    issueIds: Array.from(
                      e.target.selectedOptions,
                      (o) => o.value,
                    ),
                  })
                }
              >
                {data.issues.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.id} · {i.title}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Diff">
              <textarea
                className="r-large-editor r-code"
                value={edit.diff ?? ""}
                onChange={(e) => setEdit({ ...edit, diff: e.target.value })}
                placeholder="Paste a unified diff…"
              />
            </Field>
            <footer>
              <Button primary type="submit">
                Save review
              </Button>
            </footer>
          </form>
        </Dialog>
      )}
    </>
  );
}
export function AgentPage({ route, onIssue, onCreate }: PageProps) {
  const data = useData(),
    workspace = useWorkspace();
  const chat = data.chats.find((c) => c.id === route.id);
  const [text, setText] = useState(""),
    [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [projectProposal, setProjectProposal] = useState<{
      name: string;
      description: string;
    } | null>(null);
  useEffect(() => {
    setText("");
    setError("");
  }, [route.id]);
  async function send() {
    if (!text.trim() || pending) return;
    setPending(true);
    setError("");
    const input = text.trim();
    let id = chat?.id;
    try {
      if (!id) {
        id = uid("chat");
        const newId = id;
        workspace.mutate((d) => {
          d.chats.unshift({
            id: newId,
            title: input.slice(0, 64),
            createdAt: stamp(),
            messages: [],
          });
        });
        navigate({ nav: "agent", id });
      }
      const chatId = id;
      workspace.mutate((d) => {
        d.chats
          .find((c) => c.id === chatId)!
          .messages.push({ id: uid("message"), role: "user", text: input });
        for (const file of d.attachments)
          if (file.ownerId === "agent-draft") file.ownerId = chatId;
      });
      setText("");
      const message = await localAgent.reply(input, workspace.getSnapshot());
      workspace.mutate((d) => {
        d.chats.find((c) => c.id === chatId)!.messages.push(message);
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <PageHeader
        title={chat?.title ?? "New chat"}
        actions={
          <>
            <select
              aria-label="Switch agent chat"
              value={chat?.id ?? ""}
              onChange={(e) =>
                navigate({ nav: "agent", id: e.target.value || undefined })
              }
            >
              <option value="">New chat</option>
              {data.chats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
            <IconButton
              label="New chat"
              onClick={() => navigate({ nav: "agent" })}
            >
              <I.PlusIcon />
            </IconButton>
          </>
        }
      />
      <div className="r-agent">
        <div className="r-agent-messages">
          {route.id && !chat ? (
            <Empty title="Chat not found" />
          ) : (
            chat?.messages.map((m) => (
              <article key={m.id} className={`r-message ${m.role}`}>
                <Avatar
                  small
                  name={m.role === "user" ? data.settings.user : "Linear"}
                />
                <div>
                  <small>
                    {m.role === "user"
                      ? data.settings.user
                      : "Linear · Local assistant"}
                  </small>
                  <p>{m.text}</p>
                  {m.issueIds?.map((id) => (
                    <button
                      className="r-chip"
                      key={id}
                      onClick={() => onIssue(id)}
                    >
                      {id}
                    </button>
                  ))}
                  {m.projectDraft && (
                    <div className="r-agent-draft">
                      <h3>{m.projectDraft.name}</h3>
                      <Button
                        onClick={() => setProjectProposal(m.projectDraft!)}
                      >
                        Review project draft
                      </Button>
                    </div>
                  )}
                  {m.draft && (
                    <div className="r-agent-draft">
                      <h3>{m.draft.title}</h3>
                      <p>{m.draft.body}</p>
                      <Button
                        onClick={() => {
                          workspace.mutate((d) => {
                            d.draft = {
                              title: m.draft!.title,
                              body: m.draft!.body,
                              status: "backlog",
                              priority: 0,
                              labels: [],
                            };
                          });
                          onCreate();
                        }}
                      >
                        Review issue draft
                      </Button>
                    </div>
                  )}
                </div>
              </article>
            ))
          )}
        </div>
        <div className="r-agent-compose">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <textarea
              aria-label="Send a message to Linear AI"
              placeholder="Ask about your workspace…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing
                ) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            <footer>
              <FileInput ownerId={chat?.id ?? "agent-draft"} />
              <span className="r-local-mode">Local assistant</span>
              <span className="r-push" />
              <Button type="submit" disabled={!text.trim() || pending}>
                {pending ? "Thinking…" : "Send message"}
              </Button>
            </footer>
          </form>
          <Attachments ownerId={chat?.id ?? "agent-draft"} />
          {error && <p className="r-error">{error}</p>}
          {!chat && (
            <div className="r-agent-examples">
              <p>Get started with some examples</p>
              {[
                ["Create a new project", "Create a new project: "],
                ["Research a topic", "Find "],
                ["Set up new team", "Set up new team"],
              ].map(([label, value]) => (
                <button
                  key={label}
                  onClick={() => {
                    setText(value);
                    document
                      .querySelector<HTMLTextAreaElement>(
                        '[aria-label="Send a message to Linear AI"]',
                      )
                      ?.focus();
                  }}
                >
                  <I.SparkIcon />
                  <span>{label}</span>
                  <I.ForwardIcon />
                </button>
              ))}
            </div>
          )}
          <p className="r-service-note">
            Works with local workspace data. Files are stored locally; their
            contents are not analyzed by a model.
          </p>
        </div>
      </div>
      {projectProposal && (
        <Dialog
          title="Review project draft"
          onClose={() => setProjectProposal(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const kernel = createKernel({
                ...workspace.getSnapshot(),
                viewer: data.settings.user,
                teamKey: "XXH",
              });
              const project = kernel.createProject({
                name: projectProposal.name,
                summary: projectProposal.description,
                description: "",
              });
              workspace.mutate((d) => {
                d.projects = kernel.projects();
              });
              setProjectProposal(null);
              navigate({ nav: "projects", id: project.id });
            }}
          >
            <Field label="Project name">
              <input
                required
                autoFocus
                value={projectProposal.name}
                onChange={(e) =>
                  setProjectProposal({
                    ...projectProposal,
                    name: e.target.value,
                  })
                }
              />
            </Field>
            <Field label="Project summary">
              <textarea
                value={projectProposal.description}
                onChange={(e) =>
                  setProjectProposal({
                    ...projectProposal,
                    description: e.target.value,
                  })
                }
              />
            </Field>
            <footer>
              <Button primary type="submit">
                Create project
              </Button>
            </footer>
          </form>
        </Dialog>
      )}
    </>
  );
}
export function LoopsPage({ route }: PageProps) {
  const data = useData(),
    workspace = useWorkspace();
  const [category, setCategory] = useState("Featured"),
    [tab, setTab] = useState("My loops"),
    [prompt, setPrompt] = useState(""),
    [edit, setEdit] = useState<Loop | null>(null);
  const loop = data.loops.find((l) => l.id === route.id);
  const draft = (template?: (typeof LOOP_TEMPLATES)[number]) =>
    setEdit({
      id: uid("loop"),
      name: template?.name ?? "New loop",
      prompt: template?.description ?? prompt,
      category: template?.category ?? "Reporting",
      trigger: template?.trigger ?? "manual",
      action: template?.action ?? "summarize",
      enabled: false,
    });
  return (
    <>
      <PageHeader
        title={loop?.name ?? "Loops"}
        actions={
          <Button
            onClick={
              loop ? () => setEdit(structuredClone(loop)) : () => draft()
            }
          >
            {loop ? "Edit loop" : "New loop"}
          </Button>
        }
      />
      {route.id && !loop ? (
        <Empty title="Loop not found" />
      ) : loop ? (
        <div className="r-document">
          <div className="r-inline">
            <Button onClick={() => navigate({ nav: "loops" })}>
              All loops
            </Button>
            <span className="r-chip">
              {loop.enabled ? "Enabled" : "Paused"}
            </span>
            <span>{loop.trigger}</span>
            <span>→</span>
            <span>{loop.action}</span>
          </div>
          <h1>{loop.name}</h1>
          <p>{loop.prompt}</p>
          <div className="r-inline">
            <Button primary onClick={() => workspace.runLoop(loop.id)}>
              Run now
            </Button>
            <Button
              onClick={() =>
                workspace.mutate((d) => {
                  d.loops.find((l) => l.id === loop.id)!.enabled =
                    !loop.enabled;
                })
              }
            >
              {loop.enabled ? "Pause loop" : "Enable loop"}
            </Button>
          </div>
          <p className="r-service-note">
            Schedules run while this app is open. External coding and Slack
            actions report a service limitation and never send data.
          </p>
          <h3>Run history</h3>
          {data.runs
            .filter((r) => r.loopId === loop.id)
            .map((run) => (
              <article className="r-run" key={run.id}>
                <div className="r-inline">
                  <span className={`r-run-status ${run.status}`}>
                    {run.status}
                  </span>
                  <DateLabel value={run.time} />
                </div>
                <pre>{run.result}</pre>
                <div className="r-inline">
                  {run.issueIds.slice(0, 12).map((id) => (
                    <a href={`#/issue/${id}`} className="r-chip" key={id}>
                      {id}
                    </a>
                  ))}
                </div>
              </article>
            ))}
          {!data.runs.some((r) => r.loopId === loop.id) && (
            <p className="r-muted">No runs yet.</p>
          )}
        </div>
      ) : (
        <>
          <Tabs items={["My loops", "All"]} value={tab} onChange={setTab} />
          {data.loops.length > 0 && (
            <div className="r-loop-list">
              {data.loops.map((l) => (
                <a className="r-loop-row" href={`#/loops/${l.id}`} key={l.id}>
                  <I.LoopsIcon />
                  <strong>{l.name}</strong>
                  <span className="r-push" />
                  <span>{l.trigger}</span>
                  <span className="r-chip">
                    {l.enabled ? "Enabled" : "Paused"}
                  </span>
                </a>
              ))}
            </div>
          )}
          <div className="r-loop-create">
            <h1>Create a new loop</h1>
            <p>
              Automate manual work for your team and keep your process moving
            </p>
            <div className="r-inline">
              <Button onClick={() => draft()}>Start fresh</Button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                draft();
              }}
            >
              <textarea
                aria-label="Loop prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Ask Linear to build the loop for you"
              />
              <footer>
                <FileInput ownerId="loop-draft" />
                <span className="r-push" />
                <button
                  type="submit"
                  className="r-loop-submit"
                  aria-label="Create loop from prompt"
                  disabled={!prompt.trim()}
                >
                  <I.ForwardIcon />
                </button>
              </footer>
            </form>
            <Tabs
              items={[
                "Featured",
                "Engineering",
                "Triage",
                "Reporting",
                "Security",
                "Support",
              ]}
              value={category}
              onChange={setCategory}
            />
            <div className="r-template-grid">
              {LOOP_TEMPLATES.filter(
                (t) => category === "Featured" || t.category === category,
              ).map((t) => (
                <button key={t.name} onClick={() => draft(t)}>
                  <span className="r-template-icon" data-category={t.category}>
                    {t.category === "Engineering" ? (
                      <I.SparkIcon />
                    ) : t.category === "Triage" ? (
                      <I.InboxIcon />
                    ) : t.category === "Security" ? (
                      <I.BellIcon />
                    ) : (
                      <I.CalendarIcon />
                    )}
                  </span>
                  <h3>{t.name}</h3>
                  <p>{t.description}</p>
                  <footer>
                    <span>
                      {t.trigger === "issue-updated"
                        ? "Issue updated"
                        : t.trigger[0].toUpperCase() + t.trigger.slice(1)}
                    </span>
                    <span>→</span>
                    <span>
                      {
                        (
                          {
                            "Autofix bugs": "Start coding session",
                            "Triage agent": "Assign owner",
                            "Slack Q&A assistant": "Reply in thread",
                            "Weekly wrap": "Share highlights",
                            "Feature request report": "Share report",
                            "Update issue priority based on demand":
                              "Raise priority",
                            "Project hygiene": "Notify project leads",
                            "Security alerts": "Alert channel",
                          } as Record<string, string>
                        )[t.name]
                      }
                    </span>
                  </footer>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
      {edit && (
        <Dialog
          wide
          title={
            data.loops.some((l) => l.id === edit.id)
              ? "Edit loop"
              : "Create loop"
          }
          onClose={() => setEdit(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              workspace.mutate((d) => {
                const index = d.loops.findIndex((l) => l.id === edit.id);
                if (index < 0) d.loops.push(edit);
                else d.loops[index] = edit;
                for (const file of d.attachments)
                  if (file.ownerId === "loop-draft") file.ownerId = edit.id;
              });
              setEdit(null);
              navigate({ nav: "loops", id: edit.id });
            }}
          >
            <Field label="Name">
              <input
                required
                autoFocus
                value={edit.name}
                onChange={(e) => setEdit({ ...edit, name: e.target.value })}
              />
            </Field>
            <Field label="Instructions">
              <textarea
                required
                value={edit.prompt}
                onChange={(e) => setEdit({ ...edit, prompt: e.target.value })}
              />
            </Field>
            <div className="r-form-grid">
              <Field label="Trigger">
                <select
                  value={edit.trigger}
                  onChange={(e) =>
                    setEdit({
                      ...edit,
                      trigger: e.target.value as Loop["trigger"],
                    })
                  }
                >
                  {[
                    "manual",
                    "triage",
                    "issue-updated",
                    "hourly",
                    "daily",
                    "weekly",
                  ].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </Field>
              <Field label="Action">
                <select
                  value={edit.action}
                  onChange={(e) =>
                    setEdit({
                      ...edit,
                      action: e.target.value as Loop["action"],
                    })
                  }
                >
                  {[
                    "summarize",
                    "assign-owner",
                    "raise-priority",
                    "coding-session",
                    "slack-reply",
                  ].map((a) => (
                    <option key={a} value={a}>
                      {a.replaceAll("-", " ")}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Project scope">
              <select
                value={edit.projectId ?? ""}
                onChange={(e) =>
                  setEdit({ ...edit, projectId: e.target.value || undefined })
                }
              >
                <option value="">All projects</option>
                {data.projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            {edit.action === "raise-priority" && (
              <Field label="Minimum duplicate reports">
                <input
                  required
                  type="number"
                  min="1"
                  value={edit.minimumDemand ?? 2}
                  onChange={(e) =>
                    setEdit({ ...edit, minimumDemand: e.target.valueAsNumber })
                  }
                />
              </Field>
            )}
            {edit.action === "assign-owner" && (
              <Field label="Assign to">
                <input
                  value={edit.assignee ?? data.settings.user}
                  onChange={(e) =>
                    setEdit({ ...edit, assignee: e.target.value })
                  }
                />
              </Field>
            )}
            <Attachments ownerId={edit.id} />
            <p className="r-service-note">
              Local execution uses the configured trigger and action.
              Instructions are saved as context, not interpreted by an AI model.
            </p>
            <footer>
              <Button onClick={() => setEdit(null)}>Cancel</Button>
              <Button primary type="submit">
                Save loop
              </Button>
            </footer>
          </form>
        </Dialog>
      )}
    </>
  );
}
export function HomePage({ onIssue, onCreate }: PageProps) {
  const data = useData();
  const team = currentTeam(data);
  const issues = data.issues.filter((i) => (i.teamKey || team.key) === team.key);
  const current = data.cycles.find((c) => (c.teamKey || team.key) === team.key && cyclePhase(c) === "Current");
  return (
    <>
      <PageHeader
        title={team.name}
        actions={<Button onClick={() => onCreate()}>New issue</Button>}
      />
      <div className="r-document">
        <h1>Team overview</h1>
        <div className="r-home-stats">
          <a href="#/triage">
            <I.InboxIcon />
            <strong>
              {issues.filter((i) => i.status === "triage").length}
            </strong>
            <span>Issues to triage</span>
          </a>
          <a href="#/cycles/current">
            <I.CalendarIcon />
            <strong>{current?.name ?? "No current cycle"}</strong>
            <span>Current cycle</span>
          </a>
          <a href="#/projects">
            <I.CubeIcon />
            <strong>
              {data.projects.filter((p) => p.status === "started" && (!p.teamKeys.length || p.teamKeys.includes(team.key))).length}
            </strong>
            <span>Active projects</span>
          </a>
        </div>
        <h3>Recent activity</h3>
        {data.activity.filter((a) => issues.some((issue) => issue.id === a.issueId)).slice(0, 20).map((a) => (
          <button
            className="r-home-event"
            key={a.id}
            onClick={() => onIssue(a.issueId)}
          >
            <span className="r-issue-id">{a.issueId}</span>
            <span>{a.text}</span>
            <time>{formatDate(a.time) || a.time}</time>
          </button>
        ))}
      </div>
    </>
  );
}
export function InboxPage({ onIssue }: PageProps) {
  const data = useData(), workspace = useWorkspace();
  const now = useNotificationTime(data.inbox);
  const [unread, setUnread] = useState(false),
    [search, setSearch] = useState(""),
    [folder, setFolder] = useState<InboxFolder>("inbox"),
    [selected, setSelected] = useState<string | null>(null),
    [reminder, setReminder] = useState(false),
    [until, setUntil] = useState(""),
    [error, setError] = useState("");
  const items = data.inbox.filter((n) =>
    inInboxFolder(n, folder, now) && (!unread || !n.read) &&
    (!search || `${n.text} ${n.issueId} ${data.issues.find(i => i.id === n.issueId)?.title ?? ""}`.toLowerCase().includes(search.toLowerCase())),
  );
  const item = data.inbox.find(n => n.id === selected && inInboxFolder(n, folder, now));
  const issue = data.issues.find(i => i.id === item?.issueId);
  const changeFolder = (value: string) => { setFolder(value as InboxFolder); setSelected(null); };
  const act = (action: "archive" | "restore" | "snooze", value?: string) => {
    if (!item) return;
    try {
      workspace.updateNotification(item.id, action, value);
      const index = items.findIndex(n => n.id === item.id);
      setSelected((items[index + 1] ?? items[index - 1])?.id ?? null);
      setReminder(false); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  const snooze = (value: string) => {
    if (value === "custom") { setReminder(true); setError(""); return; }
    const target = new Date();
    if (value === "hour") target.setHours(target.getHours() + 1);
    else { target.setDate(target.getDate() + (value === "tomorrow" ? 1 : 7)); target.setHours(9, 0, 0, 0); }
    act("snooze", target.toISOString());
  };
  return <>
    <PageHeader title="Inbox" className="r-inbox-heading" actions={<>
      <Button onClick={() => workspace.mutate(d => {
        const ids = new Set(items.map(n => n.id));
        d.inbox.forEach(n => { if (ids.has(n.id)) n.read = true; });
      })}>Mark all as read</Button>
      <Button className={unread ? "active" : ""} onClick={() => setUnread(!unread)} aria-pressed={unread}>Unread only</Button>
      <input className="r-compact-search" aria-label="Filter notifications" placeholder="Filter…" value={search} onChange={e => { setSearch(e.target.value); setSelected(null); }} />
    </>}>
      <div className="r-tabs" aria-label="Notification folders">
        {(["inbox", "snoozed", "archived"] as InboxFolder[]).map(value => <button key={value} className={folder === value ? "active" : ""} aria-pressed={folder === value} onClick={() => changeFolder(value)}>
          {{ inbox: "Inbox", snoozed: "Snoozed", archived: "Archived" }[value]} <span>{data.inbox.filter(n => inInboxFolder(n, value, now)).length}</span>
        </button>)}
      </div>
    </PageHeader>
    <div className={`r-inbox ${item ? "has-selection" : ""}`}>
      <div className="r-inbox-list" aria-label="Notifications">
        {items.map(n => <button className={`${n.read ? "" : "unread"} ${n.id === selected ? "selected" : ""}`} key={n.id} aria-current={n.id === selected ? "true" : undefined} onClick={() => { setSelected(n.id); workspace.updateNotification(n.id, "read"); }}>
          <I.BellIcon /><span><strong>{n.issueId}</strong><p>{n.text}</p>{folder === "snoozed" && <small>Reminder {new Date(n.snoozedUntil!).toLocaleString()}</small>}</span>
          <time>{formatDate(n.time) || n.time}</time>
        </button>)}
        {!items.length && <Empty title={folder === "inbox" ? "You’re all caught up" : folder === "snoozed" ? "No snoozed notifications" : "No archived notifications"} description={search || unread ? "Try changing your filters." : "New updates will appear here."} />}
      </div>
      <div className="r-inbox-preview">{item ? <div>
        <Button className="r-inbox-back" onClick={() => setSelected(null)}>← Notifications</Button>
        <h2>{item.issueId}</h2><p>{item.text}</p><p>{issue?.title ?? "This issue is no longer available."}</p>
        <div className="r-notification-actions">
          {issue && <Button onClick={() => onIssue(item.issueId)}>Open issue</Button>}
          <Button onClick={() => workspace.updateNotification(item.id, item.read ? "unread" : "read")}>{item.read ? "Mark unread" : "Mark read"}</Button>
          {folder !== "inbox" && <Button onClick={() => act("restore")}>Move to inbox</Button>}
          {folder !== "archived" && <>
            <Button onClick={() => act("archive")}>Archive</Button>
            <Choice label="Snooze notification" value="" options={[{value:"hour", label:"In one hour"}, {value:"tomorrow", label:"Tomorrow at 9 AM"}, {value:"week", label:"In one week"}, {value:"custom", label:"Choose date and time…"}]} onChange={snooze} />
          </>}
        </div>
      </div> : <Empty title="No notification selected" />}</div>
    </div>
    {reminder && <Dialog title="Snooze notification" onClose={() => setReminder(false)}><form onSubmit={e => { e.preventDefault(); act("snooze", until); }}>
      <Field label="Remind me at"><input aria-label="Remind me at" type="datetime-local" required value={until} onChange={e => setUntil(e.target.value)} /></Field>
      {error && <p role="alert">{error}</p>}
      <div className="r-dialog-actions"><Button onClick={() => setReminder(false)}>Cancel</Button><Button type="submit" primary>Snooze</Button></div>
    </form></Dialog>}
  </>;
}
export function ViewsPage({ route, onIssue, onCreate }: PageProps) {
  const data = useData(),
    workspace = useWorkspace();
  const view = data.views.find((v) => v.id === route.id);
  const [model, setModel] = useState<"Issue" | "Project">("Issue"),
    [edit, setEdit] = useState<CustomView | null>(null),
    [displayOpen, setDisplayOpen] = useState(false);
  const newView = () => {
    setEdit({
      id: uid("view"),
      slugId: uid("view"),
      name: "",
      description: "",
      modelName: model,
      shared: false,
      owner: data.settings.user,
      icon: "issues",
      grouping: "none",
      layout: "list",
      filter: {},
    });
  };
  const viewPrefs = view
    ? (data.preferences[`view:${view.id}`] ?? {
        ...DEFAULT_DISPLAY,
        layout: view.layout,
        grouping: view.grouping,
      })
    : DEFAULT_DISPLAY;
  const matches = view
    ? displayIssues(
        createKernel({ ...data, viewer: data.settings.user }).customViewIssues(
          view.id,
        ),
        viewPrefs,
      )
    : [];
  return (
    <>
      <PageHeader
        title={view?.name ?? "Views"}
        actions={
          <>
            <Button
              onClick={view ? () => setEdit(structuredClone(view)) : newView}
            >
              {view ? "Edit view" : "Create new view"}
            </Button>
            {view?.modelName === "Issue" && (
              <div className="r-menu-anchor">
                <IconButton
                  label="View display options"
                  onClick={() => setDisplayOpen(!displayOpen)}
                >
                  <I.DisplayIcon />
                </IconButton>
                {displayOpen && (
                  <DisplayMenu
                    value={viewPrefs}
                    onChange={(value) =>
                      workspace.mutate((d) => {
                        d.preferences[`view:${view.id}`] = value;
                      })
                    }
                    onClose={() => setDisplayOpen(false)}
                  />
                )}
              </div>
            )}
          </>
        }
      />
      {route.id && !view ? (
        <Empty title="View not found" />
      ) : view ? (
        <>
          {view.modelName === "Issue" ? (
            <IssueList
              issues={matches}
              prefs={viewPrefs}
              onOpen={onIssue}
              onCreate={() => onCreate()}
            />
          ) : (
            <ProjectCollection storageKey={`view:${view.id}`} projects={data.projects.filter(project => matchesProjectFilter(project, view.projectFilter ?? {query: view.filter.query}))} />
          )}
        </>
      ) : (
        <>
          <Tabs
            items={["Issues", "Projects"]}
            value={model === "Issue" ? "Issues" : "Projects"}
            onChange={(t) => setModel(t === "Issues" ? "Issue" : "Project")}
          />
          {data.views.filter((v) => v.modelName === model).length ? (
            <div className="r-view-list">
              {data.views
                .filter((v) => v.modelName === model)
                .map((v) => (
                  <a href={`#/views/${v.id}`} key={v.id}>
                    <I.ViewsIcon />
                    <strong>{v.name}</strong>
                    <span>{v.description}</span>
                    <span className="r-push" />
                    <span>{v.shared ? "Shared" : "Private"}</span>
                  </a>
                ))}
            </div>
          ) : (
            <Empty
              title="Views"
              description="Create custom views using filters to show only the issues you want to see. Save, share, and favorite views for easy access."
            >
              <Button onClick={newView}>Create new view</Button>
            </Empty>
          )}
        </>
      )}
      {edit && (
        <Dialog
          title={edit.name ? "Edit view" : "Create view"}
          onClose={() => setEdit(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              {
                const item = { ...edit };
                workspace.mutate((d) => {
                  const index = d.views.findIndex((v) => v.id === item.id);
                  if (index < 0) d.views.push(item);
                  else d.views[index] = item;
                });
                setEdit(null);
                navigate({ nav: "views", id: item.id });
              }
            }}
          >
            <Field label="Name">
              <input
                required
                autoFocus
                value={edit.name}
                onChange={(e) => setEdit({ ...edit, name: e.target.value })}
              />
            </Field>
            <Field label="Description">
              <input
                value={edit.description}
                onChange={(e) =>
                  setEdit({ ...edit, description: e.target.value })
                }
              />
            </Field>
            <Field label="Objects">
              <select
                value={edit.modelName}
                onChange={(e) =>
                  setEdit({
                    ...edit,
                    modelName: e.target.value as CustomView["modelName"],
                  })
                }
              >
                <option value="Issue">Issues</option>
                <option value="Project">Projects</option>
              </select>
            </Field>
            {edit.modelName === "Issue" ? (
              <FilterBuilder
                value={edit.filter}
                onChange={(filter) => setEdit({ ...edit, filter })}
              />
            ) : (
              <>
                <Field label="Text">
                  <input
                    value={edit.projectFilter?.query ?? ""}
                    onChange={(e) =>
                      setEdit({
                        ...edit,
                        projectFilter: {
                          ...edit.projectFilter,
                          query: e.target.value,
                        },
                      })
                    }
                  />
                </Field>
                <Field label="Project status">
                  <select
                    value={edit.projectFilter?.statuses?.[0] ?? ""}
                    onChange={(e) =>
                      setEdit({
                        ...edit,
                        projectFilter: {
                          ...edit.projectFilter,
                          statuses: e.target.value
                            ? [e.target.value as Project["status"]]
                            : undefined,
                        },
                      })
                    }
                  >
                    <option value="">Any status</option>
                    {PROJECT_STATUSES.map((s) => (
                      <option value={s} key={s}>
                        {PROJECT_STATUS_LABEL[s]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Project lead">
                  <input
                    value={edit.projectFilter?.lead ?? ""}
                    onChange={(e) =>
                      setEdit({
                        ...edit,
                        projectFilter: {
                          ...edit.projectFilter,
                          lead: e.target.value || undefined,
                        },
                      })
                    }
                  />
                </Field>
                <Field label="Project priority">
                  <select
                    value={edit.projectFilter?.priority ?? ""}
                    onChange={(e) =>
                      setEdit({
                        ...edit,
                        projectFilter: {
                          ...edit.projectFilter,
                          priority:
                            e.target.value === ""
                              ? undefined
                              : (Number(e.target.value) as Priority),
                        },
                      })
                    }
                  >
                    <option value="">Any priority</option>
                    {PRIORITY_LABEL.map((p, i) => (
                      <option value={i} key={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </Field>
              </>
            )}
            <label className="r-check-line">
              <span>Share with team</span>
              <input
                type="checkbox"
                checked={edit.shared}
                onChange={(e) => setEdit({ ...edit, shared: e.target.checked })}
              />
            </label>
            <footer>
              <Button primary type="submit">
                Save view
              </Button>
            </footer>
          </form>
        </Dialog>
      )}
    </>
  );
}
export function SettingsPage({section,invite=false}:{section?:string;invite?:boolean}) {
  const account=useContext(AccountContext);
  const data = useAllData(),
    workspace = useWorkspace();
  const [error, setError] = useState(""),
    [imported, setImported] = useState<WorkspaceData | null>(null),
    [teamKey, setTeamKey] = useState(""),
    [teamName, setTeamName] = useState(""),
    [labelName, setLabelName] = useState(""),
    [labelColorValue, setLabelColorValue] = useState<string>(LABEL_COLORS[0]),
    [serverOrigin, setServerOrigin] = useState(() => accountApiBase() || "http://127.0.0.1:4175");
  async function exportBackup() {
    try {
      const json = {
        ...data,
        attachments: await Promise.all(
          data.attachments.map(async (a) => ({
            ...a,
            blob: Array.from(new Uint8Array(await a.blob.arrayBuffer())),
          })),
        ),
      };
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(json)], { type: "application/json" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `linear-workspace-${day()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(String(e));
    }
  }
  if(account&&section==="members")return <><PageHeader title="Members"/><div className="r-document r-members-page"><WorkspaceMembers key={invite?"invite":"members"} initialInvite={invite}/></div></>;
  if(account&&section==="workspaces")return <><PageHeader title="Workspaces"/><div className="r-document r-settings"><WorkspaceAccounts/></div></>;
  return (
    <>
      <PageHeader title="Settings" />
      <div className="r-document r-settings">
        {account&&<section><h2>Account</h2><p>Signed in as {account.user.email}</p><p className="r-muted">Shared workspace records are saved on this server. Your drafts, inbox, favorites and chats stay private to your account.</p><div className="r-inline"><Button onClick={account.reconnect}>Reconnect account</Button><Button onClick={()=>void account.signOut().catch(error=>setError(error instanceof Error?error.message:String(error)))}>Sign out</Button></div></section>}
        <WorkspaceAccounts/>{account&&<Button onClick={()=>navigate({nav:"settings",id:"members"})}>Manage members</Button>}
        <h2>Workspace</h2>
        <Field label="Workspace name">
          <input
            value={data.settings.workspace}
            disabled={!!account&&account.membership?.role!=="admin"}
            onChange={(e) =>
              workspace.mutate((d) => {
                d.settings.workspace = e.target.value;
              })
            }
          />
        </Field>
        <Field label="Your display name">
          <input
            disabled={!!account}
            value={data.settings.user}
            onChange={(e) =>
              workspace.mutate((d) => {
                const old = d.settings.user;
                const name = e.target.value;
                d.settings.user = name;
                for(const item of [...d.issues,...d.activity])for(const [emoji,people] of Object.entries(item.reactions ?? {}))item.reactions![emoji]=[...new Set(people.map(person=>person===old?name:person))];
                for(const item of d.activity)if(item.author===old)item.author=name;
                for(const doc of d.documents)if(doc.creator===old)doc.creator=name;
                for (const issue of d.issues) {
                  if (issue.assignee === old) issue.assignee = name;
                  if (issue.creator === old) issue.creator = name;
                }
                for (const project of d.projects) {
                  if (project.lead === old) project.lead = name;
                  project.memberIds = project.memberIds.map((n) =>
                    n === old ? name : n,
                  );
                }
                for (const review of d.reviews) {
                  if (review.author === old) review.author = name;
                  review.reviewers = review.reviewers?.map((n) =>
                    n === old ? name : n,
                  );
                }
              })
            }
          />
        </Field>
        <IssueTemplateSettings/>
        {window.replicaDesktop && (
          <section>
            <h2>Desktop account</h2>
            <p className="r-muted">The packaged app cannot send SameSite cookies to a local account server. Sign-in uses a Bearer session and CORS for replica://app.</p>
            <Field label="Account server">
              <input value={serverOrigin} onChange={(e) => setServerOrigin(e.target.value)} placeholder="http://127.0.0.1:4175" />
            </Field>
            <div className="r-inline">
              <Button onClick={() => {
                try {
                  const url = new URL(serverOrigin);
                  if (!["http:", "https:"].includes(url.protocol) || (url.hostname !== "127.0.0.1" && url.hostname !== "localhost"))
                    throw Error("Use a local http://127.0.0.1 account server.");
                  setAccountApiBase(url.origin);
                  setAccountEnabled(true);
                  window.location.reload();
                } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
              }}>{accountEnabled() ? "Reconnect account server" : "Connect account server"}</Button>
              {accountEnabled() && <Button onClick={() => { setAccountEnabled(false); window.location.reload(); }}>Use this device only</Button>}
            </div>
          </section>
        )}
        <h2>Teams</h2>
        <p className="r-muted">Issues are identified as {"{team key}-{number}"}. Switching teams changes Home, Triage, Issues and Cycles.</p>
        <ul className="r-settings-list">
          {data.teams.map((item) => (
            <li key={item.id}>
              <span className="r-team-key">{item.key}</span>
              {item.name}
              {item.key === data.settings.currentTeamKey ? " · current" : (
                <Button onClick={() => workspace.setCurrentTeam(item.key)}>Switch</Button>
              )}
            </li>
          ))}
        </ul>
        <form className="r-inline" onSubmit={(e) => {
          e.preventDefault();
          try { workspace.createTeam({ key: teamKey, name: teamName }); setTeamKey(""); setTeamName(""); setError(""); }
          catch (e) { setError(e instanceof Error ? e.message : String(e)); }
        }}>
          <Field label="Key"><input required maxLength={8} value={teamKey} onChange={(e) => setTeamKey(e.target.value.toUpperCase())} placeholder="ENG" /></Field>
          <Field label="Name"><input required value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="Engineering" /></Field>
          <Button primary type="submit">Add team</Button>
        </form>
        <h2>Labels</h2>
        <div className="r-label-catalog">
          {data.labels.map((label) => (
            <span key={label.id} className="r-issue-label" style={{ ["--label-color" as string]: label.color }}>
              <i style={{ background: label.color }} />
              {label.name}
            </span>
          ))}
        </div>
        <form className="r-inline" onSubmit={(e) => {
          e.preventDefault();
          try { workspace.saveLabel({ name: labelName, color: labelColorValue }); setLabelName(""); setError(""); }
          catch (e) { setError(e instanceof Error ? e.message : String(e)); }
        }}>
          <Field label="Name"><input required value={labelName} onChange={(e) => setLabelName(e.target.value)} placeholder="bug" /></Field>
          <Field label="Color">
            <div className="r-color-swatches" role="radiogroup" aria-label="Label color">
              {LABEL_COLOR_OPTIONS.map(({ color, name }) => (
                <button
                  type="button"
                  key={color}
                  className="r-color-swatch"
                  style={{ background: color }}
                  title={name}
                  aria-label={name}
                  role="radio"
                  aria-checked={labelColorValue === color}
                  onClick={() => setLabelColorValue(color)}
                />
              ))}
              <span className="r-color-swatch-name">
                {LABEL_COLOR_OPTIONS.find((item) => item.color === labelColorValue)?.name ?? "Indigo"}
              </span>
            </div>
          </Field>
          <Button primary type="submit">Add label</Button>
        </form>
        <h3>Notifications</h3>
        <label className="r-check-line"><span>Desktop notifications</span><input type="checkbox" aria-label="Desktop notifications" disabled={!window.replicaDesktop?.notify} checked={!!data.settings.desktopNotifications} onChange={event=>workspace.mutate(d=>{d.settings.desktopNotifications=event.target.checked;})}/></label>
        <p className="r-muted">{window.replicaDesktop?.notify?"Show new inbox notifications while the desktop app is running. Your system notification settings also apply.":"Available in the desktop app."}</p>
        <h3>Data & storage</h3>
        <p>
          {account?"Workspace records, files, drafts and conversations are saved on your account server.":"Workspace records, files, drafts and conversations are saved on this device."}
        </p>
        <div className="r-inline">
          <Button onClick={() => void exportBackup()}>Export workspace</Button>
          <label className="r-button">
            Import workspace
            <input
              className="sr-only"
              type="file"
              accept="application/json"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                try {
                  const raw = JSON.parse(await file.text());
                  if (Array.isArray(raw.attachments))
                    for (const a of raw.attachments) {
                      if (
                        !Array.isArray(a.blob) ||
                        !a.blob.every(
                          (v: unknown) =>
                            Number.isInteger(v) &&
                            Number(v) >= 0 &&
                            Number(v) <= 255,
                        )
                      )
                        throw Error("Invalid attachment data.");
                      a.blob = new Blob([new Uint8Array(a.blob)], {
                        type: a.mime,
                      });
                    }
                  setImported(migrateData(raw));
                  setError("");
                } catch (e) {
                  setError(`Import failed: ${String(e)}`);
                }
              }}
            />
          </label>
          <Button onClick={workspace.retrySave}>Retry save</Button>
        </div>
        <h3>Integrations</h3>
        <p>
          Agent, reviews and automations run locally. No credentials or remote
          services are connected.
        </p>
        <h3>Keyboard shortcuts</h3>
        <p>
          ⌘K command menu · / search · C new issue · Space peek · G then I inbox
          · G then M my issues · G then P projects · G then C cycles · G then T
          triage · G then N initiatives.
        </p>
        {error && (
          <p className="r-error" role="alert">
            {error}
          </p>
        )}
      </div>
      {imported && (
        <Dialog title="Import workspace" onClose={() => setImported(null)}>
          <p>
            This replaces the local workspace with {imported.issues.length}{" "}
            issues, {imported.projects.length} projects and {imported.relations.length} relationships. Export your current
            workspace first if you want to keep it.
          </p>
          <footer>
            <Button onClick={() => setImported(null)}>Cancel</Button>
            <Button
              primary
              onClick={() => {
                workspace.mutate((d) => Object.assign(d, imported));
                setImported(null);
                navigate({ nav: "my-issues" });
              }}
            >
              Import workspace
            </Button>
          </footer>
        </Dialog>
      )}
    </>
  );
}
