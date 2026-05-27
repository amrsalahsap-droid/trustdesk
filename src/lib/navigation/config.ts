import { 
  LayoutIcon, 
  ClipboardIcon, 
  FileIcon, 
  BookIcon, 
  ShieldCheckIcon,
  SettingsIcon,
  ActivityIcon,
  ClockIcon
} from "@/components/icons";
import { Permission } from "@/lib/auth/permissions";

export type NavItemConfig = {
  label: string;
  href: string;
  icon: any;
  requiredPermissions?: Permission | Permission[];
  category: "workspace" | "work" | "system";
  badgeKey?: string;
  badgeTone?: "default" | "error" | "warning";
};

export const NAVIGATION_CONFIG: NavItemConfig[] = [
  {
    label: "Dashboard",
    href: "/app",
    icon: LayoutIcon,
    requiredPermissions: Permission.MANAGE_TOPICS,
    category: "workspace",
  },
  {
    label: "Questionnaires",
    href: "/app/questionnaires",
    icon: ClipboardIcon,
    requiredPermissions: [Permission.IMPORT_QUESTIONNAIRES, Permission.ASSIGN_ROWS, Permission.REVIEW_ROWS],
    category: "work",
    badgeKey: "activeQuestionnaires",
    badgeTone: "default",
  },
  {
    label: "Documents",
    href: "/app/documents",
    icon: FileIcon,
    requiredPermissions: Permission.VIEW_EVIDENCE,
    category: "work",
    badgeKey: "answersNeedingEvidence",
    badgeTone: "warning",
  },
  {
    label: "Answer Library",
    href: "/app/library",
    icon: BookIcon,
    requiredPermissions: Permission.VIEW_ANSWERS,
    category: "work",
    badgeKey: "unowned",
    badgeTone: "error",
  },
  {
    label: "Governance",
    href: "/app/governance",
    icon: ShieldCheckIcon,
    requiredPermissions: [Permission.VIEW_ANSWERS, Permission.APPROVE_ANSWERS],
    category: "work",
    badgeKey: "drafts_awaiting_approval",
    badgeTone: "warning",
  },
  {
    label: "Audit Center",
    href: "/app/audit",
    icon: ActivityIcon,
    requiredPermissions: Permission.VIEW_AUDIT,
    category: "work",
    badgeKey: "recentAuditEvents",
  },
  {
    label: "Export History",
    href: "/app/exports",
    icon: ClockIcon,
    requiredPermissions: Permission.EXPORT_DATA,
    category: "work",
  },
  {
    label: "Settings",
    href: "/app/settings",
    icon: SettingsIcon,
    requiredPermissions: [Permission.MANAGE_SETTINGS, Permission.MANAGE_MEMBERS, Permission.VIEW_AUDIT],
    category: "system",
  },
];
