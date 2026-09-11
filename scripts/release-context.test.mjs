import { createRequire } from 'node:module';
import { describe, expect, test, vi } from 'vitest';

const require = createRequire(import.meta.url);
const {
  validateRecoveryRun,
  resolveReleaseContext,
} = require('./release-context');

function fixture() {
  return {
    repository: 'duza11/riot-v3-language-server',
    tag: 'v1.0.0',
    sha: 'release-sha',
    run: {
      path: '.github/workflows/publish.yml',
      head_repository: { full_name: 'duza11/riot-v3-language-server' },
      head_sha: 'release-sha',
      head_branch: 'v1.0.0',
      event: 'workflow_dispatch',
      status: 'completed',
      conclusion: 'failure',
    },
    jobs: [
      { name: 'Package', conclusion: 'success', steps: [] },
      {
        name: 'Stage npm Package',
        conclusion: 'failure',
        steps: [{ name: 'Stage npm package', conclusion: 'failure' }],
      },
      {
        name: 'Publish VS Code Extension',
        conclusion: 'failure',
        steps: [{ name: 'Publish VS Code extension', conclusion: 'skipped' }],
      },
    ],
  };
}

describe('recovery run validation', () => {
  test('accepts a failed publish run whose packages were built successfully', () => {
    // Arrange
    const context = fixture();

    // Act
    const validate = () => validateRecoveryRun(context);

    // Assert
    expect(validate).not.toThrow();
  });

  test.each([
    ['head_sha', 'another-sha'],
    ['head_branch', 'main'],
    ['path', '.github/workflows/ci.yml'],
    ['event', 'pull_request'],
    ['status', 'in_progress'],
    ['conclusion', 'success'],
    ['head_repository', { full_name: 'someone/another-repo' }],
  ])('rejects an unrelated or unfinished run (%s)', (field, value) => {
    // Arrange
    const context = fixture();
    context.run[field] = value;

    // Act
    const validate = () => validateRecoveryRun(context);

    // Assert
    expect(validate).toThrow();
  });

  test('rejects an unsuccessful package job', () => {
    // Arrange
    const context = fixture();
    context.jobs[0].conclusion = 'failure';

    // Act
    const validate = () => validateRecoveryRun(context);

    // Assert
    expect(validate).toThrow('Package job');
  });

  test.each([1, 2])(
    'rejects successful publishing even if the job later failed (%i)',
    (index) => {
      // Arrange
      const context = fixture();
      context.jobs[index].steps[0].conclusion = 'success';

      // Act
      const validate = () => validateRecoveryRun(context);

      // Assert
      expect(validate).toThrow('already succeeded');
    },
  );
});

describe('release workflow context', () => {
  const env = {
    GITHUB_REPOSITORY: 'duza11/riot-v3-language-server',
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_REF: 'refs/tags/v1.0.0',
    GITHUB_REF_NAME: 'v1.0.0',
    GITHUB_SHA: 'release-sha',
  };
  const release = { tag_name: 'v1.0.0', draft: false, prerelease: false };

  test('allows normal publishing at an existing stable release tag', () => {
    // Arrange
    const readApi = vi
      .fn()
      .mockReturnValueOnce(release)
      .mockReturnValueOnce({ sha: 'release-sha' });

    // Act
    const context = resolveReleaseContext(env, readApi);

    // Assert
    expect(context).toEqual({ tag: 'v1.0.0', recovering: false });
  });

  test('rejects a moved release tag', () => {
    // Arrange
    const readApi = vi
      .fn()
      .mockReturnValueOnce(release)
      .mockReturnValueOnce({ sha: 'different-sha' });

    // Act
    const resolve = () => resolveReleaseContext(env, readApi);

    // Assert
    expect(resolve).toThrow('no longer matches');
  });

  test.each(['draft', 'prerelease'])('rejects a %s release', (field) => {
    // Arrange
    const readApi = vi.fn().mockReturnValue({ ...release, [field]: true });

    // Act
    const resolve = () => resolveReleaseContext(env, readApi);

    // Assert
    expect(resolve).toThrow('published stable');
  });

  test('requires the default branch for recovery', () => {
    // Arrange
    const readApi = vi.fn().mockReturnValue({ default_branch: 'main' });
    const recoveryEnv = {
      ...env,
      RELEASE_TAG_INPUT: 'v1.0.0',
      RECOVERY_RUN_ID: '123',
    };

    // Act
    const resolve = () => resolveReleaseContext(recoveryEnv, readApi);

    // Assert
    expect(resolve).toThrow('default branch');
  });

  test('rejects incomplete recovery inputs', () => {
    // Arrange
    const recoveryEnv = {
      ...env,
      RELEASE_TAG_INPUT: 'v1.0.0',
      GITHUB_REF: 'refs/heads/main',
    };

    // Act
    const resolve = () => resolveReleaseContext(recoveryEnv, vi.fn());

    // Assert
    expect(resolve).toThrow('both release_tag and recovery_run_id');
  });

  test('resolves the release tag rather than main in recovery mode', () => {
    // Arrange
    const original = fixture();
    const readApi = vi
      .fn()
      .mockReturnValueOnce({ default_branch: 'main' })
      .mockReturnValueOnce(release)
      .mockReturnValueOnce({ sha: original.sha })
      .mockReturnValueOnce(original.run)
      .mockReturnValueOnce([{ jobs: original.jobs }]);
    const recoveryEnv = {
      ...env,
      GITHUB_REF: 'refs/heads/main',
      GITHUB_REF_NAME: 'main',
      RELEASE_TAG_INPUT: 'v1.0.0',
      RECOVERY_RUN_ID: '123',
    };

    // Act
    const context = resolveReleaseContext(recoveryEnv, readApi);

    // Assert
    expect(context).toEqual({ tag: 'v1.0.0', recovering: true });
  });
});
