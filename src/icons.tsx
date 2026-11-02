import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function I(props: IconProps) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    />
  );
}

export function InboxIcon(props: IconProps) {
  return (
    <I {...props}>
      <path d="M2.6 9.1 4.2 4.6h7.6l1.6 4.5" />
      <path d="M2.6 9.1h2.3l.85 1.55h4.5l.85-1.55h2.3v2.15a1.15 1.15 0 0 1-1.15 1.15h-8.5A1.15 1.15 0 0 1 2.6 11.25V9.1Z" />
    </I>
  );
}

export function IssuesIcon(props: IconProps) {
  return (
    <I {...props}>
      <path d="M6.1 3.4H3.4v2.7" />
      <path d="M9.9 3.4h2.7v2.7" />
      <path d="M12.6 9.9v2.7H9.9" />
      <path d="M6.1 12.6H3.4V9.9" />
    </I>
  );
}

export function ReviewsIcon(props: IconProps) {
  return (
    <I {...props}>
      <circle cx="4.35" cy="4.35" r="1.4" />
      <circle cx="4.35" cy="11.65" r="1.4" />
      <circle cx="11.65" cy="8" r="1.4" />
      <path d="M4.35 5.75v4.5" />
      <path d="M5.6 5.15c1.85.35 4.35 1.05 6 2.85" />
    </I>
  );
}

export function AgentIcon(props: IconProps) {
  return (
    <I {...props}>
      <path d="M2.7 8.6 13.3 3.3 8.2 13.3 7.15 8.95Z" />
      <path d="M7.15 8.95 13.3 3.3" />
    </I>
  );
}

export function CubeIcon(props: IconProps) {
  return (
    <I {...props}>
      <path d="M8 2.35 13.15 5.3v5.55L8 13.65 2.85 10.85V5.3L8 2.35Z" />
      <path d="M8 13.65V8.05M8 8.05 2.85 5.3M8 8.05l5.15-2.75" />
    </I>
  );
}

export function HistoryIcon(props: IconProps) {
  return (
    <I {...props}>
      <path d="M3.2 8.2a4.8 4.8 0 1 0 1.35-3.35" />
      <path d="M3.2 3.6v3.1h3.1" />
      <path d="M8 5.6V8l1.7 1.2" />
    </I>
  );
}

export function FolderIcon(props: IconProps) {
  return (
    <I {...props}>
      <path d="M3 5.5V12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1H8L6.7 4.6A1 1 0 0 0 6 4.3H4a1 1 0 0 0-1 1.2Z" />
    </I>
  );
}

export function ViewsIcon(props: IconProps) {
  return (
    <I {...props}>
      <rect x="2.8" y="2.8" width="4.3" height="4.3" rx="1" />
      <rect x="8.9" y="2.8" width="4.3" height="4.3" rx="1" />
      <rect x="2.8" y="8.9" width="4.3" height="4.3" rx="1" />
      <rect x="8.9" y="8.9" width="4.3" height="4.3" rx="1" />
    </I>
  );
}

export function LoopsIcon(props: IconProps) {
  return (
    <I {...props}>
      <rect x="2.7" y="2.7" width="7.3" height="7.3" rx="1.7" />
      <rect x="6" y="6" width="7.3" height="7.3" rx="1.7" />
    </I>
  );
}

export function MoreIcon(props: IconProps) {
  return (
    <I {...props}>
      <circle cx="4" cy="8" r="1" fill="currentColor" stroke="none" />
      <circle cx="8" cy="8" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="8" r="1" fill="currentColor" stroke="none" />
    </I>
  );
}

export function HomeIcon(props: IconProps) {
  return (
    <I {...props}>
      <path d="M3 7.1 8 3.3l5 3.8V13a.8.8 0 0 1-.8.8H3.8A.8.8 0 0 1 3 13V7.1Z" />
    </I>
  );
}

export function ImportIcon(props: IconProps) {
  return (
    <I {...props}>
      <path d="M8 3.4v6.6M5.4 7.4 8 10l2.6-2.6" />
      <path d="M3.4 12.6h9.2" />
    </I>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <I {...props}>
      <path d="M8 3.6v8.8M3.6 8h8.8" />
    </I>
  );
}

export function GitHubIcon(props: IconProps) {
  return (
    <I {...props}>
      <path d="M10.2 13.5c.2-1 .1-1.7 0-2.1 1.7-.2 3.3-1 3.3-4a3 3 0 0 0-.8-2.1 2.8 2.8 0 0 0-.1-2.1s-.7-.2-2.2.8a7.4 7.4 0 0 0-4.8 0c-1.5-1-2.2-.8-2.2-.8a2.8 2.8 0 0 0-.1 2.1 3 3 0 0 0-.8 2.1c0 3 1.6 3.8 3.3 4-.1.4-.2 1.1 0 2.1" />
    </I>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <I {...props}>
      <circle cx="7" cy="7" r="3.15" />
      <path d="m9.45 9.45 3.05 3.05" />
    </I>
  );
}

