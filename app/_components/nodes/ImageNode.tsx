'use client';

import type { Node, NodeProps } from '@xyflow/react';
import { Handle, Position } from '@xyflow/react';
import { Spinner } from '@sovereignfs/ui';
import styles from './ImageNode.module.css';

export interface ImageNodeContent {
  status: 'uploading' | 'ready' | 'error';
  url?: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  error?: string;
}

export interface ImageNodeData extends ImageNodeContent, Record<string, unknown> {}

export type ImageFlowNode = Node<ImageNodeData, 'image'>;

/**
 * Read-only display node: the image is fixed at upload time (PTR-07 doesn't
 * call for in-place replacement), and deletion is handled generically by
 * Canvas's node context menu — no per-type editing UI needed here.
 */
export function ImageNode({ data, selected }: NodeProps<ImageFlowNode>) {
  return (
    <div className={[styles.node, selected ? styles.selected : ''].join(' ')}>
      <Handle type="target" position={Position.Top} />

      {data.status === 'uploading' ? (
        <div className={styles.status}>
          <Spinner size="sm" />
          <span>Uploading…</span>
        </div>
      ) : data.status === 'error' ? (
        <div className={styles.error}>{data.error ?? 'Upload failed.'}</div>
      ) : (
        <img src={data.thumbnailUrl} alt="" className={styles.image} draggable={false} />
      )}

      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
