'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';

interface DraftData {
  id: string;
  short_id: string;
  contact_name: string;
  platform: string;
  draft_reply: string;
  ai_summary: string;
  contact_identifier: string;
}

function ApproveContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id') || '';
  const mode = searchParams.get('mode') || 'edit'; // 'edit' or 'reject'

  const [draft, setDraft] = useState<DraftData | null>(null);
  const [text, setText] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  useEffect(() => {
    if (!id) { setError('No draft ID'); setLoading(false); return; }
    fetch(`/api/approve?id=${id}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); }
        else { setDraft(data); setText(data.draft_reply || ''); }
        setLoading(false);
      })
      .catch(() => { setError('Failed to load draft'); setLoading(false); });
  }, [id]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tg = typeof window !== 'undefined' ? (window as Record<string, any>).Telegram?.WebApp : null;

  async function handleApprove() {
    setSubmitting(true);
    try {
      // Try sendData to bot first (preferred — bot handles the confirmation message)
      if (tg?.sendData) {
        tg.sendData(JSON.stringify({ action: 'approve', id, text }));
        tg.close();
        return;
      }
      // Fallback: call API directly if not in Telegram context
      const res = await fetch('/api/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve', id, text }),
      });
      const result = await res.json();
      if (result.error) setError(result.error);
      else setDone(`Approved: ${result.contact}`);
    } catch { setError('Failed to approve'); }
    setSubmitting(false);
  }

  async function handleReject() {
    if (!reason.trim()) { setError('Please explain why this draft was wrong'); return; }
    setSubmitting(true);
    try {
      if (tg?.sendData) {
        tg.sendData(JSON.stringify({ action: 'reject', id, reason }));
        tg.close();
        return;
      }
      const res = await fetch('/api/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject', id, reason }),
      });
      const result = await res.json();
      if (result.error) setError(result.error);
      else setDone('Rejected. Feedback noted.');
    } catch { setError('Failed to reject'); }
    setSubmitting(false);
  }

  if (loading) return <div style={styles.container}><p style={styles.loading}>Loading draft...</p></div>;
  if (done) return <div style={styles.container}><p style={styles.done}>{done}</p></div>;
  if (error && !draft) return <div style={styles.container}><p style={styles.error}>{error}</p></div>;
  if (!draft) return null;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <strong>{draft.contact_name}</strong>
        <span style={styles.platform}>{draft.platform}</span>
      </div>

      {mode === 'reject' ? (
        <>
          <p style={styles.label}>Original draft:</p>
          <div style={styles.preview}>{draft.draft_reply}</div>
          <p style={styles.label}>What was wrong with this draft?</p>
          <textarea
            style={styles.textarea}
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Too formal, wrong tone, missing info, completely wrong approach..."
            autoFocus
          />
          {error && <p style={styles.error}>{error}</p>}
          <button style={styles.rejectBtn} onClick={handleReject} disabled={submitting}>
            {submitting ? 'Submitting...' : 'Reject & Submit Feedback'}
          </button>
        </>
      ) : (
        <>
          <p style={styles.label}>Edit the message below, then approve:</p>
          <textarea
            style={styles.textarea}
            value={text}
            onChange={e => setText(e.target.value)}
            autoFocus
          />
          {error && <p style={styles.error}>{error}</p>}
          <div style={styles.buttonRow}>
            <button style={styles.approveBtn} onClick={handleApprove} disabled={submitting}>
              {submitting ? 'Sending...' : 'Approve & Send'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function ApprovePage() {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-sync-scripts */}
      <script src="https://telegram.org/js/telegram-web-app.js" />
      <Suspense fallback={<div style={styles.container}><p>Loading...</p></div>}>
        <ApproveContent />
      </Suspense>
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
    padding: '16px',
    maxWidth: '600px',
    margin: '0 auto',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
    fontSize: '16px',
  },
  platform: {
    fontSize: '12px',
    color: '#888',
    textTransform: 'uppercase' as const,
  },
  label: {
    fontSize: '13px',
    color: '#666',
    marginBottom: '6px',
  },
  textarea: {
    width: '100%',
    minHeight: '150px',
    padding: '12px',
    fontSize: '15px',
    lineHeight: '1.5',
    border: '1px solid #ddd',
    borderRadius: '8px',
    resize: 'vertical' as const,
    boxSizing: 'border-box' as const,
  },
  preview: {
    padding: '12px',
    background: '#f5f5f5',
    borderRadius: '8px',
    fontSize: '14px',
    lineHeight: '1.5',
    marginBottom: '16px',
    whiteSpace: 'pre-wrap' as const,
  },
  buttonRow: {
    display: 'flex',
    gap: '8px',
    marginTop: '12px',
  },
  approveBtn: {
    flex: 1,
    padding: '14px',
    fontSize: '16px',
    fontWeight: '600',
    color: '#fff',
    background: '#22c55e',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  rejectBtn: {
    width: '100%',
    padding: '14px',
    fontSize: '16px',
    fontWeight: '600',
    color: '#fff',
    background: '#ef4444',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    marginTop: '12px',
  },
  loading: { color: '#888', textAlign: 'center' as const, marginTop: '40px' },
  done: { color: '#22c55e', textAlign: 'center' as const, marginTop: '40px', fontSize: '18px' },
  error: { color: '#ef4444', fontSize: '13px', marginTop: '8px' },
};
