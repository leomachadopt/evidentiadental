import { Link } from 'react-router-dom';
import { Unlock, Send, ExternalLink, Check, Download } from 'lucide-react';
import { Avatar } from './Avatar';
import type { FriendActivityItem } from '../lib/api';

function parseAuthors(a: any): any[] {
  return typeof a === 'string' ? JSON.parse(a) : a ?? [];
}

function authorLine(authors: any, journal: string | null, year: number | null): string {
  const list = parseAuthors(authors);
  const names = list.slice(0, 3).map((a: any) => a.name).join(', ') + (list.length > 3 ? ' et al' : '');
  return [names, journal, year].filter(Boolean).join(' · ');
}

/**
 * One saved paper as surfaced from a colleague. Shared by the activity feed and
 * the colleague-profile page. `showFriend` toggles the "X guardou" attribution
 * (hidden on a single colleague's profile, where it would be redundant).
 */
export function SavedArticleCard({
  item: it,
  showFriend = true,
  importing = false,
  onOpenOA,
  onAskPdf,
  onImport,
}: {
  item: FriendActivityItem;
  showFriend?: boolean;
  importing?: boolean;
  onOpenOA: (paperId: string) => void;
  onAskPdf: (paperId: string, ownerId: string) => void;
  onImport: (paperId: string, ownerId: string) => void;
}) {
  return (
    <li className="card">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          {showFriend && (
            <Link to={`/friends/${it.friend_id}`}>
              <Avatar url={it.friend_avatar} name={it.friend_name} size={36} />
            </Link>
          )}
          <div className="min-w-0">
            {showFriend && (
              <Link to={`/friends/${it.friend_id}`} className="text-xs text-primary-600 hover:underline">
                {it.friend_name ?? 'Um colega'} guardou
              </Link>
            )}
            <p className="font-medium leading-snug">{it.title}</p>
            <p className="mt-0.5 text-xs text-slate-500">{authorLine(it.authors, it.journal, it.year)}</p>
          </div>
        </div>
        {it.is_open_access && (
          <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-600">
            Open access
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {it.is_open_access ? (
          <button className="btn-ghost text-xs" onClick={() => onOpenOA(it.paper_id)}>
            <Unlock className="h-3.5 w-3.5" /> Aceder (OA)
          </button>
        ) : it.friend_has_pdf && it.friend_accepts_requests && it.mutual ? (
          <button className="btn-ghost text-xs" onClick={() => onAskPdf(it.paper_id, it.friend_id)}>
            <Send className="h-3.5 w-3.5" /> Pedir PDF a {it.friend_name ?? 'colega'}
          </button>
        ) : null}

        {it.pmid && (
          <a
            className="btn-ghost text-xs"
            href={`https://pubmed.ncbi.nlm.nih.gov/${it.pmid}/`}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink className="h-3.5 w-3.5" /> PubMed
          </a>
        )}

        {it.in_my_library ? (
          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs text-slate-400">
            <Check className="h-3.5 w-3.5" /> Na tua biblioteca
          </span>
        ) : (
          <button
            className="btn-primary text-xs"
            onClick={() => onImport(it.paper_id, it.friend_id)}
            disabled={importing}
          >
            <Download className="h-3.5 w-3.5" /> Adicionar à biblioteca
          </button>
        )}
      </div>
    </li>
  );
}
