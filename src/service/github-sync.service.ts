import * as fs from 'fs';
import * as path from 'path';
import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import axios, { AxiosError, AxiosInstance } from 'axios';
import { GITHUB_SYNC, GIT_COMMIT } from '../config/app.config';

export interface SyncResult {
  prUrl: string;
  branch: string;
  baseBranch: string;
}

@Injectable()
export class GithubSyncService {
  private readonly logger = new Logger('GithubSync');

  // Runtime config file on the pod (compiled copy under dist/assets).
  private readonly runtimeConfigPath = path.resolve(__dirname, '../assets/route-config.json');

  private client(): AxiosInstance {
    if (!GITHUB_SYNC.token) {
      throw new BadRequestException('GITHUB_TOKEN is not configured on the server.');
    }
    return axios.create({
      baseURL: `${GITHUB_SYNC.apiBase}/repos/${GITHUB_SYNC.owner}/${GITHUB_SYNC.repo}`,
      headers: {
        Authorization: `Bearer ${GITHUB_SYNC.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      timeout: 15_000,
    });
  }

  /**
   * Commit the pod's current route-config.json onto a fresh branch off the
   * deployed branch and open a PR. Returns the PR URL.
   */
  async syncRouteConfig(actor: string, buildTag: string): Promise<SyncResult> {
    const { owner, repo, baseBranch, configPath } = GITHUB_SYNC;
    const api = this.client();

    const localContent = fs.readFileSync(this.runtimeConfigPath, 'utf-8');

    // 1. Current file on the base branch (need its blob sha + content to diff).
    let baseFileSha: string | undefined;
    let baseContent: string | null = null;
    try {
      const { data } = await api.get(
        `/contents/${configPath}`,
        { params: { ref: baseBranch } },
      );
      baseFileSha = data.sha;
      baseContent = Buffer.from(data.content, 'base64').toString('utf-8');
    } catch (e) {
      // 404 => file does not exist on base yet; we'll create it. Anything else is fatal.
      if ((e as AxiosError).response?.status !== 404) throw this.wrap(e);
    }

    // 2. No diff => nothing to sync.
    if (baseContent !== null && this.normalize(baseContent) === this.normalize(localContent)) {
      throw new BadRequestException('No changes to sync — runtime config matches the branch.');
    }

    // 3. Tip sha of base branch.
    const baseRef = await api
      .get(`/git/ref/heads/${baseBranch}`)
      .catch((e) => { throw this.wrap(e); });
    const baseSha = baseRef.data.object.sha;

    // 4. Create the sync branch. Use the build tag + short commit for traceability;
    //    avoid collisions across pods/clicks by appending the base tip sha prefix.
    const branch = `routes-sync/${this.slug(buildTag)}-${baseSha.slice(0, 7)}`;
    try {
      await api.post('/git/refs', { ref: `refs/heads/${branch}`, sha: baseSha });
    } catch (e) {
      // 422 => ref already exists (a previous sync from the same tip). Reuse it.
      if ((e as AxiosError).response?.status !== 422) throw this.wrap(e);
      this.logger.warn(`Branch ${branch} already exists, reusing.`);
    }

    // 5. Commit the local file onto the sync branch.
    await api
      .put(`/contents/${configPath}`, {
        message: `chore(routes): sync runtime config from ${buildTag}`,
        content: Buffer.from(localContent, 'utf-8').toString('base64'),
        branch,
        ...(baseFileSha ? { sha: baseFileSha } : {}),
      })
      .catch((e) => { throw this.wrap(e); });

    // 6. Open the PR (or return the existing one if already open).
    const title = `Sync runtime route config (${buildTag})`;
    const body = [
      `Runtime route-config changes synced from a live pod.`,
      ``,
      `| Field | Value |`,
      `|---|---|`,
      `| Base branch | \`${baseBranch}\` |`,
      `| Deployed commit | \`${GIT_COMMIT}\` |`,
      `| Image tag | \`${buildTag}\` |`,
      `| Triggered by | ${actor} |`,
    ].join('\n');

    try {
      const pr = await api.post('/pulls', { title, head: branch, base: baseBranch, body });
      return { prUrl: pr.data.html_url, branch, baseBranch };
    } catch (e) {
      // 422 => a PR for this head already exists; fetch and return it.
      if ((e as AxiosError).response?.status === 422) {
        const existing = await api.get('/pulls', {
          params: { head: `${owner}:${branch}`, state: 'open' },
        });
        if (existing.data?.[0]?.html_url) {
          return { prUrl: existing.data[0].html_url, branch, baseBranch };
        }
      }
      throw this.wrap(e);
    }
  }

  // Ignore trailing-whitespace / newline noise when diffing.
  private normalize(s: string): string {
    return s.replace(/\r\n/g, '\n').trim();
  }

  private slug(s: string): string {
    return s.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 60);
  }

  private wrap(e: unknown): BadRequestException {
    const err = e as AxiosError<{ message?: string }>;
    const ghMsg = err.response?.data?.message;
    const status = err.response?.status;
    const method = err.config?.method?.toUpperCase();
    const url = err.config?.baseURL && err.config?.url ? `${err.config.baseURL}${err.config.url}` : err.config?.url;
    this.logger.error(`GitHub API error ${status ?? ''} on ${method} ${url}: ${ghMsg ?? err.message}`);
    return new BadRequestException(`GitHub sync failed (${status} on ${method} ${err.config?.url}): ${ghMsg ?? err.message}`);
  }
}
