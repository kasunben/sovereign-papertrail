import Link from 'next/link';
import { Card, EmptyState, PageHeader, StatusBadge } from '@sovereignfs/ui';
import { NewProjectDialog } from './_components/NewProjectDialog';
import { listProjects, type ProjectListItem } from './_lib/actions';
import { formatProjectRole } from './_lib/project-rules';
import styles from './page.module.css';

export default async function PaperTrailIndexPage() {
  const [projects, allProjects] = await Promise.all([
    listProjects(),
    listProjects({ includeArchived: true }),
  ]);
  const archivedProjects = allProjects.filter((project) => project.archivedAt !== null);

  return (
    <div className={styles.page}>
      <PageHeader
        title="Your projects"
        description="Map your evidence, follow the story."
        action={<NewProjectDialog />}
      />

      {projects.length === 0 ? (
        <EmptyState
          icon="grid-2x2"
          heading="No projects yet"
          description="Create a project to start pinning evidence and mapping connections."
        />
      ) : (
        <section className={styles.projectGrid} aria-label="Active projects">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </section>
      )}

      {archivedProjects.length > 0 ? (
        <section className={styles.archivedList} aria-label="Archived projects">
          <p className={styles.archivedHeading}>
            {archivedProjects.length} archived {archivedProjects.length === 1 ? 'project' : 'projects'}
          </p>
          {archivedProjects.map((project) => (
            <Link
              key={project.id}
              href={`/papertrail/${project.id}/settings`}
              className={styles.archivedRow}
            >
              <span>{project.name}</span>
              <StatusBadge status="conflict">Archived</StatusBadge>
            </Link>
          ))}
        </section>
      ) : null}
    </div>
  );
}

function ProjectCard({ project }: { project: ProjectListItem }) {
  return (
    <Link href={`/papertrail/${project.id}`} className={styles.cardLink}>
      <Card interactive className={styles.projectCard}>
        <div className={styles.cardHeader}>
          <h2>{project.name}</h2>
        </div>
        {project.description ? <p className={styles.projectMeta}>{project.description}</p> : null}
        <div className={styles.cardFooter}>
          <span>{formatProjectRole(project.currentUserRole)}</span>
        </div>
      </Card>
    </Link>
  );
}
