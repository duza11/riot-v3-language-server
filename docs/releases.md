# Releases

## Normal release

Run **Prepare Release** on `main`, review the version and changelog updates,
and merge the release PR. When Release Please creates the GitHub Release,
it dispatches **Publish** at the new tag. Normal publishing requires a stable
`vX.Y.Z` tag and a published, non-prerelease GitHub Release.

Approve the `release` environment jobs. The workflow stages the npm package,
publishes the VS Code extension, and attaches both packages and `checksums.txt`
to the GitHub Release. npm staging is not public publishing: review and approve
the staged package on npmjs.com with 2FA to complete the npm release.

The npm Trusted Publisher uses `publish.yml` and environment `release`.
Marketplace uses the `VSCE_PAT` environment secret.

## Recover an existing release

Use recovery when packaging succeeded but **neither npm staging nor Marketplace
publishing succeeded**. The workflow checks the original run's jobs and steps
and rejects a run with a successful publish operation. Also check the external
registries before retrying: a remote operation may succeed even if its job loses
the response. Partial publication needs a destination-specific recovery instead.

Recovery downloads `release-artifacts` from a completed, failed Publish run in
this repository. Its tag and commit must match the requested release, and its
Package job must have succeeded. Expired or deleted artifacts cannot be recovered
this way. The original packages are not rebuilt. Their checksums, package names,
publisher, and versions are verified before publishing. Legacy nested VSIX paths
and absolute checksum paths are normalized; package bytes remain unchanged.

### Recover v1.0.0

1. Merge the workflow repair into `main`.
2. In **Settings > Environments > release > Deployment branches and tags**, add
   a **Branch** rule for `main`. Keep the existing **Tag** rule `v*`.
3. Open **Actions > Publish > Run workflow**, choose branch **main**, and set:

   | Input | Value |
   | --- | --- |
   | `release_tag` | `v1.0.0` |
   | `recovery_run_id` | `34601587367` |

   Alternatively:

   ```sh
   gh workflow run publish.yml \
     --repo duza11/riot-v3-language-server \
     --ref main \
     -f release_tag=v1.0.0 \
     -f recovery_run_id=34601587367
   ```

4. Review and approve the `release` environment jobs.
5. Review the npm staged package and approve it with 2FA. Marketplace publication
   runs independently and does not wait for npm approval.
6. Confirm version `1.0.0` on npm and Marketplace, and the two package files plus
   `checksums.txt` on the existing GitHub Release. After downloading all three
   files into one directory, verify them with `shasum -a 256 -c checksums.txt`.
7. Remove the temporary **Branch** rule for `main` from the environment.

The existing `v1.0.0` tag and GitHub Release must not be recreated or moved.
Re-running the original failed workflow would still execute its old definition;
recovery must start from the repaired default branch. The npm Trusted Publisher
registration does not need to change because publishing still runs in
`publish.yml` with environment `release`.

For future releases, leave both recovery inputs empty. The normal release path
continues to execute at the tag.
