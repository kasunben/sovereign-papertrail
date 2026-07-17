'use client';

import { useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { Button, Card, ConfirmDialog, Dialog, FormField, Input } from '@sovereignfs/ui';
import type { PapertrailBoard } from '../_db/schema';
import { deleteBoard, renameBoard } from '../_lib/actions';
import styles from './BoardCard.module.css';

interface Props {
  board: PapertrailBoard;
  projectId: string;
  canEdit: boolean;
  canManage: boolean;
}

export function BoardCard({ board, projectId, canEdit, canManage }: Props) {
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePending, startDeleteTransition] = useTransition();
  const renameFormRef = useRef<HTMLFormElement>(null);

  function closeRename() {
    renameFormRef.current?.reset();
    setRenameOpen(false);
  }

  function confirmDelete() {
    startDeleteTransition(async () => {
      await deleteBoard(projectId, board.id);
      setDeleteOpen(false);
    });
  }

  return (
    <Card className={styles.card}>
      <Link href={`/papertrail/${projectId}/board/${board.id}`} className={styles.titleLink}>
        <h2 className={styles.title}>{board.title}</h2>
      </Link>
      {canEdit || canManage ? (
        <div className={styles.actions}>
          {canEdit ? (
            <Button type="button" variant="secondary" onClick={() => setRenameOpen(true)}>
              Rename
            </Button>
          ) : null}
          {canManage ? (
            <Button type="button" variant="secondary" onClick={() => setDeleteOpen(true)}>
              Delete
            </Button>
          ) : null}
        </div>
      ) : null}

      <Dialog open={renameOpen} onClose={closeRename} size="sm" title="Rename board">
        <form
          ref={renameFormRef}
          action={renameBoard.bind(null, projectId, board.id)}
          className={styles.form}
        >
          <FormField label="Board title" required>
            {(field) => <Input {...field} name="title" required defaultValue={board.title} />}
          </FormField>
          <div className={styles.formActions}>
            <Button type="button" variant="secondary" onClick={closeRename}>
              Cancel
            </Button>
            <Button type="submit">Save</Button>
          </div>
        </form>
      </Dialog>

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={confirmDelete}
        title="Delete board"
        message={
          <>
            Delete &quot;{board.title}&quot;? This permanently removes the board and everything
            pinned to it. This can&apos;t be undone.
          </>
        }
        confirmLabel="Delete board"
        destructive
        pending={deletePending}
      />
    </Card>
  );
}
