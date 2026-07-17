'use client';

import { useRef, useState } from 'react';
import { Button, Dialog, FormField, Input } from '@sovereignfs/ui';
import styles from './AddLinkDialog.module.css';

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (url: string) => void;
}

export function AddLinkDialog({ open, onClose, onSubmit }: Props) {
  const [url, setUrl] = useState('');
  const formRef = useRef<HTMLFormElement>(null);

  function close() {
    formRef.current?.reset();
    setUrl('');
    onClose();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    close();
  }

  return (
    <Dialog open={open} onClose={close} size="sm" title="Add link">
      <form ref={formRef} onSubmit={handleSubmit} className={styles.form}>
        <FormField label="URL" required>
          {(field) => (
            <Input
              {...field}
              type="url"
              required
              placeholder="https://example.com"
              value={url}
              onChange={(e) => setUrl(e.currentTarget.value)}
            />
          )}
        </FormField>
        <div className={styles.actions}>
          <Button type="button" variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button type="submit">Add link</Button>
        </div>
      </form>
    </Dialog>
  );
}