export function ComposeIcon(props: IconProps) {
  return (
    <I {...props}>
      <rect x="3.3" y="3.3" width="9.4" height="9.4" rx="2.1" />
      <path d="M7 10.6 11.1 6.5" />
      <path d="m10.2 5.6 1.2 1.2" />
    </I>
  );
}

export function ChevronIcon(props: IconProps) {
  return (
    <I {...props} width={12} height={12} viewBox="0 0 12 12">
      <path d="M4 3.5 7.5 6 4 8.5" />
    </I>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <I {...props} width={11} height={11} viewBox="0 0 12 12">
      <path d="M3.4 4.6 6 7.6 8.6 4.6" />
    </I>
  );
}

export function BackIcon(props: IconProps) {
  return (
    <I {...props}>
      <path d="M9.6 3.6 5.2 8l4.4 4.4" />
    </I>
  );
}

export function ForwardIcon(props: IconProps) {
  return (
    <I {...props}>
      <path d="M6.4 3.6 10.8 8 6.4 12.4" />
    </I>
  );
}

export function CalendarIcon(props: IconProps) {
  return (
    <I {...props}>
      <rect x="3" y="4.4" width="10" height="8.6" rx="1.4" />
      <path d="M3 7.1h10M6 3.4v2M10 3.4v2" />
    </I>
  );
}

export function FilterIcon(props: IconProps) {
  return (
    <I {...props}>
      <path d="M3.2 4h9.6L9.4 8.4v3.3L6.6 13V8.4L3.2 4Z" />
    </I>
  );
}

export function DisplayIcon(props: IconProps) {
  return (
    <I {...props}>
      <path d="M3.4 5h9.2M3.4 8h9.2M3.4 11h6" />
    </I>
  );
}

export function PanelIcon(props: IconProps) {
  return (
    <I {...props}>
      <rect x="3" y="3.4" width="10" height="9.2" rx="1.4" />
      <path d="M10.2 3.4v9.2" />
    </I>
  );
}

export function HelpIcon(props: IconProps) {
  return (
    <I {...props}>
      <circle cx="8" cy="8" r="5.2" />
      <path d="M6.45 6.45a1.55 1.55 0 1 1 1.7 2.15V9.4" />
      <path d="M8.15 11.15v.2" />
    </I>
  );
}

export function StatusBacklogIcon(props: IconProps) {
  return (
    <I {...props} className={`status backlog ${props.className ?? ""}`}>
      <circle cx="8" cy="8" r="5" strokeDasharray="1.6 1.8" />
    </I>
  );
}

export function StatusTodoIcon(props: IconProps) {
  return (
    <I {...props} className={`status todo ${props.className ?? ""}`}>
      <circle cx="8" cy="8" r="5" />
    </I>
  );
}

export function StatusProgressIcon(props: IconProps) {
  return (
    <I {...props} className={`status progress ${props.className ?? ""}`}>
      <circle cx="8" cy="8" r="5" />
      <path d="M8 3A5 5 0 1 1 3 8L8 8Z" fill="currentColor" stroke="none" />
    </I>
  );
}

export function StatusDoneIcon(props: IconProps) {
  return (
    <I {...props} className={`status done ${props.className ?? ""}`}>
      <circle cx="8" cy="8" r="5" />
      <path d="m5.55 8.05 1.75 1.7 3.2-3.4" />
    </I>
  );
}

export function StatusCanceledIcon(props: IconProps) {
  return (
    <I {...props} className={`status canceled ${props.className ?? ""}`}>
      <circle cx="8" cy="8" r="5" />
      <path d="M6 6 10 10M10 6 6 10" />
    </I>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <I {...props}>
      <path d="M4.5 4.5 11.5 11.5M11.5 4.5 4.5 11.5" />
    </I>
  );
}

export function ShareIcon(props: IconProps) {
  return (
    <I {...props}>
      <path d="M6.2 4.4H4.4A1.2 1.2 0 0 0 3.2 5.6v6a1.2 1.2 0 0 0 1.2 1.2h6a1.2 1.2 0 0 0 1.2-1.2V9.8" />
      <path d="M8.4 3.4h4.2V7.6" />
      <path d="M7.1 8.9 12.6 3.4" />
    </I>
  );
}

export function GripIcon(props: IconProps) {
  return (
    <I {...props} width={14} height={14} viewBox="0 0 14 14">
      <circle cx="5" cy="4" r="0.85" fill="currentColor" stroke="none" />
      <circle cx="9" cy="4" r="0.85" fill="currentColor" stroke="none" />
      <circle cx="5" cy="7" r="0.85" fill="currentColor" stroke="none" />
      <circle cx="9" cy="7" r="0.85" fill="currentColor" stroke="none" />
      <circle cx="5" cy="10" r="0.85" fill="currentColor" stroke="none" />
      <circle cx="9" cy="10" r="0.85" fill="currentColor" stroke="none" />
    </I>
  );
}

