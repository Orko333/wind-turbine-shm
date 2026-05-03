import * as React from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

interface SelectProps {
  value?: string
  onValueChange?: (value: string) => void
  disabled?: boolean
  children?: React.ReactNode
}

interface SelectTriggerProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  placeholder?: string
}

interface SelectItemProps
  extends React.OptionHTMLAttributes<HTMLOptionElement> {
  children?: React.ReactNode
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ value, onValueChange, disabled, children, ...props }, ref) => {
    const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      onValueChange?.(e.target.value)
    }

    return (
      <select
        ref={ref}
        value={value || ""}
        onChange={handleChange}
        disabled={disabled}
        className={cn(
          "flex h-10 w-full appearance-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          "pr-8"
        )}
        {...props}
      >
        {children}
      </select>
    )
  }
)
Select.displayName = "Select"

const SelectTrigger = React.forwardRef<
  HTMLSelectElement,
  SelectTriggerProps
>(({ className, children, placeholder, ...props }, ref) => (
  // SelectTrigger is a no-op inside a native <select> — className not forwarded
  // to avoid rendering a div/select inside the parent select element (invalid HTML)
  null as unknown as React.ReactElement
))
SelectTrigger.displayName = "SelectTrigger"

const SelectContent = ({ children }: { children?: React.ReactNode }) => (
  <>{children}</>
)

const SelectItem = React.forwardRef<
  HTMLOptionElement,
  SelectItemProps
>(({ children, ...props }, ref) => (
  <option ref={ref} {...props}>
    {children}
  </option>
))
SelectItem.displayName = "SelectItem"

const SelectValue = ({ placeholder }: { placeholder?: string }) => (
  null as unknown as React.ReactElement
)

export {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
}
