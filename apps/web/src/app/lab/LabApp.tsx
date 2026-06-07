'use client';

import { useCallback, useRef, useState } from 'react';

interface ServiceInfo {
  id: string;
  label: string;
  description: string;
  creditCost: number;
  maxInputBytes: number;
}

interface LabAppProps {
  initialBalance: number;
  services: ServiceInfo[];
}

type Phase = 'idle' | 'uploading' | 'queued' | 'running' | 'succeeded' | 'failed';

interface JobOutput {
  name: string;
  downloadUrl: string;
  bytes: number;
}

const PHASE_LABEL: Record<Phase, string> = {
  idle: '',
  uploading: 'Uploading…',
  queued: 'Queued…',
  running: 'Separating… (this takes ~30-90s)',
  succeeded: 'Done',
  failed: 'Failed',
};

export function LabApp({ initialBalance, services }: LabAppProps) {
  const [balance, setBalance] = useState(initialBalance);
  const [serviceId, setServiceId] = useState(services[0]?.id ?? 'stems');
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [outputs, setOutputs] = useState<JobOutput[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const service = services.find((s) => s.id === serviceId) ?? services[0];
  const busy = phase === 'uploading' || phase === 'queued' || phase === 'running';
  const canAfford = service ? balance >= service.creditCost : false;

  const refreshBalance = useCallback(async () => {
    try {
      const res = await fetch('/api/credits', { credentials: 'same-origin' });
      if (res.ok) {
        const data = (await res.json()) as { balance: number };
        setBalance(data.balance);
      }
    } catch {
      // non-fatal
    }
  }, []);

  const poll = useCallback(
    async (jobId: string): Promise<void> => {
      // Poll up to ~5 minutes.
      for (let i = 0; i < 150; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const res = await fetch(`/api/lab/jobs/${jobId}`, { credentials: 'same-origin' });
        if (!res.ok) continue;
        const { job } = (await res.json()) as {
          job: { status: Phase; outputs: JobOutput[]; error: string | null };
        };
        if (job.status === 'running') setPhase('running');
        if (job.status === 'succeeded') {
          setOutputs(job.outputs);
          setPhase('succeeded');
          void refreshBalance();
          return;
        }
        if (job.status === 'failed') {
          setError(job.error ?? 'Job failed.');
          setPhase('failed');
          void refreshBalance();
          return;
        }
      }
      setError('Timed out waiting for the job. Check back in a bit.');
      setPhase('failed');
    },
    [refreshBalance],
  );

  const run = useCallback(async () => {
    if (!file || !service) return;
    setError(null);
    setOutputs([]);
    setPhase('uploading');
    try {
      // 1. create job + get presigned upload URL
      const createRes = await fetch('/api/lab/jobs', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          service: service.id,
          filename: file.name,
          contentType: file.type || 'application/octet-stream',
          sizeBytes: file.size,
        }),
      });
      const createData = (await createRes.json().catch(() => ({}))) as {
        jobId?: string;
        uploadUrl?: string;
        error?: string;
      };
      if (!createRes.ok || !createData.jobId || !createData.uploadUrl) {
        throw new Error(createData.error ?? 'Could not create job.');
      }

      // 2. upload the file straight to storage
      const putRes = await fetch(createData.uploadUrl, {
        method: 'PUT',
        headers: { 'content-type': file.type || 'application/octet-stream' },
        body: file,
      });
      if (!putRes.ok) throw new Error('Upload failed.');

      // 3. start (reserves credits + enqueues)
      setPhase('queued');
      const startRes = await fetch(`/api/lab/jobs/${createData.jobId}/start`, {
        method: 'POST',
        credentials: 'same-origin',
      });
      const startData = (await startRes.json().catch(() => ({}))) as { error?: string };
      if (!startRes.ok) throw new Error(startData.error ?? 'Could not start job.');

      // 4. poll for completion
      await poll(createData.jobId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setPhase('failed');
    }
  }, [file, service, poll]);

  return (
    <div className="mt-10">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">lab</h1>
          <p className="mt-2 max-w-prose text-sm text-torus-fg-dim">
            Compute-heavy tools, billed at cost with credits. No subscription. The creative apps
            stay free — this is where the GPU work lives.
          </p>
        </div>
        <div className="shrink-0 rounded-xl border border-torus-border-strong bg-torus-surface px-4 py-3 text-right">
          <div className="text-xs text-torus-fg-faint">balance</div>
          <div className="text-xl font-semibold text-torus-mid">{balance} cr</div>
          <a href="/credits" className="text-[11px] text-torus-fg-dim underline">
            top up
          </a>
        </div>
      </div>

      {/* Service picker */}
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {services.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setServiceId(s.id)}
            className={`rounded-xl border p-4 text-left transition-colors ${
              s.id === serviceId
                ? 'border-torus-mid/50 bg-torus-mid/5'
                : 'border-torus-border hover:border-torus-mid/30'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-medium">{s.label}</span>
              <span className="text-xs text-torus-mid">{s.creditCost} cr</span>
            </div>
            <p className="mt-1 text-xs text-torus-fg-dim">{s.description}</p>
          </button>
        ))}
      </div>

      {/* Upload + run */}
      <section className="mt-8 rounded-2xl border border-torus-border-strong bg-torus-surface p-6">
        <input
          ref={inputRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setPhase('idle');
            setOutputs([]);
            setError(null);
          }}
        />

        {phase === 'succeeded' ? (
          <div>
            <h2 className="text-lg font-semibold">Your stems</h2>
            <div className="mt-4 space-y-3">
              {outputs.map((o) => (
                <div
                  key={o.name}
                  className="rounded-lg border border-torus-border bg-torus-bg p-3"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-medium capitalize">{o.name}</span>
                    <a
                      href={o.downloadUrl}
                      download={`${o.name}.mp3`}
                      className="text-xs text-torus-mid underline"
                    >
                      download
                    </a>
                  </div>
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                  <audio controls preload="none" src={o.downloadUrl} className="w-full" />
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                setFile(null);
                setOutputs([]);
                setPhase('idle');
                if (inputRef.current) inputRef.current.value = '';
              }}
              className="mt-5 rounded-full border border-torus-border-strong px-4 py-2 text-sm hover:bg-torus-bg"
            >
              New file
            </button>
          </div>
        ) : (
          <div>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="flex w-full flex-col items-center justify-center rounded-xl border border-dashed border-torus-border-strong px-6 py-10 text-center hover:border-torus-mid/40 disabled:opacity-50"
            >
              <span className="text-sm font-medium">
                {file ? file.name : 'Choose an audio file'}
              </span>
              <span className="mt-1 text-xs text-torus-fg-faint">
                {service
                  ? `${service.label} · ${service.creditCost} credits · max ${(
                      service.maxInputBytes /
                      1024 /
                      1024
                    ).toFixed(0)} MB`
                  : ''}
              </span>
            </button>

            {error ? <p className="mt-4 text-sm text-torus-bass">{error}</p> : null}

            {!canAfford && file ? (
              <p className="mt-4 text-sm text-torus-bass">
                Not enough credits ({service?.creditCost} needed).{' '}
                <a href="/credits" className="underline">
                  Top up
                </a>
                .
              </p>
            ) : null}

            <div className="mt-5 flex items-center gap-3">
              <button
                type="button"
                onClick={() => void run()}
                disabled={!file || busy || !canAfford}
                className="rounded-full bg-torus-mid/20 px-5 py-2 text-sm font-medium text-torus-mid border border-torus-mid/40 disabled:opacity-40"
              >
                {busy ? PHASE_LABEL[phase] : `Run (${service?.creditCost ?? 0} cr)`}
              </button>
              {busy ? (
                <span className="text-xs text-torus-fg-dim">{PHASE_LABEL[phase]}</span>
              ) : null}
            </div>
          </div>
        )}
      </section>

      <p className="mt-6 text-center text-[11px] text-torus-fg-faint">
        Inputs and outputs are auto-deleted after a short window. You only pay if the job succeeds —
        failures are refunded automatically.
      </p>
    </div>
  );
}
