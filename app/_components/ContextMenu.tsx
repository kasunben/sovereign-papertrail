'use client';

import { Menu, type MenuEntry } from '@sovereignfs/ui';
import styles from './ContextMenu.module.css';

export interface ContextMenuPosition {
  x: number;
  y: number;
}

interface Props {
  position: ContextMenuPosition | null;
  items: MenuEntry[];
  'aria-label': string;
  onClose: () => void;
}

/**
 * Adapts the design system's trigger-anchored `Menu` to a free-floating,
 * right-click context menu: the "trigger" is an invisible zero-size marker
 * positioned at the click coordinates, so `Menu`'s own `Popover` positioning
 * (best-side-fit, viewport clamping) applies unmodified.
 */
export function ContextMenu({ position, items, 'aria-label': ariaLabel, onClose }: Props) {
  if (!position) return null;

  return (
    <div className={styles.anchor} style={{ left: position.x, top: position.y }}>
      <Menu
        trigger={<span />}
        open
        onClose={onClose}
        items={items}
        aria-label={ariaLabel}
      />
    </div>
  );
}
