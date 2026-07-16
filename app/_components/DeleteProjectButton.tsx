'use client';

import { useState, useTransition } from 'react';
import { Button, ConfirmDialog } from '@sovereignfs/ui';
import { hardDeleteProject } from '../_lib/actions';

export function DeleteProjectButton({ projectId, projectName }: { projectId: string; projectName: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirmDelete() {
    startTransition(async () => {
      await hardDeleteProject(projectId);
    });
  }

  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        Delete permanently
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={confirmDelete}
        title="Delete project"
        message={
          <>
            Delete &quot;{projectName}&quot;? This permanently removes the project and everything in
            it. This can&apos;t be undone.
          </>
        }
        confirmLabel="Delete project"
        destructive
        pending={pending}
      />
    </>
  );
}
