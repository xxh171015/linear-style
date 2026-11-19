import { createPortal } from "react-dom";
import { useEffect, useRef, useState, type ReactNode } from "react";
import * as I from "./icons";
import { STATUS_LABEL } from "./kernel";
import { CATEGORY, formatDate } from "./workspace";
import { useData, useWorkspace } from "./context";
export { WorkspaceContext, useData, useAllData, useWorkspace } from "./context";
import type { Attachment, IssueStatus } from "./types";
export function Button({
  children,
  onClick,
  primary = false,
  disabled = false,
  title,
  className = "",
  type = "button",
  ...accessibility
}: {
  children: ReactNode;
  onClick?: () => void;
  primary?: boolean;
  disabled?: boolean;
  title?: string;
  className?: string;
  type?: "button" | "submit";
  "aria-pressed"?: boolean;
  "aria-label"?: string;
}) {
  return (
    <button
      {...accessibility}
      type={type}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`r-button ${primary ? "r-primary" : ""} ${className}`}
    >
      {children}
    </button>
  );
}
export function IconButton({
  label,
  onClick,
  children,
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="r-icon-button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
export function Status({ status }: { status: IssueStatus }) {
  const category = CATEGORY[status];
  return (
    <span className={`r-status r-state-${status}`} title={STATUS_LABEL[status]}>
      {category === "completed" ? (
        <I.StatusDoneIcon />
      ) : category === "started" ? (
        <I.StatusProgressIcon />
      ) : category === "canceled" ? (
        <I.StatusCanceledIcon />
      ) : status === "backlog" ? (
        <I.StatusBacklogIcon />
      ) : (
        <I.StatusTodoIcon />
      )}
    </span>
  );
}
export function Avatar({
  name,
  small = false,
}: {
  name?: string;
  small?: boolean;
}) {
  return (
    <span
      className={`r-avatar ${small ? "small" : ""} ${name ? "" : "unassigned"}`}
      title={name ?? "Unassigned"}
    >
      {name ? name.slice(0, 1) : <I.PersonIcon />}
    </span>
  );
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="r-field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function Empty({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="r-empty">
      <I.IssuesIcon />
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      {children}
    </div>
  );
}
export function Dialog({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const focusable = () =>
      Array.from(
        node?.querySelectorAll<HTMLElement>(
          'button:not([disabled]),input:not([disabled]),textarea,select,a[href],[tabindex="0"]',
        ) ?? [],
      ).filter((el) => el.offsetParent !== null);
    queueMicrotask(() => {
      (
        node?.querySelector<HTMLElement>("[autofocus]") ??
        node?.querySelector<HTMLElement>(
          'input:not([type="file"]):not([type="checkbox"]),textarea,select',
        ) ??
        focusable().find(
          (element) => element.getAttribute("aria-label") !== "Close dialog",
        ) ??
        node
      )?.focus();
    });
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        event.preventDefault();
        closeRef.current();
      }
      if (event.key === "Tab") {
        const elements = focusable();
        const first = elements[0],
          last = elements.at(-1);
        if (!elements.length) {
          event.preventDefault();
          node?.focus();
        } else if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("keydown", key, true);
      prev?.focus();
    };
  }, []);
  return (
    <div
      className="r-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`r-dialog ${wide ? "wide" : ""}`}
      >
        <header>
          <h2>{title}</h2>
          <IconButton label="Close dialog" onClick={onClose}>
            <I.CloseIcon />
          </IconButton>
        </header>
        {children}
      </div>
    </div>
  );
}
export function Attachments({ ownerId }: { ownerId: string }) {
  const workspace = useWorkspace(),
    data = useData();
  return (
    <div className="r-attachments">
      {data.attachments
        .filter((a) => a.ownerId === ownerId)
        .map((file) => (
          <AttachmentRow
            key={file.id}
            file={file}
            onRemove={() =>
              workspace.mutate((d) => {
                d.attachments = d.attachments.filter((a) => a.id !== file.id);
              })
            }
          />
        ))}
    </div>
  );
}
function AttachmentRow({
  file,
  onRemove,
}: {
  file: Attachment;
  onRemove: () => void;
}) {
  const ref = useRef<string>("");
  const [preview, setPreview] = useState("");
  useEffect(() => {
    if (!file.mime.startsWith("image/")) return;
    const url = URL.createObjectURL(file.blob);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file.blob, file.mime]);
  useEffect(
    () => () => {
      if (ref.current) URL.revokeObjectURL(ref.current);
    },
    [],
  );
  return (
    <div className="r-attachment">
      {preview ? <img src={preview} alt={file.name} /> : <I.DocsIcon />}
      <button
        onClick={() => {
          if (ref.current) URL.revokeObjectURL(ref.current);
          const url = URL.createObjectURL(file.blob);
          ref.current = url;
          const a = document.createElement("a");
          a.href = url;
          a.download = file.name;
          a.click();
        }}
      >
        {file.name}
      </button>
      <small>{Math.ceil(file.size / 1024)} KB</small>
      <IconButton label={`Remove ${file.name}`} onClick={onRemove}>
        <I.CloseIcon />
      </IconButton>
    </div>
  );
}
export function FileInput({ ownerId }: { ownerId: string }) {
  const workspace = useWorkspace();
  return (
    <label className="r-file-button" title="Attach images, files, or videos">
      <I.ImportIcon />
      <span className="sr-only">Attach images, files, or videos</span>
      <input
        type="file"
        multiple
        onChange={(e) => {
          workspace.addAttachments(ownerId, Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
    </label>
  );
}
export function DateLabel({ value }: { value?: string }) {
  return <time title={value}>{formatDate(value) || "—"}</time>;
}
export { RichText, RichEditor } from "./rich-editor";

export function Choice({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string; icon?: ReactNode }[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(""),
    [index, setIndex] = useState(0);
  const anchor = useRef<HTMLButtonElement>(null),
    menu = useRef<HTMLDivElement>(null),
    input = useRef<HTMLInputElement>(null);
  const filtered = options.filter((option) =>
    option.label.toLowerCase().includes(query.toLowerCase()),
  );
  const rect = anchor.current?.getBoundingClientRect();
  const choose = (next: string) => {
    onChange(next);
    setOpen(false);
    anchor.current?.focus();
  };
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setIndex(0);
    queueMicrotask(() => input.current?.focus());
    const outside = (event: MouseEvent) => {
      if (
        !menu.current?.contains(event.target as Node) &&
        !anchor.current?.contains(event.target as Node)
      )
        setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Tab") {
        const nodes = Array.from(
          menu.current?.querySelectorAll<HTMLElement>("input,button") ?? [],
        );
        const first = nodes[0],
          last = nodes.at(-1);
        if (
          (event.shiftKey && document.activeElement === first) ||
          (!event.shiftKey && document.activeElement === last)
        ) {
          event.preventDefault();
          event.stopPropagation();
          (event.shiftKey ? last : first)?.focus();
        }
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        anchor.current?.focus();
      }
    };
    document.addEventListener("mousedown", outside);
    window.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("mousedown", outside);
      window.removeEventListener("keydown", escape, true);
    };
  }, [open]);
  return (
    <div className="r-choice">
      <button
        type="button"
        ref={anchor}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="r-choice-trigger"
        onClick={() => setOpen(!open)}
      >
        <span>
          {options.find((option) => option.value === value)?.label ?? label}
        </span>
        <I.ChevronDownIcon />
      </button>
      {open &&
        createPortal(
          <div
            ref={menu}
            className="r-choice-menu"
            style={{
              left: Math.max(
                8,
                Math.min(rect?.left ?? 0, window.innerWidth - 278),
              ),
              top:
                Math.max(
                  8,
                  Math.min(rect?.bottom ?? 40, window.innerHeight - 330),
                ) + 5,
            }}
          >
            <input
              ref={input}
              aria-label={`Search ${label}`}
              placeholder={`${label}…`}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setIndex(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                  e.preventDefault();
                  setIndex((i) =>
                    Math.max(
                      0,
                      Math.min(
                        filtered.length - 1,
                        i + (e.key === "ArrowDown" ? 1 : -1),
                      ),
                    ),
                  );
                }
                if (e.key === "Enter" && filtered[index]) {
                  e.preventDefault();
                  choose(filtered[index].value);
                }
              }}
            />
            <div role="listbox" aria-label={label}>
              {filtered.map((option, i) => (
                <button
                  type="button"
                  role="option"
                  aria-selected={option.value === value}
                  className={i === index ? "active" : ""}
                  key={option.value}
                  onMouseEnter={() => setIndex(i)}
                  onClick={() => choose(option.value)}
                >
                  {option.icon}
                  <span>{option.label}</span>
                  {option.value === value && <I.CheckTinyIcon />}
                </button>
              ))}
              {!filtered.length && <p>No results found</p>}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
