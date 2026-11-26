"use client";
import { useState } from "react";

export function CopyText({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="font-mono hover:text-ink"
      onClick={() => {
        navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1400);
        });
      }}
      title="Copy"
    >
      {done ? "copied ✓" : label}
    </button>
  );
}
