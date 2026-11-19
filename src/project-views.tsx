import { useEffect, useRef, useState, type PointerEvent } from "react";
import * as I from "./icons";
import {
  Avatar,
  Button,
  Choice,
  DateLabel,
  Dialog,
  Empty,
  Field,
  IconButton,
  useData,
  useWorkspace,
} from "./ui";
import { createKernel, PRIORITY_LABEL, PROJECT_STATUSES } from "./kernel";
import { HEALTH_LABEL, PROJECT_STATUS_LABEL } from "./logic";
import { day, formatDate } from "./workspace";
import { navigate } from "./router";
import type { Project } from "./types";
import {
  DEFAULT_PROJECT_DISPLAY,
  dateNumber,
  isoWeek,
  moveSchedule,
  pixelsPerDay,
  projectSpan,
  type ProjectDisplay,
} from "./timeline";

export function ProjectCollection({
  projects,
  storageKey = "projects",
}: {
  projects: Project[];
  storageKey?: string;
}) {
  const data = useData(),
    workspace = useWorkspace();
  const prefs = data.projectPreferences[storageKey] ?? DEFAULT_PROJECT_DISPLAY;
  const change = (patch: Partial<ProjectDisplay>) =>
    workspace.mutate((d) => {
      d.projectPreferences[storageKey] = { ...prefs, ...patch };
    });
  const [display, setDisplay] = useState(false);
  const [dates, setDates] = useState<{
      id: string;
      startDate: string;
      targetDate: string;
    } | null>(null),
    [error, setError] = useState("");
  const menu = useRef<HTMLDivElement>(null);
  const kernel = createKernel({ ...data, viewer: data.settings.user });
  const filtered = projects.filter(
    (p) => prefs.showClosed || !["completed", "canceled"].includes(p.status),
  );
  const ordered = [...filtered].sort((a, b) => {
    if (prefs.ordering === "Manual") return 0;
    if (prefs.ordering === "Name") return a.name.localeCompare(b.name);
    if (prefs.ordering === "Priority")
      return (a.priority || 5) - (b.priority || 5);
    if (prefs.ordering === "Target date")
      return (a.targetDate || "9999").localeCompare(b.targetDate || "9999");
    if (prefs.ordering === "Status")
      return (
        PROJECT_STATUSES.indexOf(a.status) - PROJECT_STATUSES.indexOf(b.status)
      );
    if (prefs.ordering === "Lead")
      return (a.lead ?? "").localeCompare(b.lead ?? "");
    if (prefs.ordering === "Health")
      return (a.updates[0]?.health ?? "").localeCompare(
        b.updates[0]?.health ?? "",
      );
    return (
      kernel.projectProgress(b.id).ratio - kernel.projectProgress(a.id).ratio
    );
  });
  const groupKey = (p: Project) =>
    prefs.grouping === "status"
      ? PROJECT_STATUS_LABEL[p.status]
      : prefs.grouping === "lead"
        ? (p.lead ?? "No lead")
        : prefs.grouping === "priority"
          ? PRIORITY_LABEL[p.priority]
          : "All projects";
  const groups = new Map<string, Project[]>();
  ordered.forEach((project) => {
    const key = groupKey(project);
    groups.set(key, [...(groups.get(key) ?? []), project]);
  });
  const editDates = (project: Project) => {
    setError("");
    setDates({
      id: project.id,
      startDate: project.startDate ?? "",
      targetDate: project.targetDate ?? "",
    });
  };
  useEffect(() => {
    if (!display) return;
    const outside = (e: MouseEvent) => {
      if (
        !menu.current?.contains(e.target as Node) &&
        !(e.target as Element).closest(".r-choice-menu")
      )
        setDisplay(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDisplay(false);
    };
    document.addEventListener("mousedown", outside);
    window.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", outside);
      window.removeEventListener("keydown", escape);
    };
  }, [display]);
  return (
    <>
      <div className="r-project-view-toolbar">
        <span>{ordered.length} projects</span>
        <span className="r-push" />
        <div className="r-menu-anchor" ref={menu}>
          <IconButton
            label="Project display options"
            onClick={() => setDisplay(!display)}
          >
            <I.DisplayIcon />
          </IconButton>
          {display && (
            <div
              className="r-popover r-project-display"
              aria-label="Project display options"
            >
              <div className="r-layout-options" aria-label="Project layout">
                {(["list", "board", "timeline"] as const).map((layout) => (
                  <button
                    key={layout}
                    aria-pressed={prefs.layout === layout}
                    className={prefs.layout === layout ? "active" : ""}
                    onClick={() => change({ layout })}
                  >
                    {layout === "list" ? (
                      <I.IssuesIcon />
                    ) : layout === "board" ? (
                      <I.ViewsIcon />
                    ) : (
                      <I.CalendarIcon />
                    )}
                    {layout[0].toUpperCase() + layout.slice(1)}
                  </button>
                ))}
              </div>
              <Field label="Grouping">
                <Choice
                  label="Project grouping"
                  value={prefs.grouping}
                  onChange={(value) =>
                    change({ grouping: value as ProjectDisplay["grouping"] })
                  }
                  options={[
                    { value: "none", label: "No grouping" },
                    { value: "status", label: "Status" },
                    { value: "lead", label: "Lead" },
                    { value: "priority", label: "Priority" },
                  ]}
                />
              </Field>
              <Field label="Ordering">
                <Choice
                  label="Project ordering"
                  value={prefs.ordering}
                  onChange={(value) =>
                    change({ ordering: value as ProjectDisplay["ordering"] })
                  }
                  options={[
                    "Manual",
                    "Name",
                    "Health",
                    "Priority",
                    "Lead",
                    "Target date",
                    "Issues",
                    "Status",
                  ].map((value) => ({ value, label: value }))}
                />
              </Field>
              <label className="r-inline">
                <input
                  type="checkbox"
                  checked={prefs.showClosed}
                  onChange={(e) => change({ showClosed: e.target.checked })}
                />
                Show closed projects
              </label>
              {prefs.layout === "timeline" && (
                <>
                  <label className="r-inline">
                    <input
                      type="checkbox"
                      checked={prefs.showProjectList}
                      onChange={(e) =>
                        change({ showProjectList: e.target.checked })
                      }
                    />
                    Show project list
                  </label>
                  <label className="r-inline">
                    <input
                      type="checkbox"
                      checked={prefs.showWeekNumbers}
                      onChange={(e) =>
                        change({ showWeekNumbers: e.target.checked })
                      }
                    />
                    Show week numbers
                  </label>
                  <label className="r-inline">
                    <input
                      type="checkbox"
                      checked={prefs.showCycles}
                      onChange={(e) => change({ showCycles: e.target.checked })}
                    />
                    Show cycles
                  </label>
                  <label className="r-inline">
                    <input
                      type="checkbox"
                      checked={prefs.showDependencies}
                      onChange={(e) =>
                        change({ showDependencies: e.target.checked })
                      }
                    />
                    Show dependencies
                  </label>
                </>
              )}
              <Button onClick={() => change({ ...DEFAULT_PROJECT_DISPLAY })}>
                Reset to view default
              </Button>
            </div>
          )}
        </div>
      </div>
      {prefs.layout === "timeline" ? (
        <ProjectTimeline
          groups={groups}
          prefs={prefs}
          onChange={change}
          onDates={editDates}
        />
      ) : prefs.layout === "board" ? (
        <div className="r-project-board">
          {(prefs.grouping === "none"
            ? PROJECT_STATUSES.map(
                (status) =>
                  [
                    PROJECT_STATUS_LABEL[status],
                    ordered.filter((p) => p.status === status),
                    status,
                  ] as const,
              )
            : [...groups.entries()].map(([name, items]) => [name, items, undefined] as const)
          ).map(([name, items, status]) => (
            <section
              key={name}
              onDragOver={(e) => {
                if (prefs.grouping === "none" && status) e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/project-id");
                if (id && status)
                  workspace.patchProject(id, { status });
              }}
            >
              <h3>
                {name}
                <span>{items.length}</span>
              </h3>
              {items.map((p) => (
                <a
                  className="r-project-card"
                  key={p.id}
                  href={`#/projects/${p.id}`}
                  draggable={prefs.grouping === "none"}
                  onDragStart={(e) =>
                    e.dataTransfer.setData("text/project-id", p.id)
                  }
                >
                  <strong>
                    <I.CubeIcon />
                    {p.name}
                  </strong>
                  <p>{p.summary}</p>
                  <div>
                    <Avatar name={p.lead} small />
                    <span>{PRIORITY_LABEL[p.priority]}</span>
                    <span className="r-push" />
                    <DateLabel value={p.targetDate} />
                  </div>
                  <progress
                    max={1}
                    value={kernel.projectProgress(p.id).ratio}
                    aria-label={`${p.name} progress`}
                  />
                </a>
              ))}
            </section>
          ))}
        </div>
      ) : (
        <div className="r-table-scroll">
          <table className="r-entity-table">
            <thead>
              <tr>
                {[
                  "Name",
                  "Health",
                  "Priority",
                  "Lead",
                  "Target date",
                  "Issues",
                  "Status",
                ].map((name) => (
                  <th key={name}>
                    <button
                      onClick={() =>
                        change({ ordering: name as ProjectDisplay["ordering"] })
                      }
                    >
                      {name}
                      {prefs.ordering === name ? " ↓" : ""}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            {[...groups].map(([name, items]) => (
              <tbody key={name}>
                {prefs.grouping !== "none" && (
                  <tr className="r-project-group">
                    <th colSpan={7}>
                      {name} · {items.length}
                    </th>
                  </tr>
                )}
                {items.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <a href={`#/projects/${p.id}`}>
                        <I.CubeIcon />
                        {p.name}
                      </a>
                    </td>
                    <td>
                      {p.updates[0] ? (
                        <span className={`r-health ${p.updates[0].health}`}>
                          {HEALTH_LABEL[p.updates[0].health]}
                        </span>
                      ) : (
                        "No updates"
                      )}
                    </td>
                    <td>
                      <I.PriorityIcon level={p.priority} />
                    </td>
                    <td>
                      <Avatar name={p.lead} small />
                    </td>
                    <td>
                      <button
                        aria-label={`Edit dates for ${p.name}`}
                        onClick={() => editDates(p)}
                      >
                        <DateLabel value={p.targetDate} />
                      </button>
                    </td>
                    <td>
                      <progress
                        aria-label={`${p.name} progress`}
                        max={1}
                        value={kernel.projectProgress(p.id).ratio}
                      />
                    </td>
                    <td>{PROJECT_STATUS_LABEL[p.status]}</td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      )}
      {!ordered.length && <Empty title="No projects match this view" />}
      {dates && (
        <Dialog title="Project dates" onClose={() => setDates(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fields = new FormData(e.currentTarget);
              const submitted = {
                ...dates,
                startDate: String(fields.get("startDate") ?? ""),
                targetDate: String(fields.get("targetDate") ?? ""),
              };
              setDates(submitted);
              try {
                workspace.setProjectSchedule(
                  dates.id,
                  submitted.startDate,
                  submitted.targetDate,
                );
                setDates(null);
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              }
            }}
          >
            <Field label="Start date">
              <input
                aria-label="Project start date"
                name="startDate"
                type="date"
                value={dates.startDate}
                onChange={(e) =>
                  setDates({ ...dates, startDate: e.target.value })
                }
              />
            </Field>
            <Field label="Target date">
              <input
                aria-label="Project target date"
                name="targetDate"
                type="date"
                value={dates.targetDate}
                onChange={(e) =>
                  setDates({ ...dates, targetDate: e.target.value })
                }
              />
            </Field>
            {error && (
              <p role="alert" className="r-error">
                {error}
              </p>
            )}
            <footer>
              <Button onClick={() => setDates(null)}>Cancel</Button>
              <Button primary type="submit">
                Save dates
              </Button>
            </footer>
          </form>
        </Dialog>
      )}
    </>
  );
}

function ProjectTimeline({
  groups,
  prefs,
  onChange,
  onDates,
}: {
  groups: Map<string, Project[]>;
  prefs: ProjectDisplay;
  onChange: (patch: Partial<ProjectDisplay>) => void;
  onDates: (p: Project) => void;
}) {
  const data = useData(),
    workspace = useWorkspace();
  const today = dateNumber(day())!;
  const [anchor, setAnchor] = useState(today),
    [error, setError] = useState("");
  const [preview, setPreview] = useState<{
    id: string;
    dates: { startDate?: string; targetDate?: string };
  } | null>(null);
  const drag = useRef<{
    project: Project;
    x: number;
    mode: "move" | "start" | "end";
    delta: number;
  } | null>(null);
  const moved = useRef(false),
    scroll = useRef<HTMLDivElement>(null);
  const scale = pixelsPerDay[prefs.zoom];
  const year = new Date(anchor * 86400000).getUTCFullYear();
  const origin = dateNumber(`${year - 1}-01-01`)!,
    end = dateNumber(`${year + 2}-01-01`)!;
  const width = (end - origin) * scale,
    side = prefs.showProjectList ? 290 : 0;
  useEffect(() => {
    if (scroll.current)
      scroll.current.scrollLeft =
        (anchor - origin) * scale - (scroll.current.clientWidth - side) / 2;
  }, [anchor, origin, scale, side]);
  const months: { day: number; end: number; label: string }[] = [];
  for (let y = year - 1; y <= year + 1; y++)
    for (let m = 0; m < 12; m++) {
      const start = Date.UTC(y, m, 1) / 86400000,
        last = Date.UTC(y, m + 1, 1) / 86400000;
      months.push({
        day: start,
        end: last,
        label: new Date(start * 86400000).toLocaleDateString("en-US", {
          month: "short",
          year: m === 0 ? "numeric" : undefined,
          timeZone: "UTC",
        }),
      });
    }
  const ticks: number[] = [];
  const firstTick =
    prefs.zoom === "Week"
      ? origin
      : origin +
        ((data.settings.weekStartsOn -
          new Date(origin * 86400000).getUTCDay() +
          7) %
          7);
  const gridStyle = {
    width,
    backgroundSize: `${scale * (prefs.zoom === "Week" ? 1 : 7)}px 100%`,
    backgroundPositionX: (firstTick - origin) * scale,
  };
  for (let d = firstTick; d < end; d += prefs.zoom === "Week" ? 1 : 7)
    ticks.push(d);
  const persist = (
    project: Project,
    delta: number,
    mode: "move" | "start" | "end" = "move",
  ) => {
    try {
      const dates = moveSchedule(project, delta, mode);
      workspace.setProjectSchedule(
        project.id,
        dates.startDate,
        dates.targetDate,
      );
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const pointerDown = (e: PointerEvent<HTMLDivElement>, project: Project) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.focus();
    e.currentTarget.setPointerCapture(e.pointerId);
    const handle = (e.target as HTMLElement).dataset.handle;
    drag.current = {
      project,
      x: e.clientX,
      mode: handle === "start" || handle === "end" ? handle : "move",
      delta: 0,
    };
    moved.current = false;
  };
  const pointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const active = drag.current;
    if (!active) return;
    const delta = Math.round((e.clientX - active.x) / scale);
    active.delta = delta;
    if (Math.abs(e.clientX - active.x) > 3) moved.current = true;
    try {
      setPreview({
        id: active.project.id,
        dates: moveSchedule(active.project, delta, active.mode),
      });
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPreview(null);
    }
  };
  const pointerUp = () => {
    const active = drag.current;
    if (active && moved.current && active.delta)
      persist(active.project, active.delta, active.mode);
    drag.current = null;
    setPreview(null);
  };
  return (
    <div className="r-timeline">
      <div className="r-timeline-controls">
        <span>{new Date(anchor * 86400000).getUTCFullYear()}</span>
        <span className="r-push" />
        <IconButton
          label="Previous timeline period"
          onClick={() =>
            setAnchor(
              anchor -
                { Year: 365, Quarter: 90, Month: 30, Week: 7 }[prefs.zoom],
            )
          }
        >
          <span style={{ display: "inline-flex", transform: "rotate(180deg)" }}>
            <I.ChevronIcon />
          </span>
        </IconButton>
        <IconButton
          label="Next timeline period"
          onClick={() =>
            setAnchor(
              anchor +
                { Year: 365, Quarter: 90, Month: 30, Week: 7 }[prefs.zoom],
            )
          }
        >
          <I.ChevronIcon />
        </IconButton>
        <Button
          title="Center the timeline on today’s date"
          onClick={() => {
            setAnchor(today);
            if (scroll.current)
              scroll.current.scrollLeft =
                (today - origin) * scale -
                (scroll.current.clientWidth - side) / 2;
          }}
        >
          Today
        </Button>
        <Choice
          label="Timeline zoom"
          value={prefs.zoom}
          options={["Year", "Quarter", "Month", "Week"].map((value) => ({
            value,
            label: value,
          }))}
          onChange={(value) =>
            onChange({ zoom: value as ProjectDisplay["zoom"] })
          }
        />
      </div>
      {error && (
        <p role="alert" className="r-error">
          {error}
        </p>
      )}
      <div
        className="r-timeline-scroll"
        ref={scroll}
        aria-label="Project timeline"
      >
        <div className="r-timeline-canvas" style={{ width: width + side }}>
          <div className="r-timeline-header" style={{ paddingLeft: side }}>
            {prefs.showProjectList && (
              <span className="r-timeline-corner" style={{ width: side }}>
                Projects
              </span>
            )}
            <div style={{ width, height: 54, position: "relative" }}>
              {months.map((m) => (
                <span
                  className="r-timeline-month"
                  key={m.day}
                  style={{
                    left: (m.day - origin) * scale,
                    width: (m.end - m.day) * scale,
                  }}
                >
                  {m.label}
                </span>
              ))}
              {ticks.map((d) => (
                <span
                  className="r-timeline-tick"
                  key={d}
                  style={{ left: (d - origin) * scale }}
                >
                  {prefs.showWeekNumbers
                    ? `W${isoWeek(d)}`
                    : new Date(d * 86400000).getUTCDate()}
                </span>
              ))}
              <span
                className="r-timeline-today-label"
                style={{ left: (today - origin) * scale }}
              >
                {formatDate(day())}
              </span>
            </div>
          </div>
          {[...groups].map(([name, projects]) => (
            <div key={name}>
              {prefs.grouping !== "none" && (
                <div className="r-timeline-group">
                  {name} · {projects.length}
                </div>
              )}
              {projects.map((project) => {
                const current =
                  preview?.id === project.id
                    ? { ...project, ...preview.dates }
                    : project;
                const span = projectSpan(current, origin, scale),
                  milestones = data.milestones.filter(
                    (m) =>
                      m.projectId === project.id &&
                      dateNumber(m.targetDate) !== undefined,
                  );
                return (
                  <div
                    className="r-timeline-row"
                    key={project.id}
                    style={{ paddingLeft: side }}
                  >
                    {prefs.showProjectList && (
                      <div
                        className="r-timeline-project"
                        style={{ width: side }}
                      >
                        <a href={`#/projects/${project.id}`}>
                          <I.CubeIcon />
                          {project.name}
                        </a>
                        {prefs.showDependencies &&
                          (project.dependsOnProjectIds ?? []).map((depId) => (
                            <a
                              key={depId}
                              className="r-timeline-dependency"
                              href={`#/projects/${depId}`}
                              title={`Depends on ${data.projects.find((p) => p.id === depId)?.name ?? depId}`}
                            >
                              ↳ {data.projects.find((p) => p.id === depId)?.name ?? depId}
                            </a>
                          ))}
                        <IconButton
                          label={`Edit dates for ${project.name}`}
                          onClick={() => onDates(project)}
                        >
                          <I.CalendarIcon />
                        </IconButton>
                        <Avatar name={project.lead} small />
                      </div>
                    )}
                    <div className="r-timeline-track" style={gridStyle}>
                      {prefs.showCycles &&
                        data.cycles.map((cycle) => {
                          const start = dateNumber(cycle.startDate),
                            finish = dateNumber(cycle.endDate);
                          if (start === undefined || finish === undefined) return null;
                          if (finish < origin || start > end) return null;
                          const left = (Math.max(start, origin) - origin) * scale;
                          const widthPx = (Math.min(finish, end) - Math.max(start, origin)) * scale;
                          return (
                            <span
                              className="r-timeline-cycle"
                              key={cycle.id}
                              style={{ left, width: widthPx }}
                              title={cycle.name}
                            />
                          );
                        })}
                      <span
                        className="r-timeline-today"
                        style={{ left: (today - origin) * scale }}
                      />
                      {span ? (
                        <div
                          role="button"
                          tabIndex={0}
                          aria-label={`${project.name}, ${current.startDate ?? "no start date"} to ${current.targetDate ?? "no target date"}. Arrow keys move dates; Enter opens project.`}
                          title={`${project.name}\n${current.startDate ?? "No start date"} → ${current.targetDate ?? "No target date"}`}
                          className={`r-timeline-bar ${span.width ? "" : "partial"} ${project.status}`}
                          style={{ left: span.left, width: span.width || 155 }}
                          onPointerDown={(e) => pointerDown(e, project)}
                          onPointerMove={pointerMove}
                          onPointerUp={pointerUp}
                          onPointerCancel={() => {
                            drag.current = null;
                            setPreview(null);
                          }}
                          onClick={() => {
                            if (!moved.current)
                              navigate({ nav: "projects", id: project.id });
                            moved.current = false;
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") {
                              drag.current = null;
                              setPreview(null);
                              e.stopPropagation();
                              return;
                            }
                            if (e.key === "Enter")
                              navigate({ nav: "projects", id: project.id });
                            if (
                              e.key === "ArrowRight" ||
                              e.key === "ArrowLeft"
                            ) {
                              e.preventDefault();
                              e.stopPropagation();
                              persist(
                                project,
                                (e.key === "ArrowRight" ? 1 : -1) *
                                  (e.shiftKey ? 7 : 1),
                              );
                            }
                          }}
                        >
                          {span.width > 0 && (
                            <span
                              className="r-timeline-handle start"
                              data-handle="start"
                              title="Resize start date"
                            />
                          )}
                          <strong>{project.name}</strong>
                          {span.width === 0 && (
                            <small>
                              {span.start === undefined
                                ? "Target only"
                                : "No target date"}
                            </small>
                          )}
                          {span.width > 0 && (
                            <span
                              className="r-timeline-handle end"
                              data-handle="end"
                              title="Resize target date"
                            />
                          )}
                        </div>
                      ) : (
                        <button
                          className="r-timeline-unscheduled"
                          style={{
                            left: Math.max(0, (anchor - origin) * scale - 100),
                          }}
                          onClick={() => onDates(project)}
                        >
                          Schedule {project.name}…
                        </button>
                      )}
                      {milestones.map((m) => (
                        <button
                          key={m.id}
                          className="r-timeline-milestone"
                          title={`${m.name} · ${m.targetDate}`}
                          style={{
                            left: (dateNumber(m.targetDate)! - origin) * scale,
                          }}
                          onClick={() =>
                            navigate({ nav: "projects", id: project.id })
                          }
                        >
                          ◇<span>{m.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
          <div className="r-timeline-filler">
            {prefs.showProjectList && (
              <div className="r-timeline-filler-side" style={{ width: side }} />
            )}
            <div className="r-timeline-track" style={gridStyle}>
              <span
                className="r-timeline-today"
                style={{ left: (today - origin) * scale }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
