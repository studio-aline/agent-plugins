import {openAsBlob, statSync} from 'node:fs';
import {basename} from 'node:path';

export interface UploadResult {
  url: string;
  markdown: string;
}

export interface UploadOptions {
  file: string;
  project: string;
  host: string;
  token: string;
}

function apiBase(host: string): string {
  const withScheme = /^https?:\/\//.test(host) ? host : `https://${host}`;
  return withScheme.replace(/\/+$/, '');
}

export interface MrDescription {
  description: string;
  sha: string;
  baseSha?: string;
}

/**
 * Reads an MR description byte-for-byte. Copying it out of MCP tool output by hand risks
 * silently changing the author's text, so the skill reads through this instead.
 */
export async function getDescription(o: {host: string; token: string; project: string; iid: number}): Promise<MrDescription> {
  if (!o.token) throw new Error('GITLAB_TOKEN 환경 변수가 비어 있습니다. api 스코프 PAT를 설정하세요.');
  const url = `${apiBase(o.host)}/api/v4/projects/${encodeURIComponent(o.project)}/merge_requests/${o.iid}`;
  const res = await fetch(url, {headers: {'PRIVATE-TOKEN': o.token}});
  if (!res.ok) throw new Error(`MR 조회 실패(${res.status}): ${o.project}!${o.iid}`);
  const mr = (await res.json()) as {description: string | null; sha: string; diff_refs?: {base_sha?: string}};
  return {description: mr.description ?? '', sha: mr.sha, baseSha: mr.diff_refs?.base_sha};
}

/**
 * Replaces an MR description through the REST API. Used when the host has no GitLab MCP
 * (e.g. Codex); the caller passes the exact text produced by `body`.
 */
export async function saveDescription(o: {host: string; token: string; project: string; iid: number; description: string}): Promise<{iid: number; webUrl: string; description: string}> {
  if (!o.token) throw new Error('GITLAB_TOKEN 환경 변수가 비어 있습니다. api 스코프 PAT를 설정하세요.');
  const url = `${apiBase(o.host)}/api/v4/projects/${encodeURIComponent(o.project)}/merge_requests/${o.iid}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {'PRIVATE-TOKEN': o.token, 'content-type': 'application/json'},
    body: JSON.stringify({description: o.description}),
  });
  if (!res.ok) throw new Error(`MR 본문 저장 실패(${res.status}): ${o.project}!${o.iid} ${(await res.text()).slice(0, 200)}`);
  const mr = (await res.json()) as {iid: number; web_url: string; description: string | null};
  return {iid: mr.iid, webUrl: mr.web_url, description: mr.description ?? ''};
}

/**
 * Adds a new MR note. Used when the host has no GitLab MCP (e.g. Codex); the caller passes the
 * exact text produced by `note`.
 */
export async function postNote(o: {host: string; token: string; project: string; iid: number; body: string}): Promise<{id: number; webUrl: string; body: string}> {
  if (!o.token) throw new Error('GITLAB_TOKEN 환경 변수가 비어 있습니다. api 스코프 PAT를 설정하세요.');
  const base = apiBase(o.host);
  const url = `${base}/api/v4/projects/${encodeURIComponent(o.project)}/merge_requests/${o.iid}/notes`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {'PRIVATE-TOKEN': o.token, 'content-type': 'application/json'},
    body: JSON.stringify({body: o.body}),
  });
  if (!res.ok) throw new Error(`MR 코멘트 작성 실패(${res.status}): ${o.project}!${o.iid} ${(await res.text()).slice(0, 200)}`);
  const note = (await res.json()) as {id: number; body: string | null};
  return {id: note.id, webUrl: `${base}/${o.project}/-/merge_requests/${o.iid}#note_${note.id}`, body: note.body ?? ''};
}

export async function uploadVideo({file, project, host, token}: UploadOptions): Promise<UploadResult> {
  if (!token) throw new Error('GITLAB_TOKEN 환경 변수가 비어 있습니다. api 스코프 PAT를 설정하세요.');
  if (!host) throw new Error('GITLAB_HOST 환경 변수가 비어 있습니다 (예: gitlab.example.com).');

  const form = new FormData();
  form.append('file', new File([await openAsBlob(file)], basename(file), {type: 'video/mp4'}));
  const url = `${apiBase(host)}/api/v4/projects/${encodeURIComponent(project)}/uploads`;

  let res: Response;
  try {
    res = await fetch(url, {method: 'POST', headers: {'PRIVATE-TOKEN': token}, body: form});
  } catch (e) {
    throw new Error(`GitLab(${host})에 연결하지 못했습니다: ${(e as Error).message}`);
  }

  if (res.ok) {
    const json = (await res.json()) as {url: string; markdown: string};
    return {url: json.url, markdown: json.markdown};
  }
  const mb = (statSync(file).size / 1048576).toFixed(1);
  const detail = (await res.text()).slice(0, 300);
  switch (res.status) {
    case 401:
    case 403:
      throw new Error(`업로드 거부(${res.status}): GITLAB_TOKEN이 만료됐거나, api 스코프가 없거나, ${project}에 권한이 없습니다.`);
    case 404:
      throw new Error(`업로드 실패(404): 프로젝트 ${project}를 찾을 수 없습니다. 경로(group/repo)를 확인하세요.`);
    case 413:
      throw new Error(`업로드 실패(413): 파일(${mb}MB)이 GitLab 업로드 용량 제한을 넘습니다.`);
    default:
      throw new Error(`업로드 실패(${res.status}): ${detail}`);
  }
}
