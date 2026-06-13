import React from 'react';

interface Props {
  value: number; // 0–100
  height?: number;
  color?: string;
  backgroundColor?: string;
}

export default function ProgressBar({
  value,
  height = 6,
  color = 'var(--color-primary, #3b82f6)',
  backgroundColor = 'var(--color-border, #e5e7eb)',
}: Props) {
  const clamped = Math.max(0, Math.min(100, value));

  return (
    <div
      style={{
        width: '100%',
        height,
        borderRadius: height / 2,
        background: backgroundColor,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${clamped}%`,
          background: color,
          borderRadius: height / 2,
          transition: 'width 0.3s ease',
        }}
      />
    </div>
  );
}
