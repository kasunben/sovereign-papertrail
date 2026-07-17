'use client';

import { Button, Input, SegmentedControl, StatusBadge, Toggle } from '@sovereignfs/ui';
import type { CanvasMode } from './Canvas';
import styles from './OverlayToolbar.module.css';

interface Props {
  mode: CanvasMode;
  onModeChange: (mode: CanvasMode) => void;
  onAddTextNode: () => void;
  onAddImage: () => void;
  onAddLink: () => void;
  canEdit: boolean;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  matchCount: number;
  hideNonMatches: boolean;
  onHideNonMatchesChange: (hide: boolean) => void;
}

/**
 * Canvas chrome floating over the React Flow surface. Search (PTR-10) is
 * available to every role, including viewers (SPEC.md's access-control
 * section: viewers get "pan, zoom, search, open nodes") — only the
 * mode/add-node controls are editor+ gated. Import/export (PTR-13) attaches
 * to this same toolbar in a later step rather than a new component.
 */
export function OverlayToolbar({
  mode,
  onModeChange,
  onAddTextNode,
  onAddImage,
  onAddLink,
  canEdit,
  searchQuery,
  onSearchQueryChange,
  matchCount,
  hideNonMatches,
  onHideNonMatchesChange,
}: Props) {
  const hasQuery = searchQuery.trim().length > 0;

  return (
    <div className={styles.toolbar}>
      <div className={styles.row}>
        <Input
          aria-label="Search board"
          placeholder="Search titles, text, tags…"
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.currentTarget.value)}
          className={styles.search}
        />
        {hasQuery ? (
          <StatusBadge status="unmodified">
            {matchCount} {matchCount === 1 ? 'match' : 'matches'}
          </StatusBadge>
        ) : null}
        <div className={styles.hideToggle}>
          <span>Hide non-matches</span>
          <Toggle
            aria-label="Hide non-matching nodes"
            checked={hideNonMatches}
            disabled={!hasQuery}
            onChange={onHideNonMatchesChange}
          />
        </div>
      </div>

      <div className={styles.row}>
        <SegmentedControl
          aria-label="Canvas interaction mode"
          value={mode}
          onChange={onModeChange}
          options={[
            { label: 'Select', value: 'select' },
            { label: 'Connect', value: 'connect' },
          ]}
        />
        {canEdit ? (
          <>
            <Button type="button" onClick={onAddTextNode}>
              + Add text node
            </Button>
            <Button type="button" variant="secondary" onClick={onAddImage}>
              + Add image
            </Button>
            <Button type="button" variant="secondary" onClick={onAddLink}>
              + Add link
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}
