/**
 * Formatting Utilities
 * Formatting functions for dates, numbers, power, RUL, stress, and moments
 */

/**
 * Format date to readable string
 * @param date - Date string or Date object
 * @param format - Format option: 'short', 'long', 'full', 'time'
 */
export function formatDate(
  date: string | Date,
  format: "short" | "long" | "full" | "time" = "short"
): string {
  const dateObj = typeof date === "string" ? new Date(date) : date;

  if (isNaN(dateObj.getTime())) {
    return "Invalid date";
  }

  switch (format) {
    case "short":
      return dateObj.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    case "long":
      return dateObj.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    case "full":
      return dateObj.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    case "time":
      return dateObj.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    default:
      return dateObj.toLocaleDateString();
  }
}

/**
 * Format relative time (e.g., "2 hours ago")
 */
export function formatRelativeTime(date: string | Date): string {
  const dateObj = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - dateObj.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return `${Math.max(0, diffSecs)}s ago`;
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;

  return `${Math.floor(diffDays / 365)}y ago`;
}

/**
 * Format number with thousands separator
 */
export function formatNumber(value: number, decimals: number = 0): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * Format power in kW
 */
export function formatPower(powerKw: number, decimals: number = 1): string {
  if (powerKw < 1000) {
    return `${formatNumber(powerKw, decimals)} kW`;
  }
  return `${formatNumber(powerKw / 1000, decimals)} MW`;
}

/**
 * Format RUL (Remaining Useful Life) in years
 */
export function formatRUL(years: number, decimals: number = 2): string {
  if (years < 0) return "N/A";
  if (years < 1) return `${formatNumber(years * 12, 0)} months`;
  if (years < 10) return `${formatNumber(years, decimals)} years`;
  return `${formatNumber(years, 1)} years`;
}

/**
 * Format stress in MPa (Megapascals)
 */
export function formatStress(stressMpa: number, decimals: number = 1): string {
  if (stressMpa < 1000) {
    return `${formatNumber(stressMpa, decimals)} MPa`;
  }
  return `${formatNumber(stressMpa / 1000, decimals)} GPa`;
}

/**
 * Format moment in kN·m
 */
export function formatMoment(momentKnm: number, decimals: number = 0): string {
  if (Math.abs(momentKnm) < 1000) {
    return `${formatNumber(momentKnm, decimals)} kN·m`;
  }
  return `${formatNumber(momentKnm / 1000, decimals)} MN·m`;
}

/**
 * Format wind speed in m/s
 */
export function formatWindSpeed(speedMs: number, decimals: number = 1): string {
  return `${formatNumber(speedMs, decimals)} m/s`;
}

/**
 * Format temperature in Celsius
 */
export function formatTemperature(tempC: number, decimals: number = 1): string {
  return `${formatNumber(tempC, decimals)} °C`;
}

/**
 * Format percentage
 */
export function formatPercentage(value: number, decimals: number = 1): string {
  return `${formatNumber(value * 100, decimals)}%`;
}

/**
 * Format vibration in mm/s
 */
export function formatVibration(vibrationMms: number, decimals: number = 2): string {
  return `${formatNumber(vibrationMms, decimals)} mm/s`;
}

/**
 * Format damage rate (0-1 scale)
 */
export function formatDamageRate(rate: number, decimals: number = 1): string {
  return formatPercentage(Math.min(1, Math.max(0, rate)), decimals);
}

/**
 * Format capacity factor (0-1 scale)
 */
export function formatCapacityFactor(factor: number, decimals: number = 1): string {
  return formatPercentage(Math.min(1, Math.max(0, factor)), decimals);
}

/**
 * Format frequency in Hz
 */
export function formatFrequency(freqHz: number, decimals: number = 2): string {
  if (freqHz < 1000) {
    return `${formatNumber(freqHz, decimals)} Hz`;
  }
  return `${formatNumber(freqHz / 1000, decimals)} kHz`;
}

/**
 * Format duration in seconds to human-readable format
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

  return parts.join(" ");
}

/**
 * Format bytes to human-readable size
 */
export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return formatNumber(bytes / Math.pow(k, i), decimals) + " " + sizes[i];
}

/**
 * Format currency
 */
export function formatCurrency(amount: number, currency: string = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency,
  }).format(amount);
}

/**
 * Truncate string with ellipsis
 */
export function truncateString(text: string, maxLength: number, suffix: string = "..."): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - suffix.length) + suffix;
}

/**
 * Format стан with proper capitalization
 */
export function formatStatus(status: string): string {
  return status
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}
