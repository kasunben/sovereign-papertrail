import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge, Button, EmptyState, PageHeader } from '@sovereignfs/ui';
import { BoardCard } from '../_components/BoardCard';
import { NewBoardDialog } from '../_components/NewBoardDialog';
import { getProjectSummary, listBoards } from '../_lib/actions';
import { canEditProject, canManageProject, formatProjectRole } from '../_lib/project-rules';
import styles from './page.module.css';

interface BoardsPageProps {
  params: Promise<{ projectId: string }>;
}

export default async function ProjectBoardsPage({ params }: BoardsPageProps) {
  const { projectId } = await params;
  const summary = await getProjectSummary(projectId).catch(() => null);
  if (!summary) notFound();
  const { project, currentUserRole } = summary;

  const boards = await listBoards(projectId);
  const canEdit = canEditProject(currentUserRole);
  const canManage = canManageProject(currentUserRole);

  return (
    <div className={styles.page}>
      <Link href="/papertrail" className={styles.backLink}>
        ← Back to projects
      </Link>
      <PageHeader
        title={project.name}
        description="Boards in this project."
        action={
          <div className={styles.headerActions}>
            <Badge variant="status" status={canManage ? 'active' : 'neutral'}>
              {formatProjectRole(currentUserRole)}
            </Badge>
            <Link href={`/papertrail/${projectId}/settings`}>
              <Button type="button" variant="secondary">
                Project settings
              </Button>
            </Link>
            {canEdit ? <NewBoardDialog projectId={projectId} /> : null}
          </div>
        }
      />

      {boards.length === 0 ? (
        <EmptyState
          icon="grid-2x2"
          heading="No boards yet"
          description={
            canEdit
              ? 'Create a board to start pinning evidence and mapping connections.'
              : 'No boards have been created in this project yet.'
          }
        />
      ) : (
        <section className={styles.boardGrid} aria-label="Boards">
          {boards.map((board) => (
            <BoardCard
              key={board.id}
              board={board}
              projectId={projectId}
              canEdit={canEdit}
              canManage={canManage}
            />
          ))}
        </section>
      )}
    </div>
  );
}
