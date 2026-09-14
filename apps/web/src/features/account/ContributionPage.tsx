import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, apiFetch } from '../../lib/api';

interface Contribution {
  id: string;
  title: string;
  kind: 'image' | 'video' | 'zip';
  source: 'upload' | 'link';
  status: 'pending' | 'approved' | 'rejected';
  requested_share_bps: number;
  approved_share_bps: number | null;
  rejection_reason: string | null;
  created_at: number;
}

const MAX_DIRECT_UPLOAD_BYTES = 20 * 1024 * 1024;
const STATUS_LABELS: Record<Contribution['status'], string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '未通过'
};
const KIND_LABELS: Record<Contribution['kind'], string> = {
  image: '图片',
  video: '视频',
  zip: 'ZIP'
};

function acceptFor(kind: Contribution['kind']): string {
  if (kind === 'image') return 'image/png,image/jpeg,image/webp,image/gif';
  if (kind === 'video') return 'video/mp4,video/webm,video/quicktime';
  return '.zip,application/zip,application/x-zip-compressed';
}

export function ContributionPage() {
  const [items, setItems] = useState<Contribution[]>([]);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<Contribution['kind']>('image');
  const [externalUrl, setExternalUrl] = useState('');
  const [extractionCode, setExtractionCode] = useState('');
  const [share, setShare] = useState('10');
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load(): Promise<void> {
    try {
      const payload = await apiFetch<{ contributions: Contribution[] }>('/contributions/mine');
      setItems(payload.contributions);
    } catch {
      setError('投稿记录加载失败');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (file && file.size > MAX_DIRECT_UPLOAD_BYTES) {
        throw new ApiError('file_too_large', '站内直传不能超过 20 MB，请改用网盘链接', 400);
      }
      if (!file && !externalUrl.trim()) {
        throw new ApiError('file_required', '请选择 20 MB 以内的文件，或填写网盘链接', 400);
      }

      const body = new FormData();
      body.set('title', title);
      body.set('kind', kind);
      body.set('requestedSharePercent', String(Number(share)));
      if (file) body.set('file', file);
      if (externalUrl.trim()) body.set('externalUrl', externalUrl.trim());
      if (extractionCode.trim()) body.set('extractionCode', extractionCode.trim());
      if (note.trim()) body.set('note', note.trim());

      await apiFetch('/contributions', { method: 'POST', body });
      setNotice('投稿已提交，等待审核');
      setTitle('');
      setExternalUrl('');
      setExtractionCode('');
      setNote('');
      setFile(null);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : '投稿失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="course-page">
      <header className="course-page__header">
        <h1>合作投稿</h1>
        <p>自由选择分成收益；图片、视频和每份 ZIP 都要分别审核，任意图片或视频通过后才会永久解锁 ZIP 投稿。</p>
      </header>

      {notice ? <div className="alert alert--success" role="status">{notice}</div> : null}
      {error ? <div className="alert alert--error" role="alert">{error}</div> : null}

      <form className="card form" onSubmit={submit}>
        <div className="field">
          <label htmlFor="contribution-title">资源名称</label>
          <input id="contribution-title" value={title} onChange={(event) => setTitle(event.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="contribution-kind">投稿类型</label>
          <select
            id="contribution-kind"
            value={kind}
            onChange={(event) => {
              setKind(event.target.value as Contribution['kind']);
              setFile(null);
            }}
          >
            <option value="image">图片</option>
            <option value="video">视频</option>
            <option value="zip">ZIP</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="contribution-file">站内直传（单文件不超过 20 MB）</label>
          <input
            id="contribution-file"
            type="file"
            accept={acceptFor(kind)}
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          <small>大文件请留空此项，改填下面的网盘链接。视频和 ZIP 都不会上传到 R2。</small>
        </div>
        <div className="field">
          <label htmlFor="contribution-url">网盘链接（超过 20 MB 时使用）</label>
          <input id="contribution-url" type="url" value={externalUrl} onChange={(event) => setExternalUrl(event.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="contribution-code">提取码</label>
          <input id="contribution-code" value={extractionCode} onChange={(event) => setExtractionCode(event.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="contribution-share">期望分成（%）</label>
          <input
            id="contribution-share"
            type="number"
            min="0"
            max="100"
            value={share}
            onChange={(event) => setShare(event.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="contribution-note">备注</label>
          <textarea id="contribution-note" value={note} onChange={(event) => setNote(event.target.value)} />
        </div>
        <button className="button button--primary" disabled={busy}>提交投稿</button>
      </form>

      <div className="card">
        <h2>我的投稿</h2>
        {items.length === 0 ? (
          <p className="empty-state">暂无投稿</p>
        ) : (
          <ul className="comments__list">
            {items.map((item) => (
              <li className="comment-item" key={item.id}>
                <strong>{item.title}</strong>
                <p>
                  {KIND_LABELS[item.kind]} · {item.source === 'upload' ? '站内文件' : '网盘链接'} · {STATUS_LABELS[item.status]}
                </p>
                <p>期望分成：{item.requested_share_bps / 100}%{item.approved_share_bps !== null ? ` · 最终分成：${item.approved_share_bps / 100}%` : ''}</p>
                {item.rejection_reason ? <p role="alert">原因：{item.rejection_reason}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
