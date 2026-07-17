'use client';

import { useState } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { Button, FormField, TagInput, Textarea, Input } from '@sovereignfs/ui';
import { sanitizeTextNodeBody } from '../../_lib/actions';
import styles from './TextNode.module.css';

export interface TextNodeContent {
  title: string;
  /** Sanitised HTML — safe to render directly, never raw user input. */
  body: string;
  tags: string[];
}

export interface TextNodeData extends TextNodeContent, Record<string, unknown> {
  editable: boolean;
  onSave: (patch: TextNodeContent) => void;
}

export type TextFlowNode = Node<TextNodeData, 'text'>;

/**
 * Body markup is a plain textarea for now (typed HTML like `<strong>…</strong>`
 * is accepted and sanitised on save) — a WYSIWYG editor isn't in
 * `packages/ui` yet; swapping the input in for one later doesn't change this
 * component's save/sanitise contract.
 */
export function TextNode({ data, selected }: NodeProps<TextFlowNode>) {
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(data.title);
  const [draftBody, setDraftBody] = useState(data.body);
  const [draftTags, setDraftTags] = useState(data.tags);
  const [saving, setSaving] = useState(false);

  function startEditing() {
    if (!data.editable) return;
    setDraftTitle(data.title);
    setDraftBody(data.body);
    setDraftTags(data.tags);
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    try {
      const sanitizedBody = await sanitizeTextNodeBody(draftBody);
      data.onSave({ title: draftTitle, body: sanitizedBody, tags: draftTags });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={[styles.node, selected ? styles.selected : ''].join(' ')}>
      <Handle type="target" position={Position.Top} />

      {editing ? (
        <div className={styles.editForm}>
          <FormField label="Title">
            {(field) => (
              <Input
                {...field}
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.currentTarget.value)}
                placeholder="Untitled"
              />
            )}
          </FormField>
          <FormField label="Body">
            {(field) => (
              <Textarea
                {...field}
                rows={4}
                value={draftBody}
                onChange={(e) => setDraftBody(e.currentTarget.value)}
              />
            )}
          </FormField>
          <FormField label="Tags">
            {() => <TagInput value={draftTags} onChange={setDraftTags} placeholder="Add a tag…" />}
          </FormField>
          <div className={styles.editActions}>
            <Button type="button" variant="secondary" onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="button" onClick={save} disabled={saving}>
              Save
            </Button>
          </div>
        </div>
      ) : (
        <button type="button" className={styles.view} onDoubleClick={startEditing}>
          <h3 className={styles.title}>{data.title || 'Untitled'}</h3>
          {data.body ? (
            <div className={styles.body} dangerouslySetInnerHTML={{ __html: data.body }} />
          ) : null}
          {data.tags.length > 0 ? (
            <ul className={styles.tags}>
              {data.tags.map((tag) => (
                <li key={tag} className={styles.tag}>
                  {tag}
                </li>
              ))}
            </ul>
          ) : null}
        </button>
      )}

      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
