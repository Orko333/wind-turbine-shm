import { ReactNode } from "react";
import type { ChartDataPoint } from "./api";

// Типи пропсів компонентів
export interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  className?: string;
}

export interface CardProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  className?: string;
  footer?: ReactNode;
}

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}

export interface ToastProps {
  message: string;
  type: "success" | "error" | "warning" | "info";
  duration?: number;
}

export interface ChartProps {
  data: ChartDataPoint[];
  title?: string;
  xAxisLabel?: string;
  yAxisLabel?: string;
  height?: number;
  showLegend?: boolean;
  onClick?: (dataPoint: ChartDataPoint) => void;
}

export interface TableProps {
  columns: TableColumn[];
  data: Record<string, unknown>[];
  loading?: boolean;
  onRowClick?: (row: Record<string, unknown>) => void;
  sortable?: boolean;
  filterable?: boolean;
  pagination?: PaginationConfig;
}

export interface TableColumn {
  key: string;
  label: string;
  width?: number;
  sortable?: boolean;
  render?: (value: unknown) => ReactNode;
}

export interface PaginationConfig {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

export interface TabConfig {
  label: string;
  value: string;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface NotificationBadge {
  count: number;
  severity: "info" | "warning" | "critical";
}
