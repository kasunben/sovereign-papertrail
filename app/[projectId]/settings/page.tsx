import Link from 'next/link';
import { notFound } from 'next/navigation';
import { sdk } from '@sovereignfs/sdk';
import { Badge, Button, FormField, Input, PageHeader, Textarea } from '@sovereignfs/ui';
import { archiveProject, getProject, restoreProject, updateProjectSettings } from '../../_lib/actions';
import { canManageProject, formatProjectRole } from '../../_lib/project-rules';
import { DeleteProjectButton } from '../../_components/DeleteProjectButton';
import { MembersSection } from '../../_components/MembersSection';
import styles from './settings.module.css';

interface SettingsPageProps {
  params: Promise<{ projectId: string }>;
}

export default async function ProjectSettingsPage({ params }: SettingsPageProps) {
  const { projectId } = await params;
  const [project, session] = await Promise.all([
    getProject(projectId).catch(() => null),
    sdk.auth.requireSession(),
  ]);
  if (!project) notFound();
  const userCanManage = canManageProject(project.currentUserRole);

  return (
    <div className={styles.page}>
      <Link href="/papertrail" className={styles.backLink}>
        ← Back to projects
      </Link>
      <PageHeader
        title="Project settings"
        description={`Details for ${project.name}.`}
        action={
          <Badge variant="status" status={userCanManage ? 'active' : 'neutral'}>
            {formatProjectRole(project.currentUserRole)}
          </Badge>
        }
      />

      <section className={styles.panel} aria-labelledby="project-details">
        <h2 id="project-details">Details</h2>
        <form action={updateProjectSettings.bind(null, project.id)} className={styles.form}>
          <FormField label="Name">
            {(field) => (
              <Input {...field} name="name" required defaultValue={project.name} disabled={!userCanManage} />
            )}
          </FormField>
          <FormField label="Description">
            {(field) => (
              <Textarea
                {...field}
                name="description"
                rows={3}
                defaultValue={project.description ?? ''}
                disabled={!userCanManage}
              />
            )}
          </FormField>
          {userCanManage ? <Button type="submit">Save settings</Button> : null}
        </form>
      </section>

      <div className={styles.panel}>
        <MembersSection
          projectId={project.id}
          currentUserId={session.user.id}
          members={project.members}
          directoryLookupFailed={project.directoryLookupFailed}
          userCanManage={userCanManage}
        />
      </div>

      {userCanManage ? (
        <section className={styles.panel} aria-labelledby="danger-zone">
          <h2 id="danger-zone">Project status</h2>
          <div className={styles.actions}>
            {project.archivedAt ? (
              <form action={restoreProject.bind(null, project.id)}>
                <Button type="submit">Restore project</Button>
              </form>
            ) : (
              <form action={archiveProject.bind(null, project.id)}>
                <Button type="submit" variant="secondary">
                  Archive project
                </Button>
              </form>
            )}
            <DeleteProjectButton projectId={project.id} projectName={project.name} />
          </div>
        </section>
      ) : null}
    </div>
  );
}
