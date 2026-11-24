import path from "node:path";

/**
 * Where Claude puts work that is not part of the site: email drafts,
 * prospect lists, reports, research notes (411887c). Outside the client's
 * project, so nothing of it is committed, built or deployed with their
 * site. Next to the app's database, which already holds everything the
 * agency keeps for its clients.
 */
export function documentsRoot(): string {
  const dbPath = process.env.SEO_DB_PATH ?? path.join(process.cwd(), "data.db");
  return path.join(path.dirname(path.resolve(dbPath)), "claude-documents");
}

export function taskDocumentsDir(taskId: number, root = documentsRoot()): string {
  return path.join(root, `task-${taskId}`);
}

/** True when `child` is `parent` or somewhere below it. */
export function isInside(parent: string, child: string): boolean {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/**
 * The note handed to Claude about those documents. Null when the client's
 * folder would contain the documents folder: then "outside the repo" is
 * not true and the run must not start.
 */
export function workingFilesNote(taskId: number, projectDir: string, root = documentsRoot()): string | null {
  const dir = taskDocumentsDir(taskId, root);
  if (isInside(projectDir, dir)) return null;
  return (
    `If the task's result is a document and not a change to the site (email drafts, prospect lists, reports, research notes, audits), ` +
    `write it to ${dir} and not into the project folder, and never commit it. ` +
    `Only files that belong to the site itself go in the project. Tell the person where the file is when you finish.`
  );
}
