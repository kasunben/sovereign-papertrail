import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Canvas } from '../../../_components/Canvas';
import { getBoard } from '../../../_lib/actions';
import { canEditProject } from '../../../_lib/project-rules';
import styles from './page.module.css';

interface BoardPageProps {
  params: Promise<{ projectId: string; boardId: string }>;
}

export default async function BoardPage({ params }: BoardPageProps) {
  const { projectId, boardId } = await params;
  const result = await getBoard(projectId, boardId).catch(() => null);
  if (!result) notFound();
  const { board, currentUserRole } = result;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href={`/papertrail/${projectId}`} className={styles.backLink}>
          ← Back to boards
        </Link>
        <h1 className={styles.title}>{board.title}</h1>
      </header>
      <div className={styles.canvasArea}>
        <Canvas projectId={projectId} boardId={boardId} canEdit={canEditProject(currentUserRole)} />
      </div>
    </div>
  );
}
