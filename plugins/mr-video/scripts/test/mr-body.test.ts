import {describe, expect, it} from 'vitest';
import {buildBlock, inspectBody, sameBody, upsertBlock, videoFileName} from '../src/mr-body.ts';

const block = buildBlock({url: '/uploads/abc/mr-1-abc1234.mp4', sha7: 'abc1234', seconds: 52.4});

describe('buildBlock', () => {
  it('renders the marker block', () => {
    expect(block).toBe(
      [
        '<!-- mr-video:start -->',
        '## 🎬 설명 영상',
        '![설명 영상 · abc1234](/uploads/abc/mr-1-abc1234.mp4)',
        '> `abc1234` 기준 · 52초 · 자막 전용 · mr-video 생성',
        '<!-- mr-video:end -->',
      ].join('\n'),
    );
  });
});

describe('upsertBlock', () => {
  it('prepends to an existing body and keeps it intact', () => {
    expect(upsertBlock('## 변경 내용\n- a', block)).toBe(`${block}\n\n## 변경 내용\n- a`);
  });

  it('uses the block alone for an empty body', () => {
    expect(upsertBlock('', block)).toBe(block);
    expect(upsertBlock('  \n', block)).toBe(block);
  });

  it('replaces only the existing block', () => {
    const old = buildBlock({url: '/uploads/old/x.mp4', sha7: '0000000', seconds: 30});
    const body = `intro\n\n${old}\n\n## 변경 내용\n- a`;
    expect(upsertBlock(body, block)).toBe(`intro\n\n${block}\n\n## 변경 내용\n- a`);
  });

  it('handles CRLF bodies from the GitLab API', () => {
    const old = buildBlock({url: '/uploads/old/x.mp4', sha7: '0000000', seconds: 30}).replace(/\n/g, '\r\n');
    expect(upsertBlock(`${old}\r\n\r\ntext`, block)).toBe(`${block.replace(/\n/g, '\r\n')}\r\n\r\ntext`);
  });
});

describe('inspectBody', () => {
  it('reports the sha of an existing block', () => {
    expect(inspectBody(`x\n${block}\ny`)).toEqual({hasBlock: true, sha7: 'abc1234'});
  });

  it('reports no block', () => {
    expect(inspectBody('nothing here')).toEqual({hasBlock: false});
  });
});

describe('videoFileName', () => {
  it('prefers the iid', () => {
    expect(videoFileName({iid: 12, branch: 'feature/x'}, 'abc1234def')).toBe('mr-12-abc1234.mp4');
  });

  it('slugs the branch when there is no iid', () => {
    expect(videoFileName({branch: 'feature/Inventory Fix!'}, 'abc1234def')).toBe('mr-feature-inventory-fix-abc1234.mp4');
  });
});

describe('review fixes', () => {
  it('uses CRLF for the block inside a CRLF body', () => {
    expect(upsertBlock('a\r\nb', block)).toBe(`${block.replace(/\n/g, '\r\n')}\r\n\r\na\r\nb`);
  });

  it('strips a UTF-8 BOM from the body', () => {
    expect(upsertBlock('\uFEFFtext', block)).toBe(`${block}\n\ntext`);
  });

  it('replaces the first block and removes duplicates', () => {
    const old = buildBlock({url: '/uploads/old/x.mp4', sha7: '0000000', seconds: 30});
    expect(upsertBlock(`${old}\n\nmid\n\n${old}\n\nend`, block)).toBe(`${block}\n\nmid\n\nend`);
  });

  it('keeps $-patterns in user text and urls literal', () => {
    const b = buildBlock({url: "/uploads/$&/$'.mp4", sha7: 'abc1234', seconds: 1});
    const old = buildBlock({url: '/x', sha7: '0000000', seconds: 1});
    expect(upsertBlock(`cost $1 ${old} $&`, b)).toBe(`cost $1 ${b} $&`);
  });
});

describe('sameBody', () => {
  it('ignores CRLF, BOM and trailing whitespace only', () => {
    expect(sameBody('a\r\nb\r\n', '\uFEFFa\nb')).toEqual({same: true});
    expect(sameBody('a\nb', 'a\nc')).toEqual({same: false, line: 2});
  });
});
