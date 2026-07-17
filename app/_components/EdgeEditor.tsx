'use client';

import { useState } from 'react';
import { Button, Input, Popover, QuantityStepper, Select, Toggle } from '@sovereignfs/ui';
import type { ContextMenuPosition } from './ContextMenu';
import styles from './EdgeEditor.module.css';

export type EdgeLineStyle = 'solid' | 'dashed';
export type EdgeCurveType = 'default' | 'straight' | 'step' | 'smoothstep';

export interface EdgeStyleContent {
  label: string;
  color: string;
  width: number;
  lineStyle: EdgeLineStyle;
  curveType: EdgeCurveType;
  animated: boolean;
}

export const DEFAULT_EDGE_STYLE: EdgeStyleContent = {
  label: '',
  color: '#111111',
  width: 2,
  lineStyle: 'solid',
  curveType: 'default',
  animated: false,
};

// A small fixed palette rather than a free colour picker — matches SPEC.md's
// "Colour swatch picker" note that a full picker component is a
// `packages/ui` open question, not something this task should preempt.
const EDGE_COLORS = ['#111111', '#dc2626', '#d97706', '#16a34a', '#2563eb', '#7c3aed'];

interface Props {
  position: ContextMenuPosition | null;
  initial: EdgeStyleContent | null;
  onSave: (patch: EdgeStyleContent) => void;
  onClose: () => void;
}

/** On-canvas popover for editing an edge's label, colour, width, line style, curve, and animation (PTR-09). */
export function EdgeEditor({ position, initial, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<EdgeStyleContent | null>(initial);

  if (!position || !draft) return null;

  function update(patch: Partial<EdgeStyleContent>) {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  }

  function save() {
    if (draft) onSave(draft);
  }

  return (
    <div className={styles.anchor} style={{ left: position.x, top: position.y }}>
      <Popover trigger={<span />} open onClose={onClose} aria-label="Edit edge" width={260}>
        <div className={styles.form}>
          <Input
            aria-label="Edge label"
            placeholder="Label"
            value={draft.label}
            onChange={(e) => update({ label: e.currentTarget.value })}
          />

          <div className={styles.swatches}>
            {EDGE_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className={[styles.swatch, draft.color === color ? styles.swatchActive : ''].join(' ')}
                style={{ backgroundColor: color }}
                aria-label={`Colour ${color}`}
                aria-pressed={draft.color === color}
                onClick={() => update({ color })}
              />
            ))}
          </div>

          <QuantityStepper
            aria-label="Edge width"
            value={draft.width}
            min={1}
            max={8}
            onChange={(width) => update({ width })}
          />

          <Select
            aria-label="Line style"
            value={draft.lineStyle}
            onChange={(e) => update({ lineStyle: e.currentTarget.value as EdgeLineStyle })}
          >
            <option value="solid">Solid</option>
            <option value="dashed">Dashed</option>
          </Select>

          <Select
            aria-label="Curve type"
            value={draft.curveType}
            onChange={(e) => update({ curveType: e.currentTarget.value as EdgeCurveType })}
          >
            <option value="default">Curved</option>
            <option value="straight">Straight</option>
            <option value="step">Step</option>
            <option value="smoothstep">Smooth step</option>
          </Select>

          <div className={styles.toggleRow}>
            <span>Animated</span>
            <Toggle
              aria-label="Animated"
              checked={draft.animated}
              onChange={(checked) => update({ animated: checked })}
            />
          </div>

          <div className={styles.actions}>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" onClick={save}>
              Save
            </Button>
          </div>
        </div>
      </Popover>
    </div>
  );
}