export function PersonIcon(props: IconProps) {
  return (
    <I {...props}>
      <circle cx="8" cy="5.4" r="2.1" />
      <path d="M3.6 12.4c.6-2.3 2.2-3.5 4.4-3.5s3.8 1.2 4.4 3.5" />
    </I>
  );
}

export function LabelIcon(props: IconProps) {
  return (
    <I {...props}>
      <path d="M3.3 8.4 8.1 3.6h4.3v4.3L7.6 12.7a1 1 0 0 1-1.4 0L3.3 9.8a1 1 0 0 1 0-1.4Z" />
      <circle cx="10.15" cy="5.85" r="0.7" fill="currentColor" stroke="none" />
    </I>
  );
}

export function SparkIcon(props: IconProps) {
  return (
    <I {...props}>
      <path d="M8 2.8 8.85 6.1 12.2 7 8.85 7.9 8 11.2 7.15 7.9 3.8 7l3.35-.9Z" />
    </I>
  );
}

export function StarIcon(props: IconProps) {
  return (
    <I {...props}>
      <path d="m8 3.1 1.15 2.45 2.7.32-2 1.9.55 2.66L8 9.1l-2.4 1.33.55-2.66-2-1.9 2.7-.32Z" />
    </I>
  );
}

export function DocsIcon(props: IconProps) {
  return (
    <I {...props}>
      <path d="M5 3.3h4.2L12 6.1v6.6H5a1 1 0 0 1-1-1V4.3a1 1 0 0 1 1-1Z" />
      <path d="M9.1 3.4v2.8H12" />
    </I>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <I {...props}>
      <circle cx="8" cy="8" r="2.1" />
      <path d="M8 3.2v1.3M8 11.5v1.3M3.2 8h1.3M11.5 8h1.3M4.6 4.6l.95.95M10.45 10.45l.95.95M4.6 11.4l.95-.95M10.45 5.55l.95-.95" />
    </I>
  );
}

export function CheckTinyIcon(props: IconProps) {
  return (
    <I {...props} width={12} height={12} viewBox="0 0 12 12">
      <path d="M2.4 6.1 4.7 8.4 9.6 3.6" />
    </I>
  );
}

export function BellIcon(props: IconProps) {
  return (
    <I {...props}>
      <path d="M5 11.5h6l.45-5.15A3.45 3.45 0 0 0 8 3.2a3.45 3.45 0 0 0-3.45 3.15L5 11.5Z" />
      <path d="M7 13h2" />
    </I>
  );
}

export function PriorityIcon({ level, ...props }: IconProps & { level: 0 | 1 | 2 | 3 | 4 }) {
  return (
    <I {...props} className={`priority p${level} ${props.className ?? ""}`}>
      <path d="M4.2 11.4v-1.8" opacity={level >= 1 ? 1 : 0.28} />
      <path d="M6.8 11.4V7.4" opacity={level >= 2 ? 1 : 0.28} />
      <path d="M9.4 11.4V5.6" opacity={level >= 3 ? 1 : 0.28} />
      <path d="M12 11.4V3.8" opacity={level >= 4 ? 1 : 0.28} />
    </I>
  );
}

export function EmptyMark() {
  return (
    <svg className="empty-mark" viewBox="0 0 200 176" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="emptyFade" x1="100" y1="118" x2="100" y2="170" gradientUnits="userSpaceOnUse">
          <stop stopColor="currentColor" stopOpacity="0.34" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g
        stroke="url(#emptyFade)"
        strokeWidth="1.4"
        strokeLinejoin="round"
        transform="translate(100 166) scale(1 -0.38) translate(-100 -96)"
      >
        <EmptyTubes />
      </g>
      <g stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
        <g transform="translate(100 96) skewX(-6) scale(1 0.9) translate(-100 -96)">
          <EmptyTubes />
        </g>
        <ellipse cx="100" cy="84" rx="22" ry="8.8" />
        <path d="M78 84v12c0 4.8 9.8 8.8 22 8.8s22-4 22-8.8V84" />
        <ellipse cx="100" cy="104" rx="19" ry="7.4" strokeDasharray="2 2.5" opacity="0.42" />
      </g>
    </svg>
  );
}

function EmptyTubes() {
  return (
    <>
      <path d="M73 48C83 28 117 30 129 52A6.6 6.6 0 0 1 118 60C109 42 91 41 82 58A6.6 6.6 0 0 1 73 48Z" />
      <path d="M73 144C83 164 117 162 129 140A6.6 6.6 0 0 0 118 132C109 150 91 151 82 134A6.6 6.6 0 0 0 73 144Z" />
      <path d="M48 71C28 81 30 115 52 127A6.6 6.6 0 0 0 61 117C43 108 42 90 59 82A6.6 6.6 0 0 0 48 71Z" />
      <path d="M152 71C172 81 170 115 148 127A6.6 6.6 0 0 1 139 117C157 108 158 90 141 82A6.6 6.6 0 0 1 152 71Z" />
    </>
  );
}
