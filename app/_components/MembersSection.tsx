'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Select, StatusBadge, SuggestionInput } from '@sovereignfs/ui';
import {
  inviteProjectMember,
  removeProjectMember,
  searchProjectDirectoryUsers,
  updateProjectMemberRole,
  type ProjectMember,
} from '../_lib/actions';
import { formatProjectRole, type ProjectRole } from '../_lib/project-rules';
import styles from './MembersSection.module.css';

const SEARCH_DEBOUNCE_MS = 250;

interface Props {
  projectId: string;
  currentUserId: string;
  members: ProjectMember[];
  directoryLookupFailed: boolean;
  userCanManage: boolean;
}

export function MembersSection({
  projectId,
  currentUserId,
  members,
  directoryLookupFailed,
  userCanManage,
}: Props) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ id: string; label: string; meta?: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [inviteRole, setInviteRole] = useState<ProjectRole>('viewer');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      searchProjectDirectoryUsers(projectId, trimmed)
        .then((users) =>
          setResults(users.map((user) => ({ id: user.id, label: user.name ?? user.email, meta: user.email }))),
        )
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [projectId, query]);

  function handleInvite(userId: string) {
    setQuery('');
    setResults([]);
    setError(null);
    startTransition(async () => {
      try {
        await inviteProjectMember(projectId, userId, inviteRole);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not add that person.');
      }
    });
  }

  function handleRoleChange(memberUserId: string, role: ProjectRole) {
    setError(null);
    startTransition(async () => {
      try {
        await updateProjectMemberRole(projectId, memberUserId, role);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not update that role.');
      }
    });
  }

  function handleRemove(memberUserId: string) {
    setError(null);
    startTransition(async () => {
      try {
        await removeProjectMember(projectId, memberUserId);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not remove that member.');
      }
    });
  }

  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <h2>People</h2>
        <StatusBadge status="unmodified">{members.length} total</StatusBadge>
      </div>
      {directoryLookupFailed ? (
        <p className={styles.errorText}>Couldn&apos;t load names and emails right now. Showing IDs only.</p>
      ) : null}

      <ul className={styles.list}>
        {members.map((member) => (
          <li key={member.userId} className={styles.item}>
            <div className={styles.identity}>
              <strong>{member.displayName ?? member.email ?? member.userId}</strong>
              <p>{member.email ?? member.userId}</p>
            </div>
            {userCanManage ? (
              <Select
                aria-label={`Role for ${member.displayName ?? member.email ?? member.userId}`}
                value={member.role}
                disabled={pending}
                onChange={(event) =>
                  handleRoleChange(member.userId, event.currentTarget.value as ProjectRole)
                }
              >
                <option value="owner">Owner</option>
                <option value="editor">Editor</option>
                <option value="viewer">Viewer</option>
              </Select>
            ) : (
              <StatusBadge status="unmodified">{formatProjectRole(member.role as ProjectRole)}</StatusBadge>
            )}
            {userCanManage ? (
              <button
                type="button"
                className={styles.removeButton}
                disabled={pending}
                onClick={() => handleRemove(member.userId)}
              >
                {member.userId === currentUserId ? 'Leave' : 'Remove'}
              </button>
            ) : null}
          </li>
        ))}
      </ul>

      {error ? (
        <p className={styles.errorText} role="status" aria-live="polite">
          {error}
        </p>
      ) : null}

      {userCanManage ? (
        <div className={styles.inviteRow}>
          <SuggestionInput
            value={query}
            onChange={setQuery}
            options={results}
            onSelect={(option) => handleInvite(option.id)}
            placeholder="Add a person by name or email…"
            aria-label="Search people to add"
            loading={searching}
            disabled={pending}
          />
          <Select
            aria-label="Role to assign"
            value={inviteRole}
            disabled={pending}
            onChange={(event) => setInviteRole(event.currentTarget.value as ProjectRole)}
          >
            <option value="owner">Owner</option>
            <option value="editor">Editor</option>
            <option value="viewer">Viewer</option>
          </Select>
        </div>
      ) : null}
    </section>
  );
}
