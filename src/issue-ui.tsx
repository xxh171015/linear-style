import { useContext, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import * as I from "./icons";
import { AccountContext } from "./account-ui";
import {
  createKernel,
  ISSUE_GROUPINGS,
  ISSUE_STATUSES,
  PRIORITY_LABEL,
  STATUS_LABEL,
} from "./kernel";
import type {
  CustomViewFilter,
  DisplayPreferences,
  Issue,
  IssueDraft,
  IssueCreationRelation,
  IssueGrouping,
  IssueStatus,
  Priority,
} from "./types";
import {
  Attachments,
  RichEditor,
  RichText,
  Choice,
  Avatar,
  Button,
  Dialog,
  Empty,
  Field,
  FileInput,
  IconButton,
  Status,
  useData,
  useAllData,
  useWorkspace,
} from "./ui";
import { DEFAULT_DISPLAY, currentTeam, emptyDraft, favoriteOf, formatDate, labelColor } from "./workspace";
import { IssueRelationMenu, IssueRelations, IssueDependencies, RelationPicker, DuplicateConfirmation, CanonicalIssue } from "./relation-ui";
import { openBlockers, type IssueRelationMode } from "./relations";
import { DeleteIssueDialog } from "./archive-ui";
import { DescriptionHistory, IssueActivity, Reactions } from "./activity-ui";
import { IssueReminderDialog } from "./reminder-ui";
import { IssueLinkDialog, IssueResources } from "./issue-resources";
import { navigate } from "./router";
const GROUP_LABEL: Record<IssueGrouping, string> = {
  none: "No grouping",
  status: "Status",
  "status-type": "Status type",
  assignee: "Assignee",
  agent: "Agent",
  project: "Project",
  priority: "Priority",
  cycle: "Cycle",
  label: "Label",
  team: "Team",
};
export const PROPERTY_NAMES = [
  "ID",
  "Status",
  "Assignee",
  "Creator",
  "Priority",
  "Project",
  "Due date",
  "Milestone",
  "Cycle",
  "Labels",
  "Links",
  "Time in status",
  "Created",
  "Updated",
  "Pull requests",
];
export function DisplayMenu({
  value,
  onChange,
  onClose,
}: {
  value: DisplayPreferences;
  onChange: (value: DisplayPreferences) => void;
  onClose: () => void;
}) {
  const patch = (p: Partial<DisplayPreferences>) =>
    onChange({ ...value, ...p });
  return (
    <div
      className="r-popover r-display"
      role="dialog"
      aria-label="Display options"
    >
      <div className="r-segment">
        <button
          className={value.layout === "list" ? "active" : ""}
          onClick={() => patch({ layout: "list" })}
        >
          List
        </button>
        <button
          className={value.layout === "board" ? "active" : ""}
          onClick={() => patch({ layout: "board" })}
        >
          Board
        </button>
      </div>
      <Field label="Grouping">
        <Choice
          label="Issue grouping"
          value={value.grouping}
          onChange={(next) => patch({ grouping: next as IssueGrouping })}
          options={ISSUE_GROUPINGS.map((g) => ({
            value: g,
            label: GROUP_LABEL[g],
          }))}
        />
      </Field>
      <Field label="Ordering">
        <div className="r-inline">
          <Choice
            label="Issue ordering"
            value={value.ordering}
            onChange={(next) =>
              patch({ ordering: next as DisplayPreferences["ordering"] })
            }
            options={["created", "updated", "priority", "title", "status", "due"].map(
              (v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }),
            )}
          />
          <IconButton
            label="Direction"
            onClick={() =>
              patch({ direction: value.direction === "asc" ? "desc" : "asc" })
            }
          >
            {value.direction === "asc" ? "↑" : "↓"}
          </IconButton>
        </div>
      </Field>
      <Field label="Completed issues">
        <Choice
          label="Completed issue range"
          value={value.completed}
          onChange={(next) =>
            patch({ completed: next as DisplayPreferences["completed"] })
          }
          options={[
            { value: "all", label: "All" },
            { value: "none", label: "None" },
            { value: "week", label: "Past week" },
          ]}
        />
      </Field>
      {(["subIssues", "triage", "nested"] as const).map((key) => (
        <label className="r-check-line" key={key}>
          <span>
            {key === "subIssues"
              ? "Show sub-issues"
              : key === "triage"
                ? "Show triage issues"
                : "Nested sub-issues"}
          </span>
          <input
            type="checkbox"
            checked={value[key]}
            onChange={(e) => patch({ [key]: e.target.checked })}
          />
        </label>
      ))}
      <p className="r-small-heading">Display properties</p>
      <div className="r-property-grid">
        {PROPERTY_NAMES.map((name) => (
          <button
            key={name}
            aria-pressed={value.properties.includes(name)}
            className={value.properties.includes(name) ? "active" : ""}
            onClick={() =>
              patch({
                properties: value.properties.includes(name)
                  ? value.properties.filter((p) => p !== name)
                  : [...value.properties, name],
              })
            }
          >
            {name}
          </button>
        ))}
      </div>
      <Button onClick={onClose}>Done</Button>
    </div>
  );
}
export function FilterMenu({
  value,
  onChange,
  onClose,
}: {
  value: CustomViewFilter;
  onChange: (value: CustomViewFilter) => void;
  onClose: () => void;
}) {
  const data = useData();
  const patch = (p: Partial<CustomViewFilter>) => onChange({ ...value, ...p });
  return (
    <div
      className="r-popover r-filters"
      role="dialog"
      aria-label="Filter issues"
    >
      <Field label="Search">
        <input
          autoFocus
          placeholder="Issue ID, title or description…"
          value={value.query ?? ""}
          onChange={(e) => patch({ query: e.target.value })}
        />
      </Field>
      <Field label="Status">
        <div className="r-filter-statuses" role="group" aria-label="Statuses">
          {ISSUE_STATUSES.map((s) => (
            <label key={s} className="r-check-line">
              <span>{STATUS_LABEL[s]}</span>
              <input
                type="checkbox"
                checked={value.statuses?.includes(s) ?? false}
                onChange={(e) => {
                  const selected = new Set(value.statuses ?? []);
                  if (e.target.checked) selected.add(s);
                  else selected.delete(s);
                  patch({
                    statuses: selected.size ? [...selected] : undefined,
                  });
                }}
              />
            </label>
          ))}
        </div>
      </Field>
      <Field label="Project">
        <Choice
          label="Filter by project"
          value={value.projectId ?? ""}
          onChange={(next) => patch({ projectId: next || undefined })}
          options={[
            { value: "", label: "Any project" },
            ...data.projects.map((p) => ({ value: p.id, label: p.name })),
          ]}
        />
      </Field>
      <Field label="Cycle">
        <Choice
          label="Filter by cycle"
          value={value.cycleId ?? ""}
          onChange={(next) => patch({ cycleId: next || undefined })}
          options={[
            { value: "", label: "Any cycle" },
            ...data.cycles.map((c) => ({ value: c.id, label: c.name })),
          ]}
        />
      </Field>
      <Field label="Priority">
        <Choice
          label="Filter by priority"
          value={value.priority === undefined ? "" : String(value.priority)}
          onChange={(next) =>
            patch({
              priority: next === "" ? undefined : (Number(next) as Priority),
            })
          }
          options={[
            { value: "", label: "Any priority" },
            ...PRIORITY_LABEL.map((p, i) => ({ value: String(i), label: p })),
          ]}
        />
      </Field>
      <Field label="Label">
        <Choice
          label="Filter by label"
          value={value.labels?.[0] ?? ""}
          onChange={(next) => patch({ labels: next ? [next] : undefined })}
          options={[
            { value: "", label: "Any label" },
            ...[...new Set([...data.labels.map((l) => l.name), ...data.issues.flatMap((i) => i.labels)])].map((l) => ({
              value: l,
              label: l,
            })),
          ]}
        />
      </Field>
      <Field label="Team">
        <Choice
          label="Filter by team"
          value={value.teamKey ?? ""}
          onChange={(next) => patch({ teamKey: next || undefined })}
          options={[
            { value: "", label: "Any team" },
            ...data.teams.map((team) => ({ value: team.key, label: `${team.key} · ${team.name}` })),
          ]}
        />
      </Field>
      <Field label="Due date">
        <Choice
          label="Filter by due date"
          value={value.due ?? ""}
          onChange={(next) => patch({ due: next === "set" || next === "unset" ? next : undefined })}
          options={[
            { value: "", label: "Any due date" },
            { value: "set", label: "Has due date" },
            { value: "unset", label: "No due date" },
          ]}
        />
      </Field>
      <Field label="Estimate">
        <Choice
          label="Filter by estimate"
          value={value.estimate ?? ""}
          onChange={(next) => patch({ estimate: next === "set" || next === "unset" ? next : undefined })}
          options={[
            { value: "", label: "Any estimate" },
            { value: "set", label: "Estimated" },
            { value: "unset", label: "Unestimated" },
          ]}
        />
      </Field>
      <label className="r-check-line">
        <span>Assigned to me</span>
        <input
          type="checkbox"
          checked={!!value.assignedToMe}
          onChange={(e) => patch({ assignedToMe: e.target.checked })}
        />
      </label>
      <div className="r-inline">
        <Button onClick={() => onChange({})}>Clear filters</Button>
        <Button onClick={onClose}>Done</Button>
      </div>
    </div>
  );
}
export function IssueList({
  issues,
  prefs = DEFAULT_DISPLAY,
  onOpen,
  onCreate,
  selectedId,
  onSelect,
}: {
  issues: Issue[];
  prefs?: DisplayPreferences;
  onOpen: (id: string, peek?: boolean) => void;
  onCreate?: (status?: IssueStatus) => void;
  selectedId?: string;
  onSelect?: (id: string) => void;
}) {
  const data = useData(),
    workspace = useWorkspace();
  const [checked, setChecked] = useState<string[]>([]);
  const [menu, setMenu] = useState<string | null>(null);
  const groups = useMemo(
    () =>
      createKernel({
        issues: data.issues,
        projects: data.projects,
      }).groupIssues(issues, prefs.grouping),
    [issues, data.issues, data.projects, prefs.grouping],
  );
  const show = (name: string) => prefs.properties.includes(name);
  if (!issues.length)
    return (
      <Empty
        title="No issues match this view"
        description="Try adjusting your filters, or create a new issue."
      >
        {onCreate && <Button onClick={() => onCreate()}>New issue</Button>}
      </Empty>
    );
  return (
    <div
      className={`r-issue-list ${prefs.layout === "board" ? "r-board-layout" : ""}`}
    >
      {checked.length > 0 && (
        <div className="r-bulk">
          <span>{checked.length} selected</span>
          <select
            aria-label="Change selected issue status"
            defaultValue=""
            onChange={(e) => {
              if (!e.target.value) return;
              for (const id of checked)
                workspace.updateIssue(
                  id,
                  { status: e.target.value as IssueStatus },
                  `changed status to ${STATUS_LABEL[e.target.value as IssueStatus]}`,
                );
              setChecked([]);
            }}
          >
            <option value="">Change status…</option>
            {ISSUE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <Button onClick={() => setChecked([])}>Clear</Button>
        </div>
      )}
      {groups.map((group) => {
        let ordered = group.items;
        if (prefs.nested) {
          const included = new Set(ordered.map((i) => i.id));
          const children = (id: string, seen: Set<string>): Issue[] =>
            ordered
              .filter((i) => i.parentId === id && !seen.has(i.id))
              .flatMap((i) => {
                const next = new Set([...seen, i.id]);
                return [i, ...children(i.id, next)];
              });
          ordered = ordered
            .filter((i) => !i.parentId || !included.has(i.parentId))
            .flatMap((i) => [i, ...children(i.id, new Set([i.id]))]);
        }
        const label =
          prefs.grouping === "cycle"
            ? (data.cycles.find((c) => c.id === group.key)?.name ?? group.label)
            : group.label;
        return (
          <section
            className="r-issue-group"
            key={group.key}
            onDragOver={(e) => {
              if (prefs.grouping === "status") e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData("text/issue-id");
              if (id && group.status && data.issues.some((i) => i.id === id))
                workspace.updateIssue(
                  id,
                  { status: group.status },
                  `changed status to ${STATUS_LABEL[group.status]}`,
                );
            }}
          >
            {prefs.grouping !== "none" && (
              <header>
                {group.status ? (
                  <Status status={group.status} />
                ) : (
                  <I.ViewsIcon />
                )}
                <strong>{label}</strong>
                <span>{group.items.length}</span>
                {onCreate && (
                  <IconButton
                    label={`Create in ${label}`}
                    onClick={() => onCreate(group.status)}
                  >
                    <I.PlusIcon />
                  </IconButton>
                )}
              </header>
            )}
            {ordered.map((issue) => {
              const depth =
                prefs.nested &&
                issue.parentId &&
                ordered.some((i) => i.id === issue.parentId)
                  ? 1
                  : 0;
              return (
                <div
                  key={issue.id}
                  role="button"
                  tabIndex={0}
                  draggable={
                    prefs.layout === "board" && prefs.grouping === "status"
                  }
                  onDragStart={(e) =>
                    e.dataTransfer.setData("text/issue-id", issue.id)
                  }
                  onFocus={() => onSelect?.(issue.id)}
                  className={`r-issue-row ${selectedId === issue.id ? "selected" : ""}`}
                  style={{ paddingLeft: 20 + depth * 24 }}
                  onClick={() => onOpen(issue.id)}
                  onKeyDown={(e) => {
                    if (e.target === e.currentTarget && e.key === "Enter") {
                      e.preventDefault();
                      onOpen(issue.id);
                    }
                    if (e.target === e.currentTarget && e.key === " ") {
                      e.preventDefault();
                      onOpen(issue.id, true);
                    }
                  }}
                >
                  <input
                    type="checkbox"
                    aria-label={`Select ${issue.id}`}
                    checked={checked.includes(issue.id)}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) =>
                      setChecked(
                        e.target.checked
                          ? [...checked, issue.id]
                          : checked.filter((id) => id !== issue.id),
                      )
                    }
                  />
                  {show("Priority") && (
                    <span className="r-row-priority">
                      <I.PriorityIcon level={issue.priority} />
                    </span>
                  )}
                  {show("ID") && <span className="r-issue-id">{issue.id}</span>}
                  {show("Status") && (
                    <button
                      className="r-status-hit"
                      aria-label={`Change status of ${issue.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenu(menu === issue.id ? null : issue.id);
                      }}
                    >
                      <Status status={issue.status} />
                    </button>
                  )}
                  <span className="r-issue-title">{issue.title}</span>
                  {openBlockers(data.relations, issue.id, data.issues).length > 0 && <span className="r-blocked-indicator" title="Blocked by open issues" aria-label="Blocked by open issues">⊘</span>}
                  {data.issues.some((i) => i.parentId === issue.id) && (
                    <span className="r-sub-count">
                      {
                        data.issues.filter(
                          (i) => i.parentId === issue.id && i.status === "done",
                        ).length
                      }
                      /
                      {
                        data.issues.filter((i) => i.parentId === issue.id)
                          .length
                      }
                    </span>
                  )}
                  <div className="r-row-meta">
                    {show("Labels") &&
                      issue.labels.slice(0, 2).map((l) => (
                        <span className="r-label" key={l}>
                          <i style={{ background: labelColor(data, l) }} />
                          {l}
                        </span>
                      ))}
                    {show("Project") && issue.projectId && (
                      <span className="r-project-chip">
                        <I.CubeIcon />
                        {
                          data.projects.find((p) => p.id === issue.projectId)
                            ?.name
                        }
                      </span>
                    )}
                    {show("Cycle") && issue.cycleId && (
                      <span className="r-chip">
                        <I.CalendarIcon />
                        {data.cycles.find((c) => c.id === issue.cycleId)?.name}
                      </span>
                    )}
                    {show("Milestone") && issue.milestoneId && (
                      <span className="r-chip">
                        {
                          data.milestones.find(
                            (m) => m.id === issue.milestoneId,
                          )?.name
                        }
                      </span>
                    )}
                    {show("Pull requests") &&
                      data.reviews
                        .filter((r) => r.issueIds?.includes(issue.id))
                        .map((r) => (
                          <span key={r.id} className="r-chip">
                            <I.ReviewsIcon />
                            {r.id.slice(-4)}
                          </span>
                        ))}
                    {show("Due date") && issue.dueDate && (
                      <time>{formatDate(issue.dueDate)}</time>
                    )}
                    {show("Links") &&
                      (data.attachments.some((f) => f.ownerId === issue.id) || !!issue.links?.length || data.documents.some(doc=>doc.issueId===issue.id&&!doc.deletedAt)) && (
                        <I.DocsIcon />
                      )}
                    {show("Creator") && <Avatar small name={issue.creator} />}
                    {show("Assignee") && (
                      <Avatar small name={issue.assignee} />
                    )}{" "}
                    {show("Time in status") && (
                      <time>
                        {issue.updatedAt
                          ? `${Math.max(0, Math.floor((Date.now() - Date.parse(issue.updatedAt)) / 86400000))}d`
                          : "—"}
                      </time>
                    )}
                    {show("Updated") && (
                      <time>{formatDate(issue.updatedAt)}</time>
                    )}
                    {show("Created") && (
                      <time>{formatDate(issue.createdAt) || issue.date}</time>
                    )}
                  </div>
                  {menu === issue.id && (
                    <div
                      className="r-row-state-menu"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="r-small-heading">
                        Change status…{" "}
                        <button
                          onClick={() => setMenu(null)}
                          aria-label="Close status menu"
                        >
                          ×
                        </button>
                      </div>
                      {ISSUE_STATUSES.map((s) => (
                        <button
                          key={s}
                          onClick={() => {
                            workspace.updateIssue(
                              issue.id,
                              { status: s },
                              `changed status to ${STATUS_LABEL[s]}`,
                            );
                            setMenu(null);
                          }}
                        >
                          <Status status={s} />
                          {STATUS_LABEL[s]}
                          {issue.status === s && <I.CheckTinyIcon />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
export function IssueComposer({
  onClose,
  onCreated,
  projectId,
  cycleId,
  parentId,
  initialStatus,
  relation,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
  projectId?: string;
  cycleId?: string;
  parentId?: string;
  initialStatus?: IssueStatus;
  relation?: IssueCreationRelation;
}) {
  const memberNames=useContext(AccountContext)?.members.map(member=>member.name)??[];
  const data = useData(),
    workspace = useWorkspace();
  const [more, setMore] = useState(false),
    [error, setError] = useState("");
  const draft = data.draft;
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    workspace.mutate((d) => {
      if (projectId) d.draft.projectId = projectId;
      if (cycleId) d.draft.cycleId = cycleId;
      if (parentId) d.draft.parentId = parentId;
      if (initialStatus) d.draft.status = initialStatus;
      if (relation) {
        d.draft.relation = relation;
        const source = d.issues.find(issue => issue.id === relation.issueId);
        if (source) Object.assign(d.draft, {
          status: source.status, assignee: source.assignee, projectId: source.projectId,
          milestoneId: source.milestoneId, cycleId: source.cycleId, parentId: undefined,
          priority: 0, labels: [],
        });
      }
    });
  }, []);
  const patch = (p: Partial<IssueDraft>) =>
    workspace.mutate((d) => {
      d.draft = { ...d.draft, ...p };
    });
  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    try {
      const issue = workspace.createIssue(draft, "draft");
      workspace.mutate((d) => {
        d.draft = more
          ? {
              ...emptyDraft(),
              projectId: draft.projectId,
              cycleId: draft.cycleId,
              relation: draft.relation,
              parentId: draft.parentId,
              milestoneId: draft.milestoneId,
              assignee: draft.assignee,
              status: draft.status,
              priority: draft.priority,
              labels: draft.labels,
              teamKey: draft.teamKey,
              estimate: draft.estimate,
              dueDate: draft.dueDate,
            }
          : emptyDraft();
      });
      if (!more) {
        onClose();
        onCreated(issue.id);
      } else
        form.current
          ?.querySelector<HTMLInputElement>('[aria-label="Issue title"]')
          ?.focus();
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <Dialog wide title="New issue" onClose={onClose}>
      <form
        ref={form}
        onSubmit={submit}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        className="r-composer"
      >
        <div className="r-crumb">
          <Avatar name={data.settings.workspace} /> {currentTeam(data).name} <span>›</span>{" "}
          New issue <span className="r-push" />
          <Button onClick={onClose}>Save as draft</Button>
        </div>
        {data.templates.some(template=>!template.deletedAt && (!template.teamKey || template.teamKey === currentTeam(data).key)) && <div className="r-inline r-template-choice"><Choice label="Fill blank fields from template" value="" options={[{value:"",label:"Use template…"},...data.templates.filter(template=>!template.deletedAt && (!template.teamKey || template.teamKey === currentTeam(data).key)).map(template=>({value:template.id,label:template.name}))]} onChange={id=>{if(id)try{workspace.applyIssueTemplate(id);setError("");}catch(error){setError(error instanceof Error?error.message:String(error));}}}/></div>}
        {draft.relation && <div className="r-composer-relation" role="status">
          <span>{({related:"Related to", "blocked-by":"Blocking", blocking:"Blocked by", parent:"Sub-issue of", child:"Parent of"})[draft.relation.mode]} {draft.relation.issueId} · {data.issues.find(issue => issue.id === draft.relation?.issueId)?.title ?? "Unavailable issue"}</span>
          <IconButton label="Remove draft relationship" onClick={() => patch({relation: undefined})}><I.CloseIcon /></IconButton>
        </div>}
        <input
          autoFocus
          aria-label="Issue title"
          className="r-title-input"
          placeholder="Issue title"
          value={draft.title}
          onChange={(e) => patch({ title: e.target.value })}
        />
        <RichEditor label="Issue description" placeholder="Add description…" value={draft.body} onChange={body => patch({ body })} />
        <div className="r-compose-properties">
          <Choice
            label="Change status"
            value={draft.status}
            options={ISSUE_STATUSES.map((s) => ({
              value: s,
              label: STATUS_LABEL[s],
              icon: <Status status={s} />,
            }))}
            onChange={(value) => patch({ status: value as IssueStatus })}
          />
          <Choice
            label="Change priority"
            value={String(draft.priority)}
            options={PRIORITY_LABEL.map((label, i) => ({
              value: String(i),
              label,
              icon: <I.PriorityIcon level={i as Priority} />,
            }))}
            onChange={(value) => patch({ priority: Number(value) as Priority })}
          />
          <Choice
            label="Change assignee"
            value={draft.assignee ?? ""}
            options={[
              { value: "", label: "Assignee" },
              ...[
                ...new Set([
                  data.settings.user,
                  ...memberNames,
                  ...data.issues.flatMap((i) =>
                    i.assignee ? [i.assignee] : [],
                  ),
                ]),
              ].map((name) => ({
                value: name,
                label: name,
                icon: <Avatar small name={name} />,
              })),
            ]}
            onChange={(value) => patch({ assignee: value || undefined })}
          />
          <Choice
            label="Change project"
            value={draft.projectId ?? ""}
            options={[
              { value: "", label: "Project" },
              ...data.projects.map((p) => ({
                value: p.id,
                label: p.name,
                icon: <I.CubeIcon />,
              })),
            ]}
            onChange={(value) => patch({ projectId: value || undefined, milestoneId: undefined })}
          />
          {draft.projectId && <Choice label="Choose milestone" value={draft.milestoneId ?? ""}
            options={[{value:"",label:"Milestone"},...data.milestones.filter(m => m.projectId === draft.projectId).map(m => ({value:m.id,label:m.name}))]}
            onChange={value => patch({milestoneId:value || undefined})} />}
          <Choice
            label="Add to cycle"
            value={draft.cycleId ?? ""}
            options={[
              { value: "", label: "Cycle" },
              ...data.cycles.filter((c) => (c.teamKey || currentTeam(data).key) === (draft.teamKey || currentTeam(data).key)).map((c) => ({
                value: c.id,
                label: c.name,
                icon: <I.CalendarIcon />,
              })),
            ]}
            onChange={(value) => patch({ cycleId: value || undefined })}
          />
          <Choice
            label="Change team"
            value={draft.teamKey || currentTeam(data).key}
            options={data.teams.map((team) => ({ value: team.key, label: team.key }))}
            onChange={(value) => patch({ teamKey: value || undefined, cycleId: undefined })}
          />
          <input
            aria-label="Estimate"
            type="number"
            min={0}
            placeholder="Estimate"
            value={draft.estimate ?? ""}
            onChange={(e) => patch({ estimate: e.target.value === "" ? undefined : Number(e.target.value) })}
          />
          <input
            aria-label="Due date"
            type="date"
            value={draft.dueDate ?? ""}
            onChange={(e) => patch({ dueDate: e.target.value || undefined })}
          />
          <input
            aria-label="Labels"
            placeholder="Labels, separated by commas"
            value={draft.labels.join(", ")}
            onChange={(e) =>
              patch({
                labels: e.target.value.split(",").map((s) => s.trimStart()),
              })
            }
          />
          <div className="r-label-catalog">
            {data.labels.map((label) => {
              const on = draft.labels.includes(label.name);
              return (
                <button
                  type="button"
                  key={label.id}
                  className={`r-issue-label ${on ? "active" : ""}`}
                  onClick={() => patch({ labels: on ? draft.labels.filter((name) => name !== label.name) : [...draft.labels.filter(Boolean), label.name] })}
                >
                  <i style={{ background: label.color }} />
                  {label.name}
                </button>
              );
            })}
          </div>
        </div>
        <Attachments ownerId="draft" />
        {error && (
          <p role="alert" className="r-error">
            {error}
          </p>
        )}
        <footer>
          <FileInput ownerId="draft" />
          <span className="r-push" />
          <label className="r-check-line">
            <input
              type="checkbox"
              checked={more}
              onChange={(e) => setMore(e.target.checked)}
            />
            Create more
          </label>
          <Button primary type="submit" disabled={!draft.title.trim()}>
            {draft.copySourceId ? "Save copy" : "Create issue"}
          </Button>
        </footer>
      </form>
    </Dialog>
  );
}
export function IssueDetail({
  id,
  onClose,
  onOpen,
  onCreateChild,
  onCreateRelated,
  onMakeCopy,
  peek = false,
}: {
  id: string;
  onClose: () => void;
  onOpen: (id: string) => void;
  onCreateChild: (id: string) => void;
  onCreateRelated?: (relation: IssueCreationRelation) => void;
  onMakeCopy?: () => void;
  peek?: boolean;
}) {
  const memberNames=useContext(AccountContext)?.members.map(member=>member.name)??[];
  const data = useData(),
    workspace = useWorkspace();
  const all = useAllData();
  const issue = all.issues.find((i) => i.id === id);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showHistory,setShowHistory] = useState(false);
  const [showReminder,setShowReminder] = useState(false);
  const [linkEditor,setLinkEditor] = useState<import("./types").IssueLink | "new" | null>(null);
  const [duplicateTarget, setDuplicateTarget] = useState<string | null>(null), [reverseDuplicate, setReverseDuplicate] = useState(false);
  const [relationMode, setRelationMode] = useState<IssueRelationMode | null>(null);
  const [comment, setComment] = useState(""),
    [error, setError] = useState(""),
    [triageAction, setTriageAction] = useState<"duplicate" | "snooze" | null>(
      null,
    ),
    [triageValue, setTriageValue] = useState(""),
    [editing, setEditing] = useState(false),
    [body, setBody] = useState(issue?.body ?? ""),
    [title, setTitle] = useState(issue?.title ?? ""),
    [labelsDraft,setLabelsDraft] = useState(issue?.labels.join(", ")??"");
  const lastSeenTitle = useRef({id,title:issue?.title??"",labels:issue?.labels.join(", ")??""});
  useEffect(() => {
    const previous=lastSeenTitle.current, remote=issue?.title??"";
    setTitle(current=>previous.id!==id||current===previous.title?remote:current);
    const remoteLabels=issue?.labels.join(", ")??"";
    setLabelsDraft(current=>previous.id!==id||current===previous.labels?remoteLabels:current);
    lastSeenTitle.current={id,title:remote,labels:remoteLabels};
    if(!editing)setBody(issue?.body??"");
  },[id,issue?.title,issue?.body,issue?.labels,editing]);
  useEffect(() => {
    setTitle(issue?.title ?? "");
    setBody(issue?.body ?? "");
    setEditing(false);
    setShowReminder(false);
    setLinkEditor(null);
    setRelationMode(null);
    setDuplicateTarget(null);
    setTriageAction(null);
    setReverseDuplicate(false);
    setComment("");
    setError("");
  }, [id]);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest?.('input,textarea,select,[contenteditable="true"]') || document.querySelector('[role="dialog"]')) return;
      if(event.ctrlKey&&!event.metaKey&&!event.altKey&&event.key.toLowerCase()==="l"&&issue&&!issue.deletedAt) {
        event.preventDefault();setLinkEditor("new");
      }
      if (event.shiftKey && event.key.toLowerCase() === "h" && !event.ctrlKey && !event.metaKey && !event.altKey && issue && !issue.deletedAt) {
        event.preventDefault(); setShowReminder(true);
      }
      if ((event.metaKey || event.ctrlKey) && ["Delete","Backspace"].includes(event.key) && issue && !issue.deletedAt) {
        event.preventDefault(); setConfirmDelete(true);
      }
      if (issue?.deletedAt && (event.key === "#" || ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z"))) {
        event.preventDefault(); workspace.restoreIssue(id);
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [id, issue?.deletedAt, workspace]);
  if (!issue)
    return (
      <Empty
        title="Issue not found"
        description="This link may no longer be available."
      >
        <Button onClick={onClose}>Back to issues</Button>
      </Empty>
    );
  if (issue.deletedAt) return <div className="r-deleted-detail">
    <header className="r-detail-toolbar"><strong>{issue.id}</strong><span className="r-push" /><Button onClick={onClose}>Back</Button></header>
    <div className="r-document"><h1>{issue.title}</h1><p role="status">This issue was deleted on {new Date(issue.deletedAt).toLocaleString()}.</p>
      <Button primary onClick={() => workspace.restoreIssue(id)}>Restore issue</Button>
      {issue.body && <div className="r-description"><RichText text={issue.body} /></div>}
      <p className="r-muted">Restore this issue to make changes.</p>
    </div>
  </div>;
  const patch = (
    p: Parameters<typeof workspace.updateIssue>[1],
    text?: string,
  ) => {
    try {
      workspace.updateIssue(id, p, text);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      setError(
        "Clipboard access is unavailable. Select and copy the issue ID instead.",
      );
    }
  };
  const triage = (
    action: "accept" | "decline" | "duplicate" | "snooze",
    value?: string,
  ) => {
    try {
      if (action === "duplicate" && issue.status !== "triage")
        workspace.updateIssue(
          id,
          { status: "duplicate", duplicateOfId: value },
          `marked as duplicate of ${value}`,
        );
      else workspace.triage(id, action, value);
      setTriageAction(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const children = data.issues.filter((i) => i.parentId === id);
  const files = data.attachments.filter((a) => a.ownerId === id);
  return (
    <div className={`r-issue-detail ${peek ? "peek" : ""}`}>
      <header className="r-detail-toolbar">
        <span>{issue.teamKey}</span>
        <span>›</span>
        <strong>{id}</strong>
        <IconButton
          label={
            favoriteOf(data, "issue", id)
              ? "Remove from favorites"
              : "Add to favorites"
          }
          onClick={() => workspace.toggleFavorite("issue", id)}
        >
          <I.StarIcon />
        </IconButton>
        <IssueRelationMenu
          onAddLink={()=>setLinkEditor("new")}
          onAddDocument={()=>{try{const doc=workspace.createIssueDocument(id);navigate({nav:"documents",id:doc.id});}catch(e){setError(e instanceof Error?e.message:String(e));}}}
          onRemind={() => setShowReminder(true)}
          onMakeCopy={onMakeCopy ? () => {
            try { workspace.prepareIssueCopy(id); setError(""); onMakeCopy(); }
            catch (e) { setError(e instanceof Error ? e.message : String(e)); }
          } : undefined}
          onHistory={()=>setShowHistory(true)}
          onChoose={setRelationMode}
          onDelete={() => setConfirmDelete(true)}
          onCreate={onCreateRelated ? mode => onCreateRelated({issueId:id,mode}) : undefined}
          onCopyLink={() => void copy(window.replicaDesktop ? `linear-replica://issue/${encodeURIComponent(id)}` : `${location.origin}${location.pathname}#/issue/${id}`)}
          subscribed={issue.subscribed}
          onSubscribe={() => patch({ subscribed: !issue.subscribed }, issue.subscribed ? "unsubscribed" : "subscribed")}
          favorited={!!favoriteOf(data, "issue", id)}
          onFavorite={() => workspace.toggleFavorite("issue", id)}
        />
        <IconButton label="Copy issue ID" onClick={() => void copy(id)}>
          <I.DocsIcon />
        </IconButton>
        <span className="r-push" />
        <IconButton
          label="Copy issue URL"
          onClick={() =>
            void copy(window.replicaDesktop ? `linear-replica://issue/${encodeURIComponent(id)}` : `${location.origin}${location.pathname}#/issue/${id}`)
          }
        >
          <I.ShareIcon />
        </IconButton>
        <IconButton label="Close issue" onClick={onClose}>
          <I.CloseIcon />
        </IconButton>
      </header>
      {showHistory && <DescriptionHistory id={id} onClose={()=>setShowHistory(false)} />}
      {showReminder && <IssueReminderDialog key={id} id={id} onClose={()=>setShowReminder(false)} />}
      {linkEditor && <IssueLinkDialog key={linkEditor==="new"?"new":linkEditor.id} issueId={id} link={linkEditor==="new"?undefined:linkEditor} onClose={()=>setLinkEditor(null)}/>}
      {confirmDelete && <DeleteIssueDialog id={id} onClose={() => setConfirmDelete(false)} />}
      {relationMode && <RelationPicker key={`${id}:${relationMode}`} id={id} mode={relationMode} onClose={() => setRelationMode(null)} onCreate={onCreateRelated ? mode => {
        onCreateRelated({issueId:id,mode}); setRelationMode(null);
      } : undefined} />}
      {issue.status === "triage" && (
        <div className="r-triage-actions">
          <Button onClick={() => triage("accept")}>
            <I.CheckTinyIcon />
            Accept
          </Button>
          <Button onClick={() => triage("decline")}>Decline</Button>
          <Button
            onClick={() => {
              setTriageAction("duplicate");
              setTriageValue("");
            }}
          >
            Mark as duplicate
          </Button>
          <Button
            onClick={() => {
              setTriageAction("snooze");
              setTriageValue("");
            }}
          >
            <I.HistoryIcon />
            Snooze
          </Button>
        </div>
      )}
      {duplicateTarget && <DuplicateConfirmation
        sourceId={reverseDuplicate ? duplicateTarget : id} targetId={reverseDuplicate ? id : duplicateTarget}
        onSwitch={() => setReverseDuplicate(value => !value)} onClose={() => setDuplicateTarget(null)}
        onConfirm={() => { workspace.linkIssues(reverseDuplicate ? duplicateTarget : id, reverseDuplicate ? id : duplicateTarget, "duplicate"); setDuplicateTarget(null); }}
      />}
      <div className="r-detail-columns">
        <div className="r-detail-body">
          <input
            aria-label="Issue title"
            className="r-title-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => {
              if (title !== issue.title) patch({ title }, "updated the title");
            }}
          />
          {issue.parentId && (
            <button
              className="r-parent"
              onClick={() => onOpen(issue.parentId!)}
            >
              Sub-issue of {issue.parentId} ·{" "}
              {data.issues.find((i) => i.id === issue.parentId)?.title}
            </button>
          )}
          {editing ? (
            <div>
              <RichEditor autoFocus label="Edit issue description" value={body} onChange={setBody} attachmentOwnerId={id} />
              <div className="r-inline">
                <Button
                  primary
                  onClick={() => {
                    patch({ body }, "updated the description");
                    setEditing(false);
                  }}
                >
                  Save description
                </Button>
                <Button
                  onClick={() => {
                    setBody(issue.body);
                    setEditing(false);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="r-description" onDoubleClick={() => setEditing(true)}>
              {issue.body ? <RichText text={issue.body} /> : <span>Add description…</span>}
              <Button onClick={() => setEditing(true)} title="Edit issue description">Edit description</Button>
            </div>
          )}
          <Reactions scope="issue" id={id}/>
          <IssueResources id={id} onEdit={setLinkEditor}/>
          {files.length > 0 && <Attachments ownerId={id} />}
          <div className="r-inline r-detail-tools">
            <FileInput ownerId={id} />
            <Button onClick={() => onCreateChild(id)}>
              <I.PlusIcon />
              Add sub-issues
            </Button>
          </div>
          {children.length > 0 && (
            <div className="r-children">
              <h3>
                Sub-issues{" "}
                <span>
                  {children.filter((i) => i.status === "done").length}/
                  {children.length}
                </span>
              </h3>
              {children.map((child) => (
                <button key={child.id} onClick={() => onOpen(child.id)}>
                  <Status status={child.status} />
                  <span className="r-issue-id">{child.id}</span>
                  {child.title}
                </button>
              ))}
            </div>
          )}
          <IssueRelations id={id} onOpen={onOpen} onAdd={() => setRelationMode("related")} />
          {data.reviews
            .filter((r) => r.issueIds?.includes(id))
            .map((r) => (
              <a
                className="r-linked-review"
                href={`#/reviews/${r.id}`}
                key={r.id}
              >
                <I.ReviewsIcon />
                {r.title}
                <span>{r.status}</span>
              </a>
            ))}
          <div className="r-activity-heading">
            <h3>Activity</h3>
            <Button
              onClick={() =>
                patch(
                  { subscribed: !issue.subscribed },
                  issue.subscribed ? "unsubscribed" : "subscribed",
                )
              }
            >
              {issue.subscribed ? "Unsubscribe" : "Subscribe"}
            </Button>
          </div>
          <IssueActivity id={id} />
          {issue.status === "duplicate" && issue.duplicateOfId ? <p className="r-duplicate-guidance">This issue is a duplicate. <button onClick={() => onOpen(issue.duplicateOfId!)}>Comment on {issue.duplicateOfId}</button></p> : <form
            className="r-comment"
            onSubmit={(e) => {
              e.preventDefault();
              workspace.comment(id, comment);
              setComment("");
            }}
          >
            <RichEditor compact label="Leave a comment" placeholder="Leave a comment…" value={comment} onChange={setComment} attachmentOwnerId={id} onSubmit={body => { workspace.comment(id, body); setComment(""); }} />
            <footer>
              <FileInput ownerId={id} />
              <span className="r-push" />
              <Button type="submit" disabled={!comment.trim()}>
                Send
              </Button>
            </footer>
          </form>}
          {error && (
            <p role="alert" className="r-error">
              {error}
            </p>
          )}
        </div>
        <aside className="r-properties">
          <h3>Properties</h3>
          <label className="r-property">
            <Status status={issue.status} />
            <Choice
              label="Status"
              value={issue.status}
              options={ISSUE_STATUSES.map((s) => ({
                value: s,
                label: STATUS_LABEL[s],
                icon: <Status status={s} />,
              }))}
              onChange={(value) => {
                if (value === "duplicate") {
                  setTriageAction("duplicate");
                  setTriageValue("");
                } else
                  patch(
                    { status: value as IssueStatus },
                    `changed status to ${STATUS_LABEL[value as IssueStatus]}`,
                  );
              }}
            />
          </label>
          <label className="r-property">
            <I.PriorityIcon level={issue.priority} />
            <Choice
              label="Priority"
              value={String(issue.priority)}
              options={PRIORITY_LABEL.map((label, i) => ({
                value: String(i),
                label,
                icon: <I.PriorityIcon level={i as Priority} />,
              }))}
              onChange={(value) =>
                patch(
                  { priority: Number(value) as Priority },
                  "updated priority",
                )
              }
            />
          </label>
          <label className="r-property">
            <Avatar small name={issue.assignee} />
            <Choice
              label="Assignee"
              value={issue.assignee ?? ""}
              options={[
                { value: "", label: "Assign" },
                ...[
                  ...new Set([
                    data.settings.user,
                    ...memberNames,
                    ...data.issues.flatMap((i) =>
                      i.assignee ? [i.assignee] : [],
                    ),
                  ]),
                ].map((name) => ({
                  value: name,
                  label: name,
                  icon: <Avatar small name={name} />,
                })),
              ]}
              onChange={(value) =>
                patch({ assignee: value || null }, "updated assignee")
              }
            />
          </label>
          <label className="r-property">
            <I.CalendarIcon />
            <Choice
              label="Cycle"
              value={issue.cycleId ?? ""}
              options={[
                { value: "", label: "Add to cycle" },
                ...data.cycles.map((c) => ({
                  value: c.id,
                  label: c.name,
                  icon: <I.CalendarIcon />,
                })),
              ]}
              onChange={(value) =>
                patch({ cycleId: value || null }, "updated cycle")
              }
            />
          </label>
          <Field label="Estimate">
            <input
              type="number"
              min="0"
              step="0.5"
              value={issue.estimate ?? ""}
              placeholder="Unestimated"
              onChange={(e) => {
                const n = e.target.valueAsNumber;
                if (e.target.value === "" || (Number.isFinite(n) && n >= 0))
                  patch({ estimate: e.target.value === "" ? null : n });
              }}
            />
          </Field>
          <Field label="Due date">
            <input
              type="date"
              value={issue.dueDate ?? ""}
              onChange={(e) =>
                patch({ dueDate: e.target.value || null }, "updated due date")
              }
            />
          </Field>
          <h3>Labels</h3>
          <input
            aria-label="Issue labels"
            placeholder="Add labels, separated by commas"
            value={labelsDraft}
            onChange={event=>setLabelsDraft(event.target.value)}
            onBlur={(e) => {
              const labels = e.target.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
              if (labels.join() !== issue.labels.join())
                patch({ labels }, "updated labels");
            }}
          />
          <h3>Project</h3>
          <Choice
            label="Project"
            value={issue.projectId ?? ""}
            options={[
              { value: "", label: "Add to project" },
              ...data.projects.map((p) => ({
                value: p.id,
                label: p.name,
                icon: <I.CubeIcon />,
              })),
            ]}
            onChange={(value) =>
              patch({ projectId: value || null }, "updated project")
            }
          />
          <Choice
            label="Milestone"
            value={issue.milestoneId ?? ""}
            options={[
              { value: "", label: "Set milestone" },
              ...data.milestones
                .filter((m) => m.projectId === issue.projectId)
                .map((m) => ({ value: m.id, label: m.name })),
            ]}
            onChange={(value) =>
              patch({ milestoneId: value || null }, "updated milestone")
            }
          />
          <CanonicalIssue id={id} onOpen={onOpen} />
          <IssueDependencies id={id} onOpen={onOpen} />
          <h3>Parent issue</h3>
          <select
            aria-label="Parent issue"
            value={issue.parentId ?? ""}
            onChange={(e) =>
              patch(
                { parentId: e.target.value || null },
                "updated parent issue",
              )
            }
          >
            <option value="">No parent</option>
            {data.issues
              .filter((i) => i.id !== id)
              .map((i) => (
                <option key={i.id} value={i.id}>
                  {i.id} · {i.title}
                </option>
              ))}
          </select>
        </aside>
      </div>
      {triageAction && (
        <Dialog
          title={
            triageAction === "duplicate" ? "Mark as duplicate" : "Snooze issue"
          }
          onClose={() => setTriageAction(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (triageAction === "duplicate") {
                setDuplicateTarget(triageValue);
                setReverseDuplicate(false);
                setTriageAction(null);
                return;
              }
              triage(
                triageAction,
                triageValue
                  ? new Date(triageValue).toISOString()
                  : triageValue,
              );
            }}
          >
            {triageAction === "duplicate" ? (
              <Field label="Original issue">
                <select
                  autoFocus
                  required
                  value={triageValue}
                  onChange={(e) => setTriageValue(e.target.value)}
                >
                  <option value="">Choose an issue</option>
                  {data.issues
                    .filter((i) => i.id !== id && i.status !== "duplicate")
                    .map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.id} · {i.title}
                      </option>
                    ))}
                </select>
              </Field>
            ) : (
              <Field label="Remind me at">
                <input
                  autoFocus
                  required
                  type="datetime-local"
                  value={triageValue}
                  onChange={(e) => setTriageValue(e.target.value)}
                />
              </Field>
            )}
            {error && (
              <p className="r-error" role="alert">
                {error}
              </p>
            )}
            <footer>
              <Button onClick={() => setTriageAction(null)}>Cancel</Button>
              <Button primary type="submit" disabled={!triageValue}>
                Confirm
              </Button>
            </footer>
          </form>
        </Dialog>
      )}
    </div>
  );
}

export function FilterBuilder({
  value,
  onChange,
}: {
  value: CustomViewFilter;
  onChange: (filter: CustomViewFilter) => void;
}) {
  const data = useData();
  const mode = value.or ? "or" : "and";
  const conditions =
    value.or ??
    value.and ??
    Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .map(([key, v]) => ({ [key]: v }) as CustomViewFilter);
  const fields = [
    "query",
    "statuses",
    "priority",
    "projectId",
    "cycleId",
    "labels",
    "assignedToMe",
    "createdByMe",
    "subscribed",
  ] as const;
  const names: Record<(typeof fields)[number], string> = {
    query: "Text",
    statuses: "Status",
    priority: "Priority",
    projectId: "Project",
    cycleId: "Cycle",
    labels: "Label",
    assignedToMe: "Assigned to me",
    createdByMe: "Created by me",
    subscribed: "Subscribed",
  };
  const update = (next: CustomViewFilter[], nextMode = mode) =>
    onChange(next.length ? { [nextMode]: next } : {});
  const defaults = (key: (typeof fields)[number]): CustomViewFilter => ({
    [key]:
      key === "statuses"
        ? ["todo"]
        : key === "priority"
          ? 0
          : key === "labels"
            ? [""]
            : ["assignedToMe", "createdByMe", "subscribed"].includes(key)
              ? true
              : "",
  });
  return (
    <div className="r-filter-builder">
      <div className="r-inline">
        <span>Match</span>
        <select
          aria-label="Filter match mode"
          value={mode}
          onChange={(e) => update(conditions, e.target.value as "and" | "or")}
        >
          <option value="and">all conditions</option>
          <option value="or">any condition</option>
        </select>
      </div>
      {conditions.map((condition, index) => {
        const key = fields.find((k) => condition[k] !== undefined) ?? "query";
        const change = (next: CustomViewFilter) =>
          update(conditions.map((c, i) => (i === index ? next : c)));
        return (
          <div className="r-filter-condition" key={index}>
            <select
              aria-label={`Condition ${index + 1} field`}
              value={key}
              onChange={(e) => change(defaults(e.target.value as typeof key))}
            >
              {fields.map((f) => (
                <option key={f} value={f}>
                  {names[f]}
                </option>
              ))}
            </select>
            {key === "statuses" ? (
              <select
                aria-label={`Condition ${index + 1} value`}
                value={condition.statuses?.[0] ?? "todo"}
                onChange={(e) =>
                  change({ statuses: [e.target.value as IssueStatus] })
                }
              >
                {ISSUE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            ) : key === "priority" ? (
              <select
                aria-label={`Condition ${index + 1} value`}
                value={condition.priority ?? 0}
                onChange={(e) =>
                  change({ priority: Number(e.target.value) as Priority })
                }
              >
                {PRIORITY_LABEL.map((p, i) => (
                  <option key={p} value={i}>
                    {p}
                  </option>
                ))}
              </select>
            ) : key === "projectId" || key === "cycleId" ? (
              <select
                aria-label={`Condition ${index + 1} value`}
                value={String(condition[key] ?? "")}
                onChange={(e) => change({ [key]: e.target.value })}
              >
                <option value="">Any</option>
                {(key === "projectId" ? data.projects : data.cycles).map(
                  (item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ),
                )}
              </select>
            ) : ["assignedToMe", "createdByMe", "subscribed"].includes(key) ? (
              <span className="r-chip">is true</span>
            ) : (
              <input
                aria-label={`Condition ${index + 1} value`}
                value={
                  key === "labels"
                    ? (condition.labels?.[0] ?? "")
                    : (condition.query ?? "")
                }
                onChange={(e) =>
                  change(
                    key === "labels"
                      ? { labels: [e.target.value] }
                      : { query: e.target.value },
                  )
                }
              />
            )}
            <IconButton
              label={`Remove condition ${index + 1}`}
              onClick={() => update(conditions.filter((_, i) => i !== index))}
            >
              <I.CloseIcon />
            </IconButton>
          </div>
        );
      })}
      <Button onClick={() => update([...conditions, { query: "" }])}>
        <I.PlusIcon />
        Add condition
      </Button>
    </div>
  );
}
