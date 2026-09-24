/**
 * Where this project lives on GitHub. One copy.
 *
 * This was hardcoded in ten places across src/ and had already drifted:
 * seven said `IamRamgarhia/SEO-Tool`, three said the current
 * `IamRamgarhia/All-In-One-Free-SEO-Tool`. The old ones still resolved,
 * because GitHub redirects a renamed repository — which is why nobody
 * noticed, and why it mattered: that redirect stops the day anyone else
 * registers a repo called `SEO-Tool`. At that point the update checker
 * polls a stranger's commits and the installer one-liner in the README
 * pipes a stranger's script into a shell.
 *
 * So the slug lives here, and repo.test.ts fails the build if a literal
 * appears anywhere else — including in install.sh, install.ps1 and
 * package.json, which cannot import this file and so are checked as text.
 */

/** owner/name, exactly as GitHub spells it today. */
export const REPO_SLUG = "IamRamgarhia/All-In-One-Free-SEO-Tool";

export const REPO_URL = `https://github.com/${REPO_SLUG}`;
export const REPO_ISSUES_URL = `${REPO_URL}/issues`;
export const REPO_NEW_ISSUE_URL = `${REPO_URL}/issues/new`;
export const REPO_RELEASES_URL = `${REPO_URL}/releases`;
export const REPO_API_URL = `https://api.github.com/repos/${REPO_SLUG}`;
export const REPO_RAW_URL = `https://raw.githubusercontent.com/${REPO_SLUG}`;

/** For the User-Agent strings this tool sends when it crawls. */
export const REPO_UA_SUFFIX = `+${REPO_URL}`;
