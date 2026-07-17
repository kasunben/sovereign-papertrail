'use client';

import type { Node, NodeProps } from '@xyflow/react';
import { Handle, Position } from '@xyflow/react';
import { Spinner } from '@sovereignfs/ui';
import styles from './LinkNode.module.css';

export interface LinkNodeContent {
  status: 'loading' | 'ready' | 'error';
  url: string;
  title?: string | null;
  description?: string | null;
  image?: string | null;
  error?: string;
}

export interface LinkNodeData extends LinkNodeContent, Record<string, unknown> {}

export type LinkFlowNode = Node<LinkNodeData, 'link'>;

/**
 * Read-only display node, like ImageNode — the preview is fetched once at
 * creation time (PTR-08 doesn't call for a re-fetch/refresh affordance) and
 * deletion is handled generically by Canvas's node context menu.
 */
export function LinkNode({ data, selected }: NodeProps<LinkFlowNode>) {
  return (
    <div className={[styles.node, selected ? styles.selected : ''].join(' ')}>
      <Handle type="target" position={Position.Top} />

      {data.status === 'loading' ? (
        <div className={styles.status}>
          <Spinner size="sm" />
          <span>Fetching preview…</span>
        </div>
      ) : data.status === 'error' ? (
        <div className={styles.error}>
          <p>{data.error ?? 'Could not fetch a preview.'}</p>
          <p className={styles.url}>{data.url}</p>
        </div>
      ) : (
        <a href={data.url} target="_blank" rel="noopener noreferrer" className={`${styles.link} nodrag`}>
          {data.image ? <img src={data.image} alt="" className={styles.image} draggable={false} /> : null}
          <div className={styles.body}>
            <p className={styles.title}>{data.title || data.url}</p>
            {data.description ? <p className={styles.description}>{data.description}</p> : null}
            <p className={styles.url}>{data.url}</p>
          </div>
        </a>
      )}

      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
