'use client';

import { useRef, useState } from 'react';
import { Button, Dialog, FormField, Input, Textarea } from '@sovereignfs/ui';
import { createProject } from '../_lib/actions';
import styles from './NewProjectDialog.module.css';

export function NewProjectDialog() {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  function close() {
    formRef.current?.reset();
    setOpen(false);
  }

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        + New project
      </Button>
      <Dialog open={open} onClose={close} size="md" title="New project">
        <form ref={formRef} action={createProject} className={styles.form}>
          <FormField label="Project name" required>
            {(field) => <Input {...field} name="name" required placeholder="Investigation wall" />}
          </FormField>
          <FormField label="Description">
            {(field) => <Textarea {...field} name="description" rows={3} placeholder="Optional notes" />}
          </FormField>
          <div className={styles.actions}>
            <Button type="button" variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button type="submit">Create project</Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
