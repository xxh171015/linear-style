import type { ReactNode } from "react";
import {
  CalendarIcon,
  CubeIcon,
  DocsIcon,
  HomeIcon,
  IssuesIcon,
  LabelIcon,
  PersonIcon,
  PriorityIcon,
  SparkIcon,
  StatusDoneIcon,
  StatusProgressIcon,
  StatusTodoIcon,
  ViewsIcon,
} from "./icons";
import { HEALTH_LABEL, PRIORITY_LABEL, PROJECT_STATUS_LABEL, matchesView, milestoneStats, projectScope } from "./logic";
import type {
  Activity,
  CustomView,
  Initiative,
  Issue,
  Project,
  ProjectHealth,
  ProjectMilestone,
  ProjectStatus,
  ProjectTab,
} from "./types";

function HealthDot({ health }: { health?: ProjectHealth }) {
  const tone = health ?? "onTrack";
  return <span className={`health-dot ${tone}`} />;
}

function ProjectStatusMark({ status }: { status: ProjectStatus }) {
  if (status === "started") return <StatusProgressIcon />;
  if (status === "completed") return <StatusDoneIcon />;
  return <StatusTodoIcon />;
}

export function ProjectList({
  projects,
  issues,
  onOpen,
}: {
  projects: Project[];
  issues: Issue[];
  onOpen: (id: string) => void;
}) {
  return (
    <ul className="entity-list">
      {projects.map((project) => {
        const scoped = issues.filter((issue) => issue.projectId === project.id);
        const progress = projectScope(scoped);
        return (
          <li key={project.id}>
            <button type="button" className="entity-row" onClick={() => onOpen(project.id)}>
              <CubeIcon />
              <span className="entity-title">{project.name}</span>
              <span className="chip">{PROJECT_STATUS_LABEL[project.status]}</span>
              {project.health ? (
                <span className="health-chip">
                  <HealthDot health={project.health} />
                  {HEALTH_LABEL[project.health]}
                </span>
              ) : null}
              <span className="entity-meta">{project.lead}</span>
              <span className="issue-date">{project.targetDate}</span>
              <span className="count">{Math.round(progress.ratio * 100)}%</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function ViewList({
  views,
  issues,
  onOpen,
}: {
  views: CustomView[];
  issues: Issue[];
  onOpen: (id: string) => void;
}) {
  return (
    <ul className="entity-list">
      {views.map((view) => {
        const count = issues.filter((issue) => matchesView(issue, view)).length;
        return (
          <li key={view.id}>
            <button type="button" className="entity-row" onClick={() => onOpen(view.id)}>
              {view.icon === "project" ? <CubeIcon /> : view.icon === "focus" ? <SparkIcon /> : <ViewsIcon />}
              <span className="entity-title">{view.name}</span>
              <span className="entity-meta">{view.description}</span>
              <span className="chip">{view.shared ? "Shared" : "Private"}</span>
              <span className="chip">{view.grouping}</span>
              <span className="count">{count}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function ProjectPage({
  project,
  issues,
  milestones,
  initiatives,
  activity,
  tab,
  onTab,
  onOpenIssue,
  onCycleStatus,
  onCyclePriority,
}: {
  project: Project;
  issues: Issue[];
  milestones: ProjectMilestone[];
  initiatives: Initiative[];
  activity: Activity[];
  tab: ProjectTab;
  onTab: (tab: ProjectTab) => void;
  onOpenIssue: (id: string) => void;
  onCycleStatus: () => void;
  onCyclePriority: () => void;
}) {
  const scoped = issues.filter((issue) => issue.projectId === project.id);
  const progress = projectScope(scoped);
  const latest = project.updates[0];
  const linked = initiatives.filter((item) => project.initiativeIds.includes(item.id));
  const ownedMilestones = milestones
    .filter((milestone) => milestone.projectId === project.id)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const uncategorized = scoped.filter((issue) => !issue.milestoneId).length;

  return (
    <div className="project-page">
      <div className="project-main">
        <div className="project-hero">
          <div className="project-title-row">
            <span className="project-mark">
              <CubeIcon />
            </span>
            <h2>{project.name}</h2>
          </div>
          <p className="project-kicker">{project.description}</p>
          <div className="project-inline">
            <span className="props-label">Properties</span>
            <button className="prop-chip" type="button" onClick={onCycleStatus}>
              <ProjectStatusMark status={project.status} />
              {PROJECT_STATUS_LABEL[project.status]}
            </button>
            <button className="prop-chip" type="button" onClick={onCyclePriority}>
              <PriorityIcon level={project.priority} />
              {PRIORITY_LABEL[project.priority]}
            </button>
            <span className="prop-chip">
              <span className="row-avatar">{(project.lead ?? "?").slice(0, 1)}</span>
              {project.lead}
            </span>
            <span className="prop-chip">
              <CalendarIcon />
              {project.startDate} → {project.targetDate}
            </span>
            <span className="prop-chip">
              <HomeIcon />
              {project.teamKeys.join(", ")}
            </span>
          </div>
          <div className="project-inline">
            <span className="props-label">Initiatives</span>
            {linked.map((item) => (
              <span className="chip" key={item.id}>
                {item.name}
              </span>
            ))}
            <span className="props-label">Resources</span>
            {project.resources.map((item) => (
              <span className="chip" key={item.id}>
                <DocsIcon /> {item.title}
              </span>
            ))}
          </div>
        </div>

        <div className="tabs project-tabs">
          {(["overview", "activity", "issues"] as const).map((item) => (
            <button key={item} type="button" className={item === tab ? "tab active" : "tab"} onClick={() => onTab(item)}>
              {item === "overview" ? "Overview" : item === "activity" ? "Activity" : "Issues"}
            </button>
          ))}
        </div>

        {tab === "overview" ? (
          <div className="project-overview">
            {latest ? (
              <div className="update-card">
                <div className="update-head">
                  <HealthDot health={latest.health} />
                  <strong>{HEALTH_LABEL[latest.health]}</strong>
                  <span className="row-avatar">{latest.author.slice(0, 1)}</span>
                  <span className="issue-date">{latest.author}</span>
                  <span className="issue-date">{latest.time}</span>
                </div>
                <p>{latest.body}</p>
              </div>
            ) : null}

            <section className="md-block">
              <h3>本周进展</h3>
              <ul>
                {project.weekProgress.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
            <section className="md-block">
              <h3>下周重点</h3>
              <ol>
                {project.nextFocus.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ol>
            </section>
            <section className="md-block">
              <h3>风险</h3>
              <p>{project.risks}</p>
            </section>
          </div>
        ) : null}

        {tab === "activity" ? (
          <ul className="activity">
            {activity.length === 0 ? <p className="empty-copy">No activity yet</p> : null}
            {activity.map((item) => (
              <li key={item.id} className="activity-row">
                <p>{item.text}</p>
                <span className="issue-date">{item.time}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {tab === "issues" ? (
          <ul className="entity-list">
            {scoped.map((issue) => (
              <li key={issue.id}>
                <button type="button" className="entity-row" onClick={() => onOpenIssue(issue.id)}>
                  <IssuesIcon />
                  <span className="issue-id">{issue.id}</span>
                  <span className="entity-title">{issue.title}</span>
                  {issue.labels[0] ? <span className="chip">{issue.labels[0]}</span> : null}
                  <span className="issue-date">{issue.date}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <aside className="project-rail">
        <p className="props-label">Properties</p>
        <RailRow label="Status" onClick={onCycleStatus}>
          <ProjectStatusMark status={project.status} />
          {PROJECT_STATUS_LABEL[project.status]}
        </RailRow>
        <RailRow label="Priority" onClick={onCyclePriority}>
          <PriorityIcon level={project.priority} />
          {PRIORITY_LABEL[project.priority]}
        </RailRow>
        <RailRow label="Lead">
          <span className="row-avatar">{(project.lead ?? "?").slice(0, 1)}</span>
          {project.lead ?? "Add lead"}
        </RailRow>
        <RailRow label="Members">
          <PersonIcon />
          {project.memberIds.length ? `${project.memberIds.length}` : "Add members"}
        </RailRow>
        <RailRow label="Dates">
          <CalendarIcon />
          {project.startDate} → {project.targetDate}
        </RailRow>
        <RailRow label="Teams">
          <HomeIcon />
          {project.teamKeys.join(", ")}
        </RailRow>
        <RailRow label="Slack">{project.slackChannel ?? "Slack channel"}</RailRow>
        <p className="props-label">Initiatives</p>
        {linked.map((item) => (
          <RailRow key={item.id} label="">
            <SparkIcon />
            {item.name}
          </RailRow>
        ))}
        <p className="props-label">Labels</p>
        <RailRow label="">
          <LabelIcon />
          {project.labels[0] ?? "Add label"}
        </RailRow>

        <p className="props-label">Milestones</p>
        {ownedMilestones.map((milestone) => {
          const stats = milestoneStats(milestone, scoped);
          return (
            <div className="milestone" key={milestone.id}>
              <span className="milestone-name">{milestone.name}</span>
              <span className="issue-date">
                {stats.percent}% of {stats.total}
              </span>
              <span className="issue-date">{milestone.targetDate}</span>
              <span className="milestone-bar">
                <span style={{ width: `${stats.percent}%` }} />
              </span>
            </div>
          );
        })}
        <div className="milestone muted">
          <span className="milestone-name">No milestone</span>
          <span className="issue-date">{uncategorized ? `${uncategorized}` : ""}</span>
        </div>

        <p className="props-label">Progress</p>
        <div className="progress-legend">
          <span>
            <i className="swatch scope" /> Scope {progress.scope}
          </span>
          <span>
            <i className="swatch started" /> Started {progress.started}
          </span>
          <span>
            <i className="swatch completed" /> Completed {progress.completed}
          </span>
        </div>
        <div className="progress-bar">
          <span className="completed" style={{ width: `${progress.ratio * 100}%` }} />
        </div>
      </aside>
    </div>
  );
}

function RailRow({ label, children, onClick }: { label: string; children: ReactNode; onClick?: () => void }) {
  const inner = (
    <>
      {label ? <span className="rail-label">{label}</span> : null}
      <span className="rail-value">{children}</span>
    </>
  );
  if (onClick) {
    return (
      <button className="rail-row" type="button" onClick={onClick}>
        {inner}
      </button>
    );
  }
  return <div className="rail-row">{inner}</div>;
}
