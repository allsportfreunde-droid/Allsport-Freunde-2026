"use client";

import { useRef, useState, useEffect } from "react";

interface LastNameInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Last names of the other persons already typed in the same form */
  siblings: string[];
  placeholder?: string;
  required?: boolean;
  autoComplete?: string;
  maxLength?: number;
  className?: string;
}

export function LastNameInput({
  value,
  onChange,
  siblings,
  placeholder = "Nachname",
  required,
  autoComplete = "off",
  maxLength,
  className,
}: LastNameInputProps) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  // Unique sibling names that start with what's been typed (case-insensitive)
  const suggestions = [...new Set(
    siblings.filter(
      (s) =>
        s.trim() &&
        value.trim() &&
        s.toLowerCase().startsWith(value.toLowerCase()) &&
        s.toLowerCase() !== value.toLowerCase()
    )
  )];

  const show = open && suggestions.length > 0;

  useEffect(() => {
    if (!show) setActiveIdx(-1);
  }, [show]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const select = (s: string) => {
    onChange(s);
    setOpen(false);
    setActiveIdx(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!show) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && activeIdx >= 0) {
      e.preventDefault();
      select(suggestions[activeIdx]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={value}
        required={required}
        autoComplete={autoComplete}
        maxLength={maxLength}
        placeholder={placeholder}
        className={className}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActiveIdx(-1);
        }}
        onFocus={() => { if (value.trim()) setOpen(true); }}
        onKeyDown={handleKeyDown}
      />
      {show && (
        <ul
          role="listbox"
          className="absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden text-sm"
        >
          {suggestions.map((s, i) => (
            <li
              key={s}
              role="option"
              aria-selected={i === activeIdx}
              onMouseDown={(e) => { e.preventDefault(); select(s); }}
              className={`px-3 py-2 cursor-pointer ${
                i === activeIdx ? "bg-navy-50 text-navy-800" : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
