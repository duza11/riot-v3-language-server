const { execFileSync } = require('node:child_process');
const fs = require('node:fs');

function validateRecoveryRun({ repository, tag, sha, run, jobs }) {
  if (
    run.path !== '.github/workflows/publish.yml' ||
    run.head_repository?.full_name !== repository ||
    run.head_sha !== sha ||
    run.head_branch !== tag ||
    !['workflow_dispatch', 'release'].includes(run.event) ||
    run.status !== 'completed' ||
    run.conclusion !== 'failure'
  ) {
    throw new Error(
      'Recovery requires a failed Publish run for the same repository and release commit',
    );
  }
  if (
    !jobs.some((job) => job.name === 'Package' && job.conclusion === 'success')
  ) {
    throw new Error('Package job must have succeeded');
  }
  for (const [jobName, stepName] of [
    ['Stage npm Package', 'Stage npm package'],
    ['Publish VS Code Extension', 'Publish VS Code extension'],
  ]) {
    const job = jobs.find((entry) => entry.name === jobName);
    if (!job) throw new Error(`Missing job: ${jobName}`);
    if (
      job.conclusion === 'success' ||
      job.steps?.some(
        (step) => step.name === stepName && step.conclusion === 'success',
      )
    ) {
      throw new Error(
        `Publishing already succeeded: ${jobName}. Recover the remaining destination separately.`,
      );
    }
  }
}

function api(endpoint, paginate = false) {
  const args = ['api', endpoint];
  if (paginate) args.push('--paginate', '--slurp');
  return JSON.parse(execFileSync('gh', args, { encoding: 'utf8' }));
}

function resolveReleaseContext(env, readApi = api) {
  const repository = env.GITHUB_REPOSITORY;
  const runId = env.RECOVERY_RUN_ID || '';
  const requestedTag = env.RELEASE_TAG_INPUT || '';
  const recovering = Boolean(runId || requestedTag);
  const tag = recovering ? requestedTag : env.GITHUB_REF_NAME;
  if (!/^v\d+\.\d+\.\d+$/.test(tag))
    throw new Error('Expected a stable vX.Y.Z tag');
  if (recovering) {
    if (env.GITHUB_EVENT_NAME !== 'workflow_dispatch' || !/^\d+$/.test(runId)) {
      throw new Error('Recovery requires both release_tag and recovery_run_id');
    }
    const repo = readApi(`repos/${repository}`);
    if (env.GITHUB_REF !== `refs/heads/${repo.default_branch}`) {
      throw new Error('Run recovery from the default branch');
    }
  } else if (env.GITHUB_REF !== `refs/tags/${tag}`) {
    throw new Error('Normal publishing requires a release tag');
  }

  const release = readApi(
    `repos/${repository}/releases/tags/${encodeURIComponent(tag)}`,
  );
  if (release.draft || release.prerelease || release.tag_name !== tag) {
    throw new Error('Expected a published stable GitHub Release');
  }
  const commit = readApi(
    `repos/${repository}/commits/${encodeURIComponent(tag)}`,
  );
  if (recovering) {
    const run = readApi(`repos/${repository}/actions/runs/${runId}`);
    const pages = readApi(
      `repos/${repository}/actions/runs/${runId}/jobs?filter=latest&per_page=100`,
      true,
    );
    validateRecoveryRun({
      repository,
      tag,
      sha: commit.sha,
      run,
      jobs: pages.flatMap((page) => page.jobs),
    });
  } else if (commit.sha !== env.GITHUB_SHA) {
    throw new Error('Release tag no longer matches the workflow commit');
  }
  return { tag, recovering };
}

if (require.main === module) {
  const { tag, recovering } = resolveReleaseContext(process.env);
  fs.appendFileSync(
    process.env.GITHUB_OUTPUT,
    `tag=${tag}\nrecovering=${recovering}\n`,
  );
  console.log(
    `Validated ${recovering ? 'recovery' : 'release'} context for ${tag}`,
  );
}

module.exports = { validateRecoveryRun, resolveReleaseContext };
