'use client';

import { useRef, useState } from 'react';
import { Button, Dialog, FormField, Input } from '@sovereignfs/ui';
import { createBoard } from '../_lib/actions';
import styles from './NewBoardDialog.module.css';

export function NewBoardDialog({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  function close() {
    formRef.current?.reset();
    setOpen(false);
  }

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        + New board
      </Button>
      <Dialog open={open} onClose={close} size="sm" title="New board">
        <form ref={formRef} action={createBoard.bind(null, projectId)} className={styles.form}>
          <FormField label="Board title" required>
            {(field) => <Input {...field} name="title" required placeholder="Timeline" />}
          </FormField>
          <div className={styles.actions}>
            <Button type="button" variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button type="submit">Create board</Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
