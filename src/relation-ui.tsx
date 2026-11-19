import { useEffect, useId, useRef, useState } from "react";
import * as I from "./icons";
import type { IssueCreationRelation } from "./types";
import {
  Button,
  Dialog,
  Empty,
  IconButton,
  Status,
  useData,
  useWorkspace,
} from "./ui";
import {
  relationsFor,
  RELATION_LABEL,
  type IssueRelationMode,
} from "./relations";

export function IssueRelationMenu({
  onChoose,
  onDelete,
  onCreate,
  onHistory,
  onCopyLink,
  onMakeCopy,
  onRemind,
  onAddLink,
  onAddDocument,
  onSubscribe,
  subscribed,
  onFavorite,
  favorited,
}: {
  onChoose: (mode: IssueRelationMode) => void;
  onDelete?: () => void;
  onHistory?:()=>void;
  onCreate?: (mode: IssueCreationRelation["mode"]) => void;
  onCopyLink?: () => void;
  onMakeCopy?: () => void;
  onRemind?: () => void;
  onAddLink?: () => void;
  onAddDocument?: () => void;
  onSubscribe?: () => void;
  subscribed?: boolean;
  onFavorite?: () => void;
  favorited?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [submenu, setSubmenu] = useState<"mark" | "create" | null>(null);
  const anchor = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    anchor.current?.querySelector<HTMLButtonElement>('[role="menu"] button')?.focus();
    const outside = (event: MouseEvent) => {
      if (!anchor.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        event.preventDefault();
        if (submenu) setSubmenu(null);
        else setOpen(false);
      }
    };
    document.addEventListener("mousedown", outside);
    window.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("mousedown", outside);
      window.removeEventListener("keydown", escape, true);
    };
  }, [open, submenu]);
  return (
    <div ref={anchor} className="r-menu-anchor r-relation-menu-anchor">
      <IconButton
        label="Issue options"
        onClick={() => {
          setOpen(!open);
          setSubmenu(null);
        }}
      >
        <I.MoreIcon />
      </IconButton>
      {open && (
        <div
          className="r-popover r-relation-menu"
          role="menu"
          aria-label="Issue options"
          onKeyDown={(event) => {
            const buttons = Array.from(
              event.currentTarget.querySelectorAll<HTMLButtonElement>("button"),
            );
            const current = buttons.indexOf(
              document.activeElement as HTMLButtonElement,
            );
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              buttons[
                (current +
                  (event.key === "ArrowDown" ? 1 : -1) +
                  buttons.length) %
                  buttons.length
              ]?.focus();
            }
            if (event.key === "ArrowRight") {
              event.preventDefault();
              const next = document.activeElement?.getAttribute("data-submenu");
              if (next === "mark" || next === "create") setSubmenu(next);
            }
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              setSubmenu(null);
            }
          }}
        >
          {!submenu ? (
            <>
              {onAddLink && <button role="menuitem" onClick={()=>{setOpen(false);onAddLink();}}>Add link…</button>}
              {onAddDocument && <button role="menuitem" onClick={()=>{setOpen(false);onAddDocument();}}>Add document</button>}
              {onCopyLink && <button role="menuitem" onClick={() => { setOpen(false); onCopyLink(); }}>Copy link</button>}
              {onSubscribe && <button role="menuitem" onClick={() => { setOpen(false); onSubscribe(); }}>{subscribed ? "Unsubscribe" : "Subscribe"}</button>}
              {onFavorite && <button role="menuitem" onClick={() => { setOpen(false); onFavorite(); }}>{favorited ? "Remove from favorites" : "Add to favorites"}</button>}
              {onCreate && <button role="menuitem" data-submenu="create" aria-haspopup="menu" onClick={() => setSubmenu("create")}>Create related <I.ChevronIcon /></button>}
              <button role="menuitem" data-submenu="mark" aria-haspopup="menu" onClick={() => setSubmenu("mark")}>Mark as <I.ChevronIcon /></button>
              {onMakeCopy && <button role="menuitem" onClick={() => { setOpen(false); onMakeCopy(); }}>Make a copy…</button>}
              {onRemind && <button role="menuitem" onClick={() => { setOpen(false); onRemind(); }}>Remind me <span className="r-push"/>⇧ H</button>}
              {onHistory && <button role="menuitem" onClick={()=>{setOpen(false);onHistory();}}>Show description history</button>}
              {onDelete && <button role="menuitem" onClick={() => { setOpen(false); onDelete(); }}>Delete</button>}
            </>
          ) : submenu === "create" ? (
            <>
              <button className="r-muted" onClick={() => setSubmenu(null)}>‹ Create related</button>
              {([
                ["related", "Issue…"], ["parent", "Sub-issue…"], ["child", "Parent issue…"],
                ["blocking", "Blocked issue…"], ["blocked-by", "Blocking issue…"],
              ] as const).map(([mode,label]) => <button role="menuitem" key={mode} onClick={() => {
                setOpen(false); onCreate?.(mode);
              }}>{label}</button>)}
            </>
          ) : (
            <>
              <button className="r-muted" onClick={() => setSubmenu(null)}>
                ‹ Mark as
              </button>
              {(Object.keys(RELATION_LABEL) as IssueRelationMode[]).map(
                (mode) => (
                  <button
                    role="menuitem"
                    key={mode}
                    onClick={() => {
                      setOpen(false);
                      onChoose(mode);
                    }}
                  >
                    {RELATION_LABEL[mode]}
                  </button>
                ),
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function RelationPicker({
  id,
  mode,
  onClose,
  onCreate,
}: {
  id: string;
  mode: IssueRelationMode;
  onClose: () => void;
  onCreate?: (mode: "related" | "blocking" | "blocked-by") => void;
}) {
  const data = useData(),
    workspace = useWorkspace();
  const [query, setQuery] = useState(""),
    [index, setIndex] = useState(0),
    [error, setError] = useState(""),
    [duplicateTarget, setDuplicateTarget] = useState<string | null>(null),
    [reverse, setReverse] = useState(false);
  const matches = data.issues.filter(
    (issue) =>
      issue.id !== id &&
      `${issue.id} ${issue.title}`.toLowerCase().includes(query.toLowerCase()),
  );
  const label = RELATION_LABEL[mode].replace("…", "");
  const listId = useId(),
    list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    (
      list.current?.children[index] as HTMLElement | undefined
    )?.scrollIntoView?.({ block: "nearest" });
  }, [index, query]);
  const apply = (targetId?: string) => {
    if (!targetId) return;
    try {
      if (mode === "duplicate") {
        setDuplicateTarget(targetId);
        return;
      }
      workspace.linkIssues(id, targetId, mode);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  if (duplicateTarget) return <DuplicateConfirmation
    sourceId={reverse ? duplicateTarget : id}
    targetId={reverse ? id : duplicateTarget}
    onSwitch={() => setReverse(value => !value)}
    onClose={onClose}
    onConfirm={() => {
      workspace.linkIssues(reverse ? duplicateTarget : id, reverse ? id : duplicateTarget, "duplicate");
      onClose();
    }}
  />;
  return (
    <Dialog wide title={`Mark as ${label.toLowerCase()}`} onClose={onClose}>
      <div className="r-relation-picker">
        <input
          autoFocus
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={
            matches[index] ? `${listId}-${index}` : undefined
          }
          aria-label="Search for issue to relate"
          placeholder={`Search for issue to mark ${label.toLowerCase()}…`}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIndex(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              setIndex((value) =>
                Math.max(
                  0,
                  Math.min(
                    matches.length - 1,
                    value + (e.key === "ArrowDown" ? 1 : -1),
                  ),
                ),
              );
            }
            if (e.key === "Enter") {
              e.preventDefault();
              apply(matches[index]?.id);
            }
          }}
        />
        <div ref={list} id={listId} role="listbox" aria-label="Matching issues">
          {matches.map((issue, i) => (
            <button
              type="button"
              key={issue.id}
              role="option"
              id={`${listId}-${i}`}
              aria-selected={index === i}
              className={index === i ? "selected" : ""}
              onClick={() => setIndex(i)}
              onDoubleClick={() => apply(issue.id)}
            >
              <Status status={issue.status} />
              <span className="r-issue-id">{issue.id}</span>
              <span>{issue.title}</span>
            </button>
          ))}
        </div>
        {!matches.length && <Empty title="No matching issues" />}
        {onCreate && (mode === "related" || mode === "blocking" || mode === "blocked-by") &&
          <Button onClick={() => onCreate(mode)}><I.PlusIcon />{mode === "blocked-by" ? "Create new blocking issue" : mode === "blocking" ? "Create new blocked issue" : "Create new related issue"}</Button>}
        {error && (
          <p className="r-error" role="alert">
            {error}
          </p>
        )}
        <footer>
          <Button onClick={onClose}>Cancel</Button>
          <span className="r-push" />
          <Button
            primary
            disabled={!matches[index]}
            onClick={() => apply(matches[index]?.id)}
          >
            Mark as {label.toLowerCase()}
          </Button>
        </footer>
      </div>
    </Dialog>
  );
}

export function IssueRelations({
  id,
  onOpen,
  onAdd,
}: {
  id: string;
  onOpen: (id: string) => void;
  onAdd: () => void;
}) {
  const data = useData(),
    workspace = useWorkspace();
  const [error, setError] = useState("");
  const links = relationsFor(data.relations, "issue", id).filter(
    (item) => item.relation.type === "related",
  );
  const duplicates = [
    ...data.issues
      .filter((issue) => issue.duplicateOfId === id)
      .map((issue) => ({ issue, label: "Duplicate", ownerId: issue.id })),
  ];
  if (!links.length && !duplicates.length) return null;
  return (
    <section className="r-relations" aria-label="Issue relationships">
      <div className="r-inline">
        <h3>Relations</h3>
        <span className="r-push" />
        <Button onClick={onAdd}>
          <I.PlusIcon />
          Add relation
        </Button>
      </div>
      {links.map(({ relation, otherId, label }) => {
        const issue = data.issues.find((item) => item.id === otherId);
        if (!issue) return null;
        return (
          <div key={relation.id} className="r-relation-row">
            <span className="r-relation-type">{label}</span>
            <button onClick={() => onOpen(issue.id)}>
              <Status status={issue.status} />
              <span className="r-issue-id">{issue.id}</span>
              <span>{issue.title}</span>
            </button>
            <IconButton
              label={`Remove ${label.toLowerCase()} ${otherId}`}
              onClick={() => {
                try {
                  workspace.removeRelation(relation.id);
                  setError("");
                } catch (e) {
                  setError(e instanceof Error ? e.message : String(e));
                }
              }}
            >
              <I.CloseIcon />
            </IconButton>
          </div>
        );
      })}
      {duplicates.map(({ issue, label, ownerId }) => (
        <div className="r-relation-row" key={ownerId}>
          <span className="r-relation-type">{label}</span>
          <button onClick={() => onOpen(issue.id)}>
            <Status status={issue.status} />
            <span className="r-issue-id">{issue.id}</span>
            {issue.title}
          </button>
          <IconButton
            label={`Remove ${label.toLowerCase()} ${issue.id}`}
            onClick={() => {
              try {
                workspace.updateIssue(
                  ownerId,
                  { duplicateOfId: null },
                  `removed duplicate relationship with ${ownerId === id ? issue.id : id}`,
                );
                setError("");
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              }
            }}
          >
            <I.CloseIcon />
          </IconButton>
        </div>
      ))}
      {!links.length && !duplicates.length && (
        <p className="r-muted">No related issues</p>
      )}
      {error && (
        <p role="alert" className="r-error">
          {error}
        </p>
      )}
    </section>
  );
}

export function IssueDependencies({
  id,
  onOpen,
}: {
  id: string;
  onOpen: (id: string) => void;
}) {
  const data = useData(),
    workspace = useWorkspace();
  const [error, setError] = useState("");
  useEffect(() => setError(""), [id]);
  const current = data.issues.find(issue => issue.id === id);
  const links = relationsFor(data.relations, "issue", id).filter(
    (item) => item.relation.type === "blocks",
  ).map(item => ({ ...item, label: item.label === "Blocked by" && current?.status === "done" ? "Related" : item.label }));
  if (!links.length) return null;
  return (
    <section className="r-issue-dependencies" aria-label="Issue dependencies">
      {["Blocked by", "Blocking", "Related"].map((label) => {
        const items = links.filter((item) => item.label === label);
        if (!items.length) return null;
        return (
          <div key={label}>
            <h3>{label}</h3>
            {items.map(({ relation, otherId }) => {
              const issue = data.issues.find((item) => item.id === otherId);
              if (!issue) return null;
              return (
                <div className="r-dependency-property" key={relation.id}>
                  <button
                    onClick={() => onOpen(issue.id)}
                    title={`${issue.id} · ${issue.title}`}
                    aria-label={`${issue.id} ${issue.title}`}
                  >
                    <Status status={issue.status} />
                    <span>{issue.title}</span>
                  </button>
                  <IconButton
                    label={`Remove ${label.toLowerCase()} ${issue.id}`}
                    onClick={() => {
                      try {
                        workspace.removeRelation(relation.id);
                        setError("");
                      } catch (e) {
                        setError(e instanceof Error ? e.message : String(e));
                      }
                    }}
                  >
                    <I.CloseIcon />
                  </IconButton>
                </div>
              );
            })}
          </div>
        );
      })}
      {error && (
        <p className="r-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

export function DuplicateConfirmation({ sourceId, targetId, onSwitch, onClose, onConfirm }: {
  sourceId: string; targetId: string; onSwitch: () => void; onClose: () => void; onConfirm: () => void;
}) {
  const data = useData();
  const [error, setError] = useState("");
  const source = data.issues.find(issue => issue.id === sourceId);
  const target = data.issues.find(issue => issue.id === targetId);
  return <Dialog title="Mark as duplicate" onClose={onClose}>
    <div className="r-duplicate-confirmation">
      <p>Mark this issue as a duplicate of another issue.</p>
      <div className="r-duplicate-card"><span className="r-muted">Duplicate issue</span><strong>{sourceId} · {source?.title}</strong></div>
      <Button onClick={() => { onSwitch(); setError(""); }}>Switch direction</Button>
      <div className="r-duplicate-card"><span className="r-muted">Canonical issue</span><strong>{targetId} · {target?.title}</strong></div>
      {error && <p role="alert" className="r-error">{error}</p>}
      <footer><Button onClick={onClose}>Cancel</Button><span className="r-push" /><Button primary disabled={!source || !target} onClick={() => {
        try { onConfirm(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
      }}>Mark as duplicate</Button></footer>
    </div>
  </Dialog>;
}

export function CanonicalIssue({ id, onOpen }: { id: string; onOpen: (id: string) => void }) {
  const data = useData();
  const current = data.issues.find(issue => issue.id === id);
  const canonical = current?.status === "duplicate" && data.issues.find(issue => issue.id === current.duplicateOfId);
  if (!canonical) return null;
  return <section className="r-canonical-issue" aria-label="Canonical issue"><h3>Duplicate of</h3>
    <button onClick={() => onOpen(canonical.id)}><Status status={canonical.status} /><span>{canonical.id} · {canonical.title}</span></button>
  </section>;
}
