import { useEffect, useRef, useState, type ReactNode } from "react"

type Option = {
  id: string
  label: string
}

type SelectMenuProps = {
  label: string
  value: string
  options: readonly Option[]
  onChange: (id: string) => void
  tone?: "dark" | "month" | "day" | "hour"
}

export function SelectMenu({
  label,
  value,
  options,
  onChange,
  tone = "dark",
}: SelectMenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selected = options.find((option) => option.id === value)

  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener("pointerdown", close)
    return () => window.removeEventListener("pointerdown", close)
  }, [open])

  return (
    <div className={`select-menu tone-${tone}`} ref={ref}>
      <span>{label}</span>
      <button
        type="button"
        className="menu-button"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((current) => !current)}
      >
        {selected?.label ?? value} ▾
      </button>
      {open && (
        <div className="menu-list" role="listbox" aria-label={label}>
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              role="option"
              aria-selected={option.id === value}
              className={option.id === value ? "is-selected" : undefined}
              onClick={() => {
                onChange(option.id)
                setOpen(false)
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

type ChoiceRowProps = {
  label: string
  children: ReactNode
}

export function ChoiceRow({ label, children }: ChoiceRowProps) {
  return (
    <div className="choice-row">
      <span>{label}</span>
      <div className="choice-group">{children}</div>
    </div>
  )
}
